import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { World }            from "../../scripts/modules/world/world.js";
import { Grid }             from "../../scripts/modules/world/grid.js";
import { Entity }           from "../../scripts/modules/world/entity.js";
import { GridPlacement }    from "../../scripts/modules/world/components/grid-placement.js";
import { EdgePlacement }    from "../../scripts/modules/world/components/edge-placement.js";
import { CornerPlacement }  from "../../scripts/modules/world/components/corner-placement.js";
import { Walker }           from "../../scripts/modules/world/components/walker.js";

import * as WorldSerializer from "../../scripts/modules/world/world-serializer.js";


const HERE         = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, "../data/world/empty-room-6x8.json");

const STUB_ASSETS = { get: () => { throw new Error("stub: no asset cache in test"); } };


let warnSpy;

beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach (() => { warnSpy.mockRestore(); });


function makeWorld()
{
    return new World(new Grid(8, 8, 4));
}


/* SHAPE / VERSION ************************************************************/

test("toJSON returns a snapshot with the schema version and an entities array", () =>
{
    const snapshot = WorldSerializer.toJSON(makeWorld());

    expect(snapshot.version).toBe(WorldSerializer.SCHEMA_VERSION);
    expect(snapshot.version).toBe(1);
    expect(Array.isArray(snapshot.entities)).toBe(true);
    expect(snapshot.entities.length).toBe(0);
});


/* ROUND-TRIP — FIXTURE *******************************************************/

test("round-trip — fixture loads, re-serialises, deep-equals the original", () =>
{
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    const world   = makeWorld();

    const result = WorldSerializer.fromJSON(world, fixture, STUB_ASSETS);

    expect(result.loaded).toBe(fixture.entities.length);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);

    const reSerialised = WorldSerializer.toJSON(world);

    expect(reSerialised).toEqual(fixture);
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
    minion.addComponent(new Walker(
        [{ x: 4, z: 4 }, { x: 12, z: 12 }],
        2.0
    ));
    source.addEntity(minion);

    const snapshot = WorldSerializer.toJSON(source);

    const target = makeWorld();
    const result = WorldSerializer.fromJSON(target, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(4);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(target.entities.size).toBe(4);
    expect(WorldSerializer.toJSON(target)).toEqual(snapshot);
});


/* CLEAR-ON-LOAD **************************************************************/

test("fromJSON clears existing entities before reconstruction", () =>
{
    const world  = makeWorld();
    const stale  = Entity.fromKind("floor.stone.basic", STUB_ASSETS);
    world.addEntity(stale);
    expect(world.entities.size).toBe(1);

    const snapshot = { version: 1, entities: [] };
    const result   = WorldSerializer.fromJSON(world, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(0);
    expect(world.entities.size).toBe(0);
});


/* WARNINGS — UNKNOWN COMPONENT ***********************************************/

test("fromJSON records a warning for unknown component classes and continues loading", () =>
{
    const snapshot =
    {
        version: 1,
        entities:
        [{
            kind: "floor.stone.basic",
            components:
            {
                GridPlacement:    { cx: 1, cz: 1, rotationStep: 0 },
                MysteryComponent: { foo: "bar" }
            }
        }]
    };

    const world  = makeWorld();
    const result = WorldSerializer.fromJSON(world, snapshot, STUB_ASSETS);

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


/* WARNINGS — MISSING KIND ****************************************************/

test("fromJSON skips records missing a string `kind` and records a warning", () =>
{
    const snapshot =
    {
        version: 1,
        entities:
        [
            { components: {} },
            { kind: 42, components: {} },
            { kind: "floor.stone.basic", components: {} }
        ]
    };

    const world  = makeWorld();
    const result = WorldSerializer.fromJSON(world, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.warnings.length).toBe(2);
});


/* WARNINGS — INVALID SNAPSHOT ************************************************/

test("fromJSON records a warning when the snapshot has no entities array", () =>
{
    const world = makeWorld();

    const r1 = WorldSerializer.fromJSON(world, null, STUB_ASSETS);
    expect(r1.loaded).toBe(0);
    expect(r1.warnings.length).toBe(1);

    const r2 = WorldSerializer.fromJSON(world, { version: 1 }, STUB_ASSETS);
    expect(r2.loaded).toBe(0);
    expect(r2.warnings.length).toBe(1);
});


/* RENDERABLE NOT DUPLICATED **************************************************/

test("fromJSON does not duplicate Renderable when the snapshot includes it", () =>
{
    const snapshot =
    {
        version: 1,
        entities:
        [{
            kind: "floor.stone.basic",
            components:
            {
                Renderable: { kind: "floor.stone.basic" }
            }
        }]
    };

    const world  = makeWorld();
    const result = WorldSerializer.fromJSON(world, snapshot, STUB_ASSETS);

    expect(result.loaded).toBe(1);
    const entity = Array.from(world.entities)[0];
    const componentClasses = Array.from(entity.components.keys());
    const renderableCount  = componentClasses.filter(K => K.name === "Renderable").length;
    expect(renderableCount).toBe(1);
});
