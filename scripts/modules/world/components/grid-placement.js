import * as Errors from "../../engine/errors.js";


/******************************************************************************/
/* GRID PLACEMENT                                                             */
/******************************************************************************/

/*
 * Places an entity at the centre of cell (cx, cz) with a discrete Y-rotation
 * step (0..3 = 0/90/180/270°). Transform applied in `onAddedToWorld` because
 * cell size comes from the world's grid.
 */

const QUARTER_TURN = Math.PI / 2;


class GridPlacement
{
    constructor(cx, cz, rotationStep = 0)
    {
        if(!Number.isInteger(rotationStep) || rotationStep < 0 || rotationStep > 3)
        {
            throw new Errors.PlacementError(`GridPlacement: rotationStep must be an integer in 0..3 (got ${rotationStep}).`);
        }
        this.cx = cx;
        this.cz = cz;
        this.rotationStep = rotationStep;
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
    }

    toJSON()
    {
        return { cx: this.cx, cz: this.cz, rotationStep: this.rotationStep };
    }
}

export { GridPlacement };
