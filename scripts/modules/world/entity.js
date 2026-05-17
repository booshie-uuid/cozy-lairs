import * as THREE from "three";

import { Renderable } from "./components/renderable.js";


/******************************************************************************/
/* ENTITY                                                                     */
/******************************************************************************/

class Entity
{
    constructor(kind, object3D)
    {
        this.kind = kind;
        this.object3D = object3D;
        this.components = new Map();
        this.world = null;

        // Backref so a mesh-level raycast hit can resolve up to the entity.
        this.object3D.userData.entity = this;
    }

    addComponent(component)
    {
        this.components.set(component.constructor, component);

        if(typeof component.attach === "function")
        {
            component.attach(this);
        }

        return component;
    }

    setWorld(world)
    {
        if(world !== null && this.world !== null && this.world !== world)
        {
            throw new Error("Entity is already in a world; remove it first.");
        }

        this.world = world;
    }

    getComponent(ComponentClass)
    {
        return this.components.get(ComponentClass);
    }

    hasComponent(ComponentClass)
    {
        return this.components.has(ComponentClass);
    }

    update(dt)
    {
        for(const component of this.components.values())
        {
            if(typeof component.update === "function")
            {
                component.update(dt);
            }
        }
    }

    toJSON()
    {
        const components = {};
        for(const [Klass, component] of this.components)
        {
            if(typeof component.toJSON === "function")
            {
                components[Klass.name] = component.toJSON();
            }
        }
        
        return { kind: this.kind, components };
    }

    static fromKind(kind, assets)
    {
        const entity = new Entity(kind, new THREE.Group());
        entity.addComponent(new Renderable(kind, assets));
        return entity;
    }
}

export { Entity };
