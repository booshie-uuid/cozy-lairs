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
