import * as THREE from "three";

import { Emitter }   from "../engine/emitter.js";
import { WalkGrid }  from "./walk-grid.js";


/******************************************************************************/
/* WORLD                                                                      */
/******************************************************************************/

class World extends Emitter
{
    constructor(grid, assets = null)
    {
        super();
        this.grid     = grid;
        this.assets   = assets;
        this.walkGrid = buildWalkGrid(grid);
        this.scene    = new THREE.Scene();
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

    clear()
    {
        // Snapshot before iterating — removeEntity mutates this.entities.
        const all = Array.from(this.entities);
        for(const entity of all)
        {
            this.removeEntity(entity);
        }
        // Defensive reset against a stale refcount from a placement bug
        // — without this a leaked count survives clear into the next load.
        this.walkGrid.clear();
    }

    update(dt)
    {
        for(const entity of this.entities)
        {
            entity.update(dt);
        }
    }
}


/* INTERNAL *******************************************************************/

function buildWalkGrid(grid)
{
    // Sub-grid resolution is 1m, so `subsPerMain` equals the main
    // cellSize (cozy-lairs ships 4m cells → 4× sub-grid extent).
    const subsPerMain = grid.cellSize;
    return new WalkGrid(grid.width * subsPerMain, grid.depth * subsPerMain, 1, subsPerMain);
}


export { World };
