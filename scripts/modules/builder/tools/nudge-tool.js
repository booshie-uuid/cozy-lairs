import * as THREE from "three";

import { Tool } from "./tool.js";


/******************************************************************************/
/* NUDGE TOOL                                                                 */
/******************************************************************************/

const HIGHLIGHT_EMISSIVE = 0x2a5a3a;
const HIGHLIGHT_INTENSITY = 0.6;


class NudgeTool extends Tool
{
    constructor()
    {
        super();
        this.targetType = "entity";
        this.selected = null;
        this.materialBackups = null;
    }

    deactivate()
    {
        this.deselect();
        super.deactivate();
    }


    /* HOOKS ******************************************************************/

    onEntityClick(entity, button)
    {
        if(button !== "left") { return; }

        // Non-nudgeable hits deselect — never lock the highlight onto
        // something the arrow keys won't move.
        if(!entity || !this.editor || !this.editor.isNudgeable(entity))
        {
            this.deselect();
            return;
        }

        if(entity === this.selected) { return; }

        this.deselect();
        this.selected = entity;
        this.applyHighlight(entity);

        if(typeof this.editor.hint === "function")
        {
            this.editor.hint("Use arrow keys to nudge decor.");
        }
    }

    nudge(deltaX, deltaZ)
    {
        if(!this.selected || !this.editor) { return false; }

        // Entity was removed mid-selection — clean up the dangling ref.
        if(!this.selected.world)
        {
            this.deselect();
            return false;
        }

        return this.editor.nudgeEntity(this.selected, deltaX, deltaZ);
    }

    deselect()
    {
        if(!this.selected) { return; }

        this.restoreHighlight();

        this.selected = null;
        this.materialBackups = null;
    }


    /* HIGHLIGHT **************************************************************/

    applyHighlight(entity)
    {
        this.materialBackups = [];
        entity.object3D.traverse(node =>
        {
            if(!node.isMesh || !node.material) { return; }

            const original = node.material;

            if(!original.emissive) { return; }

            const cloned = original.clone();
            
            cloned.emissive = new THREE.Color(HIGHLIGHT_EMISSIVE);
            cloned.emissiveIntensity = HIGHLIGHT_INTENSITY;

            this.materialBackups.push({ node, original, cloned });
            node.material = cloned;
        });
    }

    restoreHighlight()
    {
        if(!this.materialBackups) { return; }

        for(const { node, original, cloned } of this.materialBackups)
        {
            node.material = original;
            cloned.dispose();
        }

        this.materialBackups = null;
    }
}


export { NudgeTool };
