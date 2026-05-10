import { test, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";

import { World }            from "../../../scripts/modules/world/world.js";
import { Grid }             from "../../../scripts/modules/world/grid.js";
import { Entity }           from "../../../scripts/modules/world/entity.js";
import { Walker }           from "../../../scripts/modules/world/components/walker.js";
import { WanderBehaviour }  from "../../../scripts/modules/world/components/wander-behaviour.js";


function makeStubPathfinder(plan)
{
    const pathfinder =
    {
        findPathCalls: [],
        findPath(grid, start, end)
        {
            this.findPathCalls.push({ start, end });
            return plan(start, end);
        }
    };
    return pathfinder;
}


function makeOpenWorld(width = 10, depth = 10)
{
    const world = new World(new Grid(width, depth, 4));
    for(let cx = 0; cx < width; cx++)
    {
        for(let cz = 0; cz < depth; cz++)
        {
            world.grid.markFloor(cx, cz);
        }
    }
    return world;
}


function setup({
    pathfinder = makeStubPathfinder(() => [{ cx: 0, cz: 0 }, { cx: 5, cz: 5 }]),
    spawnCell = { cx: 2, cz: 2 },
    minTargetDistance = 3,
    idleMin = 0.1,
    idleMax = 0.1,
    retryLimit = 3
} = {})
{
    const world  = makeOpenWorld();
    const entity = new Entity("character.test", new THREE.Object3D());

    const walker = entity.addComponent(new Walker({ speed: 10 }));
    const followPathSpy = vi.spyOn(walker, "followPath");

    const behaviour = entity.addComponent(new WanderBehaviour({
        idleMin, idleMax, retryLimit, minTargetDistance, pathfinder
    }));

    const spawn = world.grid.cellToWorld(spawnCell.cx, spawnCell.cz);
    entity.object3D.position.set(spawn.x, 0, spawn.z);

    world.addEntity(entity);

    return { world, entity, walker, behaviour, pathfinder, followPathSpy };
}


let mathRandomSpy;

beforeEach(() =>
{
    // Deterministic Math.random for pickTarget; tests that need different
    // values can re-mock per-test.
    mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() =>
{
    mathRandomSpy.mockRestore();
});


test("scheduling — onAddedToWorld queues an initial idle countdown", () =>
{
    const { behaviour } = setup({ idleMin: 0.5, idleMax: 1.5 });

    expect(behaviour.idleRemaining).toBeGreaterThan(0);
});


test("update ticks down idleRemaining and kicks a trip on zero", () =>
{
    const { behaviour, followPathSpy } = setup({ idleMin: 1, idleMax: 1 });

    behaviour.update(0.5);
    expect(followPathSpy).not.toHaveBeenCalled();

    behaviour.update(0.6);
    expect(followPathSpy).toHaveBeenCalledTimes(1);
});


test("kickTrip calls pathfinder.findPath with current cell + target, hands result to walker", () =>
{
    const path = [{ cx: 2, cz: 2 }, { cx: 5, cz: 5 }];
    const pathfinder = makeStubPathfinder(() => path);

    const { behaviour, walker, pathfinder: pf, followPathSpy } = setup({ pathfinder });

    behaviour.update(0.2);

    expect(pf.findPathCalls.length).toBe(1);
    expect(pf.findPathCalls[0].start).toEqual({ cx: 2, cz: 2 });
    expect(followPathSpy).toHaveBeenCalledWith(path);
});


test("walker blocked re-schedules another trip (same handler as arrived)", () =>
{
    const { behaviour, walker, followPathSpy } = setup({ idleMin: 0.1, idleMax: 0.1 });

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(1);

    walker.emit("blocked", { walker });
    expect(behaviour.idleRemaining).toBeGreaterThan(0);

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(2);
});


test("walker displaced re-schedules another trip (same handler as arrived)", () =>
{
    const { behaviour, walker, followPathSpy } = setup({ idleMin: 0.1, idleMax: 0.1 });

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(1);

    walker.emit("displaced", { walker });
    expect(behaviour.idleRemaining).toBeGreaterThan(0);

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(2);
});


test("walker arrived re-schedules another trip", () =>
{
    const { behaviour, walker, followPathSpy } = setup({ idleMin: 0.1, idleMax: 0.1 });

    // First trip
    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(1);

    // Walker fires arrived — should reschedule and tick a new trip after idle
    walker.emit("arrived", { walker });
    expect(behaviour.idleRemaining).toBeGreaterThan(0);

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(2);
});


test("retries on null pathfind up to retryLimit, then idles again", () =>
{
    const pathfinder = makeStubPathfinder(() => null);

    const { behaviour, followPathSpy, pathfinder: pf } = setup({
        pathfinder, retryLimit: 3, idleMin: 0.1, idleMax: 0.1
    });

    behaviour.update(0.2);

    expect(pf.findPathCalls.length).toBe(3);
    expect(followPathSpy).not.toHaveBeenCalled();
    expect(behaviour.idleRemaining).toBeGreaterThan(0);
});


test("pickTarget returns null when no walkable cell is far enough away", () =>
{
    const { behaviour, followPathSpy, pathfinder: pf } = setup({
        spawnCell: { cx: 5, cz: 5 },
        minTargetDistance: 100
    });

    behaviour.update(0.2);

    expect(pf.findPathCalls.length).toBe(0);
    expect(followPathSpy).not.toHaveBeenCalled();
    expect(behaviour.idleRemaining).toBeGreaterThan(0);
});


test("pickTarget excludes cells within minTargetDistance (Chebyshev)", () =>
{
    // Mock Math.random so we can predict which candidate gets picked.
    // pickTarget builds a sorted candidates list (filtered) then picks
    // index = floor(random * length). With random = 0, picks index 0.
    mathRandomSpy.mockReturnValue(0);

    const { behaviour, pathfinder: pf } = setup({
        spawnCell: { cx: 5, cz: 5 },
        minTargetDistance: 3
    });

    behaviour.update(0.2);

    // Whatever was picked, every excluded-zone cell must NOT have been picked
    expect(pf.findPathCalls.length).toBe(1);
    const target = pf.findPathCalls[0].end;
    const dx = Math.abs(target.cx - 5);
    const dz = Math.abs(target.cz - 5);
    expect(Math.max(dx, dz)).toBeGreaterThanOrEqual(3);
});


test("onRemovedFromWorld unsubscribes from walker.arrived", () =>
{
    const { world, entity, walker, behaviour, followPathSpy } = setup();

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(1);

    world.removeEntity(entity);

    walker.emit("arrived", { walker });
    // After unsubscribe, arrived events are ignored — idleRemaining stays at 0
    // and update is no-op (walker reference cleared).
    behaviour.update(1.0);
    expect(followPathSpy).toHaveBeenCalledTimes(1);
});


test("self-rescue — teleports the walker off a non-walkable cell instead of pathfinding", () =>
{
    const { world, walker, behaviour, followPathSpy, pathfinder: pf } = setup({
        spawnCell: { cx: 5, cz: 5 }
    });
    const teleportSpy = vi.spyOn(walker, "teleportTo");

    // Block the walker's spawn cell after-the-fact (simulates a teleport
    // onto decor or a placement-on-occupant edge case).
    world.grid.setBlocked(5, 5);

    behaviour.update(0.2);

    // No pathfinder calls — kickTrip detected the unavailable start cell
    // and chose to rescue instead.
    expect(pf.findPathCalls.length).toBe(0);
    expect(followPathSpy).not.toHaveBeenCalled();
    expect(teleportSpy).toHaveBeenCalledTimes(1);
    // Teleport target must be a walkable + unoccupied cell.
    const [cx, cz] = teleportSpy.mock.calls[0];
    expect(world.grid.isWalkable(cx, cz)).toBe(true);
});


test("warns and disables when entity has no Walker", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const world = makeOpenWorld();
    const entity = new Entity("character.test", new THREE.Object3D());
    const behaviour = entity.addComponent(new WanderBehaviour({
        pathfinder: makeStubPathfinder(() => null)
    }));
    world.addEntity(entity);

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("no Walker"));
    expect(behaviour.idleRemaining).toBe(0);

    behaviour.update(1.0);
    // Still no-op
    expect(behaviour.idleRemaining).toBe(0);

    consoleWarnSpy.mockRestore();
});
