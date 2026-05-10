import { test, expect } from "vitest";
import * as THREE from "three";

import { Grid }   from "../../../scripts/modules/world/grid.js";
import { Entity } from "../../../scripts/modules/world/entity.js";

import { FirstPersonCamera } from "../../../scripts/modules/engine/cameras/first-person-camera.js";
import { PLAYER_MARKER }     from "../../../scripts/modules/engine/player-marker.js";


// Constructor only stores the input reference; we never call into it from the
// marker-policy paths. A no-op stub keeps the camera away from real DOM.
const stubInput =
{
    on()                  {},
    off()                 {},
    requestPointerLock()  {},
    exitPointerLock()     {},
    isDown()              { return false; }
};


function makeCamera(grid, playerCell)
{
    const playerEntity = new Entity("player", new THREE.Object3D());
    const w = grid.cellToWorld(playerCell.cx, playerCell.cz);
    playerEntity.object3D.position.set(w.x, 0, w.z);

    const cam = new FirstPersonCamera(stubInput,
    {
        grid,
        playerEntity,
        initialPosition: new THREE.Vector3(w.x, 1.7, w.z)
    });

    return { cam, playerEntity };
}


test("constructor seeds lastCell from the playerEntity's spawn cell", () =>
{
    const grid = new Grid(4, 4, 4);
    grid.markFloor(2, 2);

    const { cam } = makeCamera(grid, { cx: 2, cz: 2 });
    expect(cam.lastCell).toEqual({ cx: 2, cz: 2 });
});


test("teleportPlayer to an empty cell — clears old marker, writes new one", () =>
{
    const grid = new Grid(4, 4, 4);
    grid.markFloor(0, 0);
    grid.markFloor(1, 0);
    // Mirror App.spawnPlayer's initial registration.
    grid.setOccupant(0, 0, PLAYER_MARKER);

    const { cam } = makeCamera(grid, { cx: 0, cz: 0 });

    cam.teleportPlayer({ cx: 1, cz: 0 });

    expect(grid.getOccupant(0, 0)).toBe(null);
    expect(grid.getOccupant(1, 0)).toBe(PLAYER_MARKER);
    expect(cam.lastCell).toEqual({ cx: 1, cz: 0 });
});


test("teleportPlayer pass-through — does NOT overwrite a walker's claim on the destination cell", () =>
{
    const grid = new Grid(4, 4, 4);
    grid.markFloor(0, 0);
    grid.markFloor(1, 0);
    grid.setOccupant(0, 0, PLAYER_MARKER);

    // Stand-in for a walker entity occupying (1, 0).
    const walker = { kind: "test.walker" };
    grid.setOccupant(1, 0, walker);

    const { cam } = makeCamera(grid, { cx: 0, cz: 0 });

    cam.teleportPlayer({ cx: 1, cz: 0 });

    // Walker still owns its cell.
    expect(grid.getOccupant(1, 0)).toBe(walker);
    // Old marker cell was cleared (player has left it).
    expect(grid.getOccupant(0, 0)).toBe(null);
    // Camera has no marker registration while transiting.
    expect(cam.lastCell).toBe(null);
});


test("teleportPlayer back into an empty cell after a pass-through reclaims marker ownership", () =>
{
    const grid = new Grid(4, 4, 4);
    grid.markFloor(0, 0);
    grid.markFloor(1, 0);
    grid.markFloor(2, 0);
    grid.setOccupant(0, 0, PLAYER_MARKER);
    grid.setOccupant(1, 0, { kind: "test.walker" });

    const { cam } = makeCamera(grid, { cx: 0, cz: 0 });

    cam.teleportPlayer({ cx: 1, cz: 0 });   // pass-through, lastCell = null
    expect(cam.lastCell).toBe(null);

    cam.teleportPlayer({ cx: 2, cz: 0 });   // empty cell, reclaim marker
    expect(grid.getOccupant(2, 0)).toBe(PLAYER_MARKER);
    expect(cam.lastCell).toEqual({ cx: 2, cz: 0 });
});


test("teleportPlayer to out-of-bounds clears the marker and leaves lastCell null", () =>
{
    const grid = new Grid(4, 4, 4);
    grid.markFloor(0, 0);
    grid.setOccupant(0, 0, PLAYER_MARKER);

    const { cam, playerEntity } = makeCamera(grid, { cx: 0, cz: 0 });

    // Teleport outside grid extents — syncMarker should clear and bail.
    playerEntity.object3D.position.set(-50, 0, -50);
    cam.position.set(-50, 1.7, -50);
    cam.syncMarker();

    expect(grid.getOccupant(0, 0)).toBe(null);
    expect(cam.lastCell).toBe(null);
});
