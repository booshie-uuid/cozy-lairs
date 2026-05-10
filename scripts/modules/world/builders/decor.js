import { Entity }         from "../entity.js";
import { GridPlacement }  from "../components/grid-placement.js";
import { Walker }         from "../components/walker.js";
import { PLAYER_MARKER }  from "../../engine/player-marker.js";


/******************************************************************************/
/* DECOR BUILDERS                                                             */
/******************************************************************************/

/*
 * Floor-resident decor: an entity rendered on top of an existing floor tile,
 * blocking the cell for pathfinding. V1 only models floor decor (barrels,
 * crates). Wall-mounted decor (banners, torches) is a separate class and
 * will land later via EdgePlacement — keep helpers explicit per asset kind so
 * that future wall decor isn't shoe-horned through this same call site.
 *
 * Placement-on-occupant safety net: if the target cell already has an
 * occupant (a Walker entity, or the player marker), find the nearest free
 * cell via BFS spiral and displace the occupant before placing or
 * relocating the decor. If no free cell exists, warn and skip the
 * operation. `displaceOccupantAt` centralises the dispatch so both
 * `placeFloorDecor` (new placement) and `relocateDecor` (chaos / move
 * existing decor) share the logic.
 */

const KIND_BARREL = "decor.barrel";
const KIND_CRATE = "decor.crate";


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

    if(!displaceOccupantAt(world, cx, cz, kind)) { return null; }

    const entity = Entity.fromKind(kind, assets);
    entity.addComponent(new GridPlacement(cx, cz, 0, { blocks: true }));
    world.addEntity(entity);
    return entity;
}


function relocateDecor(world, entity, newCx, newCz)
{
    const grid = world.grid;
    const placement = entity.getComponent(GridPlacement);
    if(!placement)
    {
        console.warn(`[decor] cannot relocate ${entity.kind} — no GridPlacement component.`);
        return false;
    }

    if(placement.cx === newCx && placement.cz === newCz) { return true; }

    if(!grid.floorCells.has(grid.cellKey(newCx, newCz)))
    {
        console.warn(`[decor] ${entity.kind} cannot relocate to (${newCx}, ${newCz}) — no floor at that cell.`);
        return false;
    }

    if(!displaceOccupantAt(world, newCx, newCz, entity.kind)) { return false; }

    grid.clearBlocked(placement.cx, placement.cz);
    placement.moveTo(newCx, newCz);
    grid.setBlocked(newCx, newCz);

    const w = grid.cellToWorld(newCx, newCz);
    entity.object3D.position.set(w.x, 0, w.z);

    return true;
}


function displaceOccupantAt(world, cx, cz, kindForLog)
{
    const grid = world.grid;
    const occupant = grid.getOccupant(cx, cz);
    if(occupant === null) { return true; }

    // Don't pass `excludeOccupant` — we want BFS to skip the contested
    // cell so it returns somewhere ELSE for the occupant.
    const free = grid.findClosestAvailable(cx, cz);
    if(!free)
    {
        console.warn(`[decor] ${kindForLog} at (${cx}, ${cz}) skipped — occupant present but no free cell to displace to.`);
        return false;
    }

    if(occupant === PLAYER_MARKER)
    {
        if(typeof world.playerDisplaceHandler === "function")
        {
            world.playerDisplaceHandler(free);
            return true;
        }
        console.warn(`[decor] ${kindForLog} at (${cx}, ${cz}): occupant is PLAYER_MARKER but world.playerDisplaceHandler is not set — skipping.`);
        return false;
    }

    if(typeof occupant.getComponent === "function")
    {
        const walker = occupant.getComponent(Walker);
        if(walker)
        {
            walker.teleportTo(free.cx, free.cz);
            return true;
        }
        console.warn(`[decor] ${kindForLog} at (${cx}, ${cz}): occupant entity has no Walker — skipping to avoid stranding it.`);
        return false;
    }

    console.warn(`[decor] ${kindForLog} at (${cx}, ${cz}): occupant is an unrecognised type — skipping.`);
    return false;
}


export { addBarrel, addCrate, relocateDecor };
