import { test, expect } from "vitest";
import * as THREE from "three";

import { Entity } from "../../scripts/modules/world/entity.js";


class TestComponent
{
    constructor(value = 0)
    {
        this.value = value;
        this.attached = null;
        this.updatedWith = null;
    }

    attach(entity) { this.attached = entity; }
    update(dt)     { this.updatedWith = dt; }
    toJSON()       { return { value: this.value }; }
}


class OtherComponent
{
    toJSON() { return { other: true }; }
}


test("addComponent stores the component keyed by class", () =>
{
    const entity    = new Entity("test", new THREE.Object3D());
    const component = entity.addComponent(new TestComponent(7));

    expect(entity.getComponent(TestComponent)).toBe(component);
    expect(entity.hasComponent(TestComponent)).toBe(true);
    expect(entity.hasComponent(OtherComponent)).toBe(false);
});


test("addComponent calls component.attach with the entity", () =>
{
    const entity    = new Entity("test", new THREE.Object3D());
    const component = entity.addComponent(new TestComponent());

    expect(component.attached).toBe(entity);
});


test("getComponent returns undefined for missing components", () =>
{
    const entity = new Entity("test", new THREE.Object3D());
    expect(entity.getComponent(TestComponent)).toBe(undefined);
});


test("update fans out to every component's update method", () =>
{
    const entity = new Entity("test", new THREE.Object3D());
    const a = entity.addComponent(new TestComponent());
    const b = entity.addComponent(new OtherComponent());

    entity.update(0.016);

    expect(a.updatedWith).toBe(0.016);
    expect(b.updatedWith === undefined || b.updatedWith === null).toBe(true);
});


test("toJSON serialises kind and component data keyed by class name", () =>
{
    const entity = new Entity("wall.stone.straight", new THREE.Object3D());
    entity.addComponent(new TestComponent(42));
    entity.addComponent(new OtherComponent());

    const json = entity.toJSON();

    expect(json.kind).toBe("wall.stone.straight");
    expect(json.components.TestComponent).toEqual({ value: 42 });
    expect(json.components.OtherComponent).toEqual({ other: true });
});


test("entity.world is null until added to a world", () =>
{
    const entity = new Entity("test", new THREE.Object3D());
    expect(entity.world).toBe(null);
});
