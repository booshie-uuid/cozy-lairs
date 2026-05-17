import { Tool } from "./tool.js";


/******************************************************************************/
/* PICK TOOL                                                                  */
/******************************************************************************/

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
