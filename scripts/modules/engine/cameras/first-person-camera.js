import * as THREE from "three";

import { CameraController } from "./camera-controller.js";
import { PLAYER_MARKER }    from "../player-marker.js";


/******************************************************************************/
/* FIRST PERSON CAMERA                                                        */
/******************************************************************************/

const DEFAULT_EYE_HEIGHT = 1.7;
const DEFAULT_WALK_SPEED = 4;
const LOOK_SENSITIVITY = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const LOOK_BUTTON = 2;


class FirstPersonCamera extends CameraController
{
    constructor(input, options = {})
    {
        super(input);
        this.lockTarget = options.lockTarget || null;
        this.eyeHeight = options.eyeHeight || DEFAULT_EYE_HEIGHT;
        this.walkSpeed = options.walkSpeed || DEFAULT_WALK_SPEED;
        this.grid = options.grid || null;
        this.playerEntity = options.playerEntity || null;
        // (currentX, currentZ, desiredX, desiredZ) → { x, z }. Optional —
        // without it the camera moves freely to the desired position.
        this.resolveCollision = options.resolveCollision || null;

        const initial = options.initialPosition || new THREE.Vector3(0, this.eyeHeight, 0);
        this.position = initial.clone();
        this.position.y = this.eyeHeight;

        this.yaw = options.initialYaw || 0;
        this.pitch = 0;

        this.pointerLocked = false;
        this.active = false;

        // `null` means the player isn't the marker owner — either
        // pre-spawn or transiting another occupant's cell.
        this.lastCell = null;
        if(this.grid && this.playerEntity)
        {
            const pos = this.playerEntity.object3D.position;
            const cell = this.grid.worldToCell(pos.x, pos.z);
            if(this.grid.isInBounds(cell.cx, cell.cz))
            {
                this.lastCell = { cx: cell.cx, cz: cell.cz };
            }
        }

        this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
        this.applyTransform();

        this.subscribe("pointerdown",       this.onPointerDown.bind(this));
        this.subscribe("pointerup",         this.onPointerUp.bind(this));
        this.subscribe("pointermove",       this.onPointerMove.bind(this));
        this.subscribe("pointerlockchange", this.onPointerLockChange.bind(this));
    }

    onActivate()
    {
        // Resume from where the player was last left in Builder mode.
        if(this.playerEntity)
        {
            const p = this.playerEntity.object3D.position;
            this.position.x = p.x;
            this.position.z = p.z;
            this.position.y = this.eyeHeight;
            this.applyTransform();
            this.playerEntity.object3D.visible = false;
        }

        this.active = true;
    }

    onDeactivate()
    {
        if(this.pointerLocked)
        {
            this.input.exitPointerLock();
            this.pointerLocked = false;
        }

        if(this.playerEntity)
        {
            this.playerEntity.object3D.visible = true;
        }

        this.active = false;
        // PLAYER_MARKER stays registered — the player is still present
        // in Builder mode, just controlled by the god camera.
    }

    teleportPlayer(cell)
    {
        if(!this.grid) { return; }
        const w = this.grid.cellToWorld(cell.cx, cell.cz);
        this.position.x = w.x;
        this.position.z = w.z;
        this.position.y = this.eyeHeight;
        this.applyTransform();

        if(this.playerEntity)
        {
            this.playerEntity.object3D.position.x = w.x;
            this.playerEntity.object3D.position.z = w.z;
        }

        this.syncMarker();
    }

    fixedUpdate(dt)
    {
        if(!this.active) { return; }

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
        const dx = (forwardX * forwardInput + rightX * rightInput) * speed;
        const dz = (forwardZ * forwardInput + rightZ * rightInput) * speed;

        const desiredX = this.position.x + dx;
        const desiredZ = this.position.z + dz;

        if(this.resolveCollision)
        {
            const resolved = this.resolveCollision(this.position.x, this.position.z, desiredX, desiredZ);
            this.position.x = resolved.x;
            this.position.z = resolved.z;
        }
        else
        {
            this.position.x = desiredX;
            this.position.z = desiredZ;
        }
        this.position.y = this.eyeHeight;

        if(this.playerEntity)
        {
            this.playerEntity.object3D.position.x = this.position.x;
            this.playerEntity.object3D.position.z = this.position.z;
        }

        this.syncMarker();
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

    syncMarker()
    {
        if(!this.grid) { return; }
        const cell = this.grid.worldToCell(this.position.x, this.position.z);
        if(!this.grid.isInBounds(cell.cx, cell.cz))
        {
            this.clearMarker();
            return;
        }

        if(this.lastCell && this.lastCell.cx === cell.cx && this.lastCell.cz === cell.cz)
        {
            return;
        }

        this.clearMarker();

        // Walking through a walker is allowed — pass through without
        // writing a marker rather than clobber the walker's claim.
        const existing = this.grid.getOccupant(cell.cx, cell.cz);
        if(existing !== null) { return; }

        this.grid.setOccupant(cell.cx, cell.cz, PLAYER_MARKER);
        this.lastCell = { cx: cell.cx, cz: cell.cz };
    }

    clearMarker()
    {
        if(!this.grid || this.lastCell === null) { return; }
        if(this.grid.getOccupant(this.lastCell.cx, this.lastCell.cz) === PLAYER_MARKER)
        {
            this.grid.clearOccupant(this.lastCell.cx, this.lastCell.cz);
        }
        this.lastCell = null;
    }
}

export { FirstPersonCamera };
