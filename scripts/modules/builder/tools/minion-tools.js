import * as THREE from "three";

import { Tool, TINT_VALID, TINT_INVALID, TINT_REMOVE } from "./tool.js";

import { Walker } from "../../world/components/walker.js";


/******************************************************************************/
/* MINION SPAWN / ERASE TOOLS                                                 */
/******************************************************************************/

const GHOST_OPACITY = 0.5;

const PLACEHOLDER_RADIUS = 0.6;
const PLACEHOLDER_HEIGHT = 1.8;
const PLACEHOLDER_SEGMENTS = 12;


class MinionSpawnTool extends Tool
{
    constructor({ kind })
    {
        super();
        this.kind = kind;
    }

    buildGhost()
    {
        const geometry = new THREE.CylinderGeometry(
            PLACEHOLDER_RADIUS, PLACEHOLDER_RADIUS, PLACEHOLDER_HEIGHT, PLACEHOLDER_SEGMENTS
        );
        const material = new THREE.MeshBasicMaterial({
            color:        TINT_VALID,
            transparent:  true,
            opacity:      GHOST_OPACITY,
            depthWrite:   false
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = PLACEHOLDER_HEIGHT / 2;
        return mesh;
    }

    onCellHover(cell)
    {
        this.hoverCell = cell;
        const valid = this.editor.canSpawnMinion(this.kind, cell.cx, cell.cz);
        this.positionGhostAtCell(cell.cx, cell.cz);
        this.ghostMesh.position.y = PLACEHOLDER_HEIGHT / 2;
        this.setGhostTint(valid);
    }

    onCellClick(cell, button)
    {
        if(button !== "left") { return; }
        this.editor.spawnMinion(this.kind, cell.cx, cell.cz);
    }
}


class MinionEraseTool extends Tool
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
        const target = this.findMinionAtCell(cell.cx, cell.cz);
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
        const target = this.findMinionAtCell(cell.cx, cell.cz);
        if(!target) { return; }
        this.editor.removeMinion(target);
    }

    findMinionAtCell(cx, cz)
    {
        const grid = this.editor.world.grid;
        const occupant = grid.getOccupant(cx, cz);
        if(occupant && typeof occupant.getComponent === "function" && occupant.getComponent(Walker))
        {
            return occupant;
        }
        // Walker isn't always the grid occupant mid-step.
        for(const entity of this.editor.world.entities)
        {
            if(!entity.getComponent(Walker)) { continue; }
            const physical = grid.worldToCell(entity.object3D.position.x, entity.object3D.position.z);
            if(physical.cx === cx && physical.cz === cz) { return entity; }
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


class NoopTool extends Tool
{
    constructor()
    {
        super();
        this.targetType = "none";
    }
    buildGhost() { return null; }
}


export { MinionSpawnTool, MinionEraseTool, NoopTool };
