import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World }         from "../../scripts/modules/world/world.js";
import { Grid }          from "../../scripts/modules/world/grid.js";
import { Entity }        from "../../scripts/modules/world/entity.js";
import { GridPlacement } from "../../scripts/modules/world/components/grid-placement.js";
import { Walker }        from "../../scripts/modules/world/components/walker.js";
import { WorldEditor }   from "../../scripts/modules/world/world-editor.js";


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

function makeAssets(kindMap = {}, aabbMap = {})
{
    return {
        get(_id) { return new THREE.Mesh(); },
        getKind(id)        { return kindMap[id]?.kind ?? null; },
        getDisplayName(id) { return kindMap[id]?.displayName ?? null; },
        getMeta(id)        { return kindMap[id]?.meta ?? {}; },
        getAabb(id)        { return aabbMap[id] || null; },
        getAnimations(_id) { return []; }
    };
}


function makeViewModel()
{
    return { toast: vi.fn() };
}


function paintFloors(editor, width, depth)
{
    for(let cx = 0; cx < width; cx++)
    {
        for(let cz = 0; cz < depth; cz++)
        {
            editor.paintFloor(cx, cz);
        }
    }
}


function setupWithFloors({ kindMap = {}, aabbMap = {} } = {})
{
    const assets = makeAssets(kindMap, aabbMap);
    const world = new World(new Grid(8, 8, 4), assets);
    const viewModel = makeViewModel();
    const editor = new WorldEditor({ world, assets, viewModel });
    paintFloors(editor, 8, 8);
    return { world, assets, viewModel, editor };
}


function findByKind(world, kind)
{
    return [...world.entities].find(e => e.kind === kind);
}


const KIND_MAP = {
    "decor.crate":       { kind: "decor.floor", displayName: "Crate" },
    "decor.barrel":      { kind: "decor.floor", displayName: "Barrel" },
    "character.minion":  { kind: "character",   displayName: "Skeleton" }
};


/******************************************************************************/
/* isPickupable                                                               */
/******************************************************************************/

test("isPickupable accepts decor entities with GridPlacement", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    editor.placeDecor("decor.crate", 3, 3);
    const crate = findByKind(world, "decor.crate");

    expect(editor.isPickupable(crate)).toBe(true);
});


test("isPickupable accepts minion entities (Walker only)", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    editor.spawnMinion("character.minion", 3, 3);
    const minion = [...world.entities].find(e => e.getComponent(Walker));

    expect(editor.isPickupable(minion)).toBe(true);
});


test("isPickupable rejects floors, walls, terrain blocks, and non-entities", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    const floor = findByKind(world, "floor.stone.basic");
    expect(editor.isPickupable(floor)).toBe(false);

    /* Fabricate wall + terrain entities (tracer-style) — they exist but
     * are excluded by kind-prefix. */
    const wall = new Entity("wall.stone.straight", new THREE.Object3D());
    wall.addComponent(new GridPlacement(0, 0, 0));
    expect(editor.isPickupable(wall)).toBe(false);

    const block = new Entity("terrain.block.basic", new THREE.Object3D());
    block.addComponent(new GridPlacement(0, 0, 0, { blocks: true }));
    expect(editor.isPickupable(block)).toBe(false);

    expect(editor.isPickupable(null)).toBe(false);
    expect(editor.isPickupable({})).toBe(false);
});


/******************************************************************************/
/* pickUpEntity                                                               */
/******************************************************************************/

test("pickUpEntity captures decor snapshot and removes the entity", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    editor.placeDecor("decor.crate", 3, 3, 2);
    const crate = findByKind(world, "decor.crate");

    const snapshot = editor.pickUpEntity(crate);

    expect(snapshot).not.toBeNull();
    expect(snapshot.kind).toBe("decor.crate");
    expect(snapshot.originCx).toBe(3);
    expect(snapshot.originCz).toBe(3);
    expect(snapshot.rotationStep).toBe(2);
    expect(snapshot.xOffset).toBe(0);
    expect(snapshot.zOffset).toBe(0);
    expect(world.entities.has(crate)).toBe(false);
});


test("pickUpEntity preserves nudged xOffset/zOffset in the snapshot", () =>
{
    const { editor, world } = setupWithFloors({
        kindMap: KIND_MAP,
        aabbMap: {
            "decor.crate": new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0.5, 0.5))
        }
    });
    editor.placeDecor("decor.crate", 3, 3);
    const crate = findByKind(world, "decor.crate");
    editor.nudgeEntity(crate, 1, -1);
    expect(crate.getComponent(GridPlacement).xOffset).toBe(1);

    const snapshot = editor.pickUpEntity(crate);
    expect(snapshot.xOffset).toBe(1);
    expect(snapshot.zOffset).toBe(-1);
});


test("pickUpEntity on a minion captures the cell from world position and zeroes rotation/offset", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    editor.spawnMinion("character.minion", 4, 5);
    const minion = [...world.entities].find(e => e.getComponent(Walker));

    const snapshot = editor.pickUpEntity(minion);

    expect(snapshot.kind).toBe("character.minion");
    expect(snapshot.originCx).toBe(4);
    expect(snapshot.originCz).toBe(5);
    expect(snapshot.rotationStep).toBe(0);
    expect(snapshot.xOffset).toBe(0);
    expect(world.entities.has(minion)).toBe(false);
});


test("pickUpEntity refuses non-pickupable entities, returns null + toasts", () =>
{
    const { editor, world, viewModel } = setupWithFloors({ kindMap: KIND_MAP });
    const floor = findByKind(world, "floor.stone.basic");

    expect(editor.pickUpEntity(floor)).toBe(null);
    expect(viewModel.toast).toHaveBeenCalledWith(expect.stringContaining("pick up"), "warning");
    expect(world.entities.has(floor)).toBe(true);
});


/******************************************************************************/
/* placeFromSnapshot                                                          */
/******************************************************************************/

test("placeFromSnapshot of a decor snapshot creates a fresh entity at the new cell (rotation/offset reset)", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    editor.placeDecor("decor.crate", 3, 3, 2);
    const crate = findByKind(world, "decor.crate");
    const snapshot = editor.pickUpEntity(crate);

    expect(editor.placeFromSnapshot(snapshot, 5, 5)).toBe(true);

    const placed = findByKind(world, "decor.crate");
    expect(placed).toBeTruthy();
    const placement = placed.getComponent(GridPlacement);
    expect(placement.cx).toBe(5);
    expect(placement.cz).toBe(5);
    expect(placement.rotationStep).toBe(0);
    expect(placement.xOffset).toBe(0);
    expect(placement.zOffset).toBe(0);
});


test("placeFromSnapshot of a minion snapshot spawns a fresh minion at the new cell", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    editor.spawnMinion("character.minion", 3, 3);
    const minion = [...world.entities].find(e => e.getComponent(Walker));
    const snapshot = editor.pickUpEntity(minion);

    expect(editor.placeFromSnapshot(snapshot, 6, 6)).toBe(true);

    const spawned = [...world.entities].find(e => e.getComponent(Walker));
    expect(spawned).toBeTruthy();
});


/******************************************************************************/
/* restorePickup                                                              */
/******************************************************************************/

test("restorePickup recreates a decor entity at its origin cell with preserved orientation/offset", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    editor.placeDecor("decor.crate", 3, 3, 2);
    const crate = findByKind(world, "decor.crate");
    const snapshot = editor.pickUpEntity(crate);

    expect(editor.restorePickup(snapshot)).toBe(true);

    const restored = findByKind(world, "decor.crate");
    const placement = restored.getComponent(GridPlacement);
    expect(placement.cx).toBe(3);
    expect(placement.cz).toBe(3);
    expect(placement.rotationStep).toBe(2);
});


test("restorePickup preserves xOffset/zOffset/surfaceY", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });

    /* Build a snapshot manually so we don't have to round-trip nudges through
     * a stamping walk-grid in this test. */
    const snapshot = {
        kind:         "decor.crate",
        originCx:     3,
        originCz:     3,
        rotationStep: 1,
        xOffset:      0.5,
        zOffset:     -0.25,
        surfaceY:     0
    };

    expect(editor.restorePickup(snapshot)).toBe(true);

    const restored = findByKind(world, "decor.crate");
    const placement = restored.getComponent(GridPlacement);
    expect(placement.xOffset).toBe(0.5);
    expect(placement.zOffset).toBe(-0.25);
});


test("restorePickup displaces a walker that occupies the origin main cell", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });

    /* Spawn a walker in main cell (3, 3). Walker's currentSubCell will land
     * inside the central sub-cells of (3, 3) after onAddedToWorld. */
    editor.spawnMinion("character.minion", 3, 3);
    const walker = [...world.entities].find(e => e.getComponent(Walker));
    const walkerComp = walker.getComponent(Walker);
    const subsPerMain = world.walkGrid.subsPerMain;
    const startSub = { ...walkerComp.currentSubCell };
    expect(Math.floor(startSub.sx / subsPerMain)).toBe(3);

    /* Now restore a crate at (3, 3) — should displace the walker out of (3, 3). */
    const snapshot = {
        kind: "decor.crate", originCx: 3, originCz: 3,
        rotationStep: 0, xOffset: 0, zOffset: 0, surfaceY: 0
    };
    expect(editor.restorePickup(snapshot)).toBe(true);

    const displaced = walkerComp.currentSubCell;
    const displacedMx = Math.floor(displaced.sx / subsPerMain);
    const displacedMz = Math.floor(displaced.sz / subsPerMain);
    /* Walker is no longer in main cell (3, 3). */
    expect(displacedMx === 3 && displacedMz === 3).toBe(false);
});


test("restorePickup drops the snapshot + toasts when the origin cell is no longer a floor", () =>
{
    const { editor, world, viewModel } = setupWithFloors({ kindMap: KIND_MAP });
    editor.eraseFloor(3, 3);

    const snapshot = {
        kind: "decor.crate", originCx: 3, originCz: 3,
        rotationStep: 0, xOffset: 0, zOffset: 0, surfaceY: 0
    };
    expect(editor.restorePickup(snapshot)).toBe(false);
    expect(viewModel.toast).toHaveBeenCalledWith(
        expect.stringContaining("Lost held"), "warning"
    );
    expect(findByKind(world, "decor.crate")).toBeUndefined();
});


test("restorePickup of a minion respawns at the origin cell", () =>
{
    const { editor, world } = setupWithFloors({ kindMap: KIND_MAP });
    editor.spawnMinion("character.minion", 3, 3);
    const minion = [...world.entities].find(e => e.getComponent(Walker));
    const snapshot = editor.pickUpEntity(minion);

    expect(editor.restorePickup(snapshot)).toBe(true);

    const restored = [...world.entities].find(e => e.getComponent(Walker));
    expect(restored).toBeTruthy();
    /* Position should land at the cell centre. */
    const cellCentre = world.grid.cellToWorld(3, 3);
    expect(restored.object3D.position.x).toBeCloseTo(cellCentre.x);
    expect(restored.object3D.position.z).toBeCloseTo(cellCentre.z);
});
