/******************************************************************************/
/* PATHFINDER                                                                 */
/******************************************************************************/

/*
 * 8-way BFS over a walk-grid. Returns the shortest sub-cell path from `start`
 * to `end`, or `null` if no path exists.
 *
 * Traversability is queried via the caller-supplied `isTraversable(sx, sz)`
 * predicate. Callers compose this from the walk-grid's `isWalkable` plus any
 * extra rules (e.g. "only sub-cells that sit on a floor cell"), so the
 * pathfinder stays substrate-agnostic.
 *
 * NO anti-pinch rule. A single-cell diagonal step between two sub-cell
 * centres traces a straight `y = x` line; the walker's `worldToSub` jumps
 * straight from the start cell to the target cell at the midpoint without
 * ever floor-rounding into either corner cell. So even when both corner
 * cells are blocked, the walker physically squeezes through the corner
 * point without grazing a blocker — and rejecting these steps blocks real
 * navigation around tight obstacles.
 *
 * BFS (rather than A*) chosen for simplicity — sub-grid sizes are small
 * (≤ 80×80). Step cost is uniform (1 per step regardless of axis), so the
 * walker will preferentially take diagonals where it can. A* with octile
 * weighting lands later if movement cost becomes important.
 *
 * Returns:
 *   - `[{sx, sz}, ...]` inclusive of both endpoints when a path exists.
 *   - `[start]` (length 1) when start === end.
 *   - `null` when start or end is untraversable, or no path connects them.
 */

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
