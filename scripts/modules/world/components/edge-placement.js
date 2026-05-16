import * as Errors    from "../../engine/errors.js";
import * as Footprint from "../footprint.js";


/******************************************************************************/
/* EDGE PLACEMENT                                                             */
/******************************************************************************/

/*
 * Places an entity on one edge of cell (cx, cz). Rotation orients the asset
 * to face *into* the cell — for KayKit straight walls (decorated face on
 * +Z at default rotation), south=0, north=π, west=π/2, east=-π/2.
 *
 * `lengthOffset` shifts the placement along the edge axis (X for north/south,
 * Z for east/west). `originOffset` shifts along the asset's local +X to
 * compensate for assets whose origin is not at their visual centre — e.g.
 * `wall_half.gltf` has bounds X=0..2 (origin at one end), so pass -1 to
 * centre it on the requested position.
 *
 * Stamps the walk-grid on add via the footprint module's AABB primitive,
 * passing the pre-computed world transform (edge placements don't fit the
 * cell-centred cx/cz/rotationStep shape). Reverts on remove. Gated on the
 * world having both a walk-grid and an assets cache.
 */

const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;

const ROTATION_BY_SIDE =
{
    south:  0,
    north:  HALF_TURN,
    west:   QUARTER_TURN,
    east:  -QUARTER_TURN
};


class EdgePlacement
{
    constructor(cx, cz, side, lengthOffset = 0, originOffset = 0)
    {
        if(!(side in ROTATION_BY_SIDE))
        {
            throw new Errors.PlacementError(`EdgePlacement: invalid side "${side}" (expected one of: ${Object.keys(ROTATION_BY_SIDE).join(", ")}).`);
        }
        this.cx = cx;
        this.cz = cz;
        this.side = side;
        this.lengthOffset = lengthOffset;
        this.originOffset = originOffset;
        this.entity = null;
        this.stampedSubCells = [];
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(world)
    {
        const transform = this.computeWorldTransform(world);

        const o = this.entity.object3D;
        o.position.set(transform.x, 0, transform.z);
        o.rotation.y = transform.rotationRadians;

        this.stampWalkGrid(world, transform);
    }

    onRemovedFromWorld(world)
    {
        this.revertWalkGrid(world);
    }

    toJSON()
    {
        return {
            cx: this.cx,
            cz: this.cz,
            side: this.side,
            lengthOffset: this.lengthOffset,
            originOffset: this.originOffset
        };
    }


    /* INTERNAL ***************************************************************/

    computeWorldTransform(world)
    {
        const S = world.grid.cellSize;
        const half = S / 2;

        let x = this.cx * S + half;
        let z = this.cz * S + half;

        switch(this.side)
        {
            case "north": z = (this.cz + 1) * S; break;
            case "south": z =  this.cz      * S; break;
            case "east":  x = (this.cx + 1) * S; break;
            case "west":  x =  this.cx      * S; break;
        }

        if(this.side === "north" || this.side === "south")
        {
            x += this.lengthOffset;
        }
        else
        {
            z += this.lengthOffset;
        }

        const rotationRadians = ROTATION_BY_SIDE[this.side];

        if(this.originOffset !== 0)
        {
            x += this.originOffset * Math.cos(rotationRadians);
            z -= this.originOffset * Math.sin(rotationRadians);
        }

        return { x, z, rotationRadians };
    }

    stampWalkGrid(world, transform)
    {
        if(!world.walkGrid || !world.assets) { return; }

        const { subCells } = Footprint.computeFootprint({
            kind:           this.entity.kind,
            assets:         world.assets,
            walkGrid:       world.walkGrid,
            worldTransform: transform
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

export { EdgePlacement };
