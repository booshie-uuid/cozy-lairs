import * as THREE from "three";

import { Tool, TINT_VALID, TINT_INVALID, TINT_REMOVE } from "./tool.js";


/******************************************************************************/
/* BLOCK PLACE / ERASE TOOLS                                                  */
/******************************************************************************/

const GHOST_OPACITY = 0.5;


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


class BlockPlaceTool extends Tool
{
    constructor({ kind })
    {
        super();
        this.kind = kind;
    }

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

    onCellHover(cell)
    {
        this.hoverCell = cell;
        const valid = this.editor.canPlaceBlock(this.kind, cell.cx, cell.cz);

        this.positionGhostAtCell(cell.cx, cell.cz);
        this.ghostMesh.position.y = 0;

        this.setGhostTint(valid);
    }

    onCellClick(cell, button)
    {
        if(button !== "left") { return; }
        this.editor.placeBlock(this.kind, cell.cx, cell.cz);
    }
}


class BlockEraseTool extends Tool
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
        const target = this.editor.findBlockAtCell(cell.cx, cell.cz);

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
        const target = this.editor.findBlockAtCell(cell.cx, cell.cz);
        if(!target) { return; }
        this.editor.removeBlock(target);
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


export { BlockPlaceTool, BlockEraseTool };
