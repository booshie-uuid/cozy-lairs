import * as THREE from "three";


/******************************************************************************/
/* TOOL — BASE CLASS                                                          */
/******************************************************************************/

const TINT_VALID   = 0x5af0a0;
const TINT_REMOVE  = 0xffaa33;
const TINT_INVALID = 0xff4565;

// KayKit floor_tile_large is 0.15m tall — ghost sits above it.
const GHOST_Y = 0.18;


class Tool
{
    constructor()
    {
        this.editor = null;
        this.scene = null;
        this.ghostMesh = null;
        this.hoverCell = null;
        this.hoverEdge = null;
        this.targetType = "cell";
    }


    /* LIFECYCLE **************************************************************/

    activate(editor, scene)
    {
        this.editor = editor;
        this.scene = scene;
        this.ghostMesh = this.buildGhost();
        if(this.ghostMesh)
        {
            this.ghostMesh.visible = false;
            this.scene.add(this.ghostMesh);
        }
    }

    deactivate()
    {
        if(this.ghostMesh)
        {
            if(this.scene) { this.scene.remove(this.ghostMesh); }
            this.disposeGhost(this.ghostMesh);
        }
        this.ghostMesh = null;
        this.editor = null;
        this.scene = null;
        this.hoverCell = null;
        this.hoverEdge = null;
    }


    /* DEFAULT HOOK STUBS *****************************************************/

    onCellHover(_cell)              {}
    onCellClick(_cell, _button)     {}
    onWallEdgeHover(_edge)          {}
    onWallEdgeClick(_edge, _button) {}
    rotate(_direction)              {}


    /* SUBCLASS HOOKS *********************************************************/

    buildGhost()
    {
        return null;
    }


    /* HELPERS ****************************************************************/

    positionGhostAtCell(cx, cz, yOffset = 0)
    {
        if(!this.ghostMesh || !this.editor) { return; }
        const w = this.editor.world.grid.cellToWorld(cx, cz);
        this.ghostMesh.position.set(w.x, GHOST_Y + yOffset, w.z);
        this.ghostMesh.visible = true;
    }

    setGhostTint(valid)
    {
        this.setGhostColour(valid ? TINT_VALID : TINT_INVALID);
    }

    setGhostColour(colour)
    {
        if(!this.ghostMesh) { return; }
        this.ghostMesh.traverse(node =>
        {
            if(node.material && node.material.color)
            {
                node.material.color.setHex(colour);
            }
        });
    }

    disposeGhost(mesh)
    {
        mesh.traverse(node =>
        {
            if(node.geometry) { node.geometry.dispose(); }
            if(node.material)
            {
                if(Array.isArray(node.material))
                {
                    for(const m of node.material) { m.dispose(); }
                }
                else
                {
                    node.material.dispose();
                }
            }
        });
    }
}

export { Tool, TINT_VALID, TINT_INVALID, TINT_REMOVE };
