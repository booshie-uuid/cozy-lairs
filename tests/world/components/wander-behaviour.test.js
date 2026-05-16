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
        findPath(walkGrid, start, end, isTraversable)
        {
            this.findPathCalls.push({ start, end, isTraversable });
            return plan(start, end);
        }
    };
    return pathfinder;
}


function makeOpenWorld(width = 10, depth = 10)
{
    /* All main cells walkable; walk-grid has no blockers. */
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
    pathfinder = makeStubPathfinder(() => [{ sx: 8, sz: 8 }, { sx: 20, sz: 20 }]),
    spawnSub = { sx: 8, sz: 8 },                     // sub-cell (8, 8) ≈ main cell (2, 2)
    minTargetDistance = 6,
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

    const spawn = world.walkGrid.subToWorld(spawnSub.sx, spawnSub.sz);
    entity.object3D.position.set(spawn.x, 0, spawn.z);

    world.addEntity(entity);

    return { world, entity, walker, behaviour, pathfinder, followPathSpy };
}


let mathRandomSpy;

beforeEach(() =>
{
    /* Deterministic but varying — a fixed `mockReturnValue` makes
     * sampleInRadius always produce the same (zero) offset which is the
     * walker's own cell; pickTarget would never return a valid target. */
    let counter = 0;
    mathRandomSpy = vi.spyOn(Math, "random").mockImplementation(() =>
    {
        counter += 1;
        return ((counter * 7919) % 1000) / 1000;
    });
});

afterEach(() =>
{
    mathRandomSpy.mockRestore();
});


/* SCHEDULING *****************************************************************/

test("onAddedToWorld queues an initial idle countdown", () =>
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


/* TRIP KICK ******************************************************************/

test("kickTrip calls pathfinder.findPath with current sub-cell + target, hands result to walker", () =>
{
    const path = [{ sx: 8, sz: 8 }, { sx: 20, sz: 20 }];
    const pathfinder = makeStubPathfinder(() => path);

    const { behaviour, pathfinder: pf, followPathSpy } = setup({ pathfinder });

    behaviour.update(0.2);

    expect(pf.findPathCalls.length).toBe(1);
    expect(pf.findPathCalls[0].start).toEqual({ sx: 8, sz: 8 });
    expect(typeof pf.findPathCalls[0].isTraversable).toBe("function");
    expect(followPathSpy).toHaveBeenCalledWith(path);
});


test("traversable predicate filters out sub-cells outside walkable main cells", () =>
{
    const { world, pathfinder: pf } = setup({
        pathfinder: makeStubPathfinder(() => [{ sx: 8, sz: 8 }])
    });

    // Mark main cell (5, 5) as non-floor → sub-cells (20..23, 20..23) are
    // traversable only if both walk-grid says walkable AND grid.isWalkable
    // says yes. Removing the floor (it's currently marked) flips the predicate.
    world.grid.unmarkFloor(5, 5);

    pf.findPathCalls = [];

    // Trigger another kick by calling kickTrip directly. behaviour has the
    // pf stub so the path planner gets re-called.
    const beh = world.entities.values().next().value.getComponent(WanderBehaviour);
    beh.kickTrip();

    const predicate = pf.findPathCalls[pf.findPathCalls.length - 1].isTraversable;
    // Sub-cells in main cell (5, 5) → sx in [20..23], sz in [20..23]. Should
    // now report as untraversable.
    expect(predicate(20, 20)).toBe(false);
    expect(predicate(21, 22)).toBe(false);
    // Sub-cell (12, 12) is inside still-walkable main cell (3, 3) and isn't
    // stamped by anyone, so the predicate returns true.
    expect(predicate(12, 12)).toBe(true);
});


/* WALKER EVENT HANDLERS ******************************************************/

test("walker blocked re-schedules another trip", () =>
{
    const { behaviour, walker, followPathSpy } = setup({ idleMin: 0.1, idleMax: 0.1 });

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(1);

    walker.emit("blocked", { walker });
    expect(behaviour.idleRemaining).toBeGreaterThan(0);

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(2);
});


test("walker displaced re-schedules another trip", () =>
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

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(1);

    walker.emit("arrived", { walker });
    expect(behaviour.idleRemaining).toBeGreaterThan(0);

    behaviour.update(0.2);
    expect(followPathSpy).toHaveBeenCalledTimes(2);
});


/* PATH RETRIES ***************************************************************/

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


test("pickTarget falls back to a close target when no distant one is available", () =>
{
    // With minTargetDistance set above the whole-world Chebyshev radius, the
    // primary distance constraint can never be met — the fallback should
    // still produce a traversable close target so minions in tiny accessible
    // areas don't get stuck idling forever.
    const { behaviour, followPathSpy, pathfinder: pf } = setup({
        spawnSub: { sx: 20, sz: 20 },
        minTargetDistance: 1000
    });

    behaviour.update(0.2);

    expect(pf.findPathCalls.length).toBeGreaterThan(0);
    expect(followPathSpy).toHaveBeenCalled();
});


test("pickTarget excludes sub-cells within minTargetDistance (Chebyshev)", () =>
{
    mathRandomSpy.mockReturnValue(0);

    const { behaviour, pathfinder: pf } = setup({
        spawnSub: { sx: 20, sz: 20 },
        minTargetDistance: 8
    });

    behaviour.update(0.2);

    expect(pf.findPathCalls.length).toBe(1);
    const target = pf.findPathCalls[0].end;
    const dx = Math.abs(target.sx - 20);
    const dz = Math.abs(target.sz - 20);
    expect(Math.max(dx, dz)).toBeGreaterThanOrEqual(8);
});


/* LIFECYCLE ******************************************************************/

test("onRemovedFromWorld unsubscribes from walker.arrived", () =>
{
    const { world, entity, walker, followPathSpy } = setup();

    walker.emit("arrived", { walker });
    walker.followPath.mockReset();

    world.removeEntity(entity);

    walker.emit("arrived", { walker });
    expect(followPathSpy).not.toHaveBeenCalled();
});


/* SELF-RESCUE ****************************************************************/

test("self-rescue — teleports the walker off an untraversable sub-cell", () =>
{
    const { world, walker, behaviour, followPathSpy, pathfinder: pf } = setup({
        spawnSub: { sx: 8, sz: 8 }
    });
    const teleportSpy = vi.spyOn(walker, "teleportTo");

    // Block the walker's spawn sub-cell (simulating decor placed on top of it).
    // The walker's own stamp is already there; add another so refcount=2.
    // After the walker temporarily un-stamps to check traversability, the
    // sub-cell still reads refcount=1 (blocked) → not traversable → rescue.
    world.walkGrid.applyStamp([{ sx: 8, sz: 8 }]);

    behaviour.update(0.2);

    expect(pf.findPathCalls.length).toBe(0);
    expect(followPathSpy).not.toHaveBeenCalled();
    expect(teleportSpy).toHaveBeenCalledTimes(1);

    const [sx, sz] = teleportSpy.mock.calls[0];
    expect(world.walkGrid.isInBounds(sx, sz)).toBe(true);
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
    expect(behaviour.idleRemaining).toBe(0);

    consoleWarnSpy.mockRestore();
});
