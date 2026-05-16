import * as Errors    from "../../engine/errors.js";
import * as Footprint from "../footprint.js";


/******************************************************************************/
/* CORNER PLACEMENT                                                           */
/******************************************************************************/

/*
 * Places an entity at a grid vertex (vx*S, 0, vz*S), where vertex coordinates
 * extend one past cell coordinates in each direction. KayKit's `wall_corner`
 * has arms extending in -X and +Z at default rotation (matches a SE room
 * corner); the rotation table below orients the other three corners.
 *
 * Corners stamp the walk-grid through the same footprint module GridPlacement
 * uses, dispatching to the wall-corner primitive (L-shape stamp at the two arm
 * tips). The manifest entry for wall.stone.corner carries
 * `meta.collision: "wall-corner"` so the dispatch lands on the right primitive.
 */

const QUARTER_TURN = Math.PI / 2;

const ROTATION_BY_CORNER =
{
    SE: 0,
    SW: QUARTER_TURN,
    NW: 2 * QUARTER_TURN,
    NE: 3 * QUARTER_TURN
};


class CornerPlacement
{
    constructor(vx, vz, corner)
    {
        if(!(corner in ROTATION_BY_CORNER))
        {
            throw new Errors.PlacementError(`CornerPlacement: invalid corner "${corner}" (expected one of: ${Object.keys(ROTATION_BY_CORNER).join(", ")}).`);
        }
        this.vx = vx;
        this.vz = vz;
        this.corner = corner;
        this.entity = null;
        this.stampedSubCells = [];
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(world)
    {
        const S = world.grid.cellSize;
        const o = this.entity.object3D;
        o.position.set(this.vx * S, 0, this.vz * S);
        o.rotation.y = ROTATION_BY_CORNER[this.corner];

        this.stampWalkGrid(world);
    }

    onRemovedFromWorld(world)
    {
        this.revertWalkGrid(world);
    }

    toJSON()
    {
        return { vx: this.vx, vz: this.vz, corner: this.corner };
    }


    /* INTERNAL ***************************************************************/

    stampWalkGrid(world)
    {
        if(!world.walkGrid || !world.assets) { return; }

        const { subCells } = Footprint.computeFootprint({
            kind:     this.entity.kind,
            vx:       this.vx,
            vz:       this.vz,
            corner:   this.corner,
            assets:   world.assets,
            walkGrid: world.walkGrid
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

export { CornerPlacement };
