import { test, expect } from "vitest";
import * as THREE from "three";

import { World }  from "../../../scripts/modules/world/world.js";
import { Grid }   from "../../../scripts/modules/world/grid.js";
import { Entity } from "../../../scripts/modules/world/entity.js";
import { Walker } from "../../../scripts/modules/world/components/walker.js";


function spawn(waypoints, speed = 1.5)
{
    const world  = new World(new Grid(10, 10, 4));
    const entity = new Entity("test", new THREE.Object3D());
    entity.addComponent(new Walker(waypoints, speed));
    world.addEntity(entity);
    return entity;
}


test("constructor throws on fewer than 2 waypoints", () =>
{
    expect(() => new Walker([])).toThrow();
    expect(() => new Walker([{ x: 0, z: 0 }])).toThrow();
    expect(() => new Walker(null)).toThrow();
    expect(() => new Walker(undefined)).toThrow();
});


test("snaps to first waypoint when added to world", () =>
{
    const e = spawn([{ x: 5, z: 5 }, { x: 10, z: 10 }]);
    expect(e.object3D.position.x).toBeCloseTo(5);
    expect(e.object3D.position.z).toBeCloseTo(5);
});


test("update moves position toward current target at constant speed", () =>
{
    const e = spawn([{ x: 0, z: 0 }, { x: 10, z: 0 }], 1.0);

    e.update(1.0);
    expect(e.object3D.position.x).toBeCloseTo(1.0);
    expect(e.object3D.position.z).toBeCloseTo(0);

    e.update(2.0);
    expect(e.object3D.position.x).toBeCloseTo(3.0);
});


test("snaps to target when step would overshoot", () =>
{
    const e = spawn([{ x: 0, z: 0 }, { x: 1, z: 0 }], 100);

    e.update(1 / 60);
    expect(e.object3D.position.x).toBeCloseTo(1);
});


test("ping-pongs through 3 waypoints", () =>
{
    const wps = [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 2, z: 0 }
    ];
    const e = spawn(wps, 100);

    e.update(0.1);
    expect(e.object3D.position.x).toBeCloseTo(1);

    e.update(0.1);
    expect(e.object3D.position.x).toBeCloseTo(2);

    e.update(0.1);
    expect(e.object3D.position.x).toBeCloseTo(1);

    e.update(0.1);
    expect(e.object3D.position.x).toBeCloseTo(0);

    e.update(0.1);
    expect(e.object3D.position.x).toBeCloseTo(1);
});


test("ping-pongs between exactly 2 waypoints", () =>
{
    const e = spawn([{ x: 0, z: 0 }, { x: 5, z: 0 }], 100);

    e.update(0.1);
    expect(e.object3D.position.x).toBeCloseTo(5);

    e.update(0.1);
    expect(e.object3D.position.x).toBeCloseTo(0);

    e.update(0.1);
    expect(e.object3D.position.x).toBeCloseTo(5);
});


test("faces direction of travel via Y rotation", () =>
{
    const e = spawn([{ x: 0, z: 0 }, { x: 5, z: 0 }]);

    e.update(0.1);
    expect(e.object3D.rotation.y).toBeCloseTo(Math.atan2(5, 0));
});


test("toJSON returns waypoints and speed", () =>
{
    const walker = new Walker([{ x: 1, z: 2 }, { x: 3, z: 4 }], 2.0);
    expect(walker.toJSON()).toEqual({
        waypoints: [{ x: 1, z: 2 }, { x: 3, z: 4 }],
        speed:     2.0
    });
});


test("deep-clones waypoints — mutating the source array does not affect the walker", () =>
{
    const sourceWps = [{ x: 0, z: 0 }, { x: 5, z: 0 }];
    const walker   = new Walker(sourceWps);
    sourceWps[0].x = 100;
    sourceWps[1].z = 100;
    expect(walker.waypoints[0].x).toBe(0);
    expect(walker.waypoints[1].z).toBe(0);
});


test("rejects waypoints without numeric x and z", () =>
{
    expect(() => new Walker([{ x: 0, z: 0 }, { x: undefined, z: 0 }])).toThrow();
    expect(() => new Walker([{ x: 0, z: 0 }, { x: 0 }])).toThrow();
    expect(() => new Walker([{ x: 0, z: 0 }, null])).toThrow();
    expect(() => new Walker([{ x: "0", z: 0 }, { x: 0, z: 0 }])).toThrow();
});
