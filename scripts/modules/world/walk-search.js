/******************************************************************************/
/* WALK-SEARCH                                                                */
/******************************************************************************/

// 4-neighbour BFS — `start` may itself be returned if traversable.
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
