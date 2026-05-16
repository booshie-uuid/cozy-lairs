import * as Errors    from "../../engine/errors.js";
import * as Footprint from "../footprint.js";


/******************************************************************************/
/* GRID PLACEMENT                                                             */
/******************************************************************************/

/*
 * Places an entity at the centre of cell (cx, cz) with a discrete Y-rotation
 * step (0..3 = 0/90/180/270°). Transform applied in `onAddedToWorld` because
 * cell size comes from the world's grid.
 *
 * Optional flags drive grid walkability:
 *   walkable: registers the cell in `grid.floorCells` on add, clears on remove.
 *   blocks:   registers the cell in `grid.blockedCells` on add, clears on remove.
 * Both default false.
 *
 * `surfaceY` lifts the entity off the cell floor — used when a decor is
 * placed on top of a surface (e.g. a candle on a table). Round-trips through
 * `toJSON` only when non-zero.
 *
 * `xOffset` / `zOffset` are free-axis nudge offsets within the cell. Default
 * 0. Emitted in `toJSON` only when non-zero so un-nudged saves keep the V5
 * byte shape.
 *
 * When the host world has a `walkGrid` AND an `assets` reference, every add /
 * remove (and `setOffset`) stamps/reverts the sub-grid via the footprint
 * module. Without either, the lifecycle silently skips stamping — Task 7
 * wires `walkGrid` + `assets` onto `World` so the gate disappears in
 * production.
 */

const QUARTER_TURN = Math.PI / 2;


class GridPlacement
{
    constructor(cx, cz, rotationStep = 0, options = {})
    {
        if(!Number.isInteger(rotationStep) || rotationStep < 0 || rotationStep > 3)
        {
            throw new Errors.PlacementError(`GridPlacement: rotationStep must be an integer in 0..3 (got ${rotationStep}).`);
        }

        const { walkable = false, blocks = false, surfaceY = 0, xOffset = 0, zOffset = 0 } = options;

        if(typeof walkable !== "boolean")
        {
            throw new Errors.PlacementError(`GridPlacement: walkable must be a boolean (got ${typeof walkable}).`);
        }
        if(typeof blocks !== "boolean")
        {
            throw new Errors.PlacementError(`GridPlacement: blocks must be a boolean (got ${typeof blocks}).`);
        }
        if(typeof surfaceY !== "number" || !Number.isFinite(surfaceY))
        {
            throw new Errors.PlacementError(`GridPlacement: surfaceY must be a finite number (got ${surfaceY}).`);
        }
        if(typeof xOffset !== "number" || !Number.isFinite(xOffset))
        {
            throw new Errors.PlacementError(`GridPlacement: xOffset must be a finite number (got ${xOffset}).`);
        }
        if(typeof zOffset !== "number" || !Number.isFinite(zOffset))
        {
            throw new Errors.PlacementError(`GridPlacement: zOffset must be a finite number (got ${zOffset}).`);
        }

        this.cx = cx;
        this.cz = cz;
        this.rotationStep = rotationStep;
        this.walkable = walkable;
        this.blocks = blocks;
        this.surfaceY = surfaceY;
        this.xOffset = xOffset;
        this.zOffset = zOffset;

        this.entity = null;
        this.stampedSubCells = [];
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(world)
    {
        this.applyTransform(world);

        if(this.walkable) { world.grid.markFloor(this.cx, this.cz); }
        if(this.blocks)   { world.grid.setBlocked(this.cx, this.cz); }

        this.stampWalkGrid(world);
    }

    onRemovedFromWorld(world)
    {
        if(this.walkable) { world.grid.unmarkFloor(this.cx, this.cz); }
        if(this.blocks)   { world.grid.clearBlocked(this.cx, this.cz); }

        this.revertWalkGrid(world);
    }

    moveTo(cx, cz)
    {
        this.cx = cx;
        this.cz = cz;
    }

    setOffset(xOffset, zOffset)
    {
        if(typeof xOffset !== "number" || !Number.isFinite(xOffset))
        {
            throw new Errors.PlacementError(`GridPlacement.setOffset: xOffset must be a finite number (got ${xOffset}).`);
        }
        if(typeof zOffset !== "number" || !Number.isFinite(zOffset))
        {
            throw new Errors.PlacementError(`GridPlacement.setOffset: zOffset must be a finite number (got ${zOffset}).`);
        }

        const world = this.entity ? this.entity.world : null;

        if(world) { this.revertWalkGrid(world); }

        this.xOffset = xOffset;
        this.zOffset = zOffset;

        if(world)
        {
            this.applyTransform(world);
            this.stampWalkGrid(world);
        }
    }

    toJSON()
    {
        const json = { cx: this.cx, cz: this.cz, rotationStep: this.rotationStep };
        if(this.walkable)        { json.walkable = true; }
        if(this.blocks)          { json.blocks   = true; }
        if(this.surfaceY !== 0)  { json.surfaceY = this.surfaceY; }
        if(this.xOffset  !== 0)  { json.xOffset  = this.xOffset;  }
        if(this.zOffset  !== 0)  { json.zOffset  = this.zOffset;  }
        return json;
    }


    /* INTERNAL ***************************************************************/

    applyTransform(world)
    {
        const { x, z } = world.grid.cellToWorld(this.cx, this.cz);
        const o = this.entity.object3D;
        o.position.set(x + this.xOffset, this.surfaceY, z + this.zOffset);
        o.rotation.y = this.rotationStep * QUARTER_TURN;
    }

    stampWalkGrid(world)
    {
        /* Floors and surface-placeables don't add their own blocker stamp.
         * Floors are *walkable* (sub-grid baseline is "no blocker = walkable");
         * surface-placeables sit on a surface entity that already stamps the
         * cell. Only entities flagged `blocks: true` contribute to the
         * sub-grid refcount. */
        if(!this.blocks) { return; }
        if(!world.walkGrid || !world.assets) { return; }

        const { subCells } = Footprint.computeFootprint({
            kind:         this.entity.kind,
            cx:           this.cx,
            cz:           this.cz,
            rotationStep: this.rotationStep,
            xOffset:      this.xOffset,
            zOffset:      this.zOffset,
            assets:       world.assets,
            walkGrid:     world.walkGrid
        });

        this.stampedSubCells = subCells;
        world.walkGrid.applyStamp(subCells);
    }

    revertWalkGrid(world)
    {
        if(!world.walkGrid || this.stampedSubCells.length === 0) { return; }

        world.walkGrid.revertStamp(this.stampedSubCells);
        this.stampedSubCells = [];
    }
}

export { GridPlacement };
