/******************************************************************************/
/* WALK-SEARCH                                                                */
/******************************************************************************/

/*
 * Small BFS helpers over a `WalkGrid`. Pulled out so the wander behaviour and
 * the V7 pickup-restore path can share one definition of "nearest free
 * sub-cell" without either pulling the other's imports in.
 */


/*
 * 4-neighbour BFS from `start` over `walkGrid`, returning the first sub-cell
 * that satisfies `isTraversable(sx, sz)`. `start` may itself be returned if
 * it's already traversable. Returns null if no traversable cell is reachable.
 */
function findNearestTraversable(walkGrid, start, isTraversable)
{
    const visited = new Set();
    const queue = [{ sx: start.sx, sz: start.sz }];
    visited.add(`${start.sx},${start.sz}`);

    const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while(queue.length > 0)
    {
        const cell = queue.shift();
        if(walkGrid.isInBounds(cell.sx, cell.sz) && isTraversable(cell.sx, cell.sz))
        {
            return cell;
        }
        for(const [dsx, dsz] of NEIGHBOURS)
        {
            const nsx = cell.sx + dsx;
            const nsz = cell.sz + dsz;
            if(!walkGrid.isInBounds(nsx, nsz)) { continue; }
            const key = `${nsx},${nsz}`;
            if(visited.has(key)) { continue; }
            visited.add(key);
            queue.push({ sx: nsx, sz: nsz });
        }
    }

    return null;
}


export { findNearestTraversable };
