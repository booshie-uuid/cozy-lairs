import * as THREE from "three";

import { Tool, TINT_VALID, TINT_INVALID, TINT_REMOVE } from "./tool.js";


/******************************************************************************/
/* DECOR PLACE / ERASE + WALL DECOR PLACE TOOLS                               */
/******************************************************************************/

const GHOST_OPACITY = 0.5;

const QUARTER_TURN = Math.PI / 2;


function makeTranslucent(mesh, colour)
{
    mesh.traverse(node =>
    {
        if(node.isMesh && node.material)
        {
            const cloned = node.material.clone();
            cloned.transparent = true;
            cloned.opacity = GHOST_OPACITY;
            cloned.depthWrite = false;
            if(cloned.color) { cloned.color.setHex(colour); }
            node.material = cloned;
        }
    });
}


class DecorPlaceTool extends Tool
{
    constructor({ kind })
    {
        super();
        this.kind = kind;
        this.rotationStep = 0;
    }

    buildGhost()
    {
        const mesh = this.editor.assets.get(this.kind);
        makeTranslucent(mesh, TINT_VALID);
        mesh.rotation.y = this.rotationStep * QUARTER_TURN;
        return mesh;
    }

    onCellHover(cell)
    {
        this.hoverCell = cell;
        const valid = this.editor.canPlaceDecor(this.kind, cell.cx, cell.cz);
        this.positionGhostAtCell(cell.cx, cell.cz);
        this.setGhostTint(valid);
    }

    onCellClick(cell, button)
    {
        if(button !== "left") { return; }
        this.editor.placeDecor(this.kind, cell.cx, cell.cz, this.rotationStep);
    }

    rotate(direction)
    {
        if(direction === "cw")       { this.rotationStep = (this.rotationStep + 1) % 4; }
        else if(direction === "ccw") { this.rotationStep = (this.rotationStep + 3) % 4; }

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
        this.hoverEdge = edge;
        
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

    rotate(direction)
    {
        if(direction === "cw")       { this.rotationStep = (this.rotationStep + 1) % 4; }
        else if(direction === "ccw") { this.rotationStep = (this.rotationStep + 3) % 4; }
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
            case "south": z = floorEdge.cz * S;       rotY = 0;            break;
            case "north": z = (floorEdge.cz + 1) * S; rotY = Math.PI;      break;
            case "west":  x = floorEdge.cx * S;       rotY = Math.PI / 2;  break;
            case "east":  x = (floorEdge.cx + 1) * S; rotY = -Math.PI / 2; break;
        }

        this.ghostMesh.position.set(x, 0, z);
        this.ghostMesh.rotation.y = rotY;
        this.ghostMesh.visible = true;
    }
}


class DecorEraseTool extends Tool
{
    buildGhost()
    {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ color: TINT_REMOVE });
        const lines = new THREE.LineSegments(edges, material);
        geometry.dispose();
        return lines;
    }

    onCellHover(cell)
    {
        this.hoverCell = cell;
        const target = this.findDecorTarget(cell);
        if(!target)
        {
            if(this.ghostMesh) { this.ghostMesh.visible = false; }
            return;
        }
        this.snapToEntity(target);
    }

    onCellClick(cell, button)
    {
        if(button !== "left") { return; }
        const target = this.findDecorTarget(cell);
        if(!target) { return; }
        this.editor.removeDecor(target);
    }

    findDecorTarget(cell)
    {
        const decorList = this.editor.findDecorAtCell(cell.cx, cell.cz);
        if(decorList.length > 0) { return decorList[0]; }

        for(const side of ["north", "south", "east", "west"])
        {
            const wd = this.editor.findWallDecorAtEdge({ cx: cell.cx, cz: cell.cz, side });
            if(wd) { return wd; }
        }
        return null;
    }

    snapToEntity(entity)
    {
        if(!this.ghostMesh) { return; }
        const bbox = new THREE.Box3().setFromObject(entity.object3D);
        const size = new THREE.Vector3();
        const centre = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(centre);
        size.x = Math.max(size.x, 0.1);
        size.y = Math.max(size.y, 0.1);
        size.z = Math.max(size.z, 0.1);
        this.ghostMesh.scale.copy(size);
        this.ghostMesh.position.copy(centre);
        this.ghostMesh.visible = true;
    }
}


export { DecorPlaceTool, DecorEraseTool, WallDecorPlaceTool };
