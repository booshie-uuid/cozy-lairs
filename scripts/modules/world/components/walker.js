import { Emitter }  from "../../engine/emitter.js";
import { Animator } from "./animator.js";


/******************************************************************************/
/* WALKER                                                                     */
/******************************************************************************/

/*
 * Cell-based path follower. `followPath([{cx, cz}, ...])` consumes the cell
 * list and walks the entity from cell-centre to cell-centre via straight
 * lines, facing the direction of travel. Emits `arrived` once the last cell
 * is reached. No path = no movement; calling followPath with a 0- or 1-cell
 * path emits `arrived` immediately.
 *
 * Path coordinates are in cell space — `cellToWorld` translation happens
 * lazily during `update`, so the path is decoupled from `grid.cellSize`.
 *
 * Events:
 *   "arrived" — emitted when the path completes (or immediately for an
 *               empty / single-cell path).
 */

const ARRIVE_EPSILON = 0.001;
const TWO_PI = Math.PI * 2;


class Walker extends Emitter
{
    constructor({ speed = 1.5, turnRate = 8 } = {})
    {
        super();
        this.speed = speed;
        this.turnRate = turnRate;
        this.path = [];
        this.pathIndex = 0;
        this.completed = true;
        this.entity = null;
        this.pendingFollow = null;
        this.targetRotation = 0;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(_world)
    {
        if(this.pendingFollow)
        {
            const { path, startIndex } = this.pendingFollow;
            this.pendingFollow = null;
            this.followPath(path, { startIndex });
        }
    }

    followPath(path, options = {})
    {
        if(!Array.isArray(path))
        {
            throw new Error("Walker.followPath: path must be an array of {cx, cz} cells.");
        }

        this.path = path.map((cell, i) =>
        {
            if(!cell || !Number.isFinite(cell.cx) || !Number.isFinite(cell.cz))
            {
                throw new Error(`Walker.followPath: path[${i}] must have numeric cx and cz (got ${JSON.stringify(cell)}).`);
            }
            return { cx: cell.cx, cz: cell.cz };
        });

        if(this.path.length === 0)
        {
            this.pathIndex = 0;
            this.completed = true;
            this.crossfadeAnimator("idle");
            this.emit("arrived", { walker: this });
            return;
        }

        const restored = options.startIndex !== undefined;

        if(restored)
        {
            const idx = options.startIndex;
            if(idx >= this.path.length)
            {
                this.pathIndex = this.path.length;
                this.snapToCell(this.path[this.path.length - 1]);
                this.completed = true;
                this.crossfadeAnimator("idle");
                this.emit("arrived", { walker: this });
                return;
            }
            this.pathIndex = Math.max(0, idx);
            const snapIdx = Math.max(0, this.pathIndex - 1);
            this.snapToCell(this.path[snapIdx]);
            this.completed = false;
            this.faceTowardsCell(this.path[this.pathIndex]);
            this.crossfadeAnimator("walk");
            return;
        }

        this.snapToCell(this.path[0]);
        if(this.path.length === 1)
        {
            this.pathIndex = 1;
            this.completed = true;
            this.crossfadeAnimator("idle");
            this.emit("arrived", { walker: this });
            return;
        }
        this.pathIndex = 1;
        this.completed = false;
        this.faceTowardsCell(this.path[1]);
        this.crossfadeAnimator("walk");
    }

    update(dt)
    {
        if(this.completed)
        {
            this.tickRotation(dt);
            return;
        }

        const o = this.entity.object3D;
        const target = this.cellToWorld(this.path[this.pathIndex]);

        const dx = target.x - o.position.x;
        const dz = target.z - o.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const step = this.speed * dt;

        if(step >= dist)
        {
            o.position.x = target.x;
            o.position.z = target.z;
            this.pathIndex += 1;

            if(this.pathIndex >= this.path.length)
            {
                this.completed = true;
                this.crossfadeAnimator("idle");
                this.emit("arrived", { walker: this });
                this.tickRotation(dt);
                return;
            }

            this.faceTowardsCell(this.path[this.pathIndex]);
            this.tickRotation(dt);
            return;
        }

        o.position.x += (dx / dist) * step;
        o.position.z += (dz / dist) * step;

        if(dist > ARRIVE_EPSILON)
        {
            this.targetRotation = Math.atan2(dx, dz);
        }
        this.tickRotation(dt);
    }

    toJSON()
    {
        return {
            speed:     this.speed,
            path:      this.path.map(c => ({ cx: c.cx, cz: c.cz })),
            pathIndex: this.pathIndex
        };
    }


    /* INTERNAL ***************************************************************/

    cellToWorld(cell)
    {
        return this.entity.world.grid.cellToWorld(cell.cx, cell.cz);
    }

    crossfadeAnimator(state)
    {
        this.entity.getComponent(Animator)?.crossfade(state);
    }

    snapToCell(cell)
    {
        const w = this.cellToWorld(cell);
        this.entity.object3D.position.set(w.x, 0, w.z);
    }

    faceTowardsCell(cell)
    {
        const w = this.cellToWorld(cell);
        const o = this.entity.object3D;
        const dx = w.x - o.position.x;
        const dz = w.z - o.position.z;
        if(dx * dx + dz * dz > ARRIVE_EPSILON * ARRIVE_EPSILON)
        {
            this.targetRotation = Math.atan2(dx, dz);
        }
    }

    tickRotation(dt)
    {
        const o = this.entity.object3D;
        let delta = this.targetRotation - o.rotation.y;
        // Wrap to [-π, π] so the lerp always picks the shortest arc.
        while(delta >  Math.PI) { delta -= TWO_PI; }
        while(delta < -Math.PI) { delta += TWO_PI; }
        // Exponential smoothing: framerate-independent, asymptotic approach.
        const factor = 1 - Math.exp(-this.turnRate * dt);
        o.rotation.y += delta * factor;
    }
}

export { Walker };
