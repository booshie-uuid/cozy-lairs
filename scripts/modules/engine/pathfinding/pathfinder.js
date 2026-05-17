/******************************************************************************/
/* PATHFINDER                                                                 */
/******************************************************************************/

// NO anti-pinch rule. A diagonal step traces a straight `y = x` line
// between sub-cell centres; the walker's `worldToSub` jumps directly
// from start to target at the midpoint without floor-rounding into
// either corner cell. Rejecting diagonals between two blocked corners
// would break legitimate navigation around tight obstacles.

const NEIGHBOURS =
[
    { dsx:  1, dsz:  0 },
    { dsx: -1, dsz:  0 },
    { dsx:  0, dsz:  1 },
    { dsx:  0, dsz: -1 },
    { dsx:  1, dsz:  1 },
    { dsx:  1, dsz: -1 },
    { dsx: -1, dsz:  1 },
    { dsx: -1, dsz: -1 }
];


function findPath(walkGrid, start, end, isTraversable)
{
    if(typeof isTraversable !== "function")
    {
        throw new Error("Pathfinder.findPath: isTraversable predicate is required.");
    }

    if(!isTraversable(start.sx, start.sz)) { return null; }
    if(!isTraversable(end.sx,   end.sz))   { return null; }

    if(start.sx === end.sx && start.sz === end.sz)
    {
        return [{ sx: start.sx, sz: start.sz }];
    }

    const startKey = subKey(start.sx, start.sz);
    const endKey   = subKey(end.sx,   end.sz);

    const cameFrom = new Map();
    const visited  = new Set();
    const queue    = [{ sx: start.sx, sz: start.sz, key: startKey }];
    visited.add(startKey);

    while(queue.length > 0)
    {
        const current = queue.shift();

        if(current.key === endKey)
        {
            return reconstructPath(cameFrom, current, startKey);
        }

        for(const { dsx, dsz } of NEIGHBOURS)
        {
            const nsx = current.sx + dsx;
            const nsz = current.sz + dsz;
            const nKey = subKey(nsx, nsz);

            if(visited.has(nKey))         { continue; }
            if(!isTraversable(nsx, nsz))  { continue; }

            visited.add(nKey);
            cameFrom.set(nKey, current);
            queue.push({ sx: nsx, sz: nsz, key: nKey });
        }
    }

    return null;
}


function reconstructPath(cameFrom, endNode, startKey)
{
    const path = [];
    let current = endNode;
    while(current.key !== startKey)
    {
        path.push({ sx: current.sx, sz: current.sz });
        current = cameFrom.get(current.key);
    }
    path.push({ sx: current.sx, sz: current.sz });
    path.reverse();
    return path;
}


function subKey(sx, sz)
{
    return `${sx},${sz}`;
}


export { findPath };
