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

const ORBIT_BUTTON   = 2;
const PAN_BUTTON     = 0;
const DAMPING        = 0.18;
const KEY_PAN_SPEED  = 8;
const ORBIT_SPEED    = 0.003;
const PAN_DRAG_SPEED = 0.0025;
const ZOOM_SPEED     = 0.0015;
const PHI_MIN        = 0.18;
const PHI_MAX        = Math.PI / 2 - 0.05;

const WORLD_UP = new THREE.Vector3(0, 1, 0);


class BuilderCamera extends CameraController
{
    constructor(input, options = {})
    {
        super();
        this.input = input;

        const focus    = options.initialFocus    || new THREE.Vector3(0, 0, 0);
        const distance = options.initialDistance || 12;

        this.minDistance = options.minDistance || 4;
        this.maxDistance = options.maxDistance || 60;

        this._focus       = focus.clone();
        this._targetFocus = focus.clone();

        this._theta       = Math.PI * 0.25;
        this._phi         = Math.PI * 0.32;
        this._distance    = distance;

        this._targetTheta    = this._theta;
        this._targetPhi      = this._phi;
        this._targetDistance = this._distance;

        this._draggingButton = -1;

        this._tmpForward = new THREE.Vector3();
        this._tmpRight   = new THREE.Vector3();

        this._raycaster  = new THREE.Raycaster();
        this._floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._ndc        = new THREE.Vector2();
        this._hit        = new THREE.Vector3();
        this._dragAnchor = new THREE.Vector3();

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
        this._applyTransform();

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp   = this._onPointerUp.bind(this);
        this._onWheel       = this._onWheel.bind(this);
    }

    activate()
    {
        this.input.on("pointerdown", this._onPointerDown);
        this.input.on("pointermove", this._onPointerMove);
        this.input.on("pointerup",   this._onPointerUp);
        this.input.on("wheel",       this._onWheel);
    }

    deactivate()
    {
        this.input.off("pointerdown", this._onPointerDown);
        this.input.off("pointermove", this._onPointerMove);
        this.input.off("pointerup",   this._onPointerUp);
        this.input.off("wheel",       this._onWheel);
        this._draggingButton = -1;
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

        const distScale = THREE.MathUtils.clamp(this._distance / 12, 0.5, 3.0);
        const speed     = KEY_PAN_SPEED * dt * distScale;
        this._panFocusByCameraRelative(forwardInput * speed, rightInput * speed);
    }

    frameUpdate(_alpha)
    {
        this._theta    = THREE.MathUtils.lerp(this._theta,    this._targetTheta,    DAMPING);
        this._phi      = THREE.MathUtils.lerp(this._phi,      this._targetPhi,      DAMPING);
        this._distance = THREE.MathUtils.lerp(this._distance, this._targetDistance, DAMPING);
        this._focus.lerp(this._targetFocus, DAMPING);

        this._applyTransform();
    }


    /* HANDLERS ***************************************************************/

    _onPointerDown(event)
    {
        if(this._draggingButton !== -1) { return; }
        if(event.button === ORBIT_BUTTON)
        {
            this._draggingButton = ORBIT_BUTTON;
        }
        else if(event.button === PAN_BUTTON)
        {
            if(this._raycastFloor(event.x, event.y, this._dragAnchor))
            {
                this._draggingButton = PAN_BUTTON;
            }
        }
    }

    _onPointerMove(event)
    {
        if(this._draggingButton === ORBIT_BUTTON)
        {
            this._targetTheta -= event.dx * ORBIT_SPEED;
            this._targetPhi   = THREE.MathUtils.clamp(
                this._targetPhi - event.dy * ORBIT_SPEED,
                PHI_MIN,
                PHI_MAX
            );
        }
        else if(this._draggingButton === PAN_BUTTON)
        {
            if(this._raycastFloor(event.x, event.y, this._hit))
            {
                const dx = this._dragAnchor.x - this._hit.x;
                const dz = this._dragAnchor.z - this._hit.z;
                this._focus.x       += dx;
                this._focus.z       += dz;
                this._targetFocus.x += dx;
                this._targetFocus.z += dz;
                this._applyTransform();
            }
        }
    }

    _onPointerUp(event)
    {
        if(event.button === this._draggingButton)
        {
            this._draggingButton = -1;
        }
    }

    _onWheel(event)
    {
        this._targetDistance = THREE.MathUtils.clamp(
            this._targetDistance * (1 + event.deltaY * ZOOM_SPEED),
            this.minDistance,
            this.maxDistance
        );
    }


    /* INTERNAL ***************************************************************/

    _raycastFloor(clientX, clientY, out)
    {
        this._ndc.x =  (clientX / window.innerWidth)  * 2 - 1;
        this._ndc.y = -(clientY / window.innerHeight) * 2 + 1;
        this._raycaster.setFromCamera(this._ndc, this.camera);
        return this._raycaster.ray.intersectPlane(this._floorPlane, out) !== null;
    }

    _panFocusByCameraRelative(forwardAmount, rightAmount)
    {
        this.camera.getWorldDirection(this._tmpForward);
        this._tmpForward.y = 0;
        this._tmpForward.normalize();

        this._tmpRight.crossVectors(this._tmpForward, WORLD_UP).normalize();

        this._targetFocus.addScaledVector(this._tmpForward, forwardAmount);
        this._targetFocus.addScaledVector(this._tmpRight,   rightAmount);
    }

    _applyTransform()
    {
        const sinPhi = Math.sin(this._phi);
        const cosPhi = Math.cos(this._phi);

        this.camera.position.set(
            this._focus.x + this._distance * sinPhi * Math.cos(this._theta),
            this._focus.y + this._distance * cosPhi,
            this._focus.z + this._distance * sinPhi * Math.sin(this._theta)
        );
        this.camera.lookAt(this._focus);
    }
}

export { BuilderCamera };
