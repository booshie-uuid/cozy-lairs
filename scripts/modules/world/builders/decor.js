import { Entity }        from "../entity.js";
import { GridPlacement } from "../components/grid-placement.js";


/******************************************************************************/
/* DECOR BUILDERS                                                             */
/******************************************************************************/

/*
 * Floor-resident decor: an entity rendered on top of an existing floor tile,
 * blocking the cell for pathfinding. V1 only models floor decor (barrels,
 * crates). Wall-mounted decor (banners, torches) is a separate class and
 * will land later via EdgePlacement — keep helpers explicit per asset kind so
 * that future wall decor isn't shoe-horned through this same call site.
 */

const KIND_BARREL = "decor.barrel";
const KIND_CRATE  = "decor.crate";


function addBarrel(world, assets, cx, cz)
{
    return placeFloorDecor(world, assets, KIND_BARREL, cx, cz);
}


function addCrate(world, assets, cx, cz)
{
    return placeFloorDecor(world, assets, KIND_CRATE, cx, cz);
}


function placeFloorDecor(world, assets, kind, cx, cz)
{
    const grid = world.grid;
    if(!grid.floorCells.has(grid.cellKey(cx, cz)))
    {
        console.warn(`[decor] ${kind} at (${cx}, ${cz}) skipped — no floor at that cell.`);
        return null;
    }

    const entity = Entity.fromKind(kind, assets);
    entity.addComponent(new GridPlacement(cx, cz, 0, { blocks: true }));
    world.addEntity(entity);
    return entity;
}


export { addBarrel, addCrate };
