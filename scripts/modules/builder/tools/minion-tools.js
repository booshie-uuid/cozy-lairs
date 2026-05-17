import * as THREE from "three";

import { Tool, CellPlaceTool, CellEraseTool, TINT_VALID, GHOST_OPACITY } from "./tool.js";

import { Walker } from "../../world/components/walker.js";


/******************************************************************************/
/* MINION SPAWN / ERASE TOOLS                                                 */
/******************************************************************************/

const PLACEHOLDER_RADIUS = 0.6;
const PLACEHOLDER_HEIGHT = 1.8;
const PLACEHOLDER_SEGMENTS = 12;


class MinionSpawnTool extends CellPlaceTool
{
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

    validate(cell)
    {
        return this.editor.canSpawnMinion(this.kind, cell.cx, cell.cz);
    }

    positionGhost(cell)
    {
        this.positionGhostAtCell(cell.cx, cell.cz);
        // Placeholder cylinder is centred at its midpoint — lift to stand
        // on the floor regardless of the cell's surface offset.
        this.ghostMesh.position.y = PLACEHOLDER_HEIGHT / 2;
    }

    commit(cell)
    {
        this.editor.spawnMinion(this.kind, cell.cx, cell.cz);
    }
}


class MinionEraseTool extends CellEraseTool
{
    findTarget(cell)
    {
        const grid = this.editor.world.grid;
        const occupant = grid.getOccupant(cell.cx, cell.cz);
        if(occupant && typeof occupant.getComponent === "function" && occupant.getComponent(Walker))
        {
            return occupant;
        }
        // Walker isn't always the grid occupant mid-step.
        for(const entity of this.editor.world.entities)
        {
            if(!entity.getComponent(Walker)) { continue; }
            const physical = grid.worldToCell(entity.object3D.position.x, entity.object3D.position.z);
            if(physical.cx === cell.cx && physical.cz === cell.cz) { return entity; }
        }
        return null;
    }

    commitRemove(target)
    {
        this.editor.removeMinion(target);
    }
}


class NoopTool extends Tool
{
    constructor()
    {
        super();
        this.targetType = "none";
    }
}


export { MinionSpawnTool, MinionEraseTool, NoopTool };
