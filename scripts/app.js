import * as THREE from "three";

import { Renderer }          from "./modules/engine/renderer.js";
import { GameLoop }          from "./modules/engine/game-loop.js";
import { Input }             from "./modules/engine/input.js";
import { AssetManager }      from "./modules/engine/asset-manager.js";
import { SaveService }       from "./modules/engine/save-service.js";
import { DevConsole }        from "./modules/engine/dev/dev-console.js";
import { BuilderCamera }     from "./modules/engine/cameras/builder-camera.js";
import { FirstPersonCamera } from "./modules/engine/cameras/first-person-camera.js";

import { World }  from "./modules/world/world.js";
import { Grid }   from "./modules/world/grid.js";
import { Entity } from "./modules/world/entity.js";

import { Walker }           from "./modules/world/components/walker.js";
import { Animator }         from "./modules/world/components/animator.js";
import { Renderable }       from "./modules/world/components/renderable.js";
import { WanderBehaviour }  from "./modules/world/components/wander-behaviour.js";

import { buildEmptyRoom }    from "./modules/world/builders/empty-room.js";
import * as DecorBuilder     from "./modules/world/builders/decor.js";
import * as WorldSerializer  from "./modules/world/world-serializer.js";

import { AppViewModel } from "./modules/ui/app-view-model.js";
import "./modules/ui/bindings.js";


const ko = window.ko;

const VERSION = "V1_9_0";

const ROOM = { x0: 1, z0: 1, width: 8, depth: 10 };
const GRID_WIDTH = 10;
const GRID_DEPTH = 12;
const GRID_CELL_SIZE = 4;

const TOGGLE_CAMERA_KEY = "Tab";
const SAVE_KEY = "KeyS";
const DEV_TOGGLE_KEY = "Backquote";

const MINION_SPEED = 1.6;
const MINION_SPAWN_CELL = { cx: 2, cz: 2 };
const MANIFEST_PATH = "assets/manifest.json";

// KayKit Rig_Medium clip names. The rig ships A/B (and sometimes C) variants
// for many states — picking one variant per state. Full naming convention
// captured in CLAUDE.md → "KayKit characters and animations are separate".
const MINION_CLIPS = { idle: "Idle_A", walk: "Walking_A" };

const DECOR_LAYOUT =
[
    { kind: "decor.barrel", cx: 4, cz: 9 },
    { kind: "decor.barrel", cx: 6, cz: 9 },
    { kind: "decor.crate",  cx: 4, cz: 4 },
    { kind: "decor.crate",  cx: 5, cz: 4 },
    { kind: "decor.crate",  cx: 5, cz: 5 },
    { kind: "decor.crate",  cx: 6, cz: 5 }
];

const SCENE_AMBIENT_SKY = 0xffffff;
const SCENE_AMBIENT_GROUND = 0x303040;
const SCENE_AMBIENT_INTENSITY = 1.2;

const SCENE_SUN_COLOR = 0xffffff;
const SCENE_SUN_INTENSITY = 1.0;
const SCENE_SUN_POSITION = { x: 4, y: 8, z: 4 };

const GRID_HELPER_MAJOR_COLOUR = 0x445566;
const GRID_HELPER_MINOR_COLOUR = 0x2a3340;
const GRID_HELPER_Y_OFFSET = 0.001;


/******************************************************************************/
/* APP                                                                        */
/******************************************************************************/

class App
{
    constructor()
    {
        this.version = VERSION;
        this.renderer = null;
        this.gameLoop = null;
        this.input = null;
        this.assets = null;
        this.world = null;
        this.viewModel = null;
        this.saveService = null;
        this.devConsole = null;
        this.cameraController = null;
        this.canvasWrapper = null;
        this.cameraControllers = {};
        this.tabHandler = null;
        this.saveHandler = null;
        this.devToggleHandler = null;
        this.contextMenuHandler = null;
        this.resizeHandler = null;
        this.globalErrorHandler = null;
        this.unhandledRejectionHandler = null;
        this.isShutDown = false;
    }

    async start()
    {
        try
        {
            await this.startInner();
        }
        catch(err)
        {
            this.showFatalError(err);
            throw err;
        }
    }

    async startInner()
    {
        this.canvasWrapper = document.getElementById("canvas-wrapper");
        this.contextMenuHandler = e => e.preventDefault();
        this.canvasWrapper.addEventListener("contextmenu", this.contextMenuHandler);

        this.renderer = new Renderer(this.canvasWrapper);
        this.input = new Input(window);
        this.input.preventDefaultFor(TOGGLE_CAMERA_KEY);

        this.viewModel = new AppViewModel({ version: this.version });
        ko.applyBindings(this.viewModel);

        this.wireViewportTracking();
        this.wireGlobalErrorHandlers();

        this.assets = new AssetManager(MANIFEST_PATH, (loaded, total, id) =>
        {
            this.viewModel.loadStatus(id);
            this.viewModel.loadProgress({ loaded, total });
        });

        this.viewModel.loadStatus("Loading manifest");
        await this.assets.loadManifest();

        this.viewModel.loadStatus("Loading core assets");
        await this.assets.preloadCore();

        this.buildWorld();
        this.buildCameraControllers();
        this.buildLoop();
        this.wireCameraToggle();
        this.wireSaveService();
        this.wireDevConsole();
        this.setCameraMode("builder");

        this.gameLoop.start();

        this.viewModel.loadStatus("Ready");
        requestAnimationFrame(() =>
        {
            requestAnimationFrame(() =>
            {
                this.viewModel.isReady(true);
            });
        });
    }

    setCameraMode(mode)
    {
        const next = this.cameraControllers[mode];
        if(!next) { throw new Error(`Unknown camera mode: ${mode}`); }
        if(this.cameraController === next) { return; }

        if(this.cameraController) { this.cameraController.deactivate(); }
        this.cameraController = next;
        this.cameraController.activate();
        this.renderer.setActiveCamera(this.cameraController.camera);
        this.viewModel.cameraMode(mode);
    }

    shutdown()
    {
        if(this.isShutDown) { return; }
        this.isShutDown = true;

        if(this.gameLoop)         { this.gameLoop.stop(); }
        if(this.cameraController) { this.cameraController.deactivate(); }
        if(this.saveService)      { this.saveService.dispose(); }
        if(this.devConsole)       { this.devConsole.uninstall(); }

        if(this.input && this.tabHandler)
        {
            this.input.off("keydown", this.tabHandler);
        }
        if(this.input && this.saveHandler)
        {
            this.input.off("keydown", this.saveHandler);
        }
        if(this.input && this.devToggleHandler)
        {
            this.input.off("keydown", this.devToggleHandler);
        }
        if(this.input)    { this.input.dispose(); }
        if(this.renderer) { this.renderer.dispose(); }

        if(this.canvasWrapper && this.contextMenuHandler)
        {
            this.canvasWrapper.removeEventListener("contextmenu", this.contextMenuHandler);
        }

        if(this.resizeHandler)
        {
            window.removeEventListener("resize", this.resizeHandler);
        }
        if(this.globalErrorHandler)
        {
            window.removeEventListener("error", this.globalErrorHandler);
        }
        if(this.unhandledRejectionHandler)
        {
            window.removeEventListener("unhandledrejection", this.unhandledRejectionHandler);
        }

        if(typeof ko !== "undefined" && ko.cleanNode)
        {
            ko.cleanNode(document.documentElement);
        }
    }

    buildWorld()
    {
        this.world = new World(new Grid(GRID_WIDTH, GRID_DEPTH, GRID_CELL_SIZE));
        this.renderer.setScene(this.world.scene);

        const ambient = new THREE.HemisphereLight(
            SCENE_AMBIENT_SKY,
            SCENE_AMBIENT_GROUND,
            SCENE_AMBIENT_INTENSITY
        );
        this.world.scene.add(ambient);

        const sun = new THREE.DirectionalLight(SCENE_SUN_COLOR, SCENE_SUN_INTENSITY);
        sun.position.set(SCENE_SUN_POSITION.x, SCENE_SUN_POSITION.y, SCENE_SUN_POSITION.z);
        this.world.scene.add(sun);

        const grid = this.world.grid;
        const worldWidth  = grid.width * grid.cellSize;
        const worldDepth  = grid.depth * grid.cellSize;
        const helperSize      = Math.max(worldWidth, worldDepth);
        const helperDivisions = Math.max(grid.width, grid.depth);

        const helper = new THREE.GridHelper(helperSize, helperDivisions, GRID_HELPER_MAJOR_COLOUR, GRID_HELPER_MINOR_COLOUR);
        helper.position.set(worldWidth / 2, GRID_HELPER_Y_OFFSET, worldDepth / 2);
        this.world.scene.add(helper);

        buildEmptyRoom(this.world, this.assets, ROOM);
        this.placeDecor();
        this.spawnMinion();
    }

    placeDecor()
    {
        for(const { kind, cx, cz } of DECOR_LAYOUT)
        {
            if(kind === "decor.barrel")     { DecorBuilder.addBarrel(this.world, this.assets, cx, cz); }
            else if(kind === "decor.crate") { DecorBuilder.addCrate(this.world, this.assets, cx, cz); }
            else { console.warn(`[App] Unknown decor kind: ${kind}`); }
        }
    }

    spawnMinion()
    {
        const minion = Entity.fromKind("character.skeleton.minion", this.assets);
        minion.addComponent(new Walker({ speed: MINION_SPEED }));

        // KayKit ships character meshes and clip libraries separately — both
        // bind to the shared "Rig_Medium" skeleton, so the cloned character's
        // bone names will resolve against any clip from the rig libraries.
        const animations =
        [
            ...this.assets.getAnimations("character.skeleton.minion"),
            ...this.assets.getAnimations("animations.rig-medium.general"),
            ...this.assets.getAnimations("animations.rig-medium.movement")
        ];
        minion.addComponent(new Animator({ clipMap: MINION_CLIPS, animations }));

        minion.addComponent(new WanderBehaviour());

        const spawn = this.world.grid.cellToWorld(MINION_SPAWN_CELL.cx, MINION_SPAWN_CELL.cz);
        minion.object3D.position.set(spawn.x, 0, spawn.z);

        this.world.addEntity(minion);
        minion.getComponent(Animator).crossfade("idle");
    }

    buildCameraControllers()
    {
        const S = this.world.grid.cellSize;
        const centre = new THREE.Vector3(
            (ROOM.x0 + ROOM.width / 2) * S,
            0,
            (ROOM.z0 + ROOM.depth / 2) * S
        );

        this.cameraControllers.builder = new BuilderCamera(this.input,
        {
            initialFocus:    centre,
            initialDistance: 30
        });

        this.cameraControllers.firstPerson = new FirstPersonCamera(this.input,
        {
            lockTarget:      this.canvasWrapper,
            initialPosition: centre.clone()
        });
    }

    wireCameraToggle()
    {
        this.tabHandler = event =>
        {
            if(event.code === TOGGLE_CAMERA_KEY && !event.repeat)
            {
                const next = this.viewModel.cameraMode() === "builder" ? "firstPerson" : "builder";
                this.setCameraMode(next);
            }
        };
        this.input.on("keydown", this.tabHandler);
    }

    wireSaveService()
    {
        this.saveService = new SaveService({
            getSnapshot: () => WorldSerializer.toJSON(this.world)
        });

        this.saveService.on("saved", payload =>
        {
            this.viewModel.saveStatus(`Saved (${payload.size.toLocaleString()} bytes)`);
        });

        this.saveService.on("saveFailed", err =>
        {
            // AbortError is the user closing the picker — surface as "Cancelled"
            // rather than a scary failure.
            const cause = err && err.cause;
            const cancelled = cause && cause.name === "AbortError";
            const message = cancelled ? "Save cancelled" : `Save failed: ${err.message}`;
            this.viewModel.saveStatus(message);
            this.viewModel.toast(message, cancelled ? "info" : "error");
        });

        this.saveService.on("autosaved", payload =>
        {
            this.viewModel.saveStatus(`Autosaved (${payload.size.toLocaleString()} bytes)`);
        });

        this.input.preventDefaultFor(SAVE_KEY);
        this.saveHandler = event =>
        {
            if(event.code === SAVE_KEY && event.ctrl && !event.repeat)
            {
                this.saveService.save();
            }
        };
        this.input.on("keydown", this.saveHandler);

        this.saveService.startAutosave();
    }

    wireDevConsole()
    {
        this.devConsole = new DevConsole(this.viewModel.dev,
        {
            sources:
            {
                gameLoop:    this.gameLoop,
                renderer:    this.renderer,
                world:       this.world,
                assets:      this.assets,
                saveService: this.saveService
            }
        });

        this.viewModel.dev.actions =
        {
            toggleCameraMode: () => this.toggleCameraMode(),
            dumpWorldJSON:    () => this.dumpWorldJSON(),
            forceSaveFailure: () => this.forceSaveFailure(),
            reloadManifest:   () => this.reloadManifest()
        };

        this.devConsole.install();

        this.input.preventDefaultFor(DEV_TOGGLE_KEY);
        this.devToggleHandler = event =>
        {
            if(event.code !== DEV_TOGGLE_KEY || event.repeat) { return; }
            if(this.isTextInputFocused())                     { return; }
            this.devConsole.toggle();
        };
        this.input.on("keydown", this.devToggleHandler);

        const params = new URLSearchParams(window.location.search);
        if(params.get("debug") === "1")
        {
            this.devConsole.setOpen(true);
        }
    }

    isTextInputFocused()
    {
        const el = document.activeElement;
        if(!el) { return false; }
        const tag = el.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
    }


    /* RUNTIME ERROR HANDLING / VIEWPORT GUARD ********************************/

    wireViewportTracking()
    {
        const update = () =>
        {
            this.viewModel.viewport({ width: window.innerWidth, height: window.innerHeight });
        };
        this.resizeHandler = update;
        window.addEventListener("resize", this.resizeHandler);
        update();
    }

    wireGlobalErrorHandlers()
    {
        this.globalErrorHandler = event =>
        {
            const message = event && event.message ? event.message : "Unknown runtime error.";
            this.viewModel.toast(message, "error");
        };
        this.unhandledRejectionHandler = event =>
        {
            const reason = event && event.reason;
            const message = (reason && reason.message) ? reason.message : String(reason);
            this.viewModel.toast(`Unhandled rejection: ${message}`, "error");
        };
        window.addEventListener("error", this.globalErrorHandler);
        window.addEventListener("unhandledrejection", this.unhandledRejectionHandler);
    }

    showFatalError(err)
    {
        const overlay = document.getElementById("fatal-overlay");
        if(!overlay)
        {
            console.error("[App] Fatal error (no overlay in DOM):", err);
            return;
        }

        const nameEl = document.getElementById("fatal-overlay-name");
        const messageEl = document.getElementById("fatal-overlay-message");
        const stackEl = document.getElementById("fatal-overlay-stack");

        if(nameEl)    { nameEl.textContent    = (err && err.name)    || "Error"; }
        if(messageEl) { messageEl.textContent = (err && err.message) || String(err); }
        if(stackEl)   { stackEl.textContent   = (err && err.stack)   || ""; }

        overlay.hidden = false;

        if(this.gameLoop) { this.gameLoop.stop(); }
    }


    /* DEV CONSOLE ACTIONS ****************************************************/

    toggleCameraMode()
    {
        const next = this.viewModel.cameraMode() === "builder" ? "firstPerson" : "builder";
        this.setCameraMode(next);
    }

    dumpWorldJSON()
    {
        const snapshot = WorldSerializer.toJSON(this.world);
        console.log(JSON.stringify(snapshot, null, 2));
    }

    forceSaveFailure()
    {
        this.saveService.forceFailNextSave();
        this.saveService.save();
    }

    async reloadManifest()
    {
        try
        {
            this.viewModel.loadStatus("Reloading manifest");
            await this.assets.reload();
            for(const entity of this.world.entities)
            {
                const renderable = entity.getComponent(Renderable);
                if(renderable) { renderable.reattach(); }
            }
            this.viewModel.loadStatus("Manifest reloaded");
        }
        catch(err)
        {
            console.error("[App] Manifest reload failed:", err);
            this.viewModel.loadStatus(`Reload failed: ${err.message || err}`);
        }
    }

    buildLoop()
    {
        this.gameLoop = new GameLoop(
        {
            onFixedUpdate: dt =>
            {
                this.world.update(dt);
                if(this.cameraController) { this.cameraController.fixedUpdate(dt); }
            },
            onFrameUpdate: alpha =>
            {
                if(this.cameraController) { this.cameraController.frameUpdate(alpha); }
                this.renderer.render();
            }
        });
    }
}


/******************************************************************************/
/* BOOTSTRAP                                                                  */
/******************************************************************************/

const app = new App();
window.App = app;

function bootstrap()
{
    app.start().catch(err =>
    {
        console.error("[App.start] fatal:", err);
    });
}

if(document.readyState === "loading")
{
    document.addEventListener("DOMContentLoaded", bootstrap);
}
else
{
    bootstrap();
}
