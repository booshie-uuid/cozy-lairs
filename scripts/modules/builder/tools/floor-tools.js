import * as THREE from "three";

import { Tool, TINT_VALID, TINT_INVALID, TINT_REMOVE, FLOOR_OVERLAY_OPACITY } from "./tool.js";


/******************************************************************************/
/* FLOOR PAINT / ERASE TOOLS                                                  */
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


class FloorEraseTool extends Tool
{
    buildGhost()
    {
        const cellSize = this.editor.world.grid.cellSize;
        return buildCellOverlay(cellSize, TINT_REMOVE);
    }

    onCellHover(cell)
    {
        this.positionGhostAtCell(cell.cx, cell.cz);
        const colour = this.editor.canEraseFloor(cell.cx, cell.cz) ? TINT_REMOVE : TINT_INVALID;
        this.setGhostColour(colour);
    }

    onCellClick(cell, button)
    {
        if(button !== "left") { return; }
        this.editor.eraseFloor(cell.cx, cell.cz);
    }
}


export { FloorPaintTool, FloorEraseTool };
