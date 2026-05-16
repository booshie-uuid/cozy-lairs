import * as Errors from "../engine/errors.js";


/******************************************************************************/
/* WALK-GRID                                                                  */
/******************************************************************************/

/*
 * Sub-grid for minion pathing and collision queries. Lives alongside the main
 * authoring `Grid` at a finer resolution (typically 1m sub-cells inside 4m
 * authoring cells, so 4 sub-cells span one main cell on each axis).
 *
 * Each sub-cell holds a refcount of blockers. A sub-cell is walkable iff its
 * refcount is 0. Multiple overlapping stamps compose: stamp/revert as a matched
 * pair from each blocker so removing one doesn't accidentally clear another.
 *
 * The walk-grid is derived state — it is rebuilt deterministically from
 * authored entities at load time and never persisted.
 */

const DEFAULT_SUB_CELL_SIZE = 1;
const DEFAULT_SUBS_PER_MAIN = 4;


class WalkGrid
{
    constructor(width, depth, subCellSize = DEFAULT_SUB_CELL_SIZE, subsPerMain = DEFAULT_SUBS_PER_MAIN)
    {
        if(!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0)
        {
            throw new Errors.GridBoundsError(`WalkGrid dimensions must be positive (got ${width}x${depth}).`);
        }
        if(!Number.isFinite(subCellSize) || subCellSize <= 0)
        {
            throw new Errors.GridBoundsError(`WalkGrid subCellSize must be positive (got ${subCellSize}).`);
        }
        if(!Number.isInteger(subsPerMain) || subsPerMain <= 0)
        {
            throw new Errors.GridBoundsError(`WalkGrid subsPerMain must be a positive integer (got ${subsPerMain}).`);
        }

        this.width = width;
        this.depth = depth;
        this.subCellSize = subCellSize;
        this.subsPerMain = subsPerMain;
        this.mainCellSize = subCellSize * subsPerMain;

        this.refcounts = new Uint16Array(width * depth);
    }

    isInBounds(sx, sz)
    {
        return sx >= 0 && sx < this.width && sz >= 0 && sz < this.depth;
    }

    isWalkable(sx, sz)
    {
        if(!this.isInBounds(sx, sz)) { return false; }
        return this.refcounts[sz * this.width + sx] === 0;
    }

    isWalkableAtWorld(x, z)
    {
        const { sx, sz } = this.worldToSub(x, z);
        return this.isWalkable(sx, sz);
    }

    applyStamp(subCells)
    {
        for(const cell of subCells)
        {
            if(!this.isInBounds(cell.sx, cell.sz)) { continue; }
            this.refcounts[cell.sz * this.width + cell.sx] += 1;
        }
    }

    revertStamp(subCells)
    {
        for(const cell of subCells)
        {
            if(!this.isInBounds(cell.sx, cell.sz)) { continue; }
            const index = cell.sz * this.width + cell.sx;
            if(this.refcounts[index] === 0) { continue; }
            this.refcounts[index] -= 1;
        }
    }

    worldToSub(x, z)
    {
        return {
            sx: Math.floor(x / this.subCellSize),
            sz: Math.floor(z / this.subCellSize)
        };
    }

    subToWorld(sx, sz)
    {
        const half = this.subCellSize / 2;
        return {
            x: sx * this.subCellSize + half,
            z: sz * this.subCellSize + half
        };
    }

    mainToSub(cx, cz)
    {
        return {
            sx: cx * this.subsPerMain,
            sz: cz * this.subsPerMain
        };
    }

    clear()
    {
        this.refcounts.fill(0);
    }
}


export { WalkGrid, DEFAULT_SUB_CELL_SIZE, DEFAULT_SUBS_PER_MAIN };
