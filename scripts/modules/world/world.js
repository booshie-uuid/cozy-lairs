import * as THREE from "three";

import { Emitter } from "../engine/emitter.js";
import { WalkGrid } from "./walk-grid.js";


/******************************************************************************/
/* WORLD                                                                      */
/******************************************************************************/

const EMPTY_SET = new Set();


class World extends Emitter
{
    constructor(grid, assets = null)
    {
        super();
        this.grid = grid;
        this.assets = assets;
        this.walkGrid = buildWalkGrid(grid);
        this.scene = new THREE.Scene();
        this.entities = new Set();
        // Spatial index: cellKey → Set<Entity>. Populated by GridPlacement's
        // lifecycle hooks so `entitiesAtCell` is O(1). Replaces five
        // linear scans over `entities` that WorldEditor used to do.
        this.cellIndex = new Map();
        // Reserved for the future MovePlayerTool. V3's decor builder used
        // to invoke this when placing on PLAYER_MARKER; V4 replaced that
        // path with canPlaceDecor refusing the placement. The setter
        // stays wired so the MovePlayerTool can land without changing
        // World's shape.
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
        this.cellIndex.clear();
    }

    /* CELL INDEX *************************************************************/

    indexEntityAtCell(entity, cx, cz)
    {
        const key = cellKey(cx, cz);
        let set = this.cellIndex.get(key);
        if(!set) { set = new Set(); this.cellIndex.set(key, set); }
        set.add(entity);
    }

    unindexEntityAtCell(entity, cx, cz)
    {
        const key = cellKey(cx, cz);
        const set = this.cellIndex.get(key);
        if(!set) { return; }

        set.delete(entity);
        if(set.size === 0) { this.cellIndex.delete(key); }
    }

    // Iterable over entities anchored at (cx, cz) via GridPlacement.
    // Returns a stable empty set when the cell has nothing — callers
    // can `for...of` without a null check.
    entitiesAtCell(cx, cz)
    {
        return this.cellIndex.get(cellKey(cx, cz)) || EMPTY_SET;
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

function cellKey(cx, cz)
{
    return `${cx},${cz}`;
}

function buildWalkGrid(grid)
{
    // Sub-grid resolution is 1m, so `subsPerMain` equals the main
    // cellSize (cozy-lairs ships 4m cells → 4× sub-grid extent).
    const subsPerMain = grid.cellSize;
    return new WalkGrid(grid.width * subsPerMain, grid.depth * subsPerMain, 1, subsPerMain);
}


export { World };
