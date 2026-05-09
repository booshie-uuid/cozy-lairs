import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World }  from "../../../scripts/modules/world/world.js";
import { Grid }   from "../../../scripts/modules/world/grid.js";
import { Entity } from "../../../scripts/modules/world/entity.js";
import { Walker } from "../../../scripts/modules/world/components/walker.js";


function spawn(speed = 1.5)
{
    const world  = new World(new Grid(10, 10, 4));
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
