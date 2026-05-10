import { test, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";

import { World }   from "../../scripts/modules/world/world.js";
import { Grid }    from "../../scripts/modules/world/grid.js";
import { Entity }  from "../../scripts/modules/world/entity.js";
import { Walker }  from "../../scripts/modules/world/components/walker.js";
import { GridPlacement } from "../../scripts/modules/world/components/grid-placement.js";

import { ChaosController } from "../../scripts/modules/world/chaos-controller.js";


function makeOpenWorld(width = 6, depth = 6)
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


function makeBarrel(world, cx, cz)
{
    // Mimic what DecorBuilder.addBarrel produces — entity with GridPlacement
    // (blocks: true) so relocateDecor's grid-state updates have something
    // to clear / set.
    const entity = new Entity("decor.barrel.test", new THREE.Group());
    entity.addComponent(new GridPlacement(cx, cz, 0, { blocks: true }));
    world.addEntity(entity);
    return entity;
}


function makeMinion(world, cx, cz)
{
    const entity = new Entity("character.test", new THREE.Object3D());
    entity.addComponent(new Walker({ speed: 1 }));
    const w = world.grid.cellToWorld(cx, cz);
    entity.object3D.position.set(w.x, 0, w.z);
    world.addEntity(entity);
    return entity;
}


let nowMs = 0;
const now = () => nowMs;
let mathRandomSpy;


function setup({ cooldownMs = 1500, walkerCount = 2, chaosBarrelCount = 2 } = {})
{
    nowMs = 1000;  // start above 0 so the first call's elapsed > cooldown

    const world = makeOpenWorld();
    const minions = [];
    for(let i = 0; i < walkerCount; i++) { minions.push(makeMinion(world, i, 0)); }

    const chaosBarrels = [];
    for(let i = 0; i < chaosBarrelCount; i++) { chaosBarrels.push(makeBarrel(world, i, 5)); }

    const walkers = minions.map(m => m.getComponent(Walker));

    const controller = new ChaosController({
        world, walkers, chaosBarrels, cooldownMs, now
    });

    return { world, minions, walkers, chaosBarrels, controller };
}


// Make Math.random deterministic so we know which barrel / target gets picked.
beforeEach(() =>
{
    mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => { mathRandomSpy.mockRestore(); });


test("subscribes to walker arrived/blocked/displaced and teleports a chaos barrel on each", () =>
{
    const { walkers, chaosBarrels } = setup();
    const cellBefore = { cx: chaosBarrels[0].getComponent(GridPlacement).cx, cz: chaosBarrels[0].getComponent(GridPlacement).cz };

    walkers[0].emit("arrived", { walker: walkers[0] });

    const placement = chaosBarrels[0].getComponent(GridPlacement);
    expect(placement.cx === cellBefore.cx && placement.cz === cellBefore.cz).toBe(false);
});


test("respects cooldown — second event within cooldownMs does not retrigger", () =>
{
    const { walkers, chaosBarrels } = setup({ cooldownMs: 500 });
    const placement = chaosBarrels[0].getComponent(GridPlacement);

    // First event: fires (elapsed since lastFiredAt=0 is large).
    walkers[0].emit("arrived", { walker: walkers[0] });
    const cellAfterFirst = { cx: placement.cx, cz: placement.cz };

    // Advance virtual time by 100 ms — within the 500 ms cooldown.
    nowMs += 100;
    walkers[1].emit("blocked", { walker: walkers[1] });

    // Barrel should not have moved.
    expect(placement.cx).toBe(cellAfterFirst.cx);
    expect(placement.cz).toBe(cellAfterFirst.cz);

    // Advance past the cooldown — next event fires.
    nowMs += 500;
    walkers[1].emit("displaced", { walker: walkers[1] });
    expect(placement.cx === cellAfterFirst.cx && placement.cz === cellAfterFirst.cz).toBe(false);
});


test("dispose unsubscribes — subsequent walker events are no-ops", () =>
{
    const { walkers, chaosBarrels, controller } = setup();
    const placement = chaosBarrels[0].getComponent(GridPlacement);

    controller.dispose();

    const cellBefore = { cx: placement.cx, cz: placement.cz };

    walkers[0].emit("arrived", { walker: walkers[0] });
    walkers[1].emit("blocked", { walker: walkers[1] });
    walkers[0].emit("displaced", { walker: walkers[0] });

    expect(placement.cx).toBe(cellBefore.cx);
    expect(placement.cz).toBe(cellBefore.cz);
});


test("teleporting a chaos barrel onto a walker triggers that walker's displacement", () =>
{
    const world = new World(new Grid(4, 4, 4));
    // Mark only the two cells we care about — (2, 2) for the minion / chaos
    // target, (3, 3) for the minion to be displaced to. Insertion order
    // makes (2, 2) walkable[0] so Math.random=0 deterministically picks it.
    world.grid.markFloor(2, 2);
    world.grid.markFloor(3, 3);

    const minion = makeMinion(world, 2, 2);
    const walker = minion.getComponent(Walker);
    const teleportSpy = vi.spyOn(walker, "teleportTo");

    const barrel = makeBarrel(world, 0, 0);

    nowMs = 1000;
    const controller = new ChaosController({
        world,
        walkers: [walker],
        chaosBarrels: [barrel],
        cooldownMs: 100,
        now
    });

    walker.emit("arrived", { walker });

    // Barrel should have teleported to (2, 2), displacing the minion to
    // the closest available cell — (3, 3).
    expect(teleportSpy).toHaveBeenCalledTimes(1);
    expect(teleportSpy).toHaveBeenCalledWith(3, 3);
    const placement = barrel.getComponent(GridPlacement);
    expect(placement.cx).toBe(2);
    expect(placement.cz).toBe(2);
});
