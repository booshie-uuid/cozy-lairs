import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World }         from "../../scripts/modules/world/world.js";
import { Grid }          from "../../scripts/modules/world/grid.js";
import { Entity }        from "../../scripts/modules/world/entity.js";
import { Transform }     from "../../scripts/modules/world/components/transform.js";
import { Renderable }    from "../../scripts/modules/world/components/renderable.js";
import { GridPlacement } from "../../scripts/modules/world/components/grid-placement.js";


function makeEntity(kind = "test")
{
    return new Entity(kind, new THREE.Object3D());
}


/* TRANSFORM ******************************************************************/

test("Transform.toJSON captures position, rotation, and scale", () =>
{
    const entity    = makeEntity();
    const transform = entity.addComponent(new Transform());
    entity.object3D.position.set(1, 2, 3);
    entity.object3D.rotation.set(0.1, 0.2, 0.3);
    entity.object3D.scale.set(2, 2, 2);

    const json = transform.toJSON();

    expect(json.position).toEqual([1, 2, 3]);
    expect(json.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(json.scale).toEqual([2, 2, 2]);
});


test("Transform.applyJSON restores position, rotation, and scale", () =>
{
    const entity    = makeEntity();
    const transform = entity.addComponent(new Transform());

    transform.applyJSON({
        position: [4, 5, 6],
        rotation: [0.4, 0.5, 0.6],
        scale:    [3, 3, 3]
    });

    expect(entity.object3D.position.toArray()).toEqual([4, 5, 6]);
    expect(entity.object3D.rotation.x).toBeCloseTo(0.4);
    expect(entity.object3D.rotation.y).toBeCloseTo(0.5);
    expect(entity.object3D.rotation.z).toBeCloseTo(0.6);
    expect(entity.object3D.scale.toArray()).toEqual([3, 3, 3]);
});


test("Transform round-trip preserves all values", () =>
{
    const a = makeEntity();
    const ta = a.addComponent(new Transform());
    a.object3D.position.set(7, 8, 9);
    a.object3D.rotation.set(0.5, 1.0, 1.5);
    a.object3D.scale.set(0.5, 0.5, 0.5);

    const json = ta.toJSON();

    const b = makeEntity();
    const tb = b.addComponent(new Transform());
    tb.applyJSON(json);

    expect(b.object3D.position.toArray()).toEqual(a.object3D.position.toArray());
    expect(b.object3D.scale.toArray()).toEqual(a.object3D.scale.toArray());
});


/* RENDERABLE *****************************************************************/

test("Renderable.toJSON captures the kind", () =>
{
    const entity     = makeEntity();
    const renderable = entity.addComponent(new Renderable("wall.stone.straight"));

    expect(renderable.toJSON()).toEqual({ kind: "wall.stone.straight" });
});


test("Renderable mounts a placeholder mesh when the asset can't be resolved", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingAssets  = { get: () => { throw new Error("not loaded"); } };

    const entity = makeEntity();
    const renderable = entity.addComponent(new Renderable("ghost.kind", failingAssets));

    const world = new World(new Grid(4, 4));
    expect(() => world.addEntity(entity)).not.toThrow();
    expect(entity.object3D.children.length).toBe(1);
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
});


/* GRID PLACEMENT *************************************************************/

test("GridPlacement.toJSON captures cx, cz, and rotationStep", () =>
{
    const placement = new GridPlacement(3, 5, 2);
    expect(placement.toJSON()).toEqual({ cx: 3, cz: 5, rotationStep: 2 });
});


test("GridPlacement constructor rejects out-of-range rotationStep", () =>
{
    expect(() => new GridPlacement(0, 0, 4)).toThrow();
    expect(() => new GridPlacement(0, 0, -1)).toThrow();
    expect(() => new GridPlacement(0, 0, 1.5)).toThrow();
});


test("GridPlacement applies position and rotation when added to a world", () =>
{
    const world  = new World(new Grid(8, 8));
    const entity = makeEntity();
    entity.addComponent(new GridPlacement(2, 3, 1));

    world.addEntity(entity);

    const expected = world.grid.cellToWorld(2, 3);
    expect(entity.object3D.position.x).toBe(expected.x);
    expect(entity.object3D.position.z).toBe(expected.z);
    expect(entity.object3D.position.y).toBe(0);
    expect(entity.object3D.rotation.y).toBeCloseTo(Math.PI / 2);
});


test("GridPlacement rotationStep maps to the correct quarter turns", () =>
{
    const world = new World(new Grid(4, 4));

    const cases = [
        [0, 0],
        [1, Math.PI / 2],
        [2, Math.PI],
        [3, 3 * Math.PI / 2]
    ];

    for(const [step, expected] of cases)
    {
        const entity = makeEntity();
        entity.addComponent(new GridPlacement(0, 0, step));
        world.addEntity(entity);
        expect(entity.object3D.rotation.y).toBeCloseTo(expected);
        world.removeEntity(entity);
    }
});
