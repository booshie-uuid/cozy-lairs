import * as Errors from "../engine/errors.js";


/******************************************************************************/
/* GRID                                                                       */
/******************************************************************************/

/*
 * Cell (cx, cz) covers world rectangle [cx*S, (cx+1)*S] × [cz*S, (cz+1)*S].
 * Cell (0, 0) has its low corner at the world origin in the +X/+Z quadrant.
 * Edges fall on integer multiples of S so wall placement lands on whole-metre
 * world coords.
 */

const DEFAULT_CELL_SIZE = 2;


class Grid
{
    constructor(width, depth, cellSize = DEFAULT_CELL_SIZE)
    {
        this.width    = width;
        this.depth    = depth;
        this.cellSize = cellSize;

        this._occupants = new Map();
    }

    isInBounds(cx, cz)
    {
        return cx >= 0 && cx < this.width && cz >= 0 && cz < this.depth;
    }

    worldToCell(x, z)
    {
        return {
            cx: Math.floor(x / this.cellSize),
            cz: Math.floor(z / this.cellSize)
        };
    }

    cellToWorld(cx, cz)
    {
        const half = this.cellSize / 2;
        return {
            x: cx * this.cellSize + half,
            z: cz * this.cellSize + half
        };
    }

    snapToEdge(x, z)
    {
        return {
            x: Math.round(x / this.cellSize) * this.cellSize,
            z: Math.round(z / this.cellSize) * this.cellSize
        };
    }

    setOccupant(cx, cz, entity)
    {
        if(!this.isInBounds(cx, cz))
        {
            throw new Errors.GridBoundsError(`Cell (${cx}, ${cz}) is outside grid bounds (${this.width}x${this.depth}).`);
        }
        this._occupants.set(this._key(cx, cz), entity);
    }

    getOccupant(cx, cz)
    {
        if(!this.isInBounds(cx, cz)) { return null; }
        return this._occupants.get(this._key(cx, cz)) || null;
    }

    clearOccupant(cx, cz)
    {
        if(!this.isInBounds(cx, cz))
        {
            throw new Errors.GridBoundsError(`Cell (${cx}, ${cz}) is outside grid bounds (${this.width}x${this.depth}).`);
        }
        this._occupants.delete(this._key(cx, cz));
    }

    _key(cx, cz)
    {
        return `${cx},${cz}`;
    }
}

export { Grid, DEFAULT_CELL_SIZE };
