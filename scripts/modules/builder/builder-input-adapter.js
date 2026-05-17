import * as THREE from "three";

import { NoopTool } from "./tools/minion-tools.js";


/******************************************************************************/
/* BUILDER INPUT ADAPTER                                                      */
/******************************************************************************/

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Below this pixel-distance a right-button press counts as a click (cancel
// the active tool). Above it the user is orbiting the camera — leave the
// tool alone.
const RIGHT_CLICK_DRAG_THRESHOLD = 4;


class BuilderInputAdapter
{
    constructor({ input, scene, grid, canvas, getWallEntities, editor, isTextInputFocused, onCancel })
    {
        this.input = input;
        this.scene = scene;
        this.grid = grid;
        this.canvas = canvas;
        this.getWallEntities = getWallEntities || (() => []);
        this.editor = editor;
        this.isTextInputFocused = isTextInputFocused || (() => false);
        this.onCancel = onCancel || (() => {});

        this.camera = null;
        this.tool = new NoopTool();

        this.raycaster = new THREE.Raycaster();
        this.ndc = new THREE.Vector2();

        this.installed = false;
        this.rightDownAt = null;

        this.pointerMoveHandler = event => this.onPointerMove(event);
        this.pointerDownHandler = event => this.onPointerDown(event);
        this.pointerUpHandler = event => this.onPointerUp(event);
        this.keydownHandler = event => this.onKeyDown(event);
    }


    /* PUBLIC API *************************************************************/

    setCamera(camera)
    {
        this.camera = camera;
    }

    setTool(tool)
    {
        const next = tool || new NoopTool();
        if(this.tool) { this.tool.deactivate(); }
        this.tool = next;
        this.tool.activate(this.editor, this.scene);
    }

    install()
    {
        if(this.installed) { return; }
        this.installed = true;
        this.input.on("pointermove", this.pointerMoveHandler);
        this.input.on("pointerdown", this.pointerDownHandler);
        this.input.on("pointerup", this.pointerUpHandler);
        this.input.on("keydown", this.keydownHandler);
    }

    uninstall()
    {
        if(!this.installed) { return; }
        this.installed = false;
        this.input.off("pointermove", this.pointerMoveHandler);
        this.input.off("pointerdown", this.pointerDownHandler);
        this.input.off("pointerup", this.pointerUpHandler);
        this.input.off("keydown", this.keydownHandler);
        this.rightDownAt = null;
        this.setTool(new NoopTool());
    }


    /* HANDLERS ***************************************************************/

    onPointerMove(event)
    {
        if(!this.camera) { return; }
        if(!this.isOverCanvas(event)) { return; }

        if(this.tool.targetType === "wallEdge")
        {
            const edge = this.screenToWallEdge(event);
            if(edge) { this.tool.onWallEdgeHover(edge); }
        }
        else if(this.tool.targetType === "cell")
        {
            const cell = this.screenToCell(event);
            if(cell) { this.tool.onCellHover(cell); }
        }
    }

    onPointerDown(event)
    {
        if(!this.camera) { return; }
        if(!this.isOverCanvas(event)) { return; }

        const buttonName = this.buttonNameFor(event.button);

        if(buttonName === "right")
        {
            this.rightDownAt = { x: event.x, y: event.y };
            return;
        }

        if(buttonName !== "left") { return; }

        if(this.tool.targetType === "wallEdge")
        {
            const edge = this.screenToWallEdge(event);
            if(edge) { this.tool.onWallEdgeClick(edge, buttonName); }
        }
        else if(this.tool.targetType === "cell")
        {
            const cell = this.screenToCell(event);
            if(cell) { this.tool.onCellClick(cell, buttonName); }
        }
        else if(this.tool.targetType === "entity")
        {
            // A null hit (clicking empty floor) still routes through —
            // the tool treats it as a deselect signal.
            const entity = this.screenToEntity(event);
            this.tool.onEntityClick(entity, buttonName);
        }
    }

    onPointerUp(event)
    {
        if(this.buttonNameFor(event.button) !== "right") { return; }
        if(!this.rightDownAt) { return; }

        const dx = event.x - this.rightDownAt.x;
        const dy = event.y - this.rightDownAt.y;
        const distance = Math.hypot(dx, dy);
        this.rightDownAt = null;

        if(distance > RIGHT_CLICK_DRAG_THRESHOLD) { return; }

        this.setTool(new NoopTool());
        this.onCancel();
    }

    onKeyDown(event)
    {
        if(this.isTextInputFocused()) { return; }
        if(event.code === "KeyQ" && !event.repeat) { this.tool.rotate("ccw"); }
        else if(event.code === "KeyE" && !event.repeat) { this.tool.rotate("cw"); }
        else if(event.code === "Escape" && !event.repeat)
        {
            this.setTool(new NoopTool());
            this.onCancel();
        }
        else if(this.tool.targetType === "entity" && typeof this.tool.nudge === "function")
        {
            // Arrow keys nudge by 1m. up=+Z, down=-Z, left=-X, right=+X —
            // matches floor-plan compass since builder camera looks down.
            // event.repeat is allowed so held arrows step cell-by-cell.
            if(event.code === "ArrowUp") { this.tool.nudge( 0,  1); }
            else if(event.code === "ArrowDown") { this.tool.nudge( 0, -1); }
            else if(event.code === "ArrowLeft") { this.tool.nudge(-1,  0); }
            else if(event.code === "ArrowRight") { this.tool.nudge( 1,  0); }
        }
    }


    /* RAYCASTING *************************************************************/

    screenToCell(event)
    {
        if(!this.setRaycastFromEvent(event)) { return null; }

        const hit = new THREE.Vector3();
        const intersected = this.raycaster.ray.intersectPlane(FLOOR_PLANE, hit);

        if(!intersected) { return null; }

        const cell = this.grid.worldToCell(hit.x, hit.z);
        if(!this.grid.isInBounds(cell.cx, cell.cz)) { return null; }
        
        return cell;
    }

    screenToWallEdge(event)
    {
        if(!this.setRaycastFromEvent(event)) { return null; }

        const wallHit = this.raycastWallEntity();
        if(wallHit) { return wallHit; }

        return this.raycastNearestCellEdge();
    }

    screenToEntity(event)
    {
        if(!this.setRaycastFromEvent(event)) { return null; }
        if(!this.scene) { return null; }

        const hits = this.raycaster.intersectObjects(this.scene.children, true);
        for(const hit of hits)
        {
            let node = hit.object;
            while(node)
            {
                if(node.userData && node.userData.entity) { return node.userData.entity; }
                node = node.parent;
            }
        }
        return null;
    }

    raycastWallEntity()
    {
        const entities = this.getWallEntities();
        if(entities.length === 0) { return null; }

        const owners = new Map();
        const roots = [];

        for(const entity of entities)
        {
            roots.push(entity.object3D);
            entity.object3D.traverse(node => owners.set(node, entity));
        }

        const hits = this.raycaster.intersectObjects(roots, true);
        if(hits.length === 0) { return null; }

        let node = hits[0].object;
        let entity = null;
        while(node && !entity)
        {
            entity = owners.get(node);
            node = node.parent;
        }
        if(!entity) { return null; }

        const placement = this.findEdgePlacement(entity);
        if(!placement) { return null; }
        return { cx: placement.cx, cz: placement.cz, side: placement.side };
    }

    raycastNearestCellEdge()
    {
        const hit = new THREE.Vector3();
        if(!this.raycaster.ray.intersectPlane(FLOOR_PLANE, hit)) { return null; }

        const cell = this.grid.worldToCell(hit.x, hit.z);
        if(!this.grid.isInBounds(cell.cx, cell.cz)) { return null; }

        const S = this.grid.cellSize;
        const localX = hit.x - cell.cx * S;
        const localZ = hit.z - cell.cz * S;

        const distSouth = localZ;
        const distNorth = S - localZ;
        const distWest = localX;
        const distEast = S - localX;

        const min = Math.min(distSouth, distNorth, distWest, distEast);
        let side;
        if(min === distSouth) { side = "south"; }
        else if(min === distNorth) { side = "north"; }
        else if(min === distWest) { side = "west"; }
        else { side = "east"; }

        return { cx: cell.cx, cz: cell.cz, side };
    }

    setRaycastFromEvent(event)
    {
        if(!this.camera || !this.canvas) { return false; }
        const rect = this.canvas.getBoundingClientRect();
        if(rect.width <= 0 || rect.height <= 0) { return false; }
        this.ndc.x = ((event.x - rect.left) / rect.width) * 2 - 1;
        this.ndc.y = -((event.y - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.ndc, this.camera);
        return true;
    }


    /* HELPERS ****************************************************************/

    isOverCanvas(event)
    {
        if(!event.target) { return true; }
        return event.target === this.canvas;
    }

    buttonNameFor(button)
    {
        if(button === 0) { return "left"; }
        if(button === 2) { return "right"; }
        return null;
    }

    findEdgePlacement(entity)
    {
        for(const component of entity.components.values())
        {
            if(component
                && typeof component.cx === "number"
                && typeof component.cz === "number"
                && typeof component.side === "string")
            {
                return component;
            }
        }
        return null;
    }
}

export { BuilderInputAdapter };
