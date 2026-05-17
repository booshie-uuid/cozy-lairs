import * as Errors        from "../../engine/errors.js";
import * as WalkGridStamp from "../walk-grid-stamp.js";


/******************************************************************************/
/* EDGE PLACEMENT                                                             */
/******************************************************************************/

// `originOffset` shifts along the asset's local +X for assets whose
// origin isn't at their visual centre — e.g. `wall_half.gltf` has
// bounds X=0..2 with origin at one end, so pass -1 to centre it.

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
        this.stampedSubCells = WalkGridStamp.apply(world, {
            kind:           this.entity.kind,
            worldTransform: transform
        });
    }

    revertWalkGrid(world)
    {
        WalkGridStamp.revert(world, this.stampedSubCells);
        this.stampedSubCells = [];
    }
}

export { EdgePlacement };
