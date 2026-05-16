import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World }         from "../../scripts/modules/world/world.js";
import { Grid }          from "../../scripts/modules/world/grid.js";
import { Entity }        from "../../scripts/modules/world/entity.js";
import { GridPlacement } from "../../scripts/modules/world/components/grid-placement.js";
import { EdgePlacement } from "../../scripts/modules/world/components/edge-placement.js";
import { Walker }        from "../../scripts/modules/world/components/walker.js";
import { WorldEditor }   from "../../scripts/modules/world/world-editor.js";

import { PLAYER_MARKER } from "../../scripts/modules/engine/player-marker.js";


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

function makeAssets(kindMap = {})
{
    // Stub AssetManager: `get` returns an empty mesh for any kind; `getKind`,
    // `getDisplayName`, and `getMeta` consult `kindMap`; `getAnimations`
    // returns [].
    return {
        get(_id) { return new THREE.Mesh(); },
        getKind(id)
        {
            return kindMap[id]?.kind ?? null;
        },
        getDisplayName(id)
        {
            return kindMap[id]?.displayName ?? null;
        },
        getMeta(id)
        {
            return kindMap[id]?.meta ?? {};
        },
        getAnimations(_id) { return []; }
    };
}


function makeViewModel()
{
    return { toast: vi.fn() };
}


function setup(kindMap = {})
{
    const world = new World(new Grid(8, 8, 4));
    const assets = makeAssets(kindMap);
    const viewModel = makeViewModel();
    const editor = new WorldEditor({ world, assets, viewModel });
    return { world, assets, viewModel, editor };
}


function paintFloors(editor, cells)
{
    for(const { cx, cz } of cells)
    {
        editor.paintFloor(cx, cz);
    }
}


/******************************************************************************/
/* paintFloor                                                                 */
/******************************************************************************/

test("paintFloor on an empty cell adds a walkable floor entity", () =>
{
    const { editor, world } = setup();
    expect(editor.paintFloor(3, 3)).toBe(true);
    expect(world.grid.isFloor(3, 3)).toBe(true);
});


test("paintFloor on an existing floor is idempotent — returns true, no duplicate", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);
    const before = world.entities.size;

    expect(editor.paintFloor(3, 3)).toBe(true);
    expect(world.entities.size).toBe(before);
});


test("paintFloor refuses out-of-bounds and emits a toast", () =>
{
    const { editor, viewModel } = setup();
    expect(editor.paintFloor(-1, 0)).toBe(false);
    expect(editor.paintFloor(0, 99)).toBe(false);
    expect(viewModel.toast).toHaveBeenCalledTimes(2);
});


test("canPaintFloor mirrors paintFloor gates", () =>
{
    const { editor } = setup();
    expect(editor.canPaintFloor(3, 3)).toBe(true);
    expect(editor.canPaintFloor(-1, 0)).toBe(false);
    expect(editor.canPaintFloor(99, 0)).toBe(false);
});


/******************************************************************************/
/* eraseFloor                                                                 */
/******************************************************************************/

test("eraseFloor on an empty floor cell removes the floor entity", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);
    expect(world.grid.isFloor(3, 3)).toBe(true);

    expect(editor.eraseFloor(3, 3)).toBe(true);
    expect(world.grid.isFloor(3, 3)).toBe(false);
});


test("eraseFloor refuses cells holding PLAYER_MARKER and toasts", () =>
{
    const { editor, world, viewModel } = setup();
    editor.paintFloor(3, 3);
    world.grid.setOccupant(3, 3, PLAYER_MARKER);

    expect(editor.eraseFloor(3, 3)).toBe(false);
    expect(world.grid.isFloor(3, 3)).toBe(true);
    expect(viewModel.toast).toHaveBeenCalledWith(expect.stringContaining("player"), "warning");
});


test("eraseFloor refuses cells holding a walker and toasts", () =>
{
    const { editor, world, viewModel } = setup();
    editor.paintFloor(3, 3);

    // Walker presence is detected by scanning entities for any walker whose
    // currentSubCell maps into main cell (3, 3). Stand a walker on a sub-cell
    // inside (3, 3) — sub-cells (12..15, 12..15) at default 4× scaling.
    const walker = new Entity("test.walker", new THREE.Object3D());
    const wComp  = walker.addComponent(new Walker());
    wComp.currentSubCell = { sx: 13, sz: 13 };
    world.entities.add(walker);

    expect(editor.eraseFloor(3, 3)).toBe(false);
    expect(viewModel.toast).toHaveBeenCalledWith(expect.stringContaining("minion"), "warning");
});


test("eraseFloor refuses non-floor cells and OOB with a toast", () =>
{
    const { editor, viewModel } = setup();
    expect(editor.eraseFloor(3, 3)).toBe(false);       // not a floor
    expect(editor.eraseFloor(-1, 0)).toBe(false);      // OOB
    expect(viewModel.toast).toHaveBeenCalledTimes(2);
});


test("eraseFloor cascade-removes decor in the cell before removing the floor", () =>
{
    const { editor, world } = setup({ "decor.crate": { kind: "decor.floor", displayName: "Crate" } });
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.crate", 3, 3);
    expect(world.grid.blockedCells.has(world.grid.cellKey(3, 3))).toBe(true);

    expect(editor.eraseFloor(3, 3)).toBe(true);
    expect(world.grid.isFloor(3, 3)).toBe(false);
    expect(world.grid.blockedCells.has(world.grid.cellKey(3, 3))).toBe(false);
});


/******************************************************************************/
/* placeDecor                                                                 */
/******************************************************************************/

test("placeDecor on an empty floor cell adds a blocking entity", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);

    expect(editor.placeDecor("decor.crate", 3, 3)).toBe(true);
    expect(world.grid.blockedCells.has(world.grid.cellKey(3, 3))).toBe(true);
});


test("placeDecor refuses non-floor cells with a toast", () =>
{
    const { editor, viewModel } = setup();
    expect(editor.placeDecor("decor.crate", 3, 3)).toBe(false);
    expect(viewModel.toast).toHaveBeenCalled();
});


test("placeDecor refuses cells already holding blocking decor", () =>
{
    const { editor } = setup();
    editor.paintFloor(3, 3);
    expect(editor.placeDecor("decor.crate", 3, 3)).toBe(true);
    expect(editor.placeDecor("decor.barrel", 3, 3)).toBe(false);
});


test("placeDecor refuses cells holding the player marker", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);
    world.grid.setOccupant(3, 3, PLAYER_MARKER);

    expect(editor.placeDecor("decor.crate", 3, 3)).toBe(false);
});


test("placeDecor refuses cells holding a walker", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);

    const walker = new Entity("test.walker", new THREE.Object3D());
    const wComp  = walker.addComponent(new Walker());
    wComp.currentSubCell = { sx: 13, sz: 13 };  // sub-cell in main cell (3, 3)
    world.entities.add(walker);

    expect(editor.placeDecor("decor.crate", 3, 3)).toBe(false);
});


test("placeDecor applies the requested rotationStep", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.crate", 3, 3, 2);

    const decor = [...world.entities].find(e =>
    {
        const gp = e.getComponent(GridPlacement);
        return gp && gp.blocks && gp.cx === 3 && gp.cz === 3;
    });
    expect(decor.getComponent(GridPlacement).rotationStep).toBe(2);
});


/******************************************************************************/
/* removeDecor                                                                */
/******************************************************************************/

test("removeDecor removes a placed decor entity and clears the block", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.crate", 3, 3);

    const decor = [...world.entities].find(e =>
        e.getComponent(GridPlacement)?.blocks);

    expect(editor.removeDecor(decor)).toBe(true);
    expect(world.grid.blockedCells.size).toBe(0);
});


test("removeDecor refuses non-decor entities", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);

    const floorEntity = [...world.entities][0];
    expect(editor.removeDecor(floorEntity)).toBe(false);
    expect(editor.removeDecor(null)).toBe(false);
    expect(editor.removeDecor({})).toBe(false);
});


/******************************************************************************/
/* placeWallDecor                                                             */
/******************************************************************************/

test("placeWallDecor refuses an edge with no wall", () =>
{
    const { editor, viewModel } = setup({
        "decor.banner": { kind: "decor.wall", displayName: "Banner" }
    });
    expect(editor.placeWallDecor("decor.banner", { cx: 3, cz: 3, side: "north" })).toBe(false);
    expect(viewModel.toast).toHaveBeenCalled();
});


test("placeWallDecor succeeds when one side of the edge is a floor", () =>
{
    const { editor, world } = setup({
        "decor.banner": { kind: "decor.wall", displayName: "Banner" }
    });
    editor.paintFloor(3, 3);

    expect(editor.placeWallDecor("decor.banner", { cx: 3, cz: 3, side: "north" })).toBe(true);

    const wallDecor = [...world.entities].find(e => e.kind === "decor.banner");
    expect(wallDecor).toBeTruthy();
});


test("placeWallDecor refuses an edge that already holds wall decor", () =>
{
    const { editor } = setup({
        "decor.banner": { kind: "decor.wall", displayName: "Banner" }
    });
    editor.paintFloor(3, 3);

    expect(editor.placeWallDecor("decor.banner", { cx: 3, cz: 3, side: "north" })).toBe(true);
    expect(editor.placeWallDecor("decor.banner", { cx: 3, cz: 3, side: "north" })).toBe(false);
});


test("placeWallDecor resolves either side of the same edge to the same wall", () =>
{
    const { editor } = setup({
        "decor.banner": { kind: "decor.wall", displayName: "Banner" }
    });
    editor.paintFloor(3, 3);

    // Approaching from (3, 4)'s south side should resolve to the same edge as
    // (3, 3)'s north side — both refer to the floor/non-floor boundary at z=4.
    expect(editor.placeWallDecor("decor.banner", { cx: 3, cz: 4, side: "south" })).toBe(true);
    expect(editor.placeWallDecor("decor.banner", { cx: 3, cz: 3, side: "north" })).toBe(false);
});


test("placeWallDecor accepts edges with no rendered wall entity (1-cell alcove)", () =>
{
    const { editor } = setup({
        "decor.banner": { kind: "decor.wall", displayName: "Banner" }
    });
    // A single floor cell has corners at all 4 vertices; WallTracer covers
    // every edge with corner-piece arms only — no wall.* entities exist.
    // The wall logically exists (one side floor, one side not) so wall
    // decor must still be placeable.
    editor.paintFloor(3, 3);

    expect(editor.canPlaceWallDecor("decor.banner", { cx: 3, cz: 3, side: "east" })).toBe(true);
    expect(editor.placeWallDecor("decor.banner", { cx: 3, cz: 3, side: "east" })).toBe(true);
});


/******************************************************************************/
/* spawnMinion + removeMinion                                                 */
/******************************************************************************/

test("spawnMinion on an empty floor cell creates a walker entity", () =>
{
    const { editor, world } = setup({
        "character.skeleton.minion": { kind: "character", displayName: "Skeleton Minion" }
    });
    editor.paintFloor(3, 3);

    expect(editor.spawnMinion("character.skeleton.minion", 3, 3)).toBe(true);

    const minion = [...world.entities].find(e => e.getComponent(Walker));
    expect(minion).toBeTruthy();
});


test("spawnMinion refuses non-floor cells with a toast", () =>
{
    const { editor, viewModel } = setup();
    expect(editor.spawnMinion("character.skeleton.minion", 3, 3)).toBe(false);
    expect(viewModel.toast).toHaveBeenCalled();
});


test("spawnMinion refuses cells already occupied", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);
    world.grid.setOccupant(3, 3, PLAYER_MARKER);

    expect(editor.spawnMinion("character.skeleton.minion", 3, 3)).toBe(false);
});


test("removeMinion removes a spawned minion entity", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);
    editor.spawnMinion("character.skeleton.minion", 3, 3);

    const minion = [...world.entities].find(e => e.getComponent(Walker));
    expect(editor.removeMinion(minion)).toBe(true);
});


test("removeMinion refuses non-minion entities", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);

    const floorEntity = [...world.entities][0];
    expect(editor.removeMinion(floorEntity)).toBe(false);
    expect(editor.removeMinion(null)).toBe(false);
});


/******************************************************************************/
/* PREDICATES vs ACTIONS — gate consistency                                   */
/******************************************************************************/

test("canEraseFloor agrees with eraseFloor for player-occupied cells", () =>
{
    const { editor, world } = setup();
    editor.paintFloor(3, 3);
    world.grid.setOccupant(3, 3, PLAYER_MARKER);

    expect(editor.canEraseFloor(3, 3)).toBe(false);
    expect(editor.eraseFloor(3, 3)).toBe(false);
});


test("canPlaceDecor agrees with placeDecor for blocked cells", () =>
{
    const { editor } = setup();
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.crate", 3, 3);

    expect(editor.canPlaceDecor("decor.barrel", 3, 3)).toBe(false);
    expect(editor.placeDecor("decor.barrel", 3, 3)).toBe(false);
});


test("canSpawnMinion agrees with spawnMinion", () =>
{
    const { editor, world } = setup();
    expect(editor.canSpawnMinion("character.skeleton.minion", 3, 3)).toBe(false);  // not a floor
    editor.paintFloor(3, 3);
    expect(editor.canSpawnMinion("character.skeleton.minion", 3, 3)).toBe(true);
    world.grid.setOccupant(3, 3, PLAYER_MARKER);
    expect(editor.canSpawnMinion("character.skeleton.minion", 3, 3)).toBe(false);
});


/******************************************************************************/
/* Toast suppression when no view-model                                       */
/******************************************************************************/

test("no toast emitted when viewModel is null — refusal still returns false", () =>
{
    const world = new World(new Grid(8, 8, 4));
    const editor = new WorldEditor({
        world,
        assets: makeAssets(),
        viewModel: null
    });

    // Doesn't throw.
    expect(editor.paintFloor(-1, 0)).toBe(false);
    expect(editor.eraseFloor(3, 3)).toBe(false);
});


/******************************************************************************/
/* SURFACE PLACEMENT                                                          */
/******************************************************************************/

const SURFACE_KIND_MAP = {
    "decor.table": {
        kind: "decor.floor",
        displayName: "Table",
        meta: { surface: { surfaceY: 0.85 } }
    },
    "decor.candle.triple": {
        kind: "decor.floor",
        displayName: "Triple Candle",
        meta: { placeableOnSurface: true }
    },
    "decor.bottles": {
        kind: "decor.floor",
        displayName: "Bottles",
        meta: { placeableOnSurface: true }
    },
    "decor.chair": {
        kind: "decor.floor",
        displayName: "Chair"
        // no meta — pure floor decor
    }
};


test("findSurfaceAtCell returns the surface entity when one is present", () =>
{
    const { editor, world } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);

    const surface = editor.findSurfaceAtCell(3, 3);
    expect(surface).not.toBeNull();
    expect(surface.kind).toBe("decor.table");
    expect(editor.findSurfaceAtCell(4, 4)).toBeNull();
});


test("getPlacementYFor returns the surface's surfaceY for a placeable kind on a surface cell", () =>
{
    const { editor } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);

    expect(editor.getPlacementYFor("decor.candle.triple", 3, 3)).toBe(0.85);
});


test("getPlacementYFor returns 0 for a placeable kind on a bare floor cell", () =>
{
    const { editor } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);

    expect(editor.getPlacementYFor("decor.candle.triple", 3, 3)).toBe(0);
});


test("getPlacementYFor returns 0 for a non-placeable kind on a surface cell", () =>
{
    const { editor } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);

    expect(editor.getPlacementYFor("decor.chair", 3, 3)).toBe(0);
});


test("canPlaceDecor allows a placeableOnSurface kind on a surface cell", () =>
{
    const { editor } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);

    expect(editor.canPlaceDecor("decor.candle.triple", 3, 3)).toBe(true);
});


test("canPlaceDecor refuses a placeableOnSurface kind when the surface already has one", () =>
{
    const { editor } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);
    editor.placeDecor("decor.candle.triple", 3, 3);

    expect(editor.canPlaceDecor("decor.bottles", 3, 3)).toBe(false);
});


test("canPlaceDecor refuses a non-placeableOnSurface kind on a surface cell", () =>
{
    const { editor } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);

    expect(editor.canPlaceDecor("decor.chair", 3, 3)).toBe(false);
});


test("placeDecor of a placeableOnSurface kind on a surface cell sets surfaceY to the surface's height", () =>
{
    const { editor, world } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);
    editor.placeDecor("decor.candle.triple", 3, 3);

    const candle = [...world.entities].find(e => e.kind === "decor.candle.triple");
    expect(candle.getComponent(GridPlacement).surfaceY).toBe(0.85);
});


test("placeDecor of a placeableOnSurface kind on bare floor sets surfaceY to 0 (floor placement)", () =>
{
    const { editor, world } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.candle.triple", 3, 3);

    const candle = [...world.entities].find(e => e.kind === "decor.candle.triple");
    expect(candle.getComponent(GridPlacement).surfaceY).toBe(0);
    expect(candle.getComponent(GridPlacement).blocks).toBe(true);
});


test("removeDecor of a surface entity cascade-removes any placeables sitting on it", () =>
{
    const { editor, world } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);
    editor.placeDecor("decor.candle.triple", 3, 3);

    const table = [...world.entities].find(e => e.kind === "decor.table");
    expect(editor.removeDecor(table)).toBe(true);

    expect([...world.entities].some(e => e.kind === "decor.table")).toBe(false);
    expect([...world.entities].some(e => e.kind === "decor.candle.triple")).toBe(false);
});


test("removeDecor of a placeable directly leaves the surface intact", () =>
{
    const { editor, world } = setup(SURFACE_KIND_MAP);
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);
    editor.placeDecor("decor.candle.triple", 3, 3);

    const candle = [...world.entities].find(e => e.kind === "decor.candle.triple");
    expect(editor.removeDecor(candle)).toBe(true);

    expect([...world.entities].some(e => e.kind === "decor.candle.triple")).toBe(false);
    expect([...world.entities].some(e => e.kind === "decor.table")).toBe(true);
});


/******************************************************************************/
/* NUDGE                                                                      */
/******************************************************************************/

function boxAabb(halfX, halfZ, halfY = 0.5)
{
    return new THREE.Box3(
        new THREE.Vector3(-halfX, 0,      -halfZ),
        new THREE.Vector3( halfX, halfY,   halfZ)
    );
}


function makeNudgeAssets(kindMap = {}, aabbMap = {})
{
    const assets = makeAssets(kindMap);
    assets.getAabb = (id) => aabbMap[id] || null;
    return assets;
}


function setupForNudge({ kindMap = {}, aabbMap = {} } = {})
{
    const assets = makeNudgeAssets(kindMap, aabbMap);
    const world = new World(new Grid(8, 8, 4), assets);
    const viewModel = makeViewModel();
    const editor = new WorldEditor({ world, assets, viewModel });
    return { world, assets, viewModel, editor };
}


function findDecorEntity(world, kind)
{
    return [...world.entities].find(e => e.kind === kind);
}


const NUDGE_KIND_MAP = {
    "decor.crate":   { kind: "decor.floor", displayName: "Crate" },
    "decor.barrel":  { kind: "decor.floor", displayName: "Barrel" },
    "decor.table":   { kind: "decor.floor", displayName: "Table", meta: { surface: { surfaceY: 0.85 } } },
    "decor.candle":  { kind: "decor.floor", displayName: "Candle", meta: { placeableOnSurface: true } }
};


test("canNudge accepts a blocking decor entity within a clear neighbourhood", () =>
{
    const { editor } = setupForNudge({
        kindMap: NUDGE_KIND_MAP,
        aabbMap: { "decor.crate": boxAabb(0.5, 0.5) }
    });
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.crate", 3, 3);
    const crate = findDecorEntity(editor.world, "decor.crate");

    expect(editor.canNudge(crate, 1, 0)).toBe(true);
});


test("nudgeEntity applies the delta to xOffset/zOffset and re-stamps the walk-grid", () =>
{
    const { editor, world } = setupForNudge({
        kindMap: NUDGE_KIND_MAP,
        aabbMap: { "decor.crate": boxAabb(0.5, 0.5) }
    });
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.crate", 3, 3);
    const crate = findDecorEntity(world, "decor.crate");
    const placement = crate.getComponent(GridPlacement);

    const oldStamp = [...placement.stampedSubCells];
    expect(oldStamp.length).toBeGreaterThan(0);

    expect(editor.nudgeEntity(crate, 1, 0)).toBe(true);
    expect(placement.xOffset).toBe(1);
    expect(placement.zOffset).toBe(0);

    // Old footprint sub-cells now read walkable; the new footprint sub-cells
    // are stamped. A 1m delta in +X must shift the stamp by exactly 1 sub-cell.
    const newStamp = placement.stampedSubCells;
    expect(newStamp.length).toBe(oldStamp.length);

    const oldXs = oldStamp.map(c => c.sx).sort((a, b) => a - b);
    const newXs = newStamp.map(c => c.sx).sort((a, b) => a - b);
    expect(newXs[0] - oldXs[0]).toBe(1);

    for(const sub of newStamp)
    {
        expect(world.walkGrid.isWalkable(sub.sx, sub.sz)).toBe(false);
    }
});


test("nudgeEntity updates the entity's world position by the requested delta", () =>
{
    const { editor, world } = setupForNudge({
        kindMap: NUDGE_KIND_MAP,
        aabbMap: { "decor.crate": boxAabb(0.5, 0.5) }
    });
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.crate", 3, 3);
    const crate = findDecorEntity(world, "decor.crate");
    const oldX = crate.object3D.position.x;
    const oldZ = crate.object3D.position.z;

    expect(editor.nudgeEntity(crate, 1, -1)).toBe(true);
    expect(crate.object3D.position.x).toBe(oldX + 1);
    expect(crate.object3D.position.z).toBe(oldZ - 1);
});


test("canNudge refuses when the new footprint would overlap another blocker", () =>
{
    const { editor, world } = setupForNudge({
        kindMap: NUDGE_KIND_MAP,
        aabbMap: { "decor.crate": boxAabb(0.5, 0.5), "decor.barrel": boxAabb(0.5, 0.5) }
    });
    editor.paintFloor(3, 3);
    editor.paintFloor(4, 3);
    editor.placeDecor("decor.crate",  3, 3);
    editor.placeDecor("decor.barrel", 4, 3);

    const crate = findDecorEntity(world, "decor.crate");

    // Nudging +4m in X drops the crate squarely on top of the barrel's stamp.
    expect(editor.canNudge(crate, 4, 0)).toBe(false);
});


test("nudgeEntity refusal emits a toast and leaves the walk-grid untouched", () =>
{
    const { editor, world, viewModel } = setupForNudge({
        kindMap: NUDGE_KIND_MAP,
        aabbMap: { "decor.crate": boxAabb(0.5, 0.5), "decor.barrel": boxAabb(0.5, 0.5) }
    });
    editor.paintFloor(3, 3);
    editor.paintFloor(4, 3);
    editor.placeDecor("decor.crate",  3, 3);
    editor.placeDecor("decor.barrel", 4, 3);

    const crate = findDecorEntity(world, "decor.crate");
    const placement = crate.getComponent(GridPlacement);
    const before = placement.stampedSubCells.map(c => ({ sx: c.sx, sz: c.sz }));

    expect(editor.nudgeEntity(crate, 4, 0)).toBe(false);
    expect(viewModel.toast).toHaveBeenCalledWith(expect.stringContaining("overlap"), "warning");

    // Stamp unchanged and old footprint still claims the sub-grid.
    expect(placement.stampedSubCells).toEqual(before);
    for(const sub of before)
    {
        expect(world.walkGrid.isWalkable(sub.sx, sub.sz)).toBe(false);
    }
});


test("nudgeEntity on a surface-placed decor doesn't touch the walk-grid", () =>
{
    const { editor, world } = setupForNudge({
        kindMap: NUDGE_KIND_MAP,
        aabbMap: {
            "decor.table":  boxAabb(1, 1),
            "decor.candle": boxAabb(0.25, 0.25)
        }
    });
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.table", 3, 3);
    editor.placeDecor("decor.candle", 3, 3);

    const candle = findDecorEntity(world, "decor.candle");
    const placement = candle.getComponent(GridPlacement);

    expect(placement.blocks).toBe(false);
    expect(placement.surfaceY).toBeGreaterThan(0);
    expect(placement.stampedSubCells).toEqual([]);

    const refsBefore = Array.from(world.walkGrid.refcounts);

    expect(editor.nudgeEntity(candle, 0.5, 0.5)).toBe(true);
    expect(placement.xOffset).toBe(0.5);
    expect(placement.zOffset).toBe(0.5);
    expect(placement.stampedSubCells).toEqual([]);

    expect(Array.from(world.walkGrid.refcounts)).toEqual(refsBefore);
});


test("canNudge / nudgeEntity reject floor entities", () =>
{
    const { editor, world } = setupForNudge();
    editor.paintFloor(3, 3);
    const floor = [...world.entities].find(e => e.kind === "floor.stone.basic");
    expect(floor).toBeTruthy();

    expect(editor.canNudge(floor, 1, 0)).toBe(false);
    expect(editor.nudgeEntity(floor, 1, 0)).toBe(false);
});


test("canNudge / nudgeEntity reject wall.stone.* kinds", () =>
{
    const { editor, world } = setupForNudge();
    editor.paintFloor(3, 3);

    // wall.stone.* entities are tracer-derived; fabricate one with a
    // GridPlacement to exercise the kind-prefix guard (the GridPlacement guard
    // already rejects EdgePlacement-only walls).
    const wall = new Entity("wall.stone.straight", new THREE.Object3D());
    wall.addComponent(new GridPlacement(3, 3, 0));
    world.entities.add(wall);

    expect(editor.canNudge(wall, 1, 0)).toBe(false);
    expect(editor.nudgeEntity(wall, 1, 0)).toBe(false);
});


test("canNudge / nudgeEntity reject entities lacking a GridPlacement", () =>
{
    const { editor } = setupForNudge();
    const bare = new Entity("decor.crate", new THREE.Object3D());

    expect(editor.canNudge(bare, 1, 0)).toBe(false);
    expect(editor.nudgeEntity(bare, 1, 0)).toBe(false);
});


test("canNudge rejects non-finite deltas", () =>
{
    const { editor, world } = setupForNudge({
        kindMap: NUDGE_KIND_MAP,
        aabbMap: { "decor.crate": boxAabb(0.5, 0.5) }
    });
    editor.paintFloor(3, 3);
    editor.placeDecor("decor.crate", 3, 3);
    const crate = findDecorEntity(world, "decor.crate");

    expect(editor.canNudge(crate, NaN, 0)).toBe(false);
    expect(editor.canNudge(crate, 0, Infinity)).toBe(false);
});


test("canNudge agrees with nudgeEntity across happy + refusal paths", () =>
{
    const { editor, world } = setupForNudge({
        kindMap: NUDGE_KIND_MAP,
        aabbMap: { "decor.crate": boxAabb(0.5, 0.5), "decor.barrel": boxAabb(0.5, 0.5) }
    });
    editor.paintFloor(3, 3);
    editor.paintFloor(4, 3);
    editor.placeDecor("decor.crate",  3, 3);
    editor.placeDecor("decor.barrel", 4, 3);

    const crate = findDecorEntity(world, "decor.crate");

    expect(editor.canNudge(crate,  1, 0)).toBe(true);
    expect(editor.canNudge(crate,  4, 0)).toBe(false);
});
