import { Entity }          from "../entity.js";
import { GridPlacement }   from "../components/grid-placement.js";
import { EdgePlacement }   from "../components/edge-placement.js";
import { CornerPlacement } from "../components/corner-placement.js";


/******************************************************************************/
/* EMPTY ROOM BUILDER                                                         */
/******************************************************************************/

/*
 * Sealed rectangular room: floors fill the footprint; the four perimeter
 * corners get KayKit corner pieces; the four corner CELLS use half-walls
 * offset away from the corner so corner mesh and half-wall mesh meet end-
 * to-end (avoids z-fighting on the inner faces). Non-corner perimeter cells
 * use full straight walls. Origin is the south-west cell (x0, z0); the room
 * extends in +X and +Z.
 */

const HALF_OFFSET = 1;


function buildEmptyRoom(world, assets, { x0, z0, width, depth })
{
    if(!Number.isInteger(width) || !Number.isInteger(depth) || width < 2 || depth < 2)
    {
        throw new Error(`buildEmptyRoom: width and depth must be integers >= 2 (got width=${width}, depth=${depth}).`);
    }


    /* FLOOR ******************************************************************/

    for(let dx = 0; dx < width; dx++)
    {
        for(let dz = 0; dz < depth; dz++)
        {
            const floor = Entity.fromKind("floor.stone.basic", assets);
            floor.addComponent(new GridPlacement(x0 + dx, z0 + dz, 0, { walkable: true }));
            world.addEntity(floor);
        }
    }


    /* WALLS — NORTH AND SOUTH EDGES ******************************************/

    for(let dx = 0; dx < width; dx++)
    {
        const cx = x0 + dx;
        const atWestEnd = (dx === 0);
        const atEastEnd = (dx === width - 1);
        const atCorner = atWestEnd || atEastEnd;
        const offset = atWestEnd ? +HALF_OFFSET : -HALF_OFFSET;

        addPerimeterWall(world, assets, cx, z0,             "south", atCorner, offset);
        addPerimeterWall(world, assets, cx, z0 + depth - 1, "north", atCorner, offset);
    }


    /* WALLS — EAST AND WEST EDGES ********************************************/

    for(let dz = 0; dz < depth; dz++)
    {
        const cz = z0 + dz;
        const atSouthEnd = (dz === 0);
        const atNorthEnd = (dz === depth - 1);
        const atCorner = atSouthEnd || atNorthEnd;
        const offset = atSouthEnd ? +HALF_OFFSET : -HALF_OFFSET;

        addPerimeterWall(world, assets, x0,             cz, "west", atCorner, offset);
        addPerimeterWall(world, assets, x0 + width - 1, cz, "east", atCorner, offset);
    }


    /* CORNERS ****************************************************************/

    const corners = [
        { vx: x0,         vz: z0,         corner: "SW" },
        { vx: x0 + width, vz: z0,         corner: "SE" },
        { vx: x0,         vz: z0 + depth, corner: "NW" },
        { vx: x0 + width, vz: z0 + depth, corner: "NE" }
    ];

    for(const { vx, vz, corner } of corners)
    {
        const piece = Entity.fromKind("wall.stone.corner", assets);
        piece.addComponent(new CornerPlacement(vx, vz, corner));
        world.addEntity(piece);
    }
}


const HALF_WALL_ORIGIN_OFFSET = -1;


function addPerimeterWall(world, assets, cx, cz, side, atCorner, offset)
{
    const kind = atCorner ? "wall.stone.half" : "wall.stone.straight";
    const length = atCorner ? offset : 0;
    const originOffset = atCorner ? HALF_WALL_ORIGIN_OFFSET : 0;
    const wall = Entity.fromKind(kind, assets);
    
    wall.addComponent(new EdgePlacement(cx, cz, side, length, originOffset));
    
    world.addEntity(wall);
}


export { buildEmptyRoom };
