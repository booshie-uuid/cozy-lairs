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
        this.width = width;
        this.depth = depth;
        this.cellSize = cellSize;

        this.occupants = new Map();
        this.floorCells = new Set();
        this.blockedCells = new Set();
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
        this.occupants.set(this.cellKey(cx, cz), entity);
    }

    getOccupant(cx, cz)
    {
        if(!this.isInBounds(cx, cz)) { return null; }
        return this.occupants.get(this.cellKey(cx, cz)) || null;
    }

    clearOccupant(cx, cz)
    {
        if(!this.isInBounds(cx, cz))
        {
            throw new Errors.GridBoundsError(`Cell (${cx}, ${cz}) is outside grid bounds (${this.width}x${this.depth}).`);
        }
        this.occupants.delete(this.cellKey(cx, cz));
    }

    markFloor(cx, cz)
    {
        if(!this.isInBounds(cx, cz))
        {
            throw new Errors.GridBoundsError(`Cell (${cx}, ${cz}) is outside grid bounds (${this.width}x${this.depth}).`);
        }
        this.floorCells.add(this.cellKey(cx, cz));
    }

    unmarkFloor(cx, cz)
    {
        if(!this.isInBounds(cx, cz))
        {
            throw new Errors.GridBoundsError(`Cell (${cx}, ${cz}) is outside grid bounds (${this.width}x${this.depth}).`);
        }
        this.floorCells.delete(this.cellKey(cx, cz));
    }

    setBlocked(cx, cz)
    {
        if(!this.isInBounds(cx, cz))
        {
            throw new Errors.GridBoundsError(`Cell (${cx}, ${cz}) is outside grid bounds (${this.width}x${this.depth}).`);
        }
        this.blockedCells.add(this.cellKey(cx, cz));
    }

    clearBlocked(cx, cz)
    {
        if(!this.isInBounds(cx, cz))
        {
            throw new Errors.GridBoundsError(`Cell (${cx}, ${cz}) is outside grid bounds (${this.width}x${this.depth}).`);
        }
        this.blockedCells.delete(this.cellKey(cx, cz));
    }

    isFloor(cx, cz)
    {
        if(!this.isInBounds(cx, cz)) { return false; }
        return this.floorCells.has(this.cellKey(cx, cz));
    }

    isWalkable(cx, cz)
    {
        if(!this.isInBounds(cx, cz)) { return false; }
        const key = this.cellKey(cx, cz);
        return this.floorCells.has(key) && !this.blockedCells.has(key);
    }

    walkableCells()
    {
        const cells = [];
        for(const key of this.floorCells)
        {
            if(this.blockedCells.has(key)) { continue; }
            const [cxStr, czStr] = key.split(",");
            cells.push({ cx: Number(cxStr), cz: Number(czStr) });
        }
        return cells;
    }

    isAvailable(cx, cz, excludeOccupant = null)
    {
        if(!this.isWalkable(cx, cz)) { return false; }
        const occupant = this.occupants.get(this.cellKey(cx, cz));
        if(occupant === undefined) { return true; }
        return occupant === excludeOccupant;
    }

    findClosestAvailable(cx, cz, excludeOccupant = null)
    {
        const visited = new Set();
        const queue = [{ cx, cz }];
        visited.add(this.cellKey(cx, cz));

        while(queue.length > 0)
        {
            const cell = queue.shift();

            if(this.isInBounds(cell.cx, cell.cz) && this.isAvailable(cell.cx, cell.cz, excludeOccupant))
            {
                return cell;
            }

            for(let dz = -1; dz <= 1; dz++)
            {
                for(let dx = -1; dx <= 1; dx++)
                {
                    if(dx === 0 && dz === 0) { continue; }
                    const ncx = cell.cx + dx;
                    const ncz = cell.cz + dz;
                    if(!this.isInBounds(ncx, ncz)) { continue; }
                    const key = this.cellKey(ncx, ncz);
                    if(visited.has(key)) { continue; }
                    visited.add(key);
                    queue.push({ cx: ncx, cz: ncz });
                }
            }
        }

        return null;
    }

    cellKey(cx, cz)
    {
        return `${cx},${cz}`;
    }
}

export { Grid, DEFAULT_CELL_SIZE };
