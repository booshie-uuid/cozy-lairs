/******************************************************************************/
/* PATHFINDER                                                                 */
/******************************************************************************/

/*
 * 8-way A* over `Grid.isAvailable`. Octile heuristic, orthogonal cost 1,
 * diagonal cost √2. A diagonal step from (cx, cz) to (cx ± 1, cz ± 1) is
 * rejected if either of the two adjacent orthogonal cells is unavailable —
 * stops minions from squeezing diagonally between two blockers.
 *
 * `excludeOccupant` (optional, defaults to `null`) is passed through to
 * `Grid.isAvailable` so a walker's pathfinder can route around *other*
 * occupants while not treating its own cell as blocked. With this, plan-time
 * paths avoid cells currently occupied by other walkers — runtime collision
 * detection still catches the case where a cell becomes occupied between
 * trip-plan and trip-end.
 *
 * Pure function. Returns:
 *   - `[{cx, cz}, ...]` inclusive of both endpoints when a path exists.
 *   - `[start]` (length 1) when start === end.
 *   - `null` when start or end is out-of-bounds, unavailable, or unreachable.
 */

const SQRT2 = Math.SQRT2;
const SQRT2_MINUS_1 = Math.SQRT2 - 1;

const NEIGHBOURS =
[
    { dcx:  1, dcz:  0, cost: 1     },
    { dcx: -1, dcz:  0, cost: 1     },
    { dcx:  0, dcz:  1, cost: 1     },
    { dcx:  0, dcz: -1, cost: 1     },
    { dcx:  1, dcz:  1, cost: SQRT2 },
    { dcx:  1, dcz: -1, cost: SQRT2 },
    { dcx: -1, dcz:  1, cost: SQRT2 },
    { dcx: -1, dcz: -1, cost: SQRT2 }
];


function octile(ax, az, bx, bz)
{
    const dx = Math.abs(ax - bx);
    const dz = Math.abs(az - bz);
    return Math.max(dx, dz) + SQRT2_MINUS_1 * Math.min(dx, dz);
}


function findPath(grid, start, end, options = {})
{
    const excludeOccupant = options.excludeOccupant !== undefined
        ? options.excludeOccupant
        : null;

    if(!grid.isAvailable(start.cx, start.cz, excludeOccupant)) { return null; }
    if(!grid.isAvailable(end.cx,   end.cz,   excludeOccupant)) { return null; }

    if(start.cx === end.cx && start.cz === end.cz)
    {
        return [{ cx: start.cx, cz: start.cz }];
    }

    const startKey = grid.cellKey(start.cx, start.cz);
    const endKey   = grid.cellKey(end.cx,   end.cz);

    const open     = new PriorityQueue();
    const cameFrom = new Map();
    const gScore   = new Map();
    const closed   = new Set();

    gScore.set(startKey, 0);
    open.push({
        key: startKey,
        cx:  start.cx,
        cz:  start.cz,
        f:   octile(start.cx, start.cz, end.cx, end.cz)
    });

    while(open.size > 0)
    {
        const current = open.pop();
        if(closed.has(current.key)) { continue; }
        closed.add(current.key);

        if(current.key === endKey)
        {
            return reconstructPath(cameFrom, current, startKey);
        }

        const currentG = gScore.get(current.key);

        for(const { dcx, dcz, cost } of NEIGHBOURS)
        {
            const ncx = current.cx + dcx;
            const ncz = current.cz + dcz;

            if(!grid.isAvailable(ncx, ncz, excludeOccupant)) { continue; }

            if(dcx !== 0 && dcz !== 0)
            {
                const orthA = grid.isAvailable(current.cx + dcx, current.cz, excludeOccupant);
                const orthB = grid.isAvailable(current.cx,       current.cz + dcz, excludeOccupant);
                if(!orthA && !orthB) { continue; }
            }

            const nKey = grid.cellKey(ncx, ncz);
            if(closed.has(nKey)) { continue; }

            const tentativeG = currentG + cost;
            const knownG = gScore.has(nKey) ? gScore.get(nKey) : Infinity;
            if(tentativeG >= knownG) { continue; }

            cameFrom.set(nKey, current);
            gScore.set(nKey, tentativeG);
            open.push({
                key: nKey,
                cx:  ncx,
                cz:  ncz,
                f:   tentativeG + octile(ncx, ncz, end.cx, end.cz)
            });
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
        path.push({ cx: current.cx, cz: current.cz });
        current = cameFrom.get(current.key);
    }
    path.push({ cx: current.cx, cz: current.cz });
    path.reverse();
    return path;
}


/* PRIORITY QUEUE *************************************************************/

/*
 * Binary min-heap keyed by `f`. Lazy-deletion via the `closed` Set in
 * `findPath` — duplicate entries for the same cell are tolerated and
 * dropped on pop.
 */

class PriorityQueue
{
    constructor()
    {
        this.heap = [];
    }

    get size() { return this.heap.length; }

    push(item)
    {
        this.heap.push(item);
        this.siftUp(this.heap.length - 1);
    }

    pop()
    {
        const top = this.heap[0];
        const last = this.heap.pop();
        if(this.heap.length > 0)
        {
            this.heap[0] = last;
            this.siftDown(0);
        }
        return top;
    }

    siftUp(i)
    {
        while(i > 0)
        {
            const parent = (i - 1) >> 1;
            if(this.heap[parent].f <= this.heap[i].f) { break; }
            [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
            i = parent;
        }
    }

    siftDown(i)
    {
        const n = this.heap.length;
        while(true)
        {
            const left  = 2 * i + 1;
            const right = 2 * i + 2;
            let smallest = i;
            if(left  < n && this.heap[left].f  < this.heap[smallest].f) { smallest = left; }
            if(right < n && this.heap[right].f < this.heap[smallest].f) { smallest = right; }
            if(smallest === i) { break; }
            [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
            i = smallest;
        }
    }
}


export { findPath };
