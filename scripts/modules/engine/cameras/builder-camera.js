import * as THREE from "three";

import { CameraController } from "./camera-controller.js";


/******************************************************************************/
/* BUILDER CAMERA                                                             */
/******************************************************************************/

/*
 * Orbit / pan / zoom camera anchored to a focus point on the floor plane.
 *
 *   left-mouse drag   — drag-pan via floor raycast (cursor stays anchored)
 *   right-mouse drag  — orbit (yaw + pitch around focus)
 *   wheel             — zoom (focus distance)
 *   W A S D           — pan focus along camera-relative XZ plane
 *
 * Current and target state are split: input writes targets, `frameUpdate`
 * lerps current toward target so motion is smooth regardless of input
 * cadence. Drag-pan bypasses damping (sets both directly) so the cursor
 * stays rigidly anchored to its initial floor hit.
 */

const ORBIT_BUTTON = 2;
const PAN_BUTTON = 0;
const DAMPING = 0.18;
const KEY_PAN_SPEED = 8;
const ORBIT_SPEED = 0.003;
const PAN_DRAG_SPEED = 0.0025;
const ZOOM_SPEED = 0.0015;
const PHI_MIN = 0.18;
const PHI_MAX = Math.PI / 2 - 0.05;

const WORLD_UP = new THREE.Vector3(0, 1, 0);


class BuilderCamera extends CameraController
{
    constructor(input, options = {})
    {
        super();
        this.input = input;

        const focus = options.initialFocus || new THREE.Vector3(0, 0, 0);
        const distance = options.initialDistance || 12;

        this.minDistance = options.minDistance || 4;
        this.maxDistance = options.maxDistance || 60;

        this.focus = focus.clone();
        this.targetFocus = focus.clone();

        this.theta = options.initialTheta !== undefined ? options.initialTheta : Math.PI * 0.25;
        this.phi   = options.initialPhi   !== undefined ? options.initialPhi   : Math.PI * 0.32;
        this.distance = distance;

        this.targetTheta = this.theta;
        this.targetPhi = this.phi;
        this.targetDistance = this.distance;

        this.panEnabled = true;

        this.draggingButton = -1;

        this.tmpForward = new THREE.Vector3();
        this.tmpRight = new THREE.Vector3();

        this.raycaster = new THREE.Raycaster();
        this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.ndc = new THREE.Vector2();
        this.hit = new THREE.Vector3();
        this.dragAnchor = new THREE.Vector3();

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
        this.applyTransform();

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
    }

    activate()
    {
        this.input.on("pointerdown", this.onPointerDown);
        this.input.on("pointermove", this.onPointerMove);
        this.input.on("pointerup",   this.onPointerUp);
        this.input.on("wheel",       this.onWheel);
    }

    deactivate()
    {
        this.input.off("pointerdown", this.onPointerDown);
        this.input.off("pointermove", this.onPointerMove);
        this.input.off("pointerup",   this.onPointerUp);
        this.input.off("wheel",       this.onWheel);
        this.draggingButton = -1;
    }

    fixedUpdate(dt)
    {
        const input = this.input;
        let forwardInput = 0;
        let rightInput   = 0;

        if(input.isDown("KeyW")) { forwardInput += 1; }
        if(input.isDown("KeyS")) { forwardInput -= 1; }
        if(input.isDown("KeyD")) { rightInput   += 1; }
        if(input.isDown("KeyA")) { rightInput   -= 1; }

        if(forwardInput === 0 && rightInput === 0) { return; }

        const length = Math.sqrt(forwardInput * forwardInput + rightInput * rightInput);
        forwardInput /= length;
        rightInput   /= length;

        const distScale = THREE.MathUtils.clamp(this.distance / 12, 0.5, 3.0);
        const speed = KEY_PAN_SPEED * dt * distScale;
        this.panFocusByCameraRelative(forwardInput * speed, rightInput * speed);
    }

    frameUpdate(_alpha)
    {
        this.theta    = THREE.MathUtils.lerp(this.theta,    this.targetTheta,    DAMPING);
        this.phi      = THREE.MathUtils.lerp(this.phi,      this.targetPhi,      DAMPING);
        this.distance = THREE.MathUtils.lerp(this.distance, this.targetDistance, DAMPING);
        this.focus.lerp(this.targetFocus, DAMPING);

        this.applyTransform();
    }


    /* HANDLERS ***************************************************************/

    onPointerDown(event)
    {
        if(this.draggingButton !== -1) { return; }
        if(event.target && event.target.tagName !== "CANVAS") { return; }
        if(event.button === ORBIT_BUTTON)
        {
            this.draggingButton = ORBIT_BUTTON;
        }
        else if(event.button === PAN_BUTTON && this.panEnabled)
        {
            if(this.raycastFloor(event.x, event.y, this.dragAnchor))
            {
                this.draggingButton = PAN_BUTTON;
            }
        }
    }

    setPanEnabled(enabled)
    {
        this.panEnabled = enabled;
    }

    onPointerMove(event)
    {
        if(this.draggingButton !== -1 && !this.isDragButtonHeld(event.buttons))
        {
            this.draggingButton = -1;
            return;
        }

        if(this.draggingButton === ORBIT_BUTTON)
        {
            this.targetTheta -= event.dx * ORBIT_SPEED;
            this.targetPhi = THREE.MathUtils.clamp(
                this.targetPhi - event.dy * ORBIT_SPEED,
                PHI_MIN,
                PHI_MAX
            );
        }
        else if(this.draggingButton === PAN_BUTTON)
        {
            if(this.raycastFloor(event.x, event.y, this.hit))
            {
                const dx = this.dragAnchor.x - this.hit.x;
                const dz = this.dragAnchor.z - this.hit.z;
                this.focus.x       += dx;
                this.focus.z       += dz;
                this.targetFocus.x += dx;
                this.targetFocus.z += dz;
                this.applyTransform();
            }
        }
    }

    onPointerUp(event)
    {
        if(event.button === this.draggingButton)
        {
            this.draggingButton = -1;
            return;
        }
        if(this.draggingButton !== -1 && !this.isDragButtonHeld(event.buttons))
        {
            this.draggingButton = -1;
        }
    }

    isDragButtonHeld(buttons)
    {
        if(this.draggingButton === PAN_BUTTON)   { return (buttons & 1) !== 0; }
        if(this.draggingButton === ORBIT_BUTTON) { return (buttons & 2) !== 0; }
        return false;
    }

    onWheel(event)
    {
        /* Wheel events fire on the document. Ignore those that originated
         * inside chrome (catalogue scroll, dev console scroll, etc.) — same
         * canvas-target guard `onPointerDown` uses. Without this, scrolling
         * the catalogue also zooms the world. */
        if(event.target && event.target.tagName !== "CANVAS") { return; }

        this.targetDistance = THREE.MathUtils.clamp(
            this.targetDistance * (1 + event.deltaY * ZOOM_SPEED),
            this.minDistance,
            this.maxDistance
        );
    }


    /* INTERNAL ***************************************************************/

    raycastFloor(clientX, clientY, out)
    {
        this.ndc.x =  (clientX / window.innerWidth)  * 2 - 1;
        this.ndc.y = -(clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.ndc, this.camera);
        return this.raycaster.ray.intersectPlane(this.floorPlane, out) !== null;
    }

    panFocusByCameraRelative(forwardAmount, rightAmount)
    {
        this.camera.getWorldDirection(this.tmpForward);
        this.tmpForward.y = 0;
        this.tmpForward.normalize();

        this.tmpRight.crossVectors(this.tmpForward, WORLD_UP).normalize();

        this.targetFocus.addScaledVector(this.tmpForward, forwardAmount);
        this.targetFocus.addScaledVector(this.tmpRight,   rightAmount);
    }

    applyTransform()
    {
        const sinPhi = Math.sin(this.phi);
        const cosPhi = Math.cos(this.phi);

        this.camera.position.set(
            this.focus.x + this.distance * sinPhi * Math.cos(this.theta),
            this.focus.y + this.distance * cosPhi,
            this.focus.z + this.distance * sinPhi * Math.sin(this.theta)
        );
        this.camera.lookAt(this.focus);
    }
}

export { BuilderCamera };
