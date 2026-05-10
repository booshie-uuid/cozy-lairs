import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World }  from "../../../scripts/modules/world/world.js";
import { Grid }   from "../../../scripts/modules/world/grid.js";
import { Entity } from "../../../scripts/modules/world/entity.js";
import { Walker } from "../../../scripts/modules/world/components/walker.js";


function spawn(speed = 1.5)
{
    const world  = new World(new Grid(10, 10, 4));
    // Mark every cell as walkable so the new isAvailable pre-check doesn't
    // immediately block the walker on followPath.
    for(let cx = 0; cx < 10; cx++)
    {
        for(let cz = 0; cz < 10; cz++) { world.grid.markFloor(cx, cz); }
    }
    const entity = new Entity("test", new THREE.Object3D());
    const walker = entity.addComponent(new Walker({ speed }));
    world.addEntity(entity);
    return { world, entity, walker };
}


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


test("followPath snaps the entity to the first cell-centre", () =>
{
    const { entity, walker } = spawn();

    walker.followPath([{ cx: 1, cz: 2 }, { cx: 3, cz: 2 }]);

    // Grid cellSize=4, cell (1, 2) centre is (1*4 + 2, 2*4 + 2) = (6, 10)
    expect(entity.object3D.position.x).toBeCloseTo(6);
    expect(entity.object3D.position.z).toBeCloseTo(10);
});


test("update moves toward the next cell at constant speed", () =>
{
    const { entity, walker } = spawn(1.0);
    // followPath no longer auto-snaps to path[0]'s centre when the walker
    // is already inside that cell — position the walker at the centre
    // explicitly for this test's expected travel distance.
    entity.object3D.position.set(2, 0, 2);
    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }]);

    // (0, 0) → (1, 0): world (2, 2) → (6, 2). Distance 4m.
    entity.update(1.0);
    expect(entity.object3D.position.x).toBeCloseTo(3);
    expect(entity.object3D.position.z).toBeCloseTo(2);
});


test("snaps to target when step would overshoot, then advances pathIndex", () =>
{
    const { entity, walker } = spawn(100);
    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }, { cx: 2, cz: 0 }]);

    // step = 100 * 0.1 = 10m, distance to (1, 0) = 4m → snap and advance
    entity.update(0.1);
    expect(entity.object3D.position.x).toBeCloseTo(6);
    expect(walker.pathIndex).toBe(2);
});


test("walks a 4-cell path in order then emits arrived once", () =>
{
    const { entity, walker } = spawn(100);
    let arrivedCount = 0;
    walker.on("arrived", () => { arrivedCount += 1; });

    walker.followPath([
        { cx: 0, cz: 0 },
        { cx: 1, cz: 0 },
        { cx: 1, cz: 1 },
        { cx: 0, cz: 1 }
    ]);

    // Step generously to traverse the whole path
    for(let i = 0; i < 10; i++) { entity.update(0.1); }

    expect(walker.completed).toBe(true);
    expect(arrivedCount).toBe(1);

    // Final position should be cell (0, 1) centre = (2, 6)
    expect(entity.object3D.position.x).toBeCloseTo(2);
    expect(entity.object3D.position.z).toBeCloseTo(6);
});


test("further updates after arrival do nothing", () =>
{
    const { entity, walker } = spawn(100);
    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }]);
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

    walker.followPath([{ cx: 2, cz: 3 }]);

    expect(walker.completed).toBe(true);
    expect(arrivedCount).toBe(1);
    expect(entity.object3D.position.x).toBeCloseTo(2 * 4 + 2);
    expect(entity.object3D.position.z).toBeCloseTo(3 * 4 + 2);
});


test("targetRotation is set immediately after followPath; rotation.y smooths toward it", () =>
{
    const { entity, walker } = spawn(0.001);
    // Position at cell (0, 0) centre so the heading vector to (1, 0) is
    // pure +X (atan2 = π/2). Without this, walker stays at (0, 0, 0) and
    // the heading vector picks up the off-centre offset.
    entity.object3D.position.set(2, 0, 2);

    // (0, 0) → (1, 0): heading is +X. atan2(+X, 0) = π/2.
    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }]);

    // followPath sets target instantly, but rotation.y is still 0
    expect(walker.targetRotation).toBeCloseTo(Math.PI / 2);
    expect(entity.object3D.rotation.y).toBe(0);

    // After enough updates the rotation converges (exponential smoothing —
    // never quite reaches, but gets very close).
    for(let i = 0; i < 100; i++) { entity.update(0.1); }
    expect(entity.object3D.rotation.y).toBeCloseTo(Math.PI / 2, 4);
});


test("rotation smoothing picks the shortest arc across the ±π wrap", () =>
{
    const { entity, walker } = spawn(0.001);
    entity.object3D.rotation.y = -3.0;  // close to -π
    walker.targetRotation       = 3.0;  // close to +π — shortest arc is via -π, not via 0

    entity.update(0.1);

    // After one tick, rotation should have moved toward -π (decreasing), not toward 0
    expect(entity.object3D.rotation.y).toBeLessThan(-3.0);
});


test("toJSON captures speed, path, and pathIndex", () =>
{
    const { walker } = spawn(2.0);
    walker.followPath([{ cx: 1, cz: 2 }, { cx: 3, cz: 4 }, { cx: 5, cz: 6 }]);

    const json = walker.toJSON();
    expect(json.speed).toBe(2.0);
    expect(json.path).toEqual([
        { cx: 1, cz: 2 },
        { cx: 3, cz: 4 },
        { cx: 5, cz: 6 }
    ]);
    expect(json.pathIndex).toBe(1);
});


test("followPath deep-clones the source path — mutations don't leak in", () =>
{
    const { walker } = spawn();
    const source = [{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }];

    walker.followPath(source);
    source[0].cx = 99;
    source[1].cz = 99;

    expect(walker.path[0].cx).toBe(0);
    expect(walker.path[1].cz).toBe(0);
});


test("followPath rejects malformed cells", () =>
{
    const { walker } = spawn();
    expect(() => walker.followPath([{ cx: 0, cz: 0 }, { cx: 1 }])).toThrow();
    expect(() => walker.followPath([{ cx: 0, cz: 0 }, null])).toThrow();
    expect(() => walker.followPath([{ cx: "0", cz: 0 }, { cx: 1, cz: 0 }])).toThrow();
    expect(() => walker.followPath("not-an-array")).toThrow();
});


test("followPath with startIndex restores mid-path — snaps to previous cell, targets startIndex", () =>
{
    const { entity, walker } = spawn();
    const path = [
        { cx: 0, cz: 0 },
        { cx: 1, cz: 0 },
        { cx: 2, cz: 0 }
    ];

    walker.followPath(path, { startIndex: 2 });

    // Snapped to path[1] = cell (1, 0) → world (6, 2)
    expect(entity.object3D.position.x).toBeCloseTo(6);
    expect(entity.object3D.position.z).toBeCloseTo(2);
    expect(walker.pathIndex).toBe(2);
    expect(walker.completed).toBe(false);
});


test("followPath with startIndex past the end snaps to last cell and emits arrived", () =>
{
    const { entity, walker } = spawn();
    let arrivedCount = 0;
    walker.on("arrived", () => { arrivedCount += 1; });

    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }], { startIndex: 5 });

    expect(walker.completed).toBe(true);
    expect(arrivedCount).toBe(1);
    expect(entity.object3D.position.x).toBeCloseTo(6);
});


/* COLLISION + OCCUPANCY ******************************************************/


test("snapToCell registers the entity as occupant of the cell", () =>
{
    const { world, entity, walker } = spawn();
    walker.followPath([{ cx: 1, cz: 1 }, { cx: 2, cz: 1 }]);

    expect(world.grid.getOccupant(1, 1)).toBe(entity);
    expect(walker.currentCell).toEqual({ cx: 1, cz: 1 });
});


test("update advances occupancy as the walker crosses cells", () =>
{
    const { world, entity, walker } = spawn(100);
    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }, { cx: 2, cz: 0 }]);

    expect(world.grid.getOccupant(0, 0)).toBe(entity);

    entity.update(0.1);
    // Should have reached cell (1, 0); occupancy moved
    expect(world.grid.getOccupant(0, 0)).toBeNull();
    expect(world.grid.getOccupant(1, 0)).toBe(entity);
    expect(walker.currentCell).toEqual({ cx: 1, cz: 0 });
});


test("emits 'blocked' when the next cell becomes unavailable mid-path", () =>
{
    const { world, entity, walker } = spawn(100);
    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }, { cx: 2, cz: 0 }]);

    // After step 1, walker is at (1, 0) and about to head to (2, 0).
    // Drop a different entity into (2, 0) before that pre-check runs.
    entity.update(0.1);  // arrives at (1, 0)
    world.grid.setOccupant(2, 0, { id: "obstacle" });

    entity.update(0.1);  // walker tries to advance, pre-check fails
    expect(blockedCount).toBe(1);
    expect(walker.completed).toBe(true);
});


test("does NOT look ahead — only blocks when the immediately next cell is occupied", () =>
{
    const { world, entity, walker } = spawn(100);
    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    // Path goes 0 → 1 → 2 → 3. Drop an obstacle in cell 3 (two cells out)
    // BEFORE the walker arrives at cell 1. The walker should not block
    // at cell 1's arrival — only later when actually entering cell 3.
    world.grid.setOccupant(3, 0, { id: "obstacle" });

    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }, { cx: 2, cz: 0 }, { cx: 3, cz: 0 }]);

    entity.update(0.1);  // arrives at (1, 0) — no block (cell 3 is two ahead)
    expect(blockedCount).toBe(0);
    expect(walker.currentCell).toEqual({ cx: 1, cz: 0 });

    entity.update(0.1);  // arrives at (2, 0) — still no block
    expect(blockedCount).toBe(0);
    expect(walker.currentCell).toEqual({ cx: 2, cz: 0 });

    entity.update(0.1);  // tries to enter (3, 0) — NOW blocks
    expect(blockedCount).toBe(1);
});


test("on block, position does not advance into the contested cell", () =>
{
    const { world, entity, walker } = spawn(100);
    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }, { cx: 2, cz: 0 }]);

    entity.update(0.1);  // arrives at (1, 0); position now (6, 2)
    world.grid.setOccupant(2, 0, { id: "obstacle" });

    const xBefore = entity.object3D.position.x;
    entity.update(0.1);  // tries to cross into (2, 0), blocks
    // Position should NOT have advanced into (2, 0). It stays where it was
    // (or at most moves within (1, 0), never crossing the boundary).
    const cellAfter = world.grid.worldToCell(entity.object3D.position.x, entity.object3D.position.z);
    expect(cellAfter).toEqual({ cx: 1, cz: 0 });
    expect(entity.object3D.position.x).toBe(xBefore);
});


test("blocked far from cell centre — walker withdraws to centre, then emits 'blocked'", () =>
{
    const { world, entity, walker } = spawn(1.0);
    // Position the walker partway across cell (1, 0) — boundary at x=8 is
    // close. Plenty of room to withdraw back toward (1, 0)'s centre (6).
    entity.object3D.position.set(7.5, 0, 2);

    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    walker.followPath([{ cx: 1, cz: 0 }, { cx: 2, cz: 0 }]);

    // Pre-occupy the next cell so the walker will block on its first
    // attempt to cross into (2, 0).
    world.grid.setOccupant(2, 0, { id: "obstacle" });

    // First update: walker tries to cross x=8 boundary, blocked, withdrawal
    // path replaces user path. blocked NOT yet emitted.
    entity.update(2);  // big-ish tick to make the cross happen quickly
    expect(blockedCount).toBe(0);
    expect(walker.withdrawing).toBe(true);

    // Walker walks back toward (1, 0) centre over subsequent ticks.
    for(let i = 0; i < 20; i++) { entity.update(0.5); }

    expect(walker.withdrawing).toBe(false);
    expect(blockedCount).toBe(1);
    expect(walker.completed).toBe(true);
    // Walker should have ended at or near the centre of cell (1, 0).
    expect(entity.object3D.position.x).toBeCloseTo(6, 0);
    expect(entity.object3D.position.z).toBeCloseTo(2, 0);
});


test("blocked near cell centre — walker emits 'blocked' immediately, no withdrawal", () =>
{
    const { entity, world, walker } = spawn(100);
    // At cell (0, 0) centre — distance to centre is 0, well within MESH_BUFFER.
    entity.object3D.position.set(2, 0, 2);

    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    world.grid.setOccupant(1, 0, { id: "obstacle" });
    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }]);

    entity.update(0.1);
    expect(blockedCount).toBe(1);
    expect(walker.withdrawing).toBe(false);
    expect(walker.completed).toBe(true);
});


test("emits 'blocked' on first update when next cell is already occupied", () =>
{
    const { entity, world, walker } = spawn(100);
    // Position at cell (0, 0) centre so the block fires immediately rather
    // than triggering the withdraw-to-centre mini-path (which would defer
    // the blocked emit until withdrawal completes).
    entity.object3D.position.set(2, 0, 2);
    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    world.grid.setOccupant(1, 0, { id: "obstacle" });

    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }]);
    expect(blockedCount).toBe(0);

    // First update tick crosses (or tries to cross) into cell (1, 0)
    entity.update(0.1);
    expect(blockedCount).toBe(1);
    expect(walker.completed).toBe(true);
});


test("isAvailable check excludes self — walker doesn't block its own path", () =>
{
    const { walker } = spawn(100);
    let blockedCount = 0;
    walker.on("blocked", () => { blockedCount += 1; });

    // walker registers (0, 0) as occupant on snap; this should NOT trip the
    // pre-check for path[1] because the excludeOccupant arg passes the entity.
    walker.followPath([{ cx: 0, cz: 0 }, { cx: 1, cz: 0 }]);
    expect(blockedCount).toBe(0);
});


test("onRemovedFromWorld clears the walker's current occupancy", () =>
{
    const { world, entity, walker } = spawn();
    walker.followPath([{ cx: 1, cz: 1 }, { cx: 2, cz: 1 }]);
    expect(world.grid.getOccupant(1, 1)).toBe(entity);

    world.removeEntity(entity);
    expect(world.grid.getOccupant(1, 1)).toBeNull();
    expect(walker.currentCell).toBeNull();
});


/* TELEPORT *******************************************************************/


test("teleportTo snaps position, clears path, emits 'displaced', updates occupancy", () =>
{
    const { world, entity, walker } = spawn();
    walker.followPath([{ cx: 1, cz: 1 }, { cx: 2, cz: 1 }, { cx: 3, cz: 1 }]);

    let displacedCount = 0;
    walker.on("displaced", () => { displacedCount += 1; });

    walker.teleportTo(7, 7);

    expect(displacedCount).toBe(1);
    expect(walker.completed).toBe(true);
    expect(walker.path).toEqual([]);
    expect(walker.pathIndex).toBe(0);

    // Position snapped to cell (7, 7) → world (7*4 + 2, 7*4 + 2) = (30, 30)
    expect(entity.object3D.position.x).toBeCloseTo(30);
    expect(entity.object3D.position.z).toBeCloseTo(30);

    // Occupancy moved from previous cell (1, 1) to (7, 7)
    expect(world.grid.getOccupant(1, 1)).toBeNull();
    expect(world.grid.getOccupant(7, 7)).toBe(entity);
    expect(walker.currentCell).toEqual({ cx: 7, cz: 7 });
});


test("teleportTo on a fresh walker (no prior cell) registers occupancy from scratch", () =>
{
    const { world, entity, walker } = spawn();

    walker.teleportTo(4, 5);

    expect(world.grid.getOccupant(4, 5)).toBe(entity);
    expect(walker.currentCell).toEqual({ cx: 4, cz: 5 });
});
