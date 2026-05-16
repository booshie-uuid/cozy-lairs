import * as THREE from "three";

import { Renderer }          from "./modules/engine/renderer.js";
import { GameLoop }          from "./modules/engine/game-loop.js";
import { Input }             from "./modules/engine/input.js";
import { AssetManager }      from "./modules/engine/asset-manager.js";
import { SaveService }       from "./modules/engine/save-service.js";
import { DevConsole }        from "./modules/engine/dev/dev-console.js";
import { BuilderCamera }     from "./modules/engine/cameras/builder-camera.js";
import { FirstPersonCamera } from "./modules/engine/cameras/first-person-camera.js";
import { PLAYER_MARKER }     from "./modules/engine/player-marker.js";

import { World }  from "./modules/world/world.js";
import { Grid }   from "./modules/world/grid.js";
import { Entity } from "./modules/world/entity.js";

import { Walker }           from "./modules/world/components/walker.js";
import { Animator }         from "./modules/world/components/animator.js";
import { Renderable }       from "./modules/world/components/renderable.js";
import { WanderBehaviour }  from "./modules/world/components/wander-behaviour.js";
import { GridPlacement }    from "./modules/world/components/grid-placement.js";

import { WorldEditor }       from "./modules/world/world-editor.js";
import { WallTracer }        from "./modules/world/wall-tracer.js";
import * as WorldSerializer  from "./modules/world/world-serializer.js";

import { IconRenderer }         from "./modules/builder/icon-renderer.js";
import { BuilderInputAdapter }  from "./modules/builder/builder-input-adapter.js";

import { FloorPaintTool, FloorEraseTool }                  from "./modules/builder/tools/floor-tools.js";
import { DecorPlaceTool, DecorEraseTool, WallDecorPlaceTool } from "./modules/builder/tools/decor-tools.js";
import { MinionSpawnTool, MinionEraseTool, NoopTool }      from "./modules/builder/tools/minion-tools.js";
import { BlockPlaceTool, BlockEraseTool }                  from "./modules/builder/tools/block-tools.js";
import { SelectTool }                                      from "./modules/builder/tools/select-tool.js";

import { AppViewModel } from "./modules/ui/app-view-model.js";
import "./modules/ui/bindings.js";


const ko = window.ko;

const VERSION = "V6_11_0";

const GRID_WIDTH = 20;
const GRID_DEPTH = 20;
const GRID_CELL_SIZE = 4;

const STARTER_ROOM = { x0: 7, z0: 7, width: 6, depth: 6 };

const TOGGLE_CAMERA_KEY = "Tab";
const SAVE_KEY = "KeyS";
const LOAD_KEY = "KeyO";
const DEV_TOGGLE_KEY = "Backquote";

const PLAYER_KIND = "character.mannequin.medium";
const PLAYER_SPAWN_CELL = { cx: 7, cz: 7 };

// Kinds we never persist: the player avatar (no stateful component to
// round-trip cleanly; always re-spawned on load) and the WallTracer's
// derived walls + corners (regenerated from floor topology on load).
//
// IMPORTANT — if WallTracer ever gains additional auto-traced kinds (e.g.
// a new wall style, decorative cornices, or any other derived geometry),
// each new kind MUST be added here. Persisting tracer-produced entities
// causes a load-time duplication bug: fromJSONv2 fires entityAdded for
// each floor; the tracer reacts by building its set of walls / corners;
// the snapshot's own walls / corners are then added on top, leaving two
// complete sets. Wall index entries collapse correctly (array push); the
// corner map overwrites and orphans one of each pair. See plan-v5
// "Issues and Adjustments" for the full history.
const SAVE_SKIP_KINDS =
[
    PLAYER_KIND,
    "wall.stone.straight",
    "wall.stone.half",
    "wall.stone.corner"
];
// Approximate footprint radii for collision. Player can enter a cell
// containing decor as long as the two circles don't overlap.
const PLAYER_RADIUS = 0.5;
const DECOR_RADIUS  = 0.7;

const MANIFEST_PATH = "assets/manifest.json";

// KayKit Rig_Medium clip names. The rig ships A/B (and sometimes C) variants
// for many states — picking one variant per state. Full naming convention
// captured in CLAUDE.md → "KayKit characters and animations are separate".
const PLAYER_CLIPS = { idle: "Idle_A", walk: "Walking_A" };

const SCENE_BACKGROUND = 0x1a0e2e;
const SCENE_AMBIENT_SKY = 0xffffff;
const SCENE_AMBIENT_GROUND = 0x2c1a47;
const SCENE_AMBIENT_INTENSITY = 1.2;

const SCENE_SUN_COLOR = 0xffffff;
const SCENE_SUN_INTENSITY = 1.0;
const SCENE_SUN_POSITION = { x: 4, y: 8, z: 4 };

const GRID_HELPER_COLOUR = 0x445566;
const GRID_HELPER_Y_OFFSET = 0.001;

const DIAG_GRID_COLOUR = 0xff3030;
const DIAG_GRID_Y_OFFSET = 0.05;

const SUB_GRID_LINE_COLOUR = 0x6688aa;
const SUB_GRID_LINE_OPACITY = 0.35;
const SUB_GRID_LINE_Y_OFFSET = 0.06;
const SUB_GRID_BLOCKER_COLOUR = 0xff3030;
const SUB_GRID_BLOCKER_OPACITY = 0.45;
const SUB_GRID_BLOCKER_Y_OFFSET = 0.08;
const SUB_GRID_BLOCKER_INSET = 0.04;  // shrink the tile slightly so adjacent blockers don't merge visually


function buildRectGrid(grid, colour)
{
    const S = grid.cellSize;
    const W = grid.width  * S;
    const D = grid.depth  * S;
    const points = [];
    for(let i = 0; i <= grid.width; i++)
    {
        const x = i * S;
        points.push(x, 0, 0, x, 0, D);
    }
    for(let i = 0; i <= grid.depth; i++)
    {
        const z = i * S;
        points.push(0, 0, z, W, 0, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({ color: colour });
    return new THREE.LineSegments(geometry, material);
}


function buildSubGridLines(walkGrid)
{
    const S = walkGrid.subCellSize;
    const W = walkGrid.width * S;
    const D = walkGrid.depth * S;
    const points = [];
    for(let i = 0; i <= walkGrid.width; i++)
    {
        const x = i * S;
        points.push(x, 0, 0, x, 0, D);
    }
    for(let i = 0; i <= walkGrid.depth; i++)
    {
        const z = i * S;
        points.push(0, 0, z, W, 0, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
        color:       SUB_GRID_LINE_COLOUR,
        transparent: true,
        opacity:     SUB_GRID_LINE_OPACITY,
        depthWrite:  false
    });
    return new THREE.LineSegments(geometry, material);
}


function buildSubGridBlockerMesh(walkGrid)
{
    const total = walkGrid.width * walkGrid.depth;
    const tileSize = walkGrid.subCellSize - SUB_GRID_BLOCKER_INSET * 2;

    const geometry = new THREE.PlaneGeometry(tileSize, tileSize);
    geometry.rotateX(-Math.PI / 2);  // lie flat on XZ plane
    const material = new THREE.MeshBasicMaterial({
        color:       SUB_GRID_BLOCKER_COLOUR,
        transparent: true,
        opacity:     SUB_GRID_BLOCKER_OPACITY,
        depthWrite:  false
    });

    const mesh = new THREE.InstancedMesh(geometry, material, total);
    mesh.frustumCulled = false;
    return mesh;
}


function refreshSubGridBlockerMesh(walkGrid, mesh)
{
    const S = walkGrid.subCellSize;
    const half = S / 2;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const reusable = new THREE.Matrix4();
    let count = 0;

    for(let sz = 0; sz < walkGrid.depth; sz++)
    {
        for(let sx = 0; sx < walkGrid.width; sx++)
        {
            const index = sz * walkGrid.width + sx;
            if(walkGrid.refcounts[index] === 0)
            {
                mesh.setMatrixAt(index, hidden);
                continue;
            }
            reusable.makeTranslation(sx * S + half, 0, sz * S + half);
            mesh.setMatrixAt(index, reusable);
            count += 1;
        }
    }

    mesh.count = walkGrid.width * walkGrid.depth;
    mesh.instanceMatrix.needsUpdate = true;
    return count;
}


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
        this.player = null;
        this.worldEditor = null;
        this.wallTracer = null;
        this.iconRenderer = null;
        this.builderInputAdapter = null;
        this.diagGrid = null;
        this.subGridLines = null;
        this.subGridBlockers = null;
        this.diagMode = "off";
        this.walkGridChangeHandler = null;

        // Component class refs exposed for dev-console use. Modules don't
        // leak into global scope, so without this the dev console can't
        // call entity.getComponent(Walker) etc. directly.
        this.types = { Walker, Animator, WanderBehaviour };
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

        // Late-bound: SaveService doesn't exist until wireSaveService runs,
        // but the Save / Load / Reset button bindings are evaluated by
        // ko.applyBindings below — so the callables must already exist.
        this.viewModel.loadFile = () =>
        {
            if(this.saveService) { this.saveService.openFile(); }
        };
        this.viewModel.saveLair = () =>
        {
            if(this.saveService) { this.saveService.save(); }
        };
        this.viewModel.resetLair = () =>
        {
            this.viewModel.confirmModal.show({
                title:       "Reset lair?",
                message:     "Reset to a fresh starter room? Your current work will be lost.",
                actionLabel: "Reset",
                onConfirm:   () => this.resetLair()
            });
        };

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

        this.viewModel.loadStatus("Rendering catalogue icons");
        this.iconRenderer = new IconRenderer();
        this.viewModel.catalogueIcons(this.iconRenderer.renderCatalogue(this.assets));

        this.viewModel.installAuthoringPanel(this.assets);
        this.viewModel.authoringPanel().selectedToolId.subscribe(id =>
        {
            this.setTool(id);
            const builder = this.cameraControllers.builder;
            if(builder) { builder.setPanEnabled(id === null); }
        });

        this.buildWorld();
        this.wireSaveService();
        this.wireConfirmModal();

        const restoredSnapshot = this.saveService.loadFromAutosave();
        if(restoredSnapshot)
        {
            this.applyAutosaveSnapshot(restoredSnapshot);
        }
        else
        {
            this.buildFreshWorld();
        }

        this.buildCameraControllers();
        this.buildLoop();
        this.wireCameraToggle();
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

        if(this.builderInputAdapter)
        {
            if(mode === "builder")
            {
                this.builderInputAdapter.setCamera(this.cameraController.camera);
                this.builderInputAdapter.install();
            }
            else
            {
                // Clearing the panel's selected tool both fires the
                // ghost-teardown path via the subscribe and keeps the
                // active-tile highlight in sync with reality.
                const panel = this.viewModel.authoringPanel();
                if(panel) { panel.selectedToolId(null); }
                this.builderInputAdapter.uninstall();
            }
        }
    }

    shutdown()
    {
        if(this.isShutDown) { return; }
        this.isShutDown = true;

        if(this.gameLoop)         { this.gameLoop.stop(); }
        if(this.cameraController) { this.cameraController.deactivate(); }
        if(this.saveService)      { this.saveService.dispose(); }
        if(this.devConsole)       { this.devConsole.uninstall(); }
        if(this.wallTracer)       { this.wallTracer.dispose(); }
        if(this.iconRenderer)     { this.iconRenderer.dispose(); }

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
        this.world = new World(new Grid(GRID_WIDTH, GRID_DEPTH, GRID_CELL_SIZE), this.assets);
        this.world.scene.background = new THREE.Color(SCENE_BACKGROUND);
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

        const helper = buildRectGrid(grid, GRID_HELPER_COLOUR);
        helper.position.y = GRID_HELPER_Y_OFFSET;
        this.world.scene.add(helper);

        this.diagGrid = buildRectGrid(grid, DIAG_GRID_COLOUR);
        this.diagGrid.position.y = DIAG_GRID_Y_OFFSET;
        this.diagGrid.visible = false;
        this.world.scene.add(this.diagGrid);

        this.subGridLines = buildSubGridLines(this.world.walkGrid);
        this.subGridLines.position.y = SUB_GRID_LINE_Y_OFFSET;
        this.subGridLines.visible = false;
        this.world.scene.add(this.subGridLines);

        this.subGridBlockers = buildSubGridBlockerMesh(this.world.walkGrid);
        this.subGridBlockers.position.y = SUB_GRID_BLOCKER_Y_OFFSET;
        this.subGridBlockers.visible = false;
        this.world.scene.add(this.subGridBlockers);
        refreshSubGridBlockerMesh(this.world.walkGrid, this.subGridBlockers);

        this.walkGridChangeHandler = () =>
        {
            if(this.diagMode === "off") { return; }
            refreshSubGridBlockerMesh(this.world.walkGrid, this.subGridBlockers);
        };
        this.world.on("entityAdded",   this.walkGridChangeHandler);
        this.world.on("entityRemoved", this.walkGridChangeHandler);

        this.worldEditor = new WorldEditor({
            world:     this.world,
            assets:    this.assets,
            viewModel: this.viewModel
        });
        this.wallTracer = new WallTracer({ world: this.world, assets: this.assets });
    }

    buildFreshWorld()
    {
        for(let dx = 0; dx < STARTER_ROOM.width; dx++)
        {
            for(let dz = 0; dz < STARTER_ROOM.depth; dz++)
            {
                this.worldEditor.paintFloor(STARTER_ROOM.x0 + dx, STARTER_ROOM.z0 + dz);
            }
        }
        this.spawnPlayer();
    }

    resetLair()
    {
        // Order matters: clear autosave first so a crash mid-rebuild leaves
        // a clean slate; clearing the file handle so the next Ctrl+S
        // re-prompts (the previous handle pointed at unrelated content).
        this.saveService.clearAutosave();
        this.saveService.clearFileHandle();
        this.world.clear();
        this.buildFreshWorld();
    }

    applyAutosaveSnapshot(snapshot)
    {
        // Skip the same kinds at load that getSnapshot skips on save: the
        // player avatar and the tracer's derived walls + corners. Legacy
        // snapshots from before the skip-list landed may still carry them
        // — filter on load so a stale autosave still hydrates cleanly.
        const result = WorldSerializer.fromJSONv2(this.world, snapshot, this.assets, { skipKinds: SAVE_SKIP_KINDS });
        if(result.warnings.length > 0)
        {
            this.viewModel.toast(
                `Autosave restored with ${result.warnings.length} warning(s).`,
                "warning"
            );
        }

        // Minions round-trip Walker + Transform but not Animator /
        // WanderBehaviour (neither has toJSON). Reattach those so
        // the resurrected minions resume idling + wandering instead
        // of marching along their stale path.
        for(const entity of Array.from(this.world.entities))
        {
            if(this.worldEditor.isMinionEntity(entity))
            {
                this.worldEditor.rehydrateMinion(entity);
            }
        }

        this.spawnPlayer();
    }

    setTool(toolId)
    {
        if(!this.builderInputAdapter) { return; }
        const tool = this.buildToolFromId(toolId);
        this.builderInputAdapter.setTool(tool);
    }

    buildToolFromId(toolId)
    {
        if(!toolId) { return new NoopTool(); }
        if(toolId === "select") { return new SelectTool(); }

        // Tool IDs follow `tab:slug[:kind]` — split safely on the first
        // two colons so kinds with dots (e.g. "decor.barrel") stay intact.
        const firstColon = toolId.indexOf(":");
        const tab = toolId.slice(0, firstColon);
        const rest = toolId.slice(firstColon + 1);

        switch(tab)
        {
            case "build":
            {
                if(rest === "paint")       { return new FloorPaintTool(); }
                if(rest === "erase")       { return new FloorEraseTool(); }
                if(rest === "block:erase") { return new BlockEraseTool(); }

                const [slug, ...kindParts] = rest.split(":");
                const kind = kindParts.join(":");
                if(slug === "block" && kindParts[0] === "place")
                {
                    return new BlockPlaceTool({ kind: kindParts.slice(1).join(":") });
                }
                break;
            }
            case "decor":
            {
                const [slug, ...kindParts] = rest.split(":");
                const kind = kindParts.join(":");
                if(slug === "erase") { return new DecorEraseTool(); }
                if(slug === "place" && kind) { return new DecorPlaceTool({ kind }); }
                if(slug === "wall" && kindParts[0] === "place")
                {
                    return new WallDecorPlaceTool({ kind: kindParts.slice(1).join(":") });
                }
                break;
            }
            case "minion":
            {
                const [slug, ...kindParts] = rest.split(":");
                const kind = kindParts.join(":");
                if(slug === "erase") { return new MinionEraseTool(); }
                if(slug === "spawn" && kind) { return new MinionSpawnTool({ kind }); }
                break;
            }
        }
        console.warn(`[App] Unknown tool id: ${toolId}`);
        return new NoopTool();
    }

    spawnPlayer()
    {
        // Player avatar: a Mannequin model (visually distinct from the
        // wandering minions) that stays still wherever the player last
        // left them. No Walker, no WanderBehaviour — position is driven
        // by FirstPersonCamera while in FP mode. PLAYER_MARKER occupies
        // the grid cell so other walkers route around the player and
        // decor placement-on-player triggers `world.playerDisplaceHandler`.
        // Mannequin shares Rig_Medium with the skeleton minion, so the same
        // clip-name map drives idle / walk animations.
        const animations =
        [
            ...this.assets.getAnimations(PLAYER_KIND),
            ...this.assets.getAnimations("animations.rig-medium.general"),
            ...this.assets.getAnimations("animations.rig-medium.movement")
        ];

        const player = Entity.fromKind(PLAYER_KIND, this.assets);
        player.addComponent(new Animator({ clipMap: PLAYER_CLIPS, animations }));

        const spawn = this.world.grid.cellToWorld(PLAYER_SPAWN_CELL.cx, PLAYER_SPAWN_CELL.cz);
        player.object3D.position.set(spawn.x, 0, spawn.z);

        this.world.addEntity(player);
        player.getComponent(Animator).crossfade("idle");

        // Register player presence in the grid via the marker, regardless
        // of camera mode. Other walkers route around this cell; decor
        // placement on this cell triggers playerDisplaceHandler.
        this.world.grid.setOccupant(PLAYER_SPAWN_CELL.cx, PLAYER_SPAWN_CELL.cz, PLAYER_MARKER);

        this.player = player;
    }

    buildCameraControllers()
    {
        const S = this.world.grid.cellSize;
        // Frame the whole grid (not just the starter room) — otherwise the
        // outer rows of the build surface fall outside the initial frustum
        // and the user can't click them without panning.
        const gridCentre = new THREE.Vector3(
            this.world.grid.width * S / 2,
            0,
            this.world.grid.depth * S / 2
        );

        this.cameraControllers.builder = new BuilderCamera(this.input,
        {
            initialFocus:    gridCentre,
            initialDistance: 45,
            initialPhi:      Math.PI * 0.25,
            maxDistance:     80
        });

        const playerStart = this.player
            ? this.player.object3D.position.clone()
            : centre.clone();

        this.cameraControllers.firstPerson = new FirstPersonCamera(this.input,
        {
            lockTarget: this.canvasWrapper,
            initialPosition: playerStart,
            grid: this.world.grid,
            playerEntity: this.player,
            resolveCollision: (cx, cz, dx, dz) => this.resolvePlayerCollision(cx, cz, dx, dz)
        });

        this.world.setPlayerDisplaceHandler(cell => this.cameraControllers.firstPerson.teleportPlayer(cell));

        this.builderInputAdapter = new BuilderInputAdapter({
            input:              this.input,
            scene:              this.world.scene,
            grid:               this.world.grid,
            canvas:             this.renderer.canvas,
            getWallEntities:    () => [
                ...this.wallTracer.getWallEntities(),
                ...this.wallTracer.getCornerEntities()
            ],
            editor:             this.worldEditor,
            isTextInputFocused: () => this.isTextInputFocused(),
            onCancel:           () =>
            {
                const panel = this.viewModel.authoringPanel();
                if(panel) { panel.selectedToolId(null); }
            }
        });
    }

    resolvePlayerCollision(currentX, currentZ, desiredX, desiredZ)
    {
        // Hybrid model:
        //  - Walls / non-floor cells: per-axis bbox check. Player's
        //    bounding box (PLAYER_RADIUS in each direction) can't
        //    overlap any non-floor cell. Per-axis check enables sliding
        //    along axis-aligned walls.
        //  - Decor: circle depenetration. If the player's circle would
        //    overlap a decor circle, push the player tangentially out
        //    so they slide around the obstacle instead of stopping dead.
        //  - Other walkers: ignored (walking through minions is fine).
        //
        // After decor depenetration, re-check walls — if the push moved
        // the player's bbox into a wall, revert to the wall-clamped
        // position. Player will appear to "stick" near a decor item
        // hugging a wall, but won't ever clip through walls.

        let x = desiredX;
        if(this.bboxHitsNonFloor(x, currentZ)) { x = currentX; }
        let z = desiredZ;
        if(this.bboxHitsNonFloor(x, z)) { z = currentZ; }

        const wallSafeX = x;
        const wallSafeZ = z;

        const minDist = PLAYER_RADIUS + DECOR_RADIUS;
        const minDistSq = minDist * minDist;
        for(const entity of this.world.entities)
        {
            const placement = entity.getComponent(GridPlacement);
            if(!placement || !placement.blocks) { continue; }
            const decorX = entity.object3D.position.x;
            const decorZ = entity.object3D.position.z;
            const dx = x - decorX;
            const dz = z - decorZ;
            const distSq = dx * dx + dz * dz;
            if(distSq >= minDistSq) { continue; }
            if(distSq < 0.0001)
            {
                // Player position essentially equals decor centre — push
                // along +X arbitrarily.
                x = decorX + minDist;
            }
            else
            {
                const dist = Math.sqrt(distSq);
                x = decorX + (dx / dist) * minDist;
                z = decorZ + (dz / dist) * minDist;
            }
        }

        if(this.bboxHitsNonFloor(x, z))
        {
            // Decor push violated wall buffer — fall back to wall-safe
            // position (no decor slide this frame).
            return { x: wallSafeX, z: wallSafeZ };
        }
        return { x, z };
    }

    bboxHitsNonFloor(x, z)
    {
        const grid = this.world.grid;
        const r = PLAYER_RADIUS;
        const c0 = grid.worldToCell(x - r, z - r);
        const c1 = grid.worldToCell(x + r, z + r);
        for(let cx = c0.cx; cx <= c1.cx; cx++)
        {
            for(let cz = c0.cz; cz <= c1.cz; cz++)
            {
                if(!grid.isFloor(cx, cz)) { return true; }
            }
        }
        return false;
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
            getSnapshot: () => WorldSerializer.toJSON(this.world, { skipKinds: SAVE_SKIP_KINDS })
        });

        this.saveService.on("saved", payload =>
        {
            this.viewModel.flashSaveStatus(`Saved (${payload.size.toLocaleString()} bytes)`);
        });

        this.saveService.on("saveFailed", err =>
        {
            // AbortError is the user closing the picker — surface as "Cancelled"
            // rather than a scary failure.
            const cause = err && err.cause;
            const cancelled = cause && cause.name === "AbortError";
            const message = cancelled ? "Save cancelled" : `Save failed: ${err.message}`;
            this.viewModel.flashSaveStatus(message);
            this.viewModel.toast(message, cancelled ? "info" : "error");
        });

        this.saveService.on("autosaved", payload =>
        {
            this.viewModel.flashSaveStatus(`Autosaved (${payload.size.toLocaleString()} bytes)`);
        });

        this.saveService.on("loadRequested", payload =>
        {
            this.viewModel.confirmModal.show({
                title:       "Replace lair?",
                message:     `Replace the current lair with "${payload.fileName}"? Your current work will be lost.`,
                actionLabel: "Replace",
                onConfirm:   () => this.applyLoadedSnapshot(payload.snapshot, payload.fileName)
            });
        });

        this.saveService.on("loadFailed", err =>
        {
            const message = err && err.message ? err.message : "Couldn't load the file.";
            this.viewModel.toast(message, "error");
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

        this.input.preventDefaultFor(LOAD_KEY);
        this.loadHandler = event =>
        {
            if(event.code === LOAD_KEY && event.ctrl && !event.repeat)
            {
                this.saveService.openFile();
            }
        };
        this.input.on("keydown", this.loadHandler);

        this.saveService.startAutosave();
    }

    applyLoadedSnapshot(snapshot, fileName)
    {
        let result;
        try
        {
            result = WorldSerializer.fromJSONv2(this.world, snapshot, this.assets, { skipKinds: SAVE_SKIP_KINDS });
        }
        catch(err)
        {
            const message = err && err.message ? err.message : String(err);
            this.viewModel.toast(`Load failed: ${message}`, "error");
            return;
        }

        // Same minion-rehydration pass as auto-resume.
        for(const entity of Array.from(this.world.entities))
        {
            if(this.worldEditor.isMinionEntity(entity))
            {
                this.worldEditor.rehydrateMinion(entity);
            }
        }
        this.spawnPlayer();

        // Drop the previous save's FSA handle — silently writing the
        // freshly-loaded lair back to whatever file the user last saved
        // is confusing. Next Ctrl+S re-prompts the picker.
        this.saveService.clearFileHandle();

        const skipped = result.skipped || 0;
        const summary = skipped > 0
            ? `Loaded ${result.loaded} entities from "${fileName}" (${skipped} skipped).`
            : `Loaded ${result.loaded} entities from "${fileName}".`;
        this.viewModel.toast(summary, skipped > 0 ? "warning" : "info");
    }

    wireConfirmModal()
    {
        // Escape cancels an open confirm modal. BuilderInputAdapter also
        // listens for Escape to cancel the active tool, but that's a no-op
        // when no tool is active (the typical state when a modal is up),
        // so the two handlers cohabit without interference.
        this.confirmModalEscapeHandler = event =>
        {
            if(event.code !== "Escape" || event.repeat)         { return; }
            if(this.isTextInputFocused())                       { return; }
            if(!this.viewModel.confirmModal.visible())          { return; }
            this.viewModel.confirmModal.cancel();
        };
        this.input.on("keydown", this.confirmModalEscapeHandler);
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
            toggleCameraMode:     () => this.toggleCameraMode(),
            toggleDiagnosticGrid: () => this.toggleDiagnosticGrid(),
            setDiagMode:          mode => this.setDiagMode(mode),
            dumpWorldJSON:        () => this.dumpWorldJSON(),
            forceSaveFailure:     () => this.forceSaveFailure(),
            reloadManifest:       () => this.reloadManifest()
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

    toggleDiagnosticGrid()
    {
        const next = this.diagMode === "off" ? "overlay" : "off";
        this.setDiagMode(next);
        if(this.viewModel && this.viewModel.dev) { this.viewModel.dev.diagMode(next); }
    }

    setDiagMode(mode)
    {
        if(mode !== "off" && mode !== "overlay" && mode !== "sub-only")
        {
            console.warn(`setDiagMode: ignoring unknown mode "${mode}".`);
            return;
        }
        this.diagMode = mode;

        const showMain     = mode === "overlay";
        const showSubGrid  = mode === "overlay" || mode === "sub-only";

        if(this.diagGrid)        { this.diagGrid.visible        = showMain;    }
        if(this.subGridLines)    { this.subGridLines.visible    = showSubGrid; }
        if(this.subGridBlockers) { this.subGridBlockers.visible = showSubGrid; }

        if(showSubGrid && this.subGridBlockers)
        {
            refreshSubGridBlockerMesh(this.world.walkGrid, this.subGridBlockers);
        }
    }

    dumpWorldJSON()
    {
        const snapshot = WorldSerializer.toJSON(this.world);
        console.log(JSON.stringify(snapshot, null, 2));
    }

    diagnoseWalkers()
    {
        const walkGrid = this.world.walkGrid;
        const minions = [...this.world.entities].filter(e => e.getComponent(Walker));
        console.log("=== Walker diagnostics ===");
        for(let i = 0; i < minions.length; i++)
        {
            const minion = minions[i];
            const walker = minion.getComponent(Walker);
            const pos = minion.object3D.position;
            const physical = walkGrid.worldToSub(pos.x, pos.z);
            const reg = walker.currentSubCell
                ? `(${walker.currentSubCell.sx}, ${walker.currentSubCell.sz})`
                : "<null>";
            const drift = walker.currentSubCell
                && (physical.sx !== walker.currentSubCell.sx || physical.sz !== walker.currentSubCell.sz)
                ? " ** DRIFT **" : "";
            console.log(
                `  #${i} pos=(${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}) ` +
                `physicalSub=(${physical.sx}, ${physical.sz}) ` +
                `registered=${reg} ` +
                `completed=${walker.completed}${drift}`
            );
        }
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
                if(this.subGridBlockers && this.subGridBlockers.visible)
                {
                    refreshSubGridBlockerMesh(this.world.walkGrid, this.subGridBlockers);
                }
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
