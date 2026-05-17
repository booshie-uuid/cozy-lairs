import { Walker }       from "./walker.js";
import * as Pathfinder  from "../../engine/pathfinding/index.js";
import * as WalkSearch  from "../walk-search.js";


// Local sample radius keeps random picks inside the walker's connected
// component — global sampling drowns useful targets in unreachable cells.
const SAMPLE_RADIUS   = 16;
const SAMPLE_ATTEMPTS = 32;


/******************************************************************************/
/* WANDER BEHAVIOUR                                                           */
/******************************************************************************/


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

        // Walker's own stamp is on the cell, so checks must un-stamp
        // first or the pathfinder sees the walker as a blocker.
        this.world.walkGrid.revertStamp([currentSub]);
        const startTraversable = isTraversable(currentSub.sx, currentSub.sz);
        this.world.walkGrid.applyStamp([currentSub]);

        if(!startTraversable)
        {
            const free = WalkSearch.findNearestTraversable(this.world.walkGrid, currentSub, isTraversable);
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

    // Sub-cells must sit inside a floor-marked main cell; the main-grid
    // `blocked` flag is NOT consulted — the walk-grid tracks blockers at
    // sub-cell resolution and consulting `blocked` would forbid pathing
    // around a partial-cell obstruction.
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

    // First pass prefers targets at or beyond `minTargetDistance` so the
    // wander looks intentional; second pass accepts any traversable cell
    // so a minion in a tiny pocket still gets to move.
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

}

export { WanderBehaviour };
