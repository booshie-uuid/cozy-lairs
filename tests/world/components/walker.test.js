import { test, expect } from "vitest";
import * as THREE from "three";

import { World }  from "../../../scripts/modules/world/world.js";
import { Grid }   from "../../../scripts/modules/world/grid.js";
import { Entity } from "../../../scripts/modules/world/entity.js";
import { Walker } from "../../../scripts/modules/world/components/walker.js";


function spawn(speed = 1.5)
{
    /* World with default 4m main cells → 40×40 walk-grid of 1m sub-cells.
     * Walker operates purely on the walk-grid; no main-grid setup needed. */
    const world  = new World(new Grid(10, 10, 4));
    const entity = new Entity("test", new THREE.Object3D());
    const walker = entity.addComponent(new Walker({ speed }));
    world.addEntity(entity);
    return { world, entity, walker };
}


/* CONSTRUCTOR + BASIC LIFECYCLE **********************************************/

test("constructor accepts an options object with a default speed", () =>
{
    const a = new Walker();
    expect(a.speed).toBe(1.5);

    const b = new Walker({ speed: 3.0 });
    expect(b.speed).toBe(3.0);
});


test("a fresh walker with no path is completed and does not move on update", () =>
{
    const { entity } = spawn();
    entity.object3D.position.set(7, 0, 7);

    entity.update(1.0);
    expect(entity.object3D.position.x).toBe(7);
    expect(entity.object3D.position.z).toBe(7);
});


/* followPath BASIC TRAVERSAL *************************************************/

test("followPath snaps the entity to the first sub-cell centre", () =>
{
    const { entity, walker } = spawn();

    walker.followPath([{ sx: 1, sz: 2 }, { sx: 3, sz: 2 }]);

    // Sub-cell (1, 2) centre = (1 + 0.5, 2 + 0.5) = (1.5, 2.5)
    expect(entity.object3D.position.x).toBeCloseTo(1.5);
    expect(entity.object3D.position.z).toBeCloseTo(2.5);
});


test("update moves toward the next sub-cell at constant speed", () =>
{
    const { entity, walker } = spawn(1.0);
    entity.object3D.position.set(0.5, 0, 0.5);  // sub-cell (0, 0) centre
    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }]);

    // (0, 0) → (1, 0): world (0.5, 0.5) → (1.5, 0.5). Distance 1m. Speed 1.
    entity.update(0.5);
    expect(entity.object3D.position.x).toBeCloseTo(1.0);
    expect(entity.object3D.position.z).toBeCloseTo(0.5);
});


test("snaps to target when step would overshoot, then advances pathIndex", () =>
{
    const { entity, walker } = spawn(100);
    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }, { sx: 2, sz: 0 }]);

    // step = 100 * 0.1 = 10m; distance to (1, 0) = 1m → snap + advance.
    entity.update(0.1);
    expect(entity.object3D.position.x).toBeCloseTo(1.5);
    expect(walker.pathIndex).toBe(2);
});


test("walks a 4-sub-cell path in order then emits arrived once", () =>
{
    const { entity, walker } = spawn(100);
    let arrivedCount = 0;
    walker.on("arrived", () => { arrivedCount += 1; });

    walker.followPath([
        { sx: 0, sz: 0 },
        { sx: 1, sz: 0 },
        { sx: 1, sz: 1 },
        { sx: 0, sz: 1 }
    ]);

    for(let i = 0; i < 10; i++) { entity.update(0.1); }

    expect(walker.completed).toBe(true);
    expect(arrivedCount).toBe(1);
    expect(entity.object3D.position.x).toBeCloseTo(0.5);
    expect(entity.object3D.position.z).toBeCloseTo(1.5);
});


test("further updates after arrival do nothing", () =>
{
    const { entity, walker } = spawn(100);
    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }]);
    for(let i = 0; i < 5; i++) { entity.update(0.1); }

    const x = entity.object3D.position.x;
    const z = entity.object3D.position.z;

    entity.update(1.0);
    expect(entity.object3D.position.x).toBe(x);
    expect(entity.object3D.position.z).toBe(z);
});


test("empty path emits arrived immediately and stays completed", () =>
{
    const { walker } = spawn();
    let arrivedCount = 0;
    walker.on("arrived", () => { arrivedCount += 1; });

    walker.followPath([]);

    expect(walker.completed).toBe(true);
    expect(arrivedCount).toBe(1);
});


test("single-cell path snaps and emits arrived immediately", () =>
{
    const { entity, walker } = spawn();
    let arrivedCount = 0;
    walker.on("arrived", () => { arrivedCount += 1; });

    walker.followPath([{ sx: 2, sz: 3 }]);

    expect(walker.completed).toBe(true);
    expect(arrivedCount).toBe(1);
    expect(entity.object3D.position.x).toBeCloseTo(2.5);
    expect(entity.object3D.position.z).toBeCloseTo(3.5);
});


/* ROTATION *******************************************************************/

test("targetRotation is set immediately after followPath; rotation.y smooths toward it", () =>
{
    const { entity, walker } = spawn(0.001);
    entity.object3D.position.set(0.5, 0, 0.5);

    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }]);

    // Heading toward +X → atan2(+1, 0) = π/2.
    expect(walker.targetRotation).toBeCloseTo(Math.PI / 2);
    expect(entity.object3D.rotation.y).toBe(0);

    for(let i = 0; i < 100; i++) { entity.update(0.1); }
    expect(entity.object3D.rotation.y).toBeCloseTo(Math.PI / 2, 4);
});


test("rotation smoothing picks the shortest arc across the ±π wrap", () =>
{
    const { entity, walker } = spawn(0.001);
    entity.object3D.rotation.y = -3.0;
    walker.targetRotation       = 3.0;

    entity.update(0.1);

    expect(entity.object3D.rotation.y).toBeLessThan(-3.0);
});


/* SERIALISATION + PATH HYGIENE ***********************************************/

test("toJSON captures speed, path, and pathIndex (sub-cell coords)", () =>
{
    const { walker } = spawn(2.0);
    walker.followPath([{ sx: 1, sz: 2 }, { sx: 3, sz: 4 }, { sx: 5, sz: 6 }]);

    const json = walker.toJSON();
    expect(json.speed).toBe(2.0);
    expect(json.path).toEqual([
        { sx: 1, sz: 2 },
        { sx: 3, sz: 4 },
        { sx: 5, sz: 6 }
    ]);
    expect(json.pathIndex).toBe(1);
});


test("followPath deep-clones the source path — mutations don't leak in", () =>
{
    const { walker } = spawn();
    const source = [{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }];

    walker.followPath(source);
    source[0].sx = 99;
    source[1].sz = 99;

    expect(walker.path[0].sx).toBe(0);
    expect(walker.path[1].sz).toBe(0);
});


test("followPath rejects malformed cells", () =>
{
    const { walker } = spawn();
    expect(() => walker.followPath([{ sx: 0, sz: 0 }, { sx: 1 }])).toThrow();
    expect(() => walker.followPath([{ sx: 0, sz: 0 }, null])).toThrow();
    expect(() => walker.followPath([{ sx: "0", sz: 0 }, { sx: 1, sz: 0 }])).toThrow();
    expect(() => walker.followPath("not-an-array")).toThrow();
});


test("followPath with startIndex restores mid-path — snaps to previous sub-cell, targets startIndex", () =>
{
    const { entity, walker } = spawn();
    const path = [
        { sx: 0, sz: 0 },
        { sx: 1, sz: 0 },
        { sx: 2, sz: 0 }
    ];

    walker.followPath(path, { startIndex: 2 });

    // Snapped to path[1] = sub-cell (1, 0) centre (1.5, 0.5).
    expect(entity.object3D.position.x).toBeCloseTo(1.5);
    expect(entity.object3D.position.z).toBeCloseTo(0.5);
    expect(walker.pathIndex).toBe(2);
    expect(walker.completed).toBe(false);
});


test("followPath with startIndex past the end snaps to last sub-cell and emits arrived", () =>
{
    const { entity, walker } = spawn();
    let arrivedCount = 0;
    walker.on("arrived", () => { arrivedCount += 1; });

    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }], { startIndex: 5 });

    expect(walker.completed).toBe(true);
    expect(arrivedCount).toBe(1);
    expect(entity.object3D.position.x).toBeCloseTo(1.5);
});


/* WALK-GRID STAMPING *********************************************************/

test("onAddedToWorld stamps the entity's current sub-cell on the walk-grid", () =>
{
    const world  = new World(new Grid(10, 10, 4));
    const entity = new Entity("test", new THREE.Object3D());
    entity.object3D.position.set(3.5, 0, 7.5);  // sub-cell (3, 7)
    const walker = entity.addComponent(new Walker());
    world.addEntity(entity);

    expect(walker.currentSubCell).toEqual({ sx: 3, sz: 7 });
    expect(world.walkGrid.isWalkable(3, 7)).toBe(false);
});


test("followPath registers occupancy at the first sub-cell", () =>
{
    const { world, walker } = spawn();
    walker.followPath([{ sx: 1, sz: 1 }, { sx: 2, sz: 1 }]);

    expect(walker.currentSubCell).toEqual({ sx: 1, sz: 1 });
    expect(world.walkGrid.isWalkable(1, 1)).toBe(false);
});


test("update advances stamps as the walker crosses sub-cells", () =>
{
    const { world, entity, walker } = spawn(100);
    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }, { sx: 2, sz: 0 }]);

    expect(world.walkGrid.isWalkable(0, 0)).toBe(false);

    entity.update(0.1);
    // Step large enough to land in (1, 0); stamp moved.
    expect(world.walkGrid.isWalkable(0, 0)).toBe(true);
    expect(world.walkGrid.isWalkable(1, 0)).toBe(false);
    expect(walker.currentSubCell).toEqual({ sx: 1, sz: 0 });
});


test("onRemovedFromWorld clears the walker's stamp", () =>
{
    const { world, entity, walker } = spawn();
    walker.followPath([{ sx: 1, sz: 1 }, { sx: 2, sz: 1 }]);
    expect(world.walkGrid.isWalkable(1, 1)).toBe(false);

    world.removeEntity(entity);
    expect(world.walkGrid.isWalkable(1, 1)).toBe(true);
    expect(walker.currentSubCell).toBeNull();
});


/* COLLISION ******************************************************************/

test("emits 'blocked' when the next sub-cell becomes blocked mid-path", () =>
{
    const { world, entity, walker } = spawn(100);
    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }, { sx: 2, sz: 0 }]);

    entity.update(0.1);  // arrives at (1, 0)
    world.walkGrid.applyStamp([{ sx: 2, sz: 0 }]);

    entity.update(0.1);
    expect(blockedCount).toBe(1);
    expect(walker.completed).toBe(true);
});


test("does NOT look ahead — only blocks when the immediately next sub-cell is blocked", () =>
{
    const { world, entity, walker } = spawn(100);
    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    world.walkGrid.applyStamp([{ sx: 3, sz: 0 }]);
    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }, { sx: 2, sz: 0 }, { sx: 3, sz: 0 }]);

    entity.update(0.1);
    expect(blockedCount).toBe(0);
    expect(walker.currentSubCell).toEqual({ sx: 1, sz: 0 });

    entity.update(0.1);
    expect(blockedCount).toBe(0);
    expect(walker.currentSubCell).toEqual({ sx: 2, sz: 0 });

    entity.update(0.1);
    expect(blockedCount).toBe(1);
});


test("emits 'blocked' on first update when the next sub-cell is already blocked", () =>
{
    const { entity, world, walker } = spawn(100);
    entity.object3D.position.set(0.5, 0, 0.5);
    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    world.walkGrid.applyStamp([{ sx: 1, sz: 0 }]);

    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }]);
    expect(blockedCount).toBe(0);

    entity.update(0.1);
    expect(blockedCount).toBe(1);
    expect(walker.completed).toBe(true);
});


test("walker's own stamp doesn't block its own path", () =>
{
    const { walker } = spawn(100);
    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    // walker stamps (0, 0) on snap; checking (1, 0) for the next step
    // doesn't consult (0, 0), so no self-block.
    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }]);
    expect(blockedCount).toBe(0);
});


/* WITHDRAWAL *****************************************************************/

test("blocked far from sub-cell centre — walker withdraws then emits 'blocked'", () =>
{
    const { world, entity, walker } = spawn(1.0);
    // Start at sub-cell (1, 0)'s centre (1.5, 0.5), then nudge toward the
    // (2, 0) boundary so we have room to withdraw.
    entity.object3D.position.set(1.9, 0, 0.5);

    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    walker.followPath([{ sx: 1, sz: 0 }, { sx: 2, sz: 0 }]);
    world.walkGrid.applyStamp([{ sx: 2, sz: 0 }]);

    entity.update(0.5);
    expect(blockedCount).toBe(0);
    expect(walker.withdrawing).toBe(true);

    for(let i = 0; i < 20; i++) { entity.update(0.5); }

    expect(walker.withdrawing).toBe(false);
    expect(blockedCount).toBe(1);
    expect(walker.completed).toBe(true);
    expect(entity.object3D.position.x).toBeCloseTo(1.5, 1);
});


test("blocked near sub-cell centre — walker emits 'blocked' immediately, no withdrawal", () =>
{
    const { entity, world, walker } = spawn(100);
    entity.object3D.position.set(0.5, 0, 0.5);

    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    world.walkGrid.applyStamp([{ sx: 1, sz: 0 }]);
    walker.followPath([{ sx: 0, sz: 0 }, { sx: 1, sz: 0 }]);

    entity.update(0.1);
    expect(blockedCount).toBe(1);
    expect(walker.withdrawing).toBe(false);
    expect(walker.completed).toBe(true);
});


/* TELEPORT *******************************************************************/

test("teleportTo snaps position, clears path, emits 'displaced', moves stamp", () =>
{
    const { world, entity, walker } = spawn();
    walker.followPath([{ sx: 1, sz: 1 }, { sx: 2, sz: 1 }, { sx: 3, sz: 1 }]);

    let displacedCount = 0;
    walker.on("displaced", () => { displacedCount += 1; });

    walker.teleportTo(7, 7);

    expect(displacedCount).toBe(1);
    expect(walker.completed).toBe(true);
    expect(walker.path).toEqual([]);
    expect(walker.pathIndex).toBe(0);

    // Sub-cell (7, 7) centre = (7.5, 7.5).
    expect(entity.object3D.position.x).toBeCloseTo(7.5);
    expect(entity.object3D.position.z).toBeCloseTo(7.5);

    expect(world.walkGrid.isWalkable(1, 1)).toBe(true);
    expect(world.walkGrid.isWalkable(7, 7)).toBe(false);
    expect(walker.currentSubCell).toEqual({ sx: 7, sz: 7 });
});


test("teleportTo on a fresh walker registers stamp from scratch", () =>
{
    const { world, walker } = spawn();
    walker.teleportTo(4, 5);

    expect(world.walkGrid.isWalkable(4, 5)).toBe(false);
    expect(walker.currentSubCell).toEqual({ sx: 4, sz: 5 });
});
