import * as THREE from "three";

import { CameraController } from "./camera-controller.js";
import { PLAYER_MARKER }    from "../player-marker.js";


/******************************************************************************/
/* FIRST PERSON CAMERA                                                        */
/******************************************************************************/

/*
 * Floor-locked first-person walker. Right-mouse-hold engages mouse-look via
 * Pointer Lock; WASD walks on the XZ plane at fixed eye height. The browser
 * may release the lock unilaterally (Escape, focus loss) — `pointerlockchange`
 * keeps internal state in sync when it does.
 *
 * Player avatar: when constructed with a `playerEntity`, the camera treats
 * that entity as the player's "body". On WASD movement the entity follows
 * the camera's XZ position. On `activate` the entity's mesh is hidden (so
 * the camera doesn't render the back of the player's own head) and the
 * camera snaps to the entity's current position (so toggling Builder→FP
 * resumes from wherever the player was last left). On `deactivate` the
 * mesh is shown again — the player's body stands idle in Builder view.
 *
 * Grid presence: `PLAYER_MARKER` occupies the player's current cell
 * regardless of camera mode (so other walkers and decor placement always
 * see the player as a blocker / displaceable). The marker registration is
 * managed by `App.spawnPlayer` initially; the camera updates it on
 * movement (WASD or `teleportPlayer`).
 *
 * Marker policy: the marker is only written to cells the player exclusively
 * occupies. While transiting a cell already owned by another occupant
 * (typically a walker — walking through walkers is allowed), no marker is
 * written and `lastCell` stays null. The walker keeps its registration; the
 * player passes through without leaving a footprint or triggering a
 * placement-on-player displacement.
 *
 * Collision: WASD movement is rejected if the destination cell isn't
 * walkable (`Grid.isWalkable` — handles decor blockers and out-of-room
 * cells uniformly). Per-axis check enables sliding along walls and decor.
 * Other walkers don't block the player (they're in `occupants`, not
 * `blockedCells`) — by design, walking through minions is fine.
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
        this.grid = options.grid || null;
        this.playerEntity = options.playerEntity || null;
        // Optional collision-resolver callback:
        //   (currentX, currentZ, desiredX, desiredZ) → { x, z }
        // Returns the position the player should actually end up at,
        // accounting for walls (per-axis sliding), decor (circle
        // depenetration), and any other obstacles the host wants to model.
        // Without it, the camera moves freely to the desired position.
        this.resolveCollision = options.resolveCollision || null;

        const initial = options.initialPosition || new THREE.Vector3(0, this.eyeHeight, 0);
        this.position = initial.clone();
        this.position.y = this.eyeHeight;

        this.yaw = options.initialYaw || 0;
        this.pitch = 0;

        this.pointerLocked = false;
        this.active = false;

        // Marker registration is initialised by whoever spawns the player
        // (App.spawnPlayer). The camera tracks the cell so it can clear
        // and re-register on movement. `null` means the player isn't
        // currently the marker owner — either pre-spawn or transiting
        // another occupant's cell.
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

        // Snap camera to the player's current position so toggling
        // Builder→FP resumes from where the player was last left.
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

        if(this.playerEntity)
        {
            this.playerEntity.object3D.visible = true;
        }

        this.active = false;
        // PLAYER_MARKER stays registered — the player is still "present"
        // in Builder mode (just controlled by the god camera now).
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

        // Don't clobber another occupant's claim. Walking through a walker
        // is allowed (the player passes through without writing a marker);
        // walking onto decor isn't possible (resolveCollision blocks it).
        // If the cell is empty, take ownership.
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
