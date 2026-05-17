import * as THREE from "three";

import { Tool, CellEraseTool, TINT_VALID, TINT_INVALID, FLOOR_OVERLAY_OPACITY } from "./tool.js";
import { GridPlacement } from "../../world/components/grid-placement.js";


/******************************************************************************/
/* FLOOR PAINT / BUILD ERASE TOOLS                                            */
/******************************************************************************/

function buildCellOverlay(cellSize, initialColour)
{
    const geometry = new THREE.PlaneGeometry(cellSize, cellSize);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
        color:        initialColour,
        transparent:  true,
        opacity:      FLOOR_OVERLAY_OPACITY,
        depthWrite:   false,
        side:         THREE.DoubleSide
    });
    return new THREE.Mesh(geometry, material);
}


class FloorPaintTool extends Tool
{
    buildGhost()
    {
        const cellSize = this.editor.world.grid.cellSize;
        return buildCellOverlay(cellSize, TINT_VALID);
    }

    onCellHover(cell)
    {
        this.positionGhostAtCell(cell.cx, cell.cz);

        const grid = this.editor.world.grid;
        if(!this.editor.canPaintFloor(cell.cx, cell.cz)) { this.setGhostColour(TINT_INVALID); }
        else if(grid.isFloor(cell.cx, cell.cz)) { this.setGhostColour(TINT_INVALID); }
        else { this.setGhostColour(TINT_VALID); }
    }

    onCellClick(cell, button)
    {
        if(button !== "left") { return; }
        this.editor.paintFloor(cell.cx, cell.cz);
    }
}


// Build-tab erase tool — handles both blocks and floors. Blocks and
// floors are mutually exclusive per cell (canPlaceBlock refuses on a
// floor, canPaintFloor refuses on a block), so at most one target exists.
class BuildEraseTool extends CellEraseTool
{
    findTarget(cell)
    {
        const block = this.editor.findBlockAtCell(cell.cx, cell.cz);
        if(block) { return block; }

        if(this.editor.canEraseFloor(cell.cx, cell.cz))
        {
            return this.editor.findFloorAtCell(cell.cx, cell.cz);
        }

        return null;
    }

    commitRemove(target)
    {
        if(this.editor.isBlockEntity(target))
        {
            this.editor.removeBlock(target);
            return;
        }

        // Floor entity — route through eraseFloor so the decor-cascade /
        // walker / player guards run, rather than removing it directly.
        const placement = target.getComponent(GridPlacement);
        this.editor.eraseFloor(placement.cx, placement.cz);
    }
}


export { FloorPaintTool, BuildEraseTool };
