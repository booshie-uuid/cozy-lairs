import * as THREE from "three";

import
{
    Tool,
    CellPlaceTool,
    CellEraseTool,
    TINT_VALID,
    makeTranslucent,
    rotateStep
} from "./tool.js";


/******************************************************************************/
/* DECOR PLACE / ERASE + WALL DECOR PLACE TOOLS                               */
/******************************************************************************/

const QUARTER_TURN = Math.PI / 2;


class DecorPlaceTool extends CellPlaceTool
{
    get supportsRotation() { return true; }

    buildGhost()
    {
        const mesh = this.editor.assets.get(this.kind);
        makeTranslucent(mesh, TINT_VALID);
        mesh.rotation.y = this.rotationStep * QUARTER_TURN;
        return mesh;
    }

    validate(cell)
    {
        return this.editor.canPlaceDecor(this.kind, cell.cx, cell.cz);
    }

    positionGhost(cell)
    {
        const surfaceY = this.editor.getPlacementYFor(this.kind, cell.cx, cell.cz);
        this.positionGhostAtCell(cell.cx, cell.cz, surfaceY);
    }

    commit(cell)
    {
        this.editor.placeDecor(this.kind, cell.cx, cell.cz, this.rotationStep);
    }

    onRotationChanged()
    {
        if(this.ghostMesh) { this.ghostMesh.rotation.y = this.rotationStep * QUARTER_TURN; }
    }
}


class WallDecorPlaceTool extends Tool
{
    constructor({ kind })
    {
        super();
        this.kind = kind;
        this.rotationStep = 0;
        this.targetType = "wallEdge";
    }

    buildGhost()
    {
        const mesh = this.editor.assets.get(this.kind);
        makeTranslucent(mesh, TINT_VALID);

        const meta = this.editor.assets.getMeta(this.kind) || {};
        if(typeof meta.scale === "number")   { mesh.scale.setScalar(meta.scale); }
        if(typeof meta.yOffset === "number") { mesh.position.y = meta.yOffset; }
        if(typeof meta.zOffset === "number") { mesh.position.z = meta.zOffset; }

        const group = new THREE.Group();
        group.add(mesh);
        return group;
    }

    onWallEdgeHover(edge)
    {
        if(!this.ghostMesh) { return; }

        const valid = this.editor.canPlaceWallDecor(this.kind, edge);
        const floor = this.editor.floorSideOfEdge(edge);

        this.positionGhostAtEdge(floor);
        this.setGhostTint(valid);
    }

    onWallEdgeClick(edge, button)
    {
        if(button !== "left") { return; }
        this.editor.placeWallDecor(this.kind, edge, this.rotationStep);
    }

    // Wall decor's ghost rotation is set by the edge side, not rotationStep,
    // so Q/E updates state but the ghost preview doesn't reorient. The
    // placed entity still picks up the rotation.
    rotate(direction)
    {
        this.rotationStep = rotateStep(this.rotationStep, direction);
    }

    positionGhostAtEdge(floorEdge)
    {
        const grid = this.editor.world.grid;
        const S = grid.cellSize;
        const half = S / 2;

        let x = floorEdge.cx * S + half;
        let z = floorEdge.cz * S + half;
        let rotY = 0;

        switch(floorEdge.side)
        {
            case "south": z = floorEdge.cz * S;       rotY = 0;             break;
            case "north": z = (floorEdge.cz + 1) * S; rotY = Math.PI;       break;
            case "west":  x = floorEdge.cx * S;       rotY = QUARTER_TURN;  break;
            case "east":  x = (floorEdge.cx + 1) * S; rotY = -QUARTER_TURN; break;
        }

        this.ghostMesh.position.set(x, 0, z);
        this.ghostMesh.rotation.y = rotY;
        this.ghostMesh.visible = true;
    }
}


class DecorEraseTool extends CellEraseTool
{
    findTarget(cell)
    {
        const decorList = this.editor.findDecorAtCell(cell.cx, cell.cz);
        if(decorList.length > 0) { return decorList[0]; }

        // Cell-targeted erase can't read the edge under the cursor, so it
        // falls back to scanning all four sides. First match wins — corner
        // cells holding two wall-decor pieces always erase the NSEW-first
        // hit rather than the side the cursor was on.
        for(const side of ["north", "south", "east", "west"])
        {
            const wd = this.editor.findWallDecorAtEdge({ cx: cell.cx, cz: cell.cz, side });
            if(wd) { return wd; }
        }
        return null;
    }

    commitRemove(target)
    {
        this.editor.removeDecor(target);
    }
}


export { DecorPlaceTool, DecorEraseTool, WallDecorPlaceTool };
