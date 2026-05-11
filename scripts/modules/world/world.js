import * as THREE from "three";

import { Emitter } from "../engine/emitter.js";


/******************************************************************************/
/* WORLD                                                                      */
/******************************************************************************/

/*
 * Owns the THREE.Scene, the Grid, and the entity registry. `addEntity` and
 * `removeEntity` keep the three in lock-step.
 *
 *   entityAdded    — the Entity that was just added
 *   entityRemoved  — the Entity that was just removed
 *   gridChanged    — emitted when the Grid mutates (reserved)
 */

class World extends Emitter
{
    constructor(grid)
    {
        super();
        this.grid = grid;
        this.scene = new THREE.Scene();
        this.entities = new Set();
        this.playerDisplaceHandler = null;
    }

    setPlayerDisplaceHandler(fn)
    {
        if(fn !== null && typeof fn !== "function")
        {
            throw new Error("World.setPlayerDisplaceHandler: argument must be a function or null.");
        }
        this.playerDisplaceHandler = fn;
    }

    addEntity(entity)
    {
        entity.setWorld(this);
        this.entities.add(entity);
        this.scene.add(entity.object3D);

        for(const component of entity.components.values())
        {
            if(typeof component.onAddedToWorld === "function")
            {
                component.onAddedToWorld(this);
            }
        }

        this.emit("entityAdded", entity);
        
        return entity;
    }

    removeEntity(entity)
    {
        if(!this.entities.has(entity)) { return; }

        for(const component of entity.components.values())
        {
            if(typeof component.onRemovedFromWorld === "function")
            {
                component.onRemovedFromWorld(this);
            }
        }

        this.scene.remove(entity.object3D);
        this.entities.delete(entity);
        entity.setWorld(null);

        this.emit("entityRemoved", entity);
    }

    update(dt)
    {
        for(const entity of this.entities)
        {
            entity.update(dt);
        }
    }
}

export { World };
