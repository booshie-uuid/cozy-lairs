import { Walker }       from "./walker.js";
import * as Pathfinder  from "../../engine/pathfinding/index.js";


/******************************************************************************/
/* WANDER BEHAVIOUR                                                           */
/******************************************************************************/

/*
 * Picks random walkable destinations for a sibling `Walker`, separated by
 * brief idle pauses, with corner-cutting handled by `Pathfinder`. One of
 * several swappable AI strategies — V1 uses this; V2+ goal-driven behaviours
 * (sleep, eat, work-station) will live alongside under the same component
 * lifecycle.
 *
 * Constructor options:
 *   idleMin / idleMax       — seconds; pause range between trips.
 *   retryLimit              — re-rolls per kick before giving up and idling
 *                             again (handles the rare "picked an unreachable
 *                             cell" case in fragmented rooms).
 *   minTargetDistance       — Chebyshev distance, in cells. Targets within
 *                             this radius of the current cell are excluded
 *                             so the minion doesn't pick adjacent cells and
 *                             twitch.
 *   pathfinder              — defaults to the shared `Pathfinder` module;
 *                             tests inject a stub.
 */


class WanderBehaviour
{
    constructor({
        idleMin           = 0.5,
        idleMax           = 1.5,
        retryLimit        = 3,
        minTargetDistance = 3,
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
        // Latch so the "stuck on non-walkable, no rescue" warning fires
        // once per episode, not on every idle expiry. Cleared once we
        // successfully kick a trip again.
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
        const currentCell = this.currentCell();
        const grid = this.world.grid;

        // Self-rescue: if we somehow ended up on a non-walkable cell (e.g.
        // teleported onto decor by a dev-console call, or displaced by a
        // future bug), pathfinder would refuse to plan a route from here.
        // Find the closest available cell and teleport. The displaced
        // event triggers another scheduleNextTrip so wandering resumes.
        if(!grid.isAvailable(currentCell.cx, currentCell.cz, this.entity))
        {
            const free = grid.findClosestAvailable(currentCell.cx, currentCell.cz, this.entity);
            if(free)
            {
                this.rescueWarned = false;
                this.walker.teleportTo(free.cx, free.cz);
                return;
            }
            // No free cell anywhere on the grid — degenerate state. Idle
            // and try again later. Warn once so the silent-loop failure
            // mode is visible in the dev console.
            if(!this.rescueWarned)
            {
                console.warn(
                    `[WanderBehaviour] ${this.entity.kind} stuck on non-walkable (${currentCell.cx}, ${currentCell.cz}) ` +
                    `— no free cell available, will retry next idle.`
                );
                this.rescueWarned = true;
            }
            this.scheduleNextTrip();
            return;
        }

        this.rescueWarned = false;

        for(let i = 0; i < this.retryLimit; i++)
        {
            const target = this.pickTarget(currentCell);
            if(target === null) { break; }

            const path = this.pathfinder.findPath(
                grid,
                currentCell,
                target,
                { excludeOccupant: this.entity }
            );
            if(path !== null)
            {
                this.walker.followPath(path);
                return;
            }
        }

        this.scheduleNextTrip();
    }

    currentCell()
    {
        const o = this.entity.object3D;
        return this.world.grid.worldToCell(o.position.x, o.position.z);
    }

    pickTarget(currentCell)
    {
        const grid = this.world.grid;
        const candidates = grid.walkableCells().filter(c =>
        {
            // Exclude cells currently occupied by another walker — picking
            // one would force pathfinder to fail (target unavailable),
            // burning a retry slot. The walker's own cell is also excluded
            // by the distance filter below.
            const occupant = grid.getOccupant(c.cx, c.cz);
            if(occupant && occupant !== this.entity) { return false; }
            const dx = Math.abs(c.cx - currentCell.cx);
            const dz = Math.abs(c.cz - currentCell.cz);
            return Math.max(dx, dz) >= this.minTargetDistance;
        });

        if(candidates.length === 0) { return null; }
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
}

export { WanderBehaviour };
