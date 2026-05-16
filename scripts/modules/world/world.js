import * as THREE from "three";

import { Emitter }   from "../engine/emitter.js";
import { WalkGrid }  from "./walk-grid.js";


/******************************************************************************/
/* WORLD                                                                      */
/******************************************************************************/

/*
 * Owns the THREE.Scene, the main Grid, the walk-grid sub-resolution map, and
 * the entity registry. `addEntity` and `removeEntity` keep them in lock-step;
 * `GridPlacement` (and other lifecycle-aware components) stamps/reverts the
 * walk-grid in its own lifecycle hooks.
 *
 *   entityAdded    — the Entity that was just added
 *   entityRemoved  — the Entity that was just removed
 *   gridChanged    — emitted when the Grid mutates (reserved)
 *
 * `assets` is optional. When supplied, lifecycle components that need to look
 * up per-asset data (e.g. `GridPlacement` reading the AABB for footprint
 * stamping) can resolve it from `world.assets`. Tests that don't exercise the
 * sub-grid can construct the world without it; the components silently skip
 * the sub-grid work in that case.
 */

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
        // Defensive reset: removeEntity should leave the walk-grid empty via
        // each placement's revert, but a stale refcount from a logic bug
        // would otherwise survive World.clear and bleed into the next load.
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
    /* Sub-grid resolution is 1m. The main grid's `cellSize` (in metres) maps
     * directly to `subsPerMain`; cozy-lairs uses 4m authoring cells so the
     * sub-grid is 4× the main grid extent on each axis. */
    const subsPerMain = grid.cellSize;
    return new WalkGrid(grid.width * subsPerMain, grid.depth * subsPerMain, 1, subsPerMain);
}


export { World };
