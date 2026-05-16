import { test, expect } from "vitest";
import * as THREE from "three";

import { World }  from "../../scripts/modules/world/world.js";
import { Grid }   from "../../scripts/modules/world/grid.js";
import { Entity } from "../../scripts/modules/world/entity.js";


function makeWorld()
{
    return new World(new Grid(4, 4));
}


test("addEntity adds the object3D to the scene and registers the entity", () =>
{
    const world  = makeWorld();
    const entity = new Entity("floor.stone.basic", new THREE.Object3D());

    world.addEntity(entity);

    expect(world.entities.has(entity)).toBe(true);
    expect(world.scene.children.includes(entity.object3D)).toBe(true);
    expect(entity.world).toBe(world);
});


test("addEntity emits entityAdded with the entity as payload", () =>
{
    const world  = makeWorld();
    const entity = new Entity("test", new THREE.Object3D());
    const seen   = [];
    world.on("entityAdded", payload => seen.push(payload));

    world.addEntity(entity);

    expect(seen).toEqual([entity]);
});


test("removeEntity unregisters and emits entityRemoved", () =>
{
    const world  = makeWorld();
    const entity = new Entity("test", new THREE.Object3D());
    const seen   = [];
    world.on("entityRemoved", payload => seen.push(payload));

    world.addEntity(entity);
    world.removeEntity(entity);

    expect(world.entities.has(entity)).toBe(false);
    expect(world.scene.children.includes(entity.object3D)).toBe(false);
    expect(entity.world).toBe(null);
    expect(seen).toEqual([entity]);
});


test("removeEntity is a no-op for an entity not in the world", () =>
{
    const world  = makeWorld();
    const entity = new Entity("test", new THREE.Object3D());
    const seen   = [];
    world.on("entityRemoved", payload => seen.push(payload));

    world.removeEntity(entity);

    expect(seen.length).toBe(0);
});


test("addEntity throws if the entity is already in another world", () =>
{
    const worldA = makeWorld();
    const worldB = makeWorld();
    const entity = new Entity("test", new THREE.Object3D());

    worldA.addEntity(entity);
    expect(() => worldB.addEntity(entity)).toThrow();
});


test("update fans out to every entity", () =>
{
    const world = makeWorld();

    let aTicks = 0;
    let bTicks = 0;

    const a = new Entity("a", new THREE.Object3D());
    a.addComponent({
        attach: () => {},
        update: () => { aTicks += 1; }
    });
    const b = new Entity("b", new THREE.Object3D());
    b.addComponent({
        attach: () => {},
        update: () => { bTicks += 1; }
    });

    world.addEntity(a);
    world.addEntity(b);
    world.update(0.016);

    expect(aTicks).toBe(1);
    expect(bTicks).toBe(1);
});


test("addEntity calls onAddedToWorld on every component that has one", () =>
{
    const world  = makeWorld();
    const entity = new Entity("test", new THREE.Object3D());

    let receivedWorld = null;
    entity.addComponent({
        attach: () => {},
        onAddedToWorld: w => { receivedWorld = w; }
    });

    world.addEntity(entity);

    expect(receivedWorld).toBe(world);
});


test("removeEntity calls onRemovedFromWorld on every component that has one", () =>
{
    const world  = makeWorld();
    const entity = new Entity("test", new THREE.Object3D());

    let removedWith = null;
    entity.addComponent({
        attach: () => {},
        onRemovedFromWorld: w => { removedWith = w; }
    });

    world.addEntity(entity);
    world.removeEntity(entity);

    expect(removedWith).toBe(world);
});


test("clear removes every entity and emits entityRemoved for each", () =>
{
    const world = makeWorld();
    const a = new Entity("a", new THREE.Object3D());
    const b = new Entity("b", new THREE.Object3D());
    const c = new Entity("c", new THREE.Object3D());
    world.addEntity(a);
    world.addEntity(b);
    world.addEntity(c);

    const removed = [];
    world.on("entityRemoved", entity => removed.push(entity));

    world.clear();

    expect(world.entities.size).toBe(0);
    expect(world.scene.children.includes(a.object3D)).toBe(false);
    expect(world.scene.children.includes(b.object3D)).toBe(false);
    expect(world.scene.children.includes(c.object3D)).toBe(false);
    expect(removed.length).toBe(3);
    expect(new Set(removed)).toEqual(new Set([a, b, c]));
});


test("clear is safe to call on an empty world", () =>
{
    const world = makeWorld();

    expect(() => world.clear()).not.toThrow();
    expect(world.entities.size).toBe(0);
});


/* WALK-GRID INTEGRATION ******************************************************/

test("World constructs a walk-grid sized to the main grid", () =>
{
    const grid = new Grid(5, 7, 4);
    const world = new World(grid);

    expect(world.walkGrid).toBeDefined();
    expect(world.walkGrid.width).toBe(20);  // 5 * 4
    expect(world.walkGrid.depth).toBe(28);  // 7 * 4
    expect(world.walkGrid.subCellSize).toBe(1);
    expect(world.walkGrid.subsPerMain).toBe(4);
});


test("World walk-grid scales sub-cells to the main grid's cellSize", () =>
{
    const grid = new Grid(3, 3, 2);  // 2m main cells
    const world = new World(grid);

    expect(world.walkGrid.subsPerMain).toBe(2);
    expect(world.walkGrid.width).toBe(6);  // 3 * 2
    expect(world.walkGrid.depth).toBe(6);
});


test("World.clear resets the walk-grid refcounts", () =>
{
    const world = makeWorld();
    world.walkGrid.applyStamp([{ sx: 1, sz: 2 }, { sx: 3, sz: 4 }]);

    expect(world.walkGrid.isWalkable(1, 2)).toBe(false);

    world.clear();

    expect(world.walkGrid.isWalkable(1, 2)).toBe(true);
    expect(world.walkGrid.isWalkable(3, 4)).toBe(true);
});


test("World stores the optional assets reference for lifecycle components", () =>
{
    const grid = new Grid(4, 4);
    const fakeAssets = { getMeta: () => null, getAabb: () => null };
    const world = new World(grid, fakeAssets);

    expect(world.assets).toBe(fakeAssets);
});
