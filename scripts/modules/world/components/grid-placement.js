import * as Errors from "../../engine/errors.js";


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
 * Both default false. A floor tile is `{ walkable: true }`; a barrel is
 * `{ blocks: true }`; a typical decoration that lives on top of a floor is
 * `{ blocks: true }` (the floor entity already supplies the walkable mark).
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

        const { walkable = false, blocks = false } = options;

        if(typeof walkable !== "boolean")
        {
            throw new Errors.PlacementError(`GridPlacement: walkable must be a boolean (got ${typeof walkable}).`);
        }
        if(typeof blocks !== "boolean")
        {
            throw new Errors.PlacementError(`GridPlacement: blocks must be a boolean (got ${typeof blocks}).`);
        }

        this.cx = cx;
        this.cz = cz;
        this.rotationStep = rotationStep;
        this.walkable = walkable;
        this.blocks = blocks;
        this.entity = null;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(world)
    {
        const { x, z } = world.grid.cellToWorld(this.cx, this.cz);
        const o = this.entity.object3D;
        o.position.set(x, 0, z);
        o.rotation.y = this.rotationStep * QUARTER_TURN;

        if(this.walkable) { world.grid.markFloor(this.cx, this.cz); }
        if(this.blocks)   { world.grid.setBlocked(this.cx, this.cz); }
    }

    onRemovedFromWorld(world)
    {
        if(this.walkable) { world.grid.unmarkFloor(this.cx, this.cz); }
        if(this.blocks)   { world.grid.clearBlocked(this.cx, this.cz); }
    }

    moveTo(cx, cz)
    {
        this.cx = cx;
        this.cz = cz;
    }

    toJSON()
    {
        const json = { cx: this.cx, cz: this.cz, rotationStep: this.rotationStep };
        if(this.walkable) { json.walkable = true; }
        if(this.blocks)   { json.blocks   = true; }
        return json;
    }
}

export { GridPlacement };
