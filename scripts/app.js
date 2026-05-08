import * as THREE from "three";

import { Renderer }          from "./modules/engine/renderer.js";
import { GameLoop }          from "./modules/engine/game-loop.js";
import { Input }             from "./modules/engine/input.js";
import { AssetManager }      from "./modules/engine/asset-manager.js";
import { BuilderCamera }     from "./modules/engine/cameras/builder-camera.js";
import { FirstPersonCamera } from "./modules/engine/cameras/first-person-camera.js";

import { World }  from "./modules/world/world.js";
import { Grid }   from "./modules/world/grid.js";
import { Entity } from "./modules/world/entity.js";

import { Walker } from "./modules/world/components/walker.js";

import { buildEmptyRoom } from "./modules/world/builders/empty-room.js";

import { AppViewModel } from "./modules/ui/app-view-model.js";
import "./modules/ui/bindings.js";


const ko = window.ko;

const VERSION       = "V0_14_0";

const ROOM = { x0: 2, z0: 1, width: 6, depth: 8 };
const TOGGLE_CAMERA_KEY = "Tab";

const PATROL_START_CELL = { cx: 3, cz: 2 };
const PATROL_END_CELL   = { cx: 6, cz: 7 };
const PATROL_SPEED      = 1.6;
const MANIFEST_PATH = "assets/manifest.json";

const SCENE_AMBIENT_SKY     = 0xffffff;
const SCENE_AMBIENT_GROUND  = 0x303040;
const SCENE_AMBIENT_INTENSITY = 1.2;

const SCENE_SUN_COLOR     = 0xffffff;
const SCENE_SUN_INTENSITY = 1.0;
const SCENE_SUN_POSITION  = { x: 4, y: 8, z: 4 };

const GRID_HELPER_MAJOR_COLOUR = 0x445566;
const GRID_HELPER_MINOR_COLOUR = 0x2a3340;
const GRID_HELPER_Y_OFFSET     = 0.001;


/******************************************************************************/
/* APP                                                                        */
/******************************************************************************/

class App
{
    constructor()
    {
        this.version           = VERSION;
        this.renderer          = null;
        this.gameLoop          = null;
        this.input             = null;
        this.assets            = null;
        this.world             = null;
        this.viewModel         = null;
        this.cameraController  = null;
        this.canvasWrapper     = null;
        this._cameraControllers   = {};
        this._tabHandler          = null;
        this._contextMenuHandler  = null;
        this._shutdown            = false;
    }

    async start()
    {
        this.canvasWrapper       = document.getElementById("canvas-wrapper");
        this._contextMenuHandler = e => e.preventDefault();
        this.canvasWrapper.addEventListener("contextmenu", this._contextMenuHandler);

        this.renderer = new Renderer(this.canvasWrapper);
        this.input    = new Input(window);
        this.input.preventDefaultFor(TOGGLE_CAMERA_KEY);

        this.viewModel = new AppViewModel({ version: this.version });
        ko.applyBindings(this.viewModel);

        this.assets = new AssetManager(MANIFEST_PATH, (loaded, total, id) =>
        {
            this.viewModel.loadStatus(id);
            this.viewModel.loadProgress({ loaded, total });
        });

        this.viewModel.loadStatus("Loading manifest");
        await this.assets.loadManifest();

        this.viewModel.loadStatus("Loading core assets");
        await this.assets.preloadCore();

        this._buildWorld();
        this._buildCameraControllers();
        this._wireCameraToggle();
        this.setCameraMode("builder");

        this._startLoop();

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
        const next = this._cameraControllers[mode];
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
        if(this._shutdown) { return; }
        this._shutdown = true;

        if(this.gameLoop)         { this.gameLoop.stop(); }
        if(this.cameraController) { this.cameraController.deactivate(); }

        if(this.input && this._tabHandler)
        {
            this.input.off("keydown", this._tabHandler);
        }
        if(this.input)    { this.input.dispose(); }
        if(this.renderer) { this.renderer.dispose(); }

        if(this.canvasWrapper && this._contextMenuHandler)
        {
            this.canvasWrapper.removeEventListener("contextmenu", this._contextMenuHandler);
        }

        if(typeof ko !== "undefined" && ko.cleanNode)
        {
            ko.cleanNode(document.documentElement);
        }
    }

    _buildWorld()
    {
        this.world = new World(new Grid(10, 10, 4));
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

        const grid        = this.world.grid;
        const worldSize   = grid.width * grid.cellSize;
        const worldCentre = worldSize / 2;

        const helper = new THREE.GridHelper(worldSize, grid.width, GRID_HELPER_MAJOR_COLOUR, GRID_HELPER_MINOR_COLOUR);
        helper.position.set(worldCentre, GRID_HELPER_Y_OFFSET, worldCentre);
        this.world.scene.add(helper);

        buildEmptyRoom(this.world, this.assets, ROOM);
        this._spawnPatrollingMinion();
    }

    _spawnPatrollingMinion()
    {
        const start = this.world.grid.cellToWorld(PATROL_START_CELL.cx, PATROL_START_CELL.cz);
        const end   = this.world.grid.cellToWorld(PATROL_END_CELL.cx,   PATROL_END_CELL.cz);

        const minion = Entity.fromKind("character.skeleton.minion", this.assets);
        minion.addComponent(new Walker(
            [{ x: start.x, z: start.z }, { x: end.x, z: end.z }],
            PATROL_SPEED
        ));
        this.world.addEntity(minion);
    }

    _buildCameraControllers()
    {
        const S = this.world.grid.cellSize;
        const centre = new THREE.Vector3(
            (ROOM.x0 + ROOM.width / 2) * S,
            0,
            (ROOM.z0 + ROOM.depth / 2) * S
        );

        this._cameraControllers.builder = new BuilderCamera(this.input,
        {
            initialFocus:    centre,
            initialDistance: 30
        });

        this._cameraControllers.firstPerson = new FirstPersonCamera(this.input,
        {
            lockTarget:      this.canvasWrapper,
            initialPosition: centre.clone()
        });
    }

    _wireCameraToggle()
    {
        this._tabHandler = event =>
        {
            if(event.code === TOGGLE_CAMERA_KEY && !event.repeat)
            {
                const next = this.viewModel.cameraMode() === "builder" ? "firstPerson" : "builder";
                this.setCameraMode(next);
            }
        };
        this.input.on("keydown", this._tabHandler);
    }

    _startLoop()
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
        this.gameLoop.start();
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
