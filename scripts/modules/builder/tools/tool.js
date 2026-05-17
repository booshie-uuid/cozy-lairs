import * as THREE from "three";


/******************************************************************************/
/* TOOL — BASE CLASS                                                          */
/******************************************************************************/

const TINT_VALID   = 0x5af0a0;
const TINT_REMOVE  = 0xffaa33;
const TINT_INVALID = 0xff4565;

// KayKit floor_tile_large is 0.15m tall — ghost sits above it.
const GHOST_Y = 0.18;

// Mesh-ghost translucency for place tools (block / decor / minion).
const GHOST_OPACITY = 0.5;

// Floor overlay reads brighter at full GHOST_OPACITY because it's a flat
// plane parallel to the ground — slightly lower opacity keeps it readable.
const FLOOR_OVERLAY_OPACITY = 0.45;


// Clone every material on the mesh, force translucency + colour tint, and
// stop depthWrite so the ghost layers cleanly on top of geometry behind it.
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


class Tool
{
    constructor()
    {
        this.editor = null;
        this.scene = null;
        this.ghostMesh = null;
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
    }


    /* DEFAULT HOOK STUBS *****************************************************/

    onCellHover(_cell) {}
    onCellClick(_cell, _button) {}
    onWallEdgeHover(_edge) {}
    onWallEdgeClick(_edge, _button) {}
    rotate(_direction) {}


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

/******************************************************************************/
/* PLACE TOOL — CELL-TARGETED BASE                                            */
/******************************************************************************/

// Shared base for tools that drop something on a single cell.
// Subclasses provide the four hooks: `buildGhost`, `validate(cell)`,
// `positionGhost(cell)`, `commit(cell)`. Optional flags `supportsRotation`
// and `onRotationChanged()` enable Q/E.

class CellPlaceTool extends Tool
{
    constructor({ kind, consumePickup = null } = {})
    {
        super();
        this.kind = kind;
        this.consumePickup = consumePickup;
        this.rotationStep = 0;
    }

    get supportsRotation() { return false; }

    onCellHover(cell)
    {
        const valid = this.validate(cell);
        this.positionGhost(cell);
        this.setGhostTint(valid);
    }

    onCellClick(cell, button)
    {
        if(button !== "left") { return; }
        if(this.consumePickup && this.consumePickup(this.kind, cell.cx, cell.cz)) { return; }
        this.commit(cell);
    }

    rotate(direction)
    {
        if(!this.supportsRotation) { return; }
        this.rotationStep = rotateStep(this.rotationStep, direction);
        this.onRotationChanged();
    }

    onRotationChanged() {}

    /* Subclass hooks (no defaults — must override) ***************************/

    validate(_cell) { return false; }
    positionGhost(_cell) {}
    commit(_cell) {}
}


// Q/E rotation modulus shared by every place tool that supports rotation.
function rotateStep(step, direction)
{
    if(direction === "cw") { return (step + 1) % 4; }
    if(direction === "ccw") { return (step + 3) % 4; }
    return step;
}


/******************************************************************************/
/* ERASE TOOL — CELL-TARGETED BASE                                            */
/******************************************************************************/

// Wireframe-box ghost that snaps to the bounding box of whatever target
// the subclass identifies under the cursor. Subclasses provide
// `findTarget(cell)` and `commitRemove(target)`.

const SNAP_MIN_DIMENSION = 0.1;


class CellEraseTool extends Tool
{
    buildGhost()
    {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const edges    = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ color: TINT_REMOVE });
        const lines    = new THREE.LineSegments(edges, material);

        geometry.dispose();
        return lines;
    }

    onCellHover(cell)
    {
        const target = this.findTarget(cell);
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
        const target = this.findTarget(cell);
        if(!target) { return; }
        this.commitRemove(target);
    }

    snapToEntity(entity)
    {
        if(!this.ghostMesh) { return; }

        const bbox   = new THREE.Box3().setFromObject(entity.object3D);
        const size   = new THREE.Vector3();
        const centre = new THREE.Vector3();

        bbox.getSize(size);
        bbox.getCenter(centre);

        size.x = Math.max(size.x, SNAP_MIN_DIMENSION);
        size.y = Math.max(size.y, SNAP_MIN_DIMENSION);
        size.z = Math.max(size.z, SNAP_MIN_DIMENSION);

        this.ghostMesh.scale.copy(size);
        this.ghostMesh.position.copy(centre);
        this.ghostMesh.visible = true;
    }

    /* Subclass hooks (must override) *****************************************/

    findTarget(_cell) { return null; }
    commitRemove(_target) {}
}


export
{
    Tool,
    CellPlaceTool,
    CellEraseTool,
    TINT_VALID,
    TINT_INVALID,
    TINT_REMOVE,
    GHOST_OPACITY,
    FLOOR_OVERLAY_OPACITY,
    makeTranslucent,
    rotateStep
};
