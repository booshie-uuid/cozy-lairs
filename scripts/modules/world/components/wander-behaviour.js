import { Walker }       from "./walker.js";
import * as Pathfinder  from "../../engine/pathfinding/index.js";


/*
 * Wander target search radius, in sub-cells. 16 sub-cells = 4 main cells.
 * Big enough that the minion explores past immediate obstacles; small
 * enough that random picks predominantly land in the same connected
 * component as the walker (sampling globally drowns useful targets in a
 * sea of unreachable cells across the rest of the world).
 */
const SAMPLE_RADIUS   = 16;
const SAMPLE_ATTEMPTS = 32;


/******************************************************************************/
/* WANDER BEHAVIOUR                                                           */
/******************************************************************************/

/*
 * Picks random walkable destinations for a sibling `Walker`, separated by
 * brief idle pauses, with corner-cutting handled by `Pathfinder`. The walker
 * substrate is the sub-grid: targets are individual sub-cells, paths are
 * sub-cell waypoints, the pathfinder runs 4-neighbour BFS over the walk-grid.
 *
 * Constructor options:
 *   idleMin / idleMax       — seconds; pause range between trips.
 *   retryLimit              — re-rolls per kick before giving up and idling
 *                             again.
 *   minTargetDistance       — sub-cell Chebyshev distance. Targets within
 *                             this radius are excluded so the minion doesn't
 *                             pick adjacent sub-cells and twitch. At 1m
 *                             sub-cells, 12 ≈ 3 main cells away.
 *   pathfinder              — defaults to the shared `Pathfinder` module;
 *                             tests inject a stub.
 */


class WanderBehaviour
{
    constructor({
        idleMin           = 0.5,
        idleMax           = 1.5,
        retryLimit        = 3,
        minTargetDistance = 4,
        pathfinder        = null
    } = {})
    {
        this.idleMin = idleMin;
        this.idleMax = idleMax;
        this.retryLimit = retryLimit;
        this.minTargetDistance = minTargetDistance;
        this.pathfinder = pathfinder || Pathfinder;

        this.idleRemaining = 0;
        this.entity = null;
        this.world = null;
        this.walker = null;
        this.arrivedHandler = null;
        this.rescueWarned = false;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(world)
    {
        this.world = world;
        this.walker = this.entity.getComponent(Walker);

        if(!this.walker)
        {
            console.warn(`[WanderBehaviour] Entity "${this.entity.kind}" has no Walker — wandering disabled.`);
            return;
        }

        this.arrivedHandler = () => this.scheduleNextTrip();
        this.walker.on("arrived",   this.arrivedHandler);
        this.walker.on("blocked",   this.arrivedHandler);
        this.walker.on("displaced", this.arrivedHandler);
        this.scheduleNextTrip();
    }

    onRemovedFromWorld(_world)
    {
        if(this.walker && this.arrivedHandler)
        {
            this.walker.off("arrived",   this.arrivedHandler);
            this.walker.off("blocked",   this.arrivedHandler);
            this.walker.off("displaced", this.arrivedHandler);
        }
        this.arrivedHandler = null;
        this.walker = null;
        this.world = null;
    }

    update(dt)
    {
        if(!this.walker) { return; }
        if(this.idleRemaining <= 0) { return; }

        this.idleRemaining -= dt;
        if(this.idleRemaining <= 0)
        {
            this.idleRemaining = 0;
            this.kickTrip();
        }
    }


    /* INTERNAL ***************************************************************/

    scheduleNextTrip()
    {
        const span = this.idleMax - this.idleMin;
        this.idleRemaining = this.idleMin + Math.random() * span;
    }

    kickTrip()
    {
        const currentSub = this.currentSubCell();
        const isTraversable = this.makeTraversablePredicate();

        /*
         * Self-rescue: if we ended up on an untraversable sub-cell (e.g. a
         * blocker was placed on top of us, or a sub-grid bug stranded us),
         * the walker's own stamp is on the cell, so the pathfinder sees it
         * as blocked. Temporarily un-stamp before checking traversability.
         */
        this.world.walkGrid.revertStamp([currentSub]);
        const startTraversable = isTraversable(currentSub.sx, currentSub.sz);
        this.world.walkGrid.applyStamp([currentSub]);

        if(!startTraversable)
        {
            const free = this.findNearestTraversable(currentSub, isTraversable);
            if(free)
            {
                this.rescueWarned = false;
                this.walker.teleportTo(free.sx, free.sz);
                return;
            }
            if(!this.rescueWarned)
            {
                console.warn(
                    `[WanderBehaviour] ${this.entity.kind} stuck on untraversable sub-cell ` +
                    `(${currentSub.sx}, ${currentSub.sz}) — no free sub-cell available, will retry next idle.`
                );
                this.rescueWarned = true;
            }
            this.scheduleNextTrip();
            return;
        }

        this.rescueWarned = false;

        for(let i = 0; i < this.retryLimit; i++)
        {
            const target = this.pickTarget(currentSub, isTraversable);
            if(target === null) { break; }

            this.world.walkGrid.revertStamp([currentSub]);
            const path = this.pathfinder.findPath(
                this.world.walkGrid,
                currentSub,
                target,
                isTraversable
            );
            this.world.walkGrid.applyStamp([currentSub]);

            if(path !== null)
            {
                this.walker.followPath(path);
                return;
            }
        }

        this.scheduleNextTrip();
    }

    currentSubCell()
    {
        const o = this.entity.object3D;
        return this.world.walkGrid.worldToSub(o.position.x, o.position.z);
    }

    /*
     * Composes walk-grid walkability with a main-grid floor check: minions
     * may only path along sub-cells that sit inside a floor-marked main cell.
     * Without the floor check the BFS would happily route a minion across
     * empty void where there's no floor entity at all.
     *
     * Crucially, the main-grid `blocked` flag is NOT consulted here — the
     * walk-grid already tracks blockers at sub-cell resolution. A barrel in
     * a main cell stamps 4 sub-cells but leaves the other 12 walkable, so
     * the pathfinder can route around it within the same main cell.
     */
    makeTraversablePredicate()
    {
        const walkGrid = this.world.walkGrid;
        const grid     = this.world.grid;
        const subsPerMain = walkGrid.subsPerMain;

        return (sx, sz) =>
        {
            if(!walkGrid.isWalkable(sx, sz)) { return false; }
            const cx = Math.floor(sx / subsPerMain);
            const cz = Math.floor(sz / subsPerMain);
            return grid.isFloor(cx, cz);
        };
    }

    /*
     * Samples sub-cells within a bounded radius of the walker's current
     * position rather than from the entire world's floor pool. Two reasons:
     *   1. Random picks land in the walker's connected component with high
     *      probability (a global sample would pile up picks in other rooms
     *      that the pathfinder then fails to reach, burning retries).
     *   2. Targets are visually plausible — minions wander in their
     *      immediate surroundings rather than constantly aiming at the
     *      far side of the map.
     *
     * Two passes: first prefer targets at or beyond `minTargetDistance` so
     * the wander looks intentional; if none found, fall back to any
     * traversable cell so a minion in a tiny pocket still gets to move.
     */
    pickTarget(currentSub, isTraversable)
    {
        const walkGrid = this.world.walkGrid;

        for(let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt++)
        {
            const candidate = this.sampleInRadius(currentSub, SAMPLE_RADIUS);
            if(!walkGrid.isInBounds(candidate.sx, candidate.sz)) { continue; }
            if(!isTraversable(candidate.sx, candidate.sz))       { continue; }

            const dx = Math.abs(candidate.sx - currentSub.sx);
            const dz = Math.abs(candidate.sz - currentSub.sz);
            const cheb = Math.max(dx, dz);
            if(cheb < this.minTargetDistance) { continue; }

            return candidate;
        }

        for(let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt++)
        {
            const candidate = this.sampleInRadius(currentSub, SAMPLE_RADIUS);
            if(candidate.sx === currentSub.sx && candidate.sz === currentSub.sz) { continue; }
            if(!walkGrid.isInBounds(candidate.sx, candidate.sz)) { continue; }
            if(!isTraversable(candidate.sx, candidate.sz))       { continue; }
            return candidate;
        }

        return null;
    }

    sampleInRadius(centre, radius)
    {
        const dsx = Math.floor(Math.random() * (2 * radius + 1)) - radius;
        const dsz = Math.floor(Math.random() * (2 * radius + 1)) - radius;
        return { sx: centre.sx + dsx, sz: centre.sz + dsz };
    }

    findNearestTraversable(start, isTraversable)
    {
        const walkGrid = this.world.walkGrid;
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
}

export { WanderBehaviour };
