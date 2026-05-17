import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { Tool, TINT_VALID, TINT_INVALID, TINT_REMOVE } from "../../scripts/modules/builder/tools/tool.js";

import { FloorPaintTool, FloorEraseTool } from "../../scripts/modules/builder/tools/floor-tools.js";

import {
    DecorPlaceTool,
    DecorEraseTool,
    WallDecorPlaceTool
} from "../../scripts/modules/builder/tools/decor-tools.js";

import {
    MinionSpawnTool,
    MinionEraseTool,
    NoopTool
} from "../../scripts/modules/builder/tools/minion-tools.js";

import { NudgeTool }     from "../../scripts/modules/builder/tools/nudge-tool.js";
import { PickTool }      from "../../scripts/modules/builder/tools/pick-tool.js";

import { Entity }        from "../../scripts/modules/world/entity.js";
import { Walker }        from "../../scripts/modules/world/components/walker.js";


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

function makeStubGrid()
{
    return {
        cellSize: 4,
        cellToWorld(cx, cz) { return { x: cx * 4 + 2, z: cz * 4 + 2 }; },
        worldToCell(x, z)   { return { cx: Math.floor(x / 4), cz: Math.floor(z / 4) }; },
        getOccupant() { return null; },
        isFloor()      { return false; }   // default: empty cells
    };
}


function makeStubEditor(overrides = {})
{
    const grid = makeStubGrid();
    return {
        world:    { grid, entities: new Set() },
        assets:   { get: () => new THREE.Mesh(), getMeta: () => ({}) },
        canPaintFloor:      vi.fn(() => true),
        paintFloor:         vi.fn(() => true),
        canEraseFloor:      vi.fn(() => true),
        eraseFloor:         vi.fn(() => true),
        canPlaceDecor:      vi.fn(() => true),
        placeDecor:         vi.fn(() => true),
        canPlaceWallDecor:  vi.fn(() => true),
        placeWallDecor:     vi.fn(() => true),
        removeDecor:        vi.fn(() => true),
        canSpawnMinion:     vi.fn(() => true),
        spawnMinion:        vi.fn(() => true),
        removeMinion:       vi.fn(() => true),
        findDecorAtCell:    vi.fn(() => []),
        findWallDecorAtEdge: vi.fn(() => null),
        floorSideOfEdge:    vi.fn(edge => edge),
        isNudgeable:        vi.fn(() => true),
        nudgeEntity:        vi.fn(() => true),
        ...overrides
    };
}


function activate(tool, editor = makeStubEditor())
{
    const scene = new THREE.Scene();
    tool.activate(editor, scene);
    return { editor, scene };
}


/******************************************************************************/
/* BASE TOOL LIFECYCLE                                                        */
/******************************************************************************/

test("activate adds the ghost to the scene (hidden by default); deactivate removes it", () =>
{
    const tool = new FloorPaintTool();
    const { scene } = activate(tool);

    expect(tool.ghostMesh).toBeTruthy();
    expect(scene.children).toContain(tool.ghostMesh);
    expect(tool.ghostMesh.visible).toBe(false);

    const oldGhost = tool.ghostMesh;
    tool.deactivate();
    expect(tool.ghostMesh).toBe(null);
    expect(scene.children).not.toContain(oldGhost);
});


test("NoopTool has no ghost and ignores all hooks", () =>
{
    const tool = new NoopTool();
    const { scene } = activate(tool);

    expect(tool.ghostMesh).toBe(null);
    expect(scene.children.length).toBe(0);

    // None of these throw or call anything.
    tool.onCellHover({ cx: 0, cz: 0 });
    tool.onCellClick({ cx: 0, cz: 0 }, "left");
    tool.rotate("cw");
});


/******************************************************************************/
/* FLOOR PAINT                                                                */
/******************************************************************************/

test("FloorPaintTool.onCellClick(cell, 'left') calls paintFloor with the cell coords", () =>
{
    const tool = new FloorPaintTool();
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 3, cz: 5 }, "left");

    expect(editor.paintFloor).toHaveBeenCalledWith(3, 5);
});


test("FloorPaintTool ignores right-click", () =>
{
    const tool = new FloorPaintTool();
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 3, cz: 5 }, "right");
    expect(editor.paintFloor).not.toHaveBeenCalled();
});


test("FloorPaintTool tints green on a paintable empty cell", () =>
{
    const tool = new FloorPaintTool();
    activate(tool);
    tool.onCellHover({ cx: 1, cz: 1 });
    expect(tool.ghostMesh.material.color.getHex()).toBe(TINT_VALID);
});


test("FloorPaintTool tints red on an already-floored cell (no-op)", () =>
{
    const tool = new FloorPaintTool();
    const editor = makeStubEditor();
    editor.world.grid.isFloor = () => true;
    activate(tool, editor);
    tool.onCellHover({ cx: 1, cz: 1 });
    expect(tool.ghostMesh.material.color.getHex()).toBe(TINT_INVALID);
});


test("FloorPaintTool tints red when canPaintFloor returns false (OOB)", () =>
{
    const tool = new FloorPaintTool();
    const editor = makeStubEditor({ canPaintFloor: vi.fn(() => false) });
    activate(tool, editor);
    tool.onCellHover({ cx: 1, cz: 1 });
    expect(tool.ghostMesh.material.color.getHex()).toBe(TINT_INVALID);
});


test("FloorEraseTool tints amber on an erasable floor cell", () =>
{
    const tool = new FloorEraseTool();
    activate(tool);
    tool.onCellHover({ cx: 1, cz: 1 });
    expect(tool.ghostMesh.material.color.getHex()).toBe(TINT_REMOVE);
});


test("FloorEraseTool tints red when canEraseFloor returns false", () =>
{
    const tool = new FloorEraseTool();
    const editor = makeStubEditor({ canEraseFloor: vi.fn(() => false) });
    activate(tool, editor);
    tool.onCellHover({ cx: 1, cz: 1 });
    expect(tool.ghostMesh.material.color.getHex()).toBe(TINT_INVALID);
});


/******************************************************************************/
/* FLOOR ERASE                                                                */
/******************************************************************************/

test("FloorEraseTool dispatches to eraseFloor on left-click", () =>
{
    const tool = new FloorEraseTool();
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 2, cz: 2 }, "left");
    expect(editor.eraseFloor).toHaveBeenCalledWith(2, 2);
});


/******************************************************************************/
/* DECOR PLACE                                                                */
/******************************************************************************/

test("DecorPlaceTool dispatches to placeDecor with the configured kind and current rotationStep", () =>
{
    const tool = new DecorPlaceTool({ kind: "decor.crate" });
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 3, cz: 4 }, "left");
    expect(editor.placeDecor).toHaveBeenCalledWith("decor.crate", 3, 4, 0);
});


test("DecorPlaceTool.rotate('cw') increments rotationStep modulo 4", () =>
{
    const tool = new DecorPlaceTool({ kind: "decor.crate" });
    activate(tool);

    tool.rotate("cw"); expect(tool.rotationStep).toBe(1);
    tool.rotate("cw"); expect(tool.rotationStep).toBe(2);
    tool.rotate("cw"); expect(tool.rotationStep).toBe(3);
    tool.rotate("cw"); expect(tool.rotationStep).toBe(0);
});


test("DecorPlaceTool.rotate('ccw') decrements rotationStep modulo 4", () =>
{
    const tool = new DecorPlaceTool({ kind: "decor.crate" });
    activate(tool);

    tool.rotate("ccw"); expect(tool.rotationStep).toBe(3);
    tool.rotate("ccw"); expect(tool.rotationStep).toBe(2);
});


test("DecorPlaceTool sends the current rotationStep to placeDecor", () =>
{
    const tool = new DecorPlaceTool({ kind: "decor.crate" });
    const { editor } = activate(tool);

    tool.rotate("cw");
    tool.rotate("cw");
    tool.onCellClick({ cx: 0, cz: 0 }, "left");
    expect(editor.placeDecor).toHaveBeenCalledWith("decor.crate", 0, 0, 2);
});


test("DecorPlaceTool with consumePickup that returns true skips the regular placeDecor call", () =>
{
    // Single-shot pickup: consumer returning true must suppress the
    // regular place path.
    const consumePickup = vi.fn(() => true);
    const tool = new DecorPlaceTool({ kind: "decor.crate", consumePickup });
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 3, cz: 4 }, "left");

    expect(consumePickup).toHaveBeenCalledWith("decor.crate", 3, 4);
    expect(editor.placeDecor).not.toHaveBeenCalled();
});


test("DecorPlaceTool falls through to placeDecor when consumePickup returns false", () =>
{
    const consumePickup = vi.fn(() => false);
    const tool = new DecorPlaceTool({ kind: "decor.crate", consumePickup });
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 3, cz: 4 }, "left");

    expect(consumePickup).toHaveBeenCalledWith("decor.crate", 3, 4);
    expect(editor.placeDecor).toHaveBeenCalledWith("decor.crate", 3, 4, 0);
});


test("DecorPlaceTool without consumePickup always falls through to placeDecor (back-compat)", () =>
{
    const tool = new DecorPlaceTool({ kind: "decor.crate" });
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 3, cz: 4 }, "left");

    expect(editor.placeDecor).toHaveBeenCalledWith("decor.crate", 3, 4, 0);
});


/******************************************************************************/
/* DECOR ERASE                                                                */
/******************************************************************************/

test("DecorEraseTool dispatches to removeDecor on the first decor found in the cell", () =>
{
    const decor = new Entity("decor.crate", new THREE.Object3D());
    const editor = makeStubEditor({
        findDecorAtCell: vi.fn(() => [decor])
    });
    const tool = new DecorEraseTool();
    activate(tool, editor);

    tool.onCellClick({ cx: 0, cz: 0 }, "left");
    expect(editor.removeDecor).toHaveBeenCalledWith(decor);
});


test("DecorEraseTool falls back to wall decor on any of the cell's 4 edges", () =>
{
    const banner = new Entity("decor.banner", new THREE.Object3D());
    const editor = makeStubEditor({
        findDecorAtCell:      vi.fn(() => []),
        findWallDecorAtEdge:  vi.fn(edge => edge.side === "east" ? banner : null)
    });
    const tool = new DecorEraseTool();
    activate(tool, editor);

    tool.onCellClick({ cx: 0, cz: 0 }, "left");
    expect(editor.removeDecor).toHaveBeenCalledWith(banner);
});


test("DecorEraseTool ghost hides when there's no decor under the cursor", () =>
{
    const tool = new DecorEraseTool();
    activate(tool);

    tool.onCellHover({ cx: 0, cz: 0 });
    expect(tool.ghostMesh.visible).toBe(false);
});


/******************************************************************************/
/* WALL DECOR PLACE                                                           */
/******************************************************************************/

test("WallDecorPlaceTool dispatches to placeWallDecor on left-click", () =>
{
    const tool = new WallDecorPlaceTool({ kind: "decor.banner" });
    const { editor } = activate(tool);

    const edge = { cx: 3, cz: 3, side: "north" };
    tool.onWallEdgeClick(edge, "left");
    expect(editor.placeWallDecor).toHaveBeenCalledWith("decor.banner", edge, 0);
});


test("WallDecorPlaceTool ignores right-click", () =>
{
    const tool = new WallDecorPlaceTool({ kind: "decor.banner" });
    const { editor } = activate(tool);

    tool.onWallEdgeClick({ cx: 3, cz: 3, side: "north" }, "right");
    expect(editor.placeWallDecor).not.toHaveBeenCalled();
});


test("WallDecorPlaceTool.rotate updates rotationStep modulo 4", () =>
{
    const tool = new WallDecorPlaceTool({ kind: "decor.banner" });
    activate(tool);

    tool.rotate("cw");
    tool.rotate("cw");
    tool.rotate("cw");
    expect(tool.rotationStep).toBe(3);
});


/******************************************************************************/
/* MINION SPAWN / ERASE                                                       */
/******************************************************************************/

test("MinionSpawnTool dispatches to spawnMinion with the configured kind", () =>
{
    const tool = new MinionSpawnTool({ kind: "character.skeleton.minion" });
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 1, cz: 2 }, "left");
    expect(editor.spawnMinion).toHaveBeenCalledWith("character.skeleton.minion", 1, 2);
});


test("MinionSpawnTool with consumePickup that returns true skips the regular spawnMinion call", () =>
{
    const consumePickup = vi.fn(() => true);
    const tool = new MinionSpawnTool({ kind: "character.skeleton.minion", consumePickup });
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 1, cz: 2 }, "left");

    expect(consumePickup).toHaveBeenCalledWith("character.skeleton.minion", 1, 2);
    expect(editor.spawnMinion).not.toHaveBeenCalled();
});


test("MinionSpawnTool falls through to spawnMinion when consumePickup returns false", () =>
{
    const consumePickup = vi.fn(() => false);
    const tool = new MinionSpawnTool({ kind: "character.skeleton.minion", consumePickup });
    const { editor } = activate(tool);

    tool.onCellClick({ cx: 1, cz: 2 }, "left");

    expect(editor.spawnMinion).toHaveBeenCalledWith("character.skeleton.minion", 1, 2);
});


test("MinionEraseTool dispatches to removeMinion when a walker entity is at the cell", () =>
{
    const minion = new Entity("character.skeleton.minion", new THREE.Object3D());
    minion.addComponent(new Walker());

    const editor = makeStubEditor();
    editor.world.entities.add(minion);
    // Position the minion so worldToCell returns (1, 2).
    minion.object3D.position.set(1 * 4 + 2, 0, 2 * 4 + 2);

    const tool = new MinionEraseTool();
    activate(tool, editor);

    tool.onCellClick({ cx: 1, cz: 2 }, "left");
    expect(editor.removeMinion).toHaveBeenCalledWith(minion);
});


test("MinionEraseTool ignores cells without a walker", () =>
{
    const editor = makeStubEditor();
    const tool = new MinionEraseTool();
    activate(tool, editor);

    tool.onCellClick({ cx: 0, cz: 0 }, "left");
    expect(editor.removeMinion).not.toHaveBeenCalled();
});


/******************************************************************************/
/* NUDGE TOOL                                                                 */
/******************************************************************************/

function makeSelectableEntity(kind = "decor.crate")
{
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    root.add(mesh);
    const entity = new Entity(kind, root);
    entity.world = { entities: new Set([entity]) };
    return entity;
}


test("NudgeTool has targetType 'entity' and no ghost mesh", () =>
{
    const tool = new NudgeTool();
    const { scene } = activate(tool);

    expect(tool.targetType).toBe("entity");
    expect(tool.ghostMesh).toBe(null);
    expect(scene.children.length).toBe(0);
});


test("NudgeTool.onEntityClick selects the entity and applies emissive highlight", () =>
{
    const tool = new NudgeTool();
    activate(tool);
    const entity = makeSelectableEntity();
    const originalMaterial = entity.object3D.children[0].material;

    tool.onEntityClick(entity, "left");

    expect(tool.selected).toBe(entity);
    /* Material was swapped for a clone with boosted emissive. */
    const swapped = entity.object3D.children[0].material;
    expect(swapped).not.toBe(originalMaterial);
    expect(swapped.emissiveIntensity).toBeGreaterThan(0);
});


test("NudgeTool.onEntityClick ignores non-left buttons", () =>
{
    const tool = new NudgeTool();
    activate(tool);
    const entity = makeSelectableEntity();

    tool.onEntityClick(entity, "right");
    expect(tool.selected).toBe(null);
});


test("NudgeTool.onEntityClick(null) deselects", () =>
{
    const tool = new NudgeTool();
    activate(tool);
    const entity = makeSelectableEntity();
    tool.onEntityClick(entity, "left");
    expect(tool.selected).toBe(entity);

    tool.onEntityClick(null, "left");
    expect(tool.selected).toBe(null);
});


test("NudgeTool clicking a non-nudgeable entity (floor / wall) deselects rather than selecting", () =>
{
    const tool = new NudgeTool();
    const editor = makeStubEditor({ isNudgeable: vi.fn(() => false) });
    activate(tool, editor);

    const floor = makeSelectableEntity("floor.stone.basic");
    const originalMaterial = floor.object3D.children[0].material;

    tool.onEntityClick(floor, "left");

    expect(tool.selected).toBe(null);
    expect(floor.object3D.children[0].material).toBe(originalMaterial);
});


test("NudgeTool clicking a non-nudgeable entity while another is selected drops the active selection", () =>
{
    const tool = new NudgeTool();
    /* Per-entity eligibility: barrel nudgeable, floor not. */
    const editor = makeStubEditor({
        isNudgeable: vi.fn(entity => entity.kind === "decor.barrel")
    });
    activate(tool, editor);

    const barrel = makeSelectableEntity("decor.barrel");
    const floor  = makeSelectableEntity("floor.stone.basic");
    const barrelOriginal = barrel.object3D.children[0].material;

    tool.onEntityClick(barrel, "left");
    expect(tool.selected).toBe(barrel);

    tool.onEntityClick(floor, "left");
    expect(tool.selected).toBe(null);
    expect(barrel.object3D.children[0].material).toBe(barrelOriginal);
});


test("NudgeTool re-selection restores the first entity's material before highlighting the next", () =>
{
    const tool = new NudgeTool();
    activate(tool);

    const first  = makeSelectableEntity("decor.crate");
    const second = makeSelectableEntity("decor.barrel");
    const firstOriginal = first.object3D.children[0].material;

    tool.onEntityClick(first,  "left");
    tool.onEntityClick(second, "left");

    expect(tool.selected).toBe(second);
    /* First entity's material is restored to the pre-selection original. */
    expect(first.object3D.children[0].material).toBe(firstOriginal);
});


test("NudgeTool.deselect restores all swapped materials", () =>
{
    const tool = new NudgeTool();
    activate(tool);
    const entity = makeSelectableEntity();
    const originalMaterial = entity.object3D.children[0].material;

    tool.onEntityClick(entity, "left");
    expect(entity.object3D.children[0].material).not.toBe(originalMaterial);

    tool.deselect();
    expect(tool.selected).toBe(null);
    expect(entity.object3D.children[0].material).toBe(originalMaterial);
});


test("NudgeTool.deactivate deselects before tearing down", () =>
{
    const tool = new NudgeTool();
    activate(tool);
    const entity = makeSelectableEntity();
    const originalMaterial = entity.object3D.children[0].material;
    tool.onEntityClick(entity, "left");

    tool.deactivate();

    expect(tool.selected).toBe(null);
    expect(entity.object3D.children[0].material).toBe(originalMaterial);
});


test("NudgeTool.nudge delegates to editor.nudgeEntity with the active selection + deltas", () =>
{
    const tool = new NudgeTool();
    const editor = makeStubEditor({ nudgeEntity: vi.fn(() => true) });
    activate(tool, editor);

    const entity = makeSelectableEntity();
    tool.onEntityClick(entity, "left");

    const ok = tool.nudge(1, -1);
    expect(ok).toBe(true);
    expect(editor.nudgeEntity).toHaveBeenCalledWith(entity, 1, -1);
});


test("NudgeTool.nudge with no selection is a no-op and returns false", () =>
{
    const tool = new NudgeTool();
    const editor = makeStubEditor({ nudgeEntity: vi.fn(() => true) });
    activate(tool, editor);

    expect(tool.nudge(1, 0)).toBe(false);
    expect(editor.nudgeEntity).not.toHaveBeenCalled();
});


test("NudgeTool.nudge on a removed entity self-deselects", () =>
{
    const tool = new NudgeTool();
    const editor = makeStubEditor({ nudgeEntity: vi.fn(() => true) });
    activate(tool, editor);

    const entity = makeSelectableEntity();
    tool.onEntityClick(entity, "left");

    /* Simulate entity removal: world ref cleared by World.removeEntity. */
    entity.world = null;

    expect(tool.nudge(1, 0)).toBe(false);
    expect(editor.nudgeEntity).not.toHaveBeenCalled();
    expect(tool.selected).toBe(null);
});


test("NudgeTool skips materials without an emissive channel (MeshBasicMaterial placeholders)", () =>
{
    const tool = new NudgeTool();
    activate(tool);

    const root = new THREE.Group();
    const basic = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xff00ff })
    );
    root.add(basic);
    const entity = new Entity("placeholder", root);
    entity.world = { entities: new Set([entity]) };
    const originalMaterial = basic.material;

    tool.onEntityClick(entity, "left");

    /* Selected, but no swap happened — original material still in place. */
    expect(tool.selected).toBe(entity);
    expect(basic.material).toBe(originalMaterial);
});


/******************************************************************************/
/* PICK TOOL                                                                  */
/******************************************************************************/

test("PickTool has targetType 'entity' and no ghost mesh", () =>
{
    const tool = new PickTool();
    const { scene } = activate(tool);

    expect(tool.targetType).toBe("entity");
    expect(tool.ghostMesh).toBe(null);
    expect(scene.children.length).toBe(0);
});


test("PickTool.onEntityClick delegates to editor.pickUpEntity and fires onPicked with the snapshot", () =>
{
    const snapshot = { kind: "decor.crate", originCx: 3, originCz: 3 };
    const onPicked = vi.fn();
    const editor = makeStubEditor({
        isPickupable: vi.fn(() => true),
        pickUpEntity: vi.fn(() => snapshot)
    });

    const tool = new PickTool({ onPicked });
    activate(tool, editor);

    const entity = new Entity("decor.crate", new THREE.Object3D());
    tool.onEntityClick(entity, "left");

    expect(editor.pickUpEntity).toHaveBeenCalledWith(entity);
    expect(onPicked).toHaveBeenCalledWith(snapshot);
});


test("PickTool.onEntityClick ignores non-left buttons", () =>
{
    const onPicked = vi.fn();
    const editor = makeStubEditor({
        isPickupable: vi.fn(() => true),
        pickUpEntity: vi.fn(() => ({ kind: "decor.crate" }))
    });

    const tool = new PickTool({ onPicked });
    activate(tool, editor);

    const entity = new Entity("decor.crate", new THREE.Object3D());
    tool.onEntityClick(entity, "right");

    expect(editor.pickUpEntity).not.toHaveBeenCalled();
    expect(onPicked).not.toHaveBeenCalled();
});


test("PickTool.onEntityClick skips non-pickupable entities", () =>
{
    const onPicked = vi.fn();
    const editor = makeStubEditor({
        isPickupable: vi.fn(() => false),
        pickUpEntity: vi.fn()
    });

    const tool = new PickTool({ onPicked });
    activate(tool, editor);

    const entity = new Entity("floor.stone.basic", new THREE.Object3D());
    tool.onEntityClick(entity, "left");

    expect(editor.pickUpEntity).not.toHaveBeenCalled();
    expect(onPicked).not.toHaveBeenCalled();
});


test("PickTool.onEntityClick skips when editor.pickUpEntity returns null", () =>
{
    const onPicked = vi.fn();
    const editor = makeStubEditor({
        isPickupable: vi.fn(() => true),
        pickUpEntity: vi.fn(() => null)
    });

    const tool = new PickTool({ onPicked });
    activate(tool, editor);

    tool.onEntityClick(new Entity("decor.crate", new THREE.Object3D()), "left");
    expect(onPicked).not.toHaveBeenCalled();
});
