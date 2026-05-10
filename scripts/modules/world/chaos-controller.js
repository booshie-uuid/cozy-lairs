import * as DecorBuilder from "./builders/decor.js";


/******************************************************************************/
/* CHAOS CONTROLLER                                                           */
/******************************************************************************/

/*
 * Subscribes to a set of walkers' trip-end events (`arrived` / `blocked` /
 * `displaced`) and, on each event (rate-limited), teleports one of a small
 * pool of designated chaos-decor entities to a random walkable cell.
 *
 * Chaos teleport routes through `DecorBuilder.relocateDecor`, which itself
 * uses the placement-on-occupant displacement flow — so a chaos barrel
 * landing on a walker triggers that walker's BFS displacement, and a
 * chaos barrel landing on the player (in FP mode) teleports the player.
 *
 * Cooldown prevents bursts: when several walkers complete trips in the
 * same frame, only one chaos teleport fires. Default 1.5 s.
 */

const DEFAULT_COOLDOWN_MS = 1500;


class ChaosController
{
    constructor({ world, walkers, chaosBarrels, cooldownMs = DEFAULT_COOLDOWN_MS, now = () => Date.now() } = {})
    {
        if(!world) { throw new Error("ChaosController: `world` is required."); }
        if(!Array.isArray(walkers)) { throw new Error("ChaosController: `walkers` must be an array."); }
        if(!Array.isArray(chaosBarrels)) { throw new Error("ChaosController: `chaosBarrels` must be an array."); }

        this.world = world;
        this.walkers = walkers;
        this.chaosBarrels = chaosBarrels;
        this.cooldownMs = cooldownMs;
        this.now = now;
        // -Infinity so the first walker event always fires regardless of
        // wall-clock value at construction time.
        this.lastFiredAt = -Infinity;

        this.tripEndedHandler = () => this.maybeTeleportRandomBarrel();
        for(const walker of this.walkers)
        {
            walker.on("arrived",   this.tripEndedHandler);
            walker.on("blocked",   this.tripEndedHandler);
            walker.on("displaced", this.tripEndedHandler);
        }
    }

    dispose()
    {
        for(const walker of this.walkers)
        {
            walker.off("arrived",   this.tripEndedHandler);
            walker.off("blocked",   this.tripEndedHandler);
            walker.off("displaced", this.tripEndedHandler);
        }
        this.walkers = [];
        this.chaosBarrels = [];
        this.tripEndedHandler = null;
    }

    maybeTeleportRandomBarrel()
    {
        const now = this.now();
        if(now - this.lastFiredAt < this.cooldownMs) { return; }
        if(this.chaosBarrels.length === 0) { return; }

        const walkable = this.world.grid.walkableCells();
        if(walkable.length === 0) { return; }

        const barrel = this.chaosBarrels[Math.floor(Math.random() * this.chaosBarrels.length)];
        const target = walkable[Math.floor(Math.random() * walkable.length)];

        if(DecorBuilder.relocateDecor(this.world, barrel, target.cx, target.cz))
        {
            this.lastFiredAt = now;
        }
    }
}

export { ChaosController };
