import * as THREE from "three";

import { Renderable } from "./components/renderable.js";


/******************************************************************************/
/* ENTITY                                                                     */
/******************************************************************************/

/*
 * One Three.js Object3D plus a typed bag of components keyed by constructor
 * (`entity.getComponent(GridPlacement)`). `kind` is the manifest asset id
 * the save format keys on when reconstructing.
 *
 * Optional component lifecycle hooks:
 *   attach(entity)         — addComponent(); entity ref now available
 *   onAddedToWorld(world)  — world.addEntity(); world ref now available
 *   onRemovedFromWorld()   — world.removeEntity()
 *   update(dt)             — entity.update()
 *   toJSON()               — plain serialisable data
 */

class Entity
{
    constructor(kind, object3D)
    {
        this.kind = kind;
        this.object3D = object3D;
        this.components = new Map();
        this.world = null;

        /* Backref consumed by `BuilderInputAdapter.raycastEntity` to resolve a
         * mesh-level raycast hit up to its owning entity. THREE seeds
         * `userData` to an empty object on every Object3D, so this assignment
         * is always safe. */
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
