import { test, expect, vi, beforeEach, afterEach } from "vitest";

import { World }            from "../../scripts/modules/world/world.js";
import { Grid }             from "../../scripts/modules/world/grid.js";
import { Entity }           from "../../scripts/modules/world/entity.js";
import { GridPlacement }    from "../../scripts/modules/world/components/grid-placement.js";
import { EdgePlacement }    from "../../scripts/modules/world/components/edge-placement.js";
import { CornerPlacement }  from "../../scripts/modules/world/components/corner-placement.js";
import { Walker }           from "../../scripts/modules/world/components/walker.js";

import * as WorldSerializer from "../../scripts/modules/world/world-serializer.js";


const STUB_ASSETS = { get: () => { throw new Error("stub: no asset cache in test"); } };


let warnSpy;

beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach (() => { warnSpy.mockRestore(); });


function makeWorld()
{
    return new World(new Grid(8, 8, 4));
}


/* SHAPE / VERSION ************************************************************/

test("toJSON returns a v2 snapshot with kinds, components, and entities arrays", () =>
{
    const snapshot = WorldSerializer.toJSON(makeWorld());

    expect(snapshot.v).toBe(WorldSerializer.SCHEMA_VERSION);
    expect(snapshot.v).toBe(2);
    expect(Array.isArray(snapshot.kinds)).toBe(true);
    expect(Array.isArray(snapshot.components)).toBe(true);
    expect(Array.isArray(snapshot.entities)).toBe(true);
    expect(snapshot.entities.length).toBe(0);
});


/* DICT ENCODING **************************************************************/

test("toJSON de-dupes kinds and components into dictionary tables", () =>
{
    const world = makeWorld();

    for(let cz = 0; cz < 3; cz++)
    {
        const floor = Entity.fromKind("floor.stone.basic", STUB_ASSETS);
        floor.addComponent(new GridPlacement(0, cz, 0, { walkable: true }));
        world.addEntity(floor);
    }

    const snapshot = WorldSerializer.toJSON(world);

    expect(snapshot.kinds).toContain("floor.stone.basic");
    expect(snapshot.kinds.length).toBe(1);

    expect(snapshot.components).toContain("Renderable");
    expect(snapshot.components).toContain("GridPlacement");

    expect(snapshot.entities.length).toBe(3);
    for(const record of snapshot.entities)
    {
        expect(record[0]).toBe(0);
    }
});


/* ENUM ENCODING **************************************************************/

test("toJSON encodes EdgePlacement.side as a small integer", () =>
{
    const world = makeWorld();

    const wall = Entity.fromKind("wall.stone.straight", STUB_ASSETS);
    wall.addComponent(new EdgePlacement(1, 1, "north", 0, 0));
    world.addEntity(wall);

    const snapshot = WorldSerializer.toJSON(world);
    const edgeComponentIdx = snapshot.components.indexOf("EdgePlacement");
    const edgeRecord = snapshot.entities[0][1].find(c => c[0] === edgeComponentIdx);

    expect(typeof edgeRecord[1].side).toBe("number");
    expect(edgeRecord[1].side).toBe(1);
});

test("toJSON encodes CornerPlacement.corner as a small integer", () =>
{
    const world = makeWorld();

    const corner = Entity.fromKind("wall.stone.corner", STUB_ASSETS);
    corner.addComponent(new CornerPlacement(2, 3, "NE"));
    world.addEntity(corner);

    const snapshot = WorldSerializer.toJSON(world);
    const cornerComponentIdx = snapshot.components.indexOf("CornerPlacement");
    const cornerRecord = snapshot.entities[0][1].find(c => c[0] === cornerComponentIdx);

    expect(typeof cornerRecord[1].corner).toBe("number");
    expect(cornerRecord[1].corner).toBe(1);
});


/* ROUND-TRIP — PROGRAMMATIC **************************************************/

test("round-trip — programmatically built world preserves entity count and component data", () =>
{
    const source = makeWorld();

    const floor = Entity.fromKind("floor.stone.basic", STUB_ASSETS);
    floor.addComponent(new GridPlacement(2, 3, 1));
    source.addEntity(floor);

    const wall = Entity.fromKind("wall.stone.straight", STUB_ASSETS);
    wall.addComponent(new EdgePlacement(3, 3, "north", 0, 0));
    source.addEntity(wall);

    const corner = Entity.fromKind("wall.stone.corner", STUB_ASSETS);
    corner.addComponent(new CornerPlacement(2, 3, "NE"));
    source.addEntity(corner);

    const minion = Entity.fromKind("character.skeleton.minion", STUB_ASSETS);
    const walker = minion.addComponent(new Walker({ speed: 2.0 }));
    source.addEntity(minion);
    walker.followPath([{ sx: 4, sz: 4 }, { sx: 12, sz: 12 }]);

    const snapshot = WorldSerializer.toJSON(source);

    const target = makeWorld();
    const result = WorldSerializer.fromJSONv2(target, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(4);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(target.entities.size).toBe(4);
    expect(WorldSerializer.toJSON(target)).toEqual(snapshot);
});


test("round-trip — every side and corner enum value", () =>
{
    const source = makeWorld();

    for(const side of ["south", "north", "west", "east"])
    {
        const wall = Entity.fromKind("wall.stone.straight", STUB_ASSETS);
        wall.addComponent(new EdgePlacement(1, 1, side, 0, 0));
        source.addEntity(wall);
    }

    for(const corner of ["NW", "NE", "SW", "SE"])
    {
        const piece = Entity.fromKind("wall.stone.corner", STUB_ASSETS);
        piece.addComponent(new CornerPlacement(2, 2, corner));
        source.addEntity(piece);
    }

    const snapshot = WorldSerializer.toJSON(source);

    const target = makeWorld();
    WorldSerializer.fromJSONv2(target, snapshot, STUB_ASSETS);

    expect(WorldSerializer.toJSON(target)).toEqual(snapshot);

    const sidesInTarget = Array.from(target.entities)
        .map(e => e.getComponent(EdgePlacement))
        .filter(c => c !== undefined)
        .map(c => c.side);
    expect(sidesInTarget.sort()).toEqual(["east", "north", "south", "west"]);

    const cornersInTarget = Array.from(target.entities)
        .map(e => e.getComponent(CornerPlacement))
        .filter(c => c !== undefined)
        .map(c => c.corner);
    expect(cornersInTarget.sort()).toEqual(["NE", "NW", "SE", "SW"]);
});


/* CLEAR-ON-LOAD **************************************************************/

test("fromJSONv2 clears existing entities before reconstruction", () =>
{
    const world  = makeWorld();
    const stale  = Entity.fromKind("floor.stone.basic", STUB_ASSETS);
    world.addEntity(stale);
    expect(world.entities.size).toBe(1);

    const snapshot = { v: 2, kinds: [], components: [], entities: [] };
    const result   = WorldSerializer.fromJSONv2(world, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(0);
    expect(world.entities.size).toBe(0);
});


/* WALLTRACER RECONCILIATION VIA ENTITY EVENTS ********************************/

test("fromJSONv2 fires entityAdded for every reconstructed entity", () =>
{
    const source = makeWorld();
    for(let i = 0; i < 3; i++)
    {
        const floor = Entity.fromKind("floor.stone.basic", STUB_ASSETS);
        floor.addComponent(new GridPlacement(i, 0, 0, { walkable: true }));
        source.addEntity(floor);
    }

    const snapshot = WorldSerializer.toJSON(source);

    const target = makeWorld();
    const addedEvents = [];
    target.on("entityAdded", e => addedEvents.push(e));

    WorldSerializer.fromJSONv2(target, snapshot, STUB_ASSETS);

    expect(addedEvents.length).toBe(3);
});


/* SURFACE Y ROUND-TRIP *******************************************************/

test("round-trip preserves GridPlacement.surfaceY through toJSON / fromJSONv2", () =>
{
    const source = makeWorld();

    const candle = Entity.fromKind("decor.candle.triple", STUB_ASSETS);
    candle.addComponent(new GridPlacement(2, 3, 0, { surfaceY: 0.85 }));
    source.addEntity(candle);

    const snapshot = WorldSerializer.toJSON(source);

    const target = makeWorld();
    WorldSerializer.fromJSONv2(target, snapshot, STUB_ASSETS);

    const restored = Array.from(target.entities)[0];
    expect(restored.getComponent(GridPlacement).surfaceY).toBe(0.85);
});


/* OFFSET ROUND-TRIP **********************************************************/

test("round-trip preserves GridPlacement.xOffset / zOffset through toJSON / fromJSONv2", () =>
{
    const source = makeWorld();

    const nudged = Entity.fromKind("decor.barrel", STUB_ASSETS);
    nudged.addComponent(new GridPlacement(2, 3, 0, { xOffset: 0.5, zOffset: -0.25 }));
    source.addEntity(nudged);

    const snapshot = WorldSerializer.toJSON(source);

    const target = makeWorld();
    WorldSerializer.fromJSONv2(target, snapshot, STUB_ASSETS);

    const restored = Array.from(target.entities)[0];
    const placement = restored.getComponent(GridPlacement);
    expect(placement.xOffset).toBe(0.5);
    expect(placement.zOffset).toBe(-0.25);
});


test("entity with zero offsets emits no xOffset / zOffset keys in the snapshot", () =>
{
    const source = makeWorld();

    const centred = Entity.fromKind("decor.barrel", STUB_ASSETS);
    centred.addComponent(new GridPlacement(2, 3, 0));
    source.addEntity(centred);

    const snapshot = WorldSerializer.toJSON(source);
    const componentRecord = snapshot.entities[0][1][0];
    const gridPlacementData = componentRecord[1];

    expect(gridPlacementData.xOffset).toBeUndefined();
    expect(gridPlacementData.zOffset).toBeUndefined();
});


test("post-attach setOffset mutations survive a save/load round-trip", () =>
{
    // Mirrors the `WorldEditor.nudgeEntity` path: the decor is added first
    // (offset=0), then `setOffset` updates the placement in-place. The
    // serializer must pick up the post-attach offset, not the zero baseline.
    const source = makeWorld();

    const nudged = Entity.fromKind("decor.barrel", STUB_ASSETS);
    const placement = nudged.addComponent(new GridPlacement(2, 3, 0));
    source.addEntity(nudged);
    placement.setOffset(1, -1);

    const snapshot = WorldSerializer.toJSON(source);

    const target = makeWorld();
    WorldSerializer.fromJSONv2(target, snapshot, STUB_ASSETS);

    const restored = Array.from(target.entities)[0];
    const restoredPlacement = restored.getComponent(GridPlacement);
    expect(restoredPlacement.xOffset).toBe(1);
    expect(restoredPlacement.zOffset).toBe(-1);
});


/* WALK-GRID POPULATION ON LOAD ***********************************************/

function footprintAssets()
{
    /* Real getAabb / getMeta entries for the kinds used in walk-grid tests.
     * `get` throws — entities use a magenta placeholder via Renderable. */
    const aabb4x4   = { min: { x: -2,    y: 0, z: -2    }, max: { x:  2,    y: 0.15, z:  2    } };
    const aabb1Cube = { min: { x: -0.5,  y: 0, z: -0.5  }, max: { x:  0.5,  y: 1,    z:  0.5  } };

    const meta =
    {
        "floor.stone.basic":   {},
        "decor.barrel":        {},
        "wall.stone.corner":   { collision: "wall-corner" }
    };

    const aabb =
    {
        "floor.stone.basic":   aabb4x4,
        "decor.barrel":        aabb1Cube,
        "wall.stone.corner":   null  // wall-corner primitive ignores AABB.
    };

    return {
        get:        () => { throw new Error("stub: no asset cache in test"); },
        getMeta:    (kind) => (meta[kind] !== undefined ? meta[kind] : {}),
        getAabb:    (kind) => (aabb[kind] !== undefined ? aabb[kind] : null)
    };
}


test("fromJSONv2 populates the walk-grid: floors stay walkable, obstacles stamp", () =>
{
    const assets = footprintAssets();
    const world  = new World(new Grid(8, 8, 4), assets);

    // Synthetic V5-style snapshot: one floor (walkable, no block), one decor
    // barrel (blocks the cell), and one corner. Tracer-produced corners are
    // normally excluded by SAVE_SKIP_KINDS at save time; included here to
    // exercise the wall-corner stamp path end-to-end.
    const snapshot =
    {
        v:          2,
        kinds:      ["floor.stone.basic", "decor.barrel", "wall.stone.corner"],
        components: ["GridPlacement", "CornerPlacement"],
        entities:
        [
            [0, [[0, { cx: 2, cz: 2, rotationStep: 0, walkable: true }]]],
            [1, [[0, { cx: 3, cz: 3, rotationStep: 0, blocks: true }]]],
            [2, [[1, { vx: 4, vz: 5, corner: 3 /* SE; CORNER_NAMES[3] = "SE" */ }]]]
        ]
    };

    const result = WorldSerializer.fromJSONv2(world, snapshot, assets);

    expect(result.loaded).toBe(3);

    // Floor at cell (2, 2) — walkable, not a blocker — leaves its sub-cells
    // walkable on the obstacle map.
    for(let sx = 8; sx <= 11; sx++)
    {
        for(let sz = 8; sz <= 11; sz++)
        {
            expect(world.walkGrid.isWalkable(sx, sz)).toBe(true);
        }
    }

    // Barrel at cell (3, 3) — blocks: true, AABB 1×1 centred → 4 straddle
    // sub-cells around the cell centre.
    expect(world.walkGrid.isWalkable(13, 13)).toBe(false);
    expect(world.walkGrid.isWalkable(14, 13)).toBe(false);
    expect(world.walkGrid.isWalkable(13, 14)).toBe(false);
    expect(world.walkGrid.isWalkable(14, 14)).toBe(false);

    // Corner at vertex (4, 5) SE → inner junction (vsx-1, vsz+0) = (15, 20),
    // west-arm tip (vsx-2, vsz+0) = (14, 20), north-arm tip (vsx-1, vsz+1)
    // = (15, 21). vsx = 4 * 4 = 16, vsz = 5 * 4 = 20.
    expect(world.walkGrid.isWalkable(15, 20)).toBe(false);
    expect(world.walkGrid.isWalkable(14, 20)).toBe(false);
    expect(world.walkGrid.isWalkable(15, 21)).toBe(false);

    // A nearby unrelated sub-cell stays walkable.
    expect(world.walkGrid.isWalkable(0, 0)).toBe(true);
});


test("fromJSONv2 leaves the walk-grid empty when world has no assets reference", () =>
{
    const world = makeWorld();  // No assets — stamping silently skips.

    const snapshot =
    {
        v:          2,
        kinds:      ["floor.stone.basic"],
        components: ["GridPlacement"],
        entities:   [[0, [[0, { cx: 2, cz: 2, rotationStep: 0, walkable: true }]]]]
    };

    WorldSerializer.fromJSONv2(world, snapshot, STUB_ASSETS);

    expect(world.walkGrid.refcounts.every(v => v === 0)).toBe(true);
});


/* SKIP KINDS *****************************************************************/

test("toJSON skips entities whose kind appears in options.skipKinds", () =>
{
    const world = makeWorld();

    const floor = Entity.fromKind("floor.stone.basic", STUB_ASSETS);
    floor.addComponent(new GridPlacement(2, 3, 0, { walkable: true }));
    world.addEntity(floor);

    const wall = Entity.fromKind("wall.stone.straight", STUB_ASSETS);
    wall.addComponent(new EdgePlacement(2, 3, "north", 0, 0));
    world.addEntity(wall);

    const snapshot = WorldSerializer.toJSON(world, { skipKinds: ["wall.stone.straight"] });

    expect(snapshot.kinds).not.toContain("wall.stone.straight");
    expect(snapshot.entities.length).toBe(1);
});


test("fromJSONv2 skips entities whose kind appears in options.skipKinds", () =>
{
    const snapshot =
    {
        v:          2,
        kinds:      ["floor.stone.basic", "wall.stone.straight"],
        components: ["GridPlacement", "EdgePlacement"],
        entities:
        [
            [0, [[0, { cx: 1, cz: 1, rotationStep: 0, walkable: true }]]],
            [1, [[1, { cx: 1, cz: 1, side: 1, lengthOffset: 0, originOffset: 0 }]]]
        ]
    };

    const world  = makeWorld();
    const result = WorldSerializer.fromJSONv2(world, snapshot, STUB_ASSETS, { skipKinds: ["wall.stone.straight"] });

    expect(result.loaded).toBe(1);
    expect(world.entities.size).toBe(1);
    const kindsInWorld = [...world.entities].map(e => e.kind);
    expect(kindsInWorld).toEqual(["floor.stone.basic"]);
});


/* WARNINGS — UNKNOWN COMPONENT ***********************************************/

test("fromJSONv2 records a warning for unknown component classes and continues loading", () =>
{
    const snapshot =
    {
        v: 2,
        kinds:      ["floor.stone.basic"],
        components: ["GridPlacement", "MysteryComponent"],
        entities:
        [[
            0,
            [
                [0, { cx: 1, cz: 1, rotationStep: 0 }],
                [1, { foo: "bar" }]
            ]
        ]]
    };

    const world  = makeWorld();
    const result = WorldSerializer.fromJSONv2(world, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(1);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatchObject({
        index:     0,
        kind:      "floor.stone.basic",
        component: "MysteryComponent"
    });

    const entity = Array.from(world.entities)[0];
    expect(entity.hasComponent(GridPlacement)).toBe(true);
});


/* WARNINGS — UNKNOWN KIND INDEX **********************************************/

test("fromJSONv2 skips records with an out-of-range kind index and records a warning", () =>
{
    const snapshot =
    {
        v:          2,
        kinds:      ["floor.stone.basic"],
        components: [],
        entities:
        [
            [99, []],
            [0,  []]
        ]
    };

    const world  = makeWorld();
    const result = WorldSerializer.fromJSONv2(world, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.warnings.length).toBe(1);
});


/* WARNINGS — INVALID SNAPSHOT ************************************************/

test("fromJSONv2 records a warning when the snapshot is null or has the wrong version", () =>
{
    const world = makeWorld();

    const r1 = WorldSerializer.fromJSONv2(world, null, STUB_ASSETS);
    expect(r1.loaded).toBe(0);
    expect(r1.warnings.length).toBe(1);

    const r2 = WorldSerializer.fromJSONv2(world, { v: 1, entities: [] }, STUB_ASSETS);
    expect(r2.loaded).toBe(0);
    expect(r2.warnings.length).toBe(1);

    const r3 = WorldSerializer.fromJSONv2(world, { v: 2 }, STUB_ASSETS);
    expect(r3.loaded).toBe(0);
    expect(r3.warnings.length).toBe(1);
});


/* RENDERABLE NOT DUPLICATED **************************************************/

test("fromJSONv2 does not duplicate Renderable when the snapshot includes it", () =>
{
    const snapshot =
    {
        v:          2,
        kinds:      ["floor.stone.basic"],
        components: ["Renderable"],
        entities:
        [
            [0, [[0, { kind: "floor.stone.basic" }]]]
        ]
    };

    const world  = makeWorld();
    const result = WorldSerializer.fromJSONv2(world, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(1);
    const entity           = Array.from(world.entities)[0];
    const componentClasses = Array.from(entity.components.keys());
    const renderableCount  = componentClasses.filter(K => K.name === "Renderable").length;
    expect(renderableCount).toBe(1);
});
