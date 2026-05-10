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
 * Collision model: the walker registers itself as the occupant of the cell
 * it's physically inside. The pre-check fires the moment its predicted next
 * position would land in a *different* cell (i.e. at the cell boundary).
 * If that cell is occupied, the walker doesn't advance into it — position
 * stays put just shy of the boundary, walker emits `blocked`, walker is
 * still aligned with its registered cell. No look-ahead beyond the
 * immediately-next cell, no snap-back.
 *
 * Events:
 *   "arrived"   — emitted when the path completes (or immediately for an
 *                 empty / single-cell path).
 *   "blocked"   — emitted when the walker tries to cross into an occupied
 *                 cell.
 *   "displaced" — emitted when `teleportTo` shoves the walker to a new cell.
 */

const ARRIVE_EPSILON = 0.001;
const TWO_PI = Math.PI * 2;

// On block, if the walker is more than MESH_BUFFER metres from its
// currentCell centre, set up a one-cell mini-path back to the centre and
// emit "blocked" only after arrival. Prevents two walkers blocked on
// opposite sides of a cell boundary from having visually overlapping
// meshes — they each withdraw to their respective centres and end up a
// full cell apart.
const MESH_BUFFER = 1.0;


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
        this.currentCell = null;
        this.withdrawing = false;
        // Latches so diagnostic warnings fire once per episode, not per
        // frame. Reset when the corresponding state is restored.
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

        // Auto-register occupancy at the entity's current cell. Without this,
        // a freshly-spawned walker sits unregistered until its first followPath
        // — other walkers doing pre-checks see the spawn cell as empty and
        // walk straight through.
        const pos = this.entity.object3D.position;
        const { cx, cz } = world.grid.worldToCell(pos.x, pos.z);
        if(world.grid.isInBounds(cx, cz))
        {
            this.registerOccupancy(cx, cz);
        }
    }

    onRemovedFromWorld(world)
    {
        if(this.currentCell)
        {
            world.grid.clearOccupant(this.currentCell.cx, this.currentCell.cz);
            this.currentCell = null;
        }
    }

    followPath(path, options = {})
    {
        if(!Array.isArray(path))
        {
            throw new Error("Walker.followPath: path must be an array of {cx, cz} cells.");
        }

        // Fresh trip — clear any in-flight withdrawal flag so an arrival
        // emits "arrived" not "blocked".
        this.withdrawing = false;

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

        // Don't force-snap to path[0]'s centre — that's a visible jump
        // (cells are 4m, so up to a 2m teleport). Instead, register
        // occupancy at path[0] without repositioning, as long as the
        // walker is actually inside that cell. If the walker is somewhere
        // else (defensive: shouldn't happen in normal play), fall back
        // to a snap.
        const grid = this.entity.world.grid;
        const startCell = this.path[0];
        const physical  = grid.worldToCell(this.entity.object3D.position.x, this.entity.object3D.position.z);

        if(physical.cx === startCell.cx && physical.cz === startCell.cz)
        {
            this.registerOccupancy(startCell.cx, startCell.cz);
        }
        else
        {
            this.snapToCell(startCell);
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
        const grid = this.entity.world.grid;

        // Drift detector: physical cell vs registered cell. Latched so a
        // sustained drift only logs once — the warn is a signal, not a heartbeat.
        if(this.currentCell)
        {
            const physical = grid.worldToCell(o.position.x, o.position.z);
            const drifted = physical.cx !== this.currentCell.cx
                         || physical.cz !== this.currentCell.cz;
            if(drifted && !this.driftWarned)
            {
                console.warn(
                    `[Walker] ${this.entity.kind} drift: physical (${physical.cx}, ${physical.cz}) ` +
                    `vs registered (${this.currentCell.cx}, ${this.currentCell.cz}) ` +
                    `at world (${o.position.x.toFixed(2)}, ${o.position.z.toFixed(2)})`
                );
                this.driftWarned = true;
            }
            else if(!drifted && this.driftWarned)
            {
                this.driftWarned = false;
            }
        }

        const target = this.cellToWorld(this.path[this.pathIndex]);

        const dx = target.x - o.position.x;
        const dz = target.z - o.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if(dist <= ARRIVE_EPSILON)
        {
            // Already at target — treat as arrived for this leg and advance.
            // Defending against degenerate paths (e.g. duplicate consecutive
            // cells) so the walker can't stall forever animating "walk"
            // without moving.
            this.pathIndex += 1;
            if(this.pathIndex >= this.path.length)
            {
                this.completePath();
                this.tickRotation(dt);
                return;
            }
            this.faceTowardsCell(this.path[this.pathIndex]);
            this.tickRotation(dt);
            return;
        }

        const step = this.speed * dt;
        const moveAmount = Math.min(step, dist);
        const dirX = dx / dist;
        const dirZ = dz / dist;
        const newX = o.position.x + dirX * moveAmount;
        const newZ = o.position.z + dirZ * moveAmount;

        // Pre-check on cell-boundary crossing only. As long as we're moving
        // within the cell we've already registered, no checks are needed —
        // we own this cell. The check fires the moment our predicted next
        // position would land in a different cell. If that cell is
        // unavailable, we don't advance into it: position stays put and
        // we emit "blocked".
        const newCell = grid.worldToCell(newX, newZ);
        const crossesCell = !this.currentCell
            || newCell.cx !== this.currentCell.cx
            || newCell.cz !== this.currentCell.cz;

        if(crossesCell)
        {
            if(!grid.isAvailable(newCell.cx, newCell.cz, this.entity))
            {
                this.startWithdrawal();
                this.tickRotation(dt);
                return;
            }
            this.registerOccupancy(newCell.cx, newCell.cz);
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

            this.faceTowardsCell(this.path[this.pathIndex]);
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
        if(!this.currentCell)
        {
            // No cell to withdraw to — block immediately.
            this.completed = true;
            this.crossfadeAnimator("idle");
            this.emit("blocked", { walker: this });
            return;
        }

        // If already close to centre, withdrawal would be near-zero — just
        // block immediately. The MESH_BUFFER threshold means walker meshes
        // can't visually overlap when both stop within their cells.
        const centre = this.cellToWorld(this.currentCell);
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

        // Withdraw: replace path with a single-cell mini-path back to
        // currentCell centre. Walker keeps animating "walk" until it
        // arrives, then completePath() emits "blocked".
        this.path = [{ cx: this.currentCell.cx, cz: this.currentCell.cz }];
        this.pathIndex = 0;
        this.withdrawing = true;
        this.faceTowardsCell(this.path[0]);
    }

    teleportTo(cx, cz)
    {
        this.path = [];
        this.pathIndex = 0;
        this.completed = true;
        this.withdrawing = false;

        const w = this.cellToWorld({ cx, cz });
        this.entity.object3D.position.set(w.x, 0, w.z);
        this.registerOccupancy(cx, cz);

        this.crossfadeAnimator("idle");
        this.emit("displaced", { walker: this });
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
        this.registerOccupancy(cell.cx, cell.cz);
    }

    registerOccupancy(cx, cz)
    {
        const grid = this.entity.world.grid;

        // Refuse to clobber another occupant. Pre-checks (boundary-cross
        // `isAvailable`, `WanderBehaviour.kickTrip`, FP camera marker policy)
        // should make this unreachable; if it ever fires, there's a bug
        // upstream — log loudly and bail rather than corrupt grid state.
        const existing = grid.getOccupant(cx, cz);
        if(existing && existing !== this.entity)
        {
            const existingKind = existing && existing.kind ? existing.kind : "<unknown>";
            console.error(`[Walker] ${this.entity.kind} refusing to overwrite occupant at (${cx}, ${cz}) — was ${existingKind}`);
            return;
        }

        if(this.currentCell)
        {
            // Only clear if we still own the previous cell — guards against
            // the case where the FP camera or another writer has taken over.
            const prev = grid.getOccupant(this.currentCell.cx, this.currentCell.cz);
            if(prev === this.entity)
            {
                grid.clearOccupant(this.currentCell.cx, this.currentCell.cz);
            }
        }

        grid.setOccupant(cx, cz, this.entity);
        this.currentCell = { cx, cz };
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
