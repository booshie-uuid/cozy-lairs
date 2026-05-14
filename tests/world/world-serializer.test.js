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
    walker.followPath([{ cx: 1, cz: 1 }, { cx: 3, cz: 3 }]);

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
