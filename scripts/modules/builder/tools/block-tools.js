import * as THREE from "three";

import
{
    CellPlaceTool,
    CellEraseTool,
    TINT_VALID,
    makeTranslucent
} from "./tool.js";


/******************************************************************************/
/* BLOCK PLACE / ERASE TOOLS                                                  */
/******************************************************************************/

class BlockPlaceTool extends CellPlaceTool
{
    buildGhost()
    {
        const mesh = this.editor.assets.get(this.kind);
        makeTranslucent(mesh, TINT_VALID);

        const meta = this.editor.assets.getMeta(this.kind);
        if(typeof meta.scale === "number")   { mesh.scale.setScalar(meta.scale); }
        if(typeof meta.yOffset === "number") { mesh.position.y = meta.yOffset; }

        const group = new THREE.Group();
        group.add(mesh);
        return group;
    }

    validate(cell)
    {
        return this.editor.canPlaceBlock(this.kind, cell.cx, cell.cz);
    }

    positionGhost(cell)
    {
        this.positionGhostAtCell(cell.cx, cell.cz);
        // Block ghost sits on the ground — block-bits use meta.yOffset
        // inside the inner mesh to lift to mid-block height.
        this.ghostMesh.position.y = 0;
    }

    commit(cell)
    {
        this.editor.placeBlock(this.kind, cell.cx, cell.cz);
    }
}


class BlockEraseTool extends CellEraseTool
{
    findTarget(cell)
    {
        return this.editor.findBlockAtCell(cell.cx, cell.cz);
    }

    commitRemove(target)
    {
        this.editor.removeBlock(target);
    }
}


export { BlockPlaceTool, BlockEraseTool };
