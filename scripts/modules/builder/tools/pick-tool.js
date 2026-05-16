import { Tool } from "./tool.js";


/******************************************************************************/
/* PICK TOOL                                                                  */
/******************************************************************************/

/*
 * Click an entity to remove it from the world, capturing a snapshot of its
 * placement state. Hands the snapshot to the parent (App) via the injected
 * `onPicked` callback so the parent can stash it as `App.pickedUp` and arm
 * the matching build tool — cancelling the build re-places the snapshot at
 * its origin (auto-restore wiring lands in Task 7).
 *
 * No ghost: hover doesn't preview anything. Eligibility (decor + minions
 * only; floors / walls / blocks excluded) is decided by `editor.isPickupable`,
 * mirroring `NudgeTool`'s reliance on `editor.isNudgeable`.
 */


class PickTool extends Tool
{
    constructor({ onPicked = null } = {})
    {
        super();
        this.targetType = "entity";
        this.onPicked = onPicked;
    }

    buildGhost() { return null; }


    /* HOOKS ******************************************************************/

    onEntityClick(entity, button)
    {
        if(button !== "left") { return; }
        if(!entity || !this.editor || !this.editor.isPickupable(entity)) { return; }

        const snapshot = this.editor.pickUpEntity(entity);
        if(!snapshot) { return; }

        if(typeof this.onPicked === "function")
        {
            this.onPicked(snapshot);
        }
    }
}


export { PickTool };
