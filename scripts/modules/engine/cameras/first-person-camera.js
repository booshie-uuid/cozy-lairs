import * as THREE from "three";

import { CameraController } from "./camera-controller.js";


/******************************************************************************/
/* FIRST PERSON CAMERA                                                        */
/******************************************************************************/

/*
 * Floor-locked first-person walker. Right-mouse-hold engages mouse-look via
 * Pointer Lock; WASD walks on the XZ plane at fixed eye height. The browser
 * may release the lock unilaterally (Escape, focus loss) — `pointerlockchange`
 * keeps internal state in sync when it does.
 */

const DEFAULT_EYE_HEIGHT  = 1.7;
const DEFAULT_WALK_SPEED  = 4;
const LOOK_SENSITIVITY    = 0.0025;
const PITCH_LIMIT         = Math.PI / 2 - 0.05;
const LOOK_BUTTON         = 2;


class FirstPersonCamera extends CameraController
{
    constructor(input, options = {})
    {
        super();
        this.input      = input;
        this.lockTarget = options.lockTarget || null;
        this.eyeHeight  = options.eyeHeight  || DEFAULT_EYE_HEIGHT;
        this.walkSpeed  = options.walkSpeed  || DEFAULT_WALK_SPEED;

        const initial = options.initialPosition || new THREE.Vector3(0, this.eyeHeight, 0);
        this.position = initial.clone();
        this.position.y = this.eyeHeight;

        this.yaw   = options.initialYaw || 0;
        this.pitch = 0;

        this._pointerLocked = false;

        this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
        this._applyTransform();

        this._onPointerDown       = this._onPointerDown.bind(this);
        this._onPointerUp         = this._onPointerUp.bind(this);
        this._onPointerMove       = this._onPointerMove.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);
    }

    activate()
    {
        this.input.on("pointerdown",       this._onPointerDown);
        this.input.on("pointerup",         this._onPointerUp);
        this.input.on("pointermove",       this._onPointerMove);
        this.input.on("pointerlockchange", this._onPointerLockChange);
    }

    deactivate()
    {
        this.input.off("pointerdown",       this._onPointerDown);
        this.input.off("pointerup",         this._onPointerUp);
        this.input.off("pointermove",       this._onPointerMove);
        this.input.off("pointerlockchange", this._onPointerLockChange);
        if(this._pointerLocked)
        {
            this.input.exitPointerLock();
            this._pointerLocked = false;
        }
    }

    fixedUpdate(dt)
    {
        let forwardInput = 0;
        let rightInput   = 0;

        if(this.input.isDown("KeyW")) { forwardInput += 1; }
        if(this.input.isDown("KeyS")) { forwardInput -= 1; }
        if(this.input.isDown("KeyD")) { rightInput   += 1; }
        if(this.input.isDown("KeyA")) { rightInput   -= 1; }

        if(forwardInput === 0 && rightInput === 0) { return; }

        const length = Math.sqrt(forwardInput * forwardInput + rightInput * rightInput);
        forwardInput /= length;
        rightInput   /= length;

        const sinY = Math.sin(this.yaw);
        const cosY = Math.cos(this.yaw);

        const forwardX = -sinY;
        const forwardZ = -cosY;
        const rightX   =  cosY;
        const rightZ   = -sinY;

        const speed = this.walkSpeed * dt;

        this.position.x += (forwardX * forwardInput + rightX * rightInput) * speed;
        this.position.z += (forwardZ * forwardInput + rightZ * rightInput) * speed;
        this.position.y  = this.eyeHeight;
    }

    frameUpdate(_alpha)
    {
        this._applyTransform();
    }


    /* HANDLERS ***************************************************************/

    _onPointerDown(event)
    {
        if(event.button === LOOK_BUTTON && !this._pointerLocked && this.lockTarget)
        {
            this.input.requestPointerLock(this.lockTarget);
        }
    }

    _onPointerUp(event)
    {
        if(event.button === LOOK_BUTTON && this._pointerLocked)
        {
            this.input.exitPointerLock();
        }
    }

    _onPointerMove(event)
    {
        if(!this._pointerLocked) { return; }

        this.yaw   -= event.dx * LOOK_SENSITIVITY;
        this.pitch -= event.dy * LOOK_SENSITIVITY;
        this.pitch  = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    }

    _onPointerLockChange(event)
    {
        this._pointerLocked = event.locked;
    }


    /* INTERNAL ***************************************************************/

    _applyTransform()
    {
        this.camera.position.copy(this.position);
        this.camera.rotation.order = "YXZ";
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.z = 0;
    }
}

export { FirstPersonCamera };
