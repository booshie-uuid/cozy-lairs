import { Emitter }  from "../../engine/emitter.js";
import { Animator } from "./animator.js";


/******************************************************************************/
/* WALKER                                                                     */
/******************************************************************************/

/*
 * Sub-cell path follower. `followPath([{sx, sz}, ...])` consumes the sub-cell
 * list and walks the entity from sub-cell-centre to sub-cell-centre via
 * straight lines, facing the direction of travel.
 *
 * Self-occupancy lives on the walk-grid as a refcount stamp: the walker holds
 * a +1 stamp on its current sub-cell, transferred (revert + apply) on each
 * boundary crossing. Other walkers see that stamp as a blocker via
 * `walkGrid.isWalkable`.
 *
 * Collision model: pre-check fires the moment the predicted next position
 * would land in a *different* sub-cell. If that sub-cell isn't walkable, the
 * walker doesn't advance into it — position stays put just shy of the
 * boundary, walker emits `blocked`, walker is still aligned with its
 * registered sub-cell. No look-ahead beyond the immediately-next sub-cell,
 * no snap-back.
 *
 * Events:
 *   "arrived"   — emitted when the path completes (or immediately for an
 *                 empty / single-cell path).
 *   "blocked"   — emitted when the walker tries to cross into an unwalkable
 *                 sub-cell.
 *   "displaced" — emitted when `teleportTo` shoves the walker to a new sub-cell.
 */

const ARRIVE_EPSILON = 0.001;
const TWO_PI = Math.PI * 2;

/*
 * On block, if the walker is more than MESH_BUFFER metres from its
 * currentSubCell centre, set up a one-step mini-path back to the centre and
 * emit "blocked" only after arrival. Sub-cells are 1m, so the buffer is
 * smaller than the previous main-cell version — withdrawing a quarter-cell is
 * enough to keep walker meshes from visually overlapping at boundaries.
 */
const MESH_BUFFER = 0.25;


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
        this.currentSubCell = null;
        this.withdrawing = false;
        this.driftWarned = false;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(world)
    {
        if(this.pendingFollow)
        {
            const { path, startIndex } = this.pendingFollow;
            this.pendingFollow = null;
            this.followPath(path, { startIndex });
            return;
        }

        // Auto-register occupancy at the entity's current sub-cell. Without
        // this, a freshly-spawned walker sits unstamped until its first
        // followPath — other walkers planning paths see the spawn sub-cell as
        // free and route through it.
        const pos = this.entity.object3D.position;
        const { sx, sz } = world.walkGrid.worldToSub(pos.x, pos.z);
        if(world.walkGrid.isInBounds(sx, sz))
        {
            this.stampSubCell(sx, sz);
        }
    }

    onRemovedFromWorld(world)
    {
        if(this.currentSubCell)
        {
            world.walkGrid.revertStamp([this.currentSubCell]);
            this.currentSubCell = null;
        }
    }

    followPath(path, options = {})
    {
        if(!Array.isArray(path))
        {
            throw new Error("Walker.followPath: path must be an array of {sx, sz} sub-cells.");
        }

        this.withdrawing = false;

        this.path = path.map((cell, i) =>
        {
            if(!cell || !Number.isFinite(cell.sx) || !Number.isFinite(cell.sz))
            {
                throw new Error(`Walker.followPath: path[${i}] must have numeric sx and sz (got ${JSON.stringify(cell)}).`);
            }
            return { sx: cell.sx, sz: cell.sz };
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
                this.snapToSubCell(this.path[this.path.length - 1]);
                this.completed = true;
                this.crossfadeAnimator("idle");
                this.emit("arrived", { walker: this });
                return;
            }
            this.pathIndex = Math.max(0, idx);
            const snapIdx = Math.max(0, this.pathIndex - 1);
            this.snapToSubCell(this.path[snapIdx]);
            this.completed = false;
            this.faceTowardsSubCell(this.path[this.pathIndex]);
            this.crossfadeAnimator("walk");
            return;
        }

        /*
         * Don't force-snap to path[0]'s centre when the walker is already
         * inside that sub-cell — at 1m sub-cells the snap is at most 0.5m
         * but still visible. Re-register occupancy in place. If the walker
         * is somewhere else (defensive), fall back to a snap.
         */
        const walkGrid = this.entity.world.walkGrid;
        const startCell = this.path[0];
        const physical  = walkGrid.worldToSub(this.entity.object3D.position.x, this.entity.object3D.position.z);

        if(physical.sx === startCell.sx && physical.sz === startCell.sz)
        {
            this.stampSubCell(startCell.sx, startCell.sz);
        }
        else
        {
            this.snapToSubCell(startCell);
        }

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
        this.faceTowardsSubCell(this.path[1]);
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
        const walkGrid = this.entity.world.walkGrid;

        // Drift detector: physical sub-cell vs registered sub-cell. Latched.
        if(this.currentSubCell)
        {
            const physical = walkGrid.worldToSub(o.position.x, o.position.z);
            const drifted = physical.sx !== this.currentSubCell.sx
                         || physical.sz !== this.currentSubCell.sz;
            if(drifted && !this.driftWarned)
            {
                console.warn(
                    `[Walker] ${this.entity.kind} drift: physical (${physical.sx}, ${physical.sz}) ` +
                    `vs registered (${this.currentSubCell.sx}, ${this.currentSubCell.sz}) ` +
                    `at world (${o.position.x.toFixed(2)}, ${o.position.z.toFixed(2)})`
                );
                this.driftWarned = true;
            }
            else if(!drifted && this.driftWarned)
            {
                this.driftWarned = false;
            }
        }

        const target = this.subCellToWorld(this.path[this.pathIndex]);

        const dx = target.x - o.position.x;
        const dz = target.z - o.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if(dist <= ARRIVE_EPSILON)
        {
            this.pathIndex += 1;
            if(this.pathIndex >= this.path.length)
            {
                this.completePath();
                this.tickRotation(dt);
                return;
            }
            this.faceTowardsSubCell(this.path[this.pathIndex]);
            this.tickRotation(dt);
            return;
        }

        const step = this.speed * dt;
        const moveAmount = Math.min(step, dist);
        const dirX = dx / dist;
        const dirZ = dz / dist;
        const newX = o.position.x + dirX * moveAmount;
        const newZ = o.position.z + dirZ * moveAmount;

        /*
         * Pre-check on sub-cell-boundary crossing only. As long as we're
         * moving within the sub-cell we've already registered, no checks are
         * needed — we own this sub-cell. The check fires the moment our
         * predicted next position would land in a different sub-cell. If
         * that sub-cell is blocked, we don't advance into it: position
         * stays put and we trigger withdrawal.
         */
        const newCell = walkGrid.worldToSub(newX, newZ);
        const crossesCell = !this.currentSubCell
            || newCell.sx !== this.currentSubCell.sx
            || newCell.sz !== this.currentSubCell.sz;

        if(crossesCell)
        {
            if(!walkGrid.isWalkable(newCell.sx, newCell.sz))
            {
                this.startWithdrawal();
                this.tickRotation(dt);
                return;
            }
            this.stampSubCell(newCell.sx, newCell.sz);
        }

        o.position.x = newX;
        o.position.z = newZ;

        this.targetRotation = Math.atan2(dx, dz);

        if(moveAmount >= dist)
        {
            this.pathIndex += 1;

            if(this.pathIndex >= this.path.length)
            {
                this.completePath();
                this.tickRotation(dt);
                return;
            }

            this.faceTowardsSubCell(this.path[this.pathIndex]);
        }

        this.tickRotation(dt);
    }

    completePath()
    {
        this.completed = true;
        this.crossfadeAnimator("idle");
        if(this.withdrawing)
        {
            this.withdrawing = false;
            this.emit("blocked", { walker: this });
        }
        else
        {
            this.emit("arrived", { walker: this });
        }
    }

    startWithdrawal()
    {
        if(!this.currentSubCell)
        {
            this.completed = true;
            this.crossfadeAnimator("idle");
            this.emit("blocked", { walker: this });
            return;
        }

        const centre = this.subCellToWorld(this.currentSubCell);
        const o = this.entity.object3D;
        const dx = centre.x - o.position.x;
        const dz = centre.z - o.position.z;
        if(dx * dx + dz * dz <= MESH_BUFFER * MESH_BUFFER)
        {
            this.completed = true;
            this.crossfadeAnimator("idle");
            this.emit("blocked", { walker: this });
            return;
        }

        this.path = [{ sx: this.currentSubCell.sx, sz: this.currentSubCell.sz }];
        this.pathIndex = 0;
        this.withdrawing = true;
        this.faceTowardsSubCell(this.path[0]);
    }

    teleportTo(sx, sz)
    {
        this.path = [];
        this.pathIndex = 0;
        this.completed = true;
        this.withdrawing = false;

        const w = this.subCellCentre(sx, sz);
        this.entity.object3D.position.set(w.x, 0, w.z);
        this.stampSubCell(sx, sz);

        this.crossfadeAnimator("idle");
        this.emit("displaced", { walker: this });
    }

    toJSON()
    {
        return {
            speed:     this.speed,
            path:      this.path.map(c => ({ sx: c.sx, sz: c.sz })),
            pathIndex: this.pathIndex
        };
    }


    /* INTERNAL ***************************************************************/

    subCellToWorld(cell)
    {
        return this.subCellCentre(cell.sx, cell.sz);
    }

    subCellCentre(sx, sz)
    {
        return this.entity.world.walkGrid.subToWorld(sx, sz);
    }

    crossfadeAnimator(state)
    {
        this.entity.getComponent(Animator)?.crossfade(state);
    }

    snapToSubCell(cell)
    {
        const w = this.subCellCentre(cell.sx, cell.sz);
        this.entity.object3D.position.set(w.x, 0, w.z);
        this.stampSubCell(cell.sx, cell.sz);
    }

    stampSubCell(sx, sz)
    {
        const walkGrid = this.entity.world.walkGrid;

        if(this.currentSubCell && this.currentSubCell.sx === sx && this.currentSubCell.sz === sz)
        {
            return; // Already stamped here.
        }

        if(this.currentSubCell)
        {
            walkGrid.revertStamp([this.currentSubCell]);
        }

        walkGrid.applyStamp([{ sx, sz }]);
        this.currentSubCell = { sx, sz };
    }

    faceTowardsSubCell(cell)
    {
        const w = this.subCellCentre(cell.sx, cell.sz);
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
        while(delta >  Math.PI) { delta -= TWO_PI; }
        while(delta < -Math.PI) { delta += TWO_PI; }
        const factor = 1 - Math.exp(-this.turnRate * dt);
        o.rotation.y += delta * factor;
    }
}

export { Walker };
