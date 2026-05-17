/******************************************************************************/
/* WALK GRID STAMP                                                            */
/******************************************************************************/

// Shared apply / revert helpers for placement components. All three
// placement shapes (GridPlacement / EdgePlacement / CornerPlacement)
// follow the same lifecycle: on add, compute a footprint + stamp the
// walk-grid; on remove, revert the stamp. Footprint inputs differ; the
// apply/revert framing doesn't.

import * as Footprint from "./footprint.js";


// Compute a footprint and apply it to the walk-grid. Returns the
// stamped sub-cell list to store on the placement so revert can
// undo the exact same set later.
function apply(world, footprintArgs)
{
    if(!world.walkGrid || !world.assets) { return []; }

    const { subCells } = Footprint.computeFootprint({
        ...footprintArgs,
        assets:   world.assets,
        walkGrid: world.walkGrid
    });

    world.walkGrid.applyStamp(subCells);
    return subCells;
}


// Revert a previously-applied stamp. Safe to call when the world has
// no walk-grid or the stamp is empty (no-op fast path).
function revert(world, stampedSubCells)
{
    if(!world.walkGrid || stampedSubCells.length === 0) { return; }
    world.walkGrid.revertStamp(stampedSubCells);
}


export { apply, revert };
