import * as Errors from "../../engine/errors.js";
import * as WalkGridStamp from "../walk-grid-stamp.js";


/******************************************************************************/
/* GRID PLACEMENT                                                             */
/******************************************************************************/

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
        if(this.blocks) { world.grid.setBlocked(this.cx, this.cz); }

        world.indexEntityAtCell(this.entity, this.cx, this.cz);

        this.stampWalkGrid(world);
    }

    onRemovedFromWorld(world)
    {
        if(this.walkable) { world.grid.unmarkFloor(this.cx, this.cz); }
        if(this.blocks) { world.grid.clearBlocked(this.cx, this.cz); }

        world.unindexEntityAtCell(this.entity, this.cx, this.cz);

        this.revertWalkGrid(world);
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

        if(this.walkable) { json.walkable = true; }
        if(this.blocks) { json.blocks = true; }
        if(this.surfaceY !== 0) { json.surfaceY = this.surfaceY; }
        if(this.xOffset !== 0) { json.xOffset = this.xOffset; }
        if(this.zOffset !== 0) { json.zOffset = this.zOffset; }

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
        // Only `blocks: true` entries contribute to the refcount —
        // surface-placeables sit on a surface that already stamps the cell.
        if(!this.blocks) { return; }

        this.stampedSubCells = WalkGridStamp.apply(world, {
            kind:         this.entity.kind,
            cx:           this.cx,
            cz:           this.cz,
            rotationStep: this.rotationStep,
            xOffset:      this.xOffset,
            zOffset:      this.zOffset
        });
    }

    revertWalkGrid(world)
    {
        WalkGridStamp.revert(world, this.stampedSubCells);
        this.stampedSubCells = [];
    }
}

export { GridPlacement };
