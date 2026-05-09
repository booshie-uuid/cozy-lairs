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

const DEFAULT_EYE_HEIGHT = 1.7;
const DEFAULT_WALK_SPEED = 4;
const LOOK_SENSITIVITY = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const LOOK_BUTTON = 2;


class FirstPersonCamera extends CameraController
{
    constructor(input, options = {})
    {
        super();
        this.input = input;
        this.lockTarget = options.lockTarget || null;
        this.eyeHeight = options.eyeHeight || DEFAULT_EYE_HEIGHT;
        this.walkSpeed = options.walkSpeed || DEFAULT_WALK_SPEED;

        const initial = options.initialPosition || new THREE.Vector3(0, this.eyeHeight, 0);
        this.position = initial.clone();
        this.position.y = this.eyeHeight;

        this.yaw = options.initialYaw || 0;
        this.pitch = 0;

        this.pointerLocked = false;

        this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
        this.applyTransform();

        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerLockChange = this.onPointerLockChange.bind(this);
    }

    activate()
    {
        this.input.on("pointerdown",       this.onPointerDown);
        this.input.on("pointerup",         this.onPointerUp);
        this.input.on("pointermove",       this.onPointerMove);
        this.input.on("pointerlockchange", this.onPointerLockChange);
    }

    deactivate()
    {
        this.input.off("pointerdown",       this.onPointerDown);
        this.input.off("pointerup",         this.onPointerUp);
        this.input.off("pointermove",       this.onPointerMove);
        this.input.off("pointerlockchange", this.onPointerLockChange);

        if(this.pointerLocked)
        {
            this.input.exitPointerLock();
            this.pointerLocked = false;
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
        this.applyTransform();
    }


    /* HANDLERS ***************************************************************/

    onPointerDown(event)
    {
        if(event.button === LOOK_BUTTON && !this.pointerLocked && this.lockTarget)
        {
            this.input.requestPointerLock(this.lockTarget);
        }
    }

    onPointerUp(event)
    {
        if(event.button === LOOK_BUTTON && this.pointerLocked)
        {
            this.input.exitPointerLock();
        }
    }

    onPointerMove(event)
    {
        if(!this.pointerLocked) { return; }

        this.yaw   -= event.dx * LOOK_SENSITIVITY;
        this.pitch -= event.dy * LOOK_SENSITIVITY;
        this.pitch  = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    }

    onPointerLockChange(event)
    {
        this.pointerLocked = event.locked;
    }


    /* INTERNAL ***************************************************************/

    applyTransform()
    {
        this.camera.position.copy(this.position);
        this.camera.rotation.order = "YXZ";
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.z = 0;
    }
}

export { FirstPersonCamera };
