import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World }         from "../../scripts/modules/world/world.js";
import { Grid }          from "../../scripts/modules/world/grid.js";
import { Entity }        from "../../scripts/modules/world/entity.js";
import { Transform }     from "../../scripts/modules/world/components/transform.js";
import { Renderable }    from "../../scripts/modules/world/components/renderable.js";
import { GridPlacement } from "../../scripts/modules/world/components/grid-placement.js";


function makeEntity(kind = "test")
{
    return new Entity(kind, new THREE.Object3D());
}


/* TRANSFORM ******************************************************************/

test("Transform.toJSON captures position, rotation, and scale", () =>
{
    const entity    = makeEntity();
    const transform = entity.addComponent(new Transform());
    entity.object3D.position.set(1, 2, 3);
    entity.object3D.rotation.set(0.1, 0.2, 0.3);
    entity.object3D.scale.set(2, 2, 2);

    const json = transform.toJSON();

    expect(json.position).toEqual([1, 2, 3]);
    expect(json.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(json.scale).toEqual([2, 2, 2]);
});


test("Transform.applyJSON restores position, rotation, and scale", () =>
{
    const entity    = makeEntity();
    const transform = entity.addComponent(new Transform());

    transform.applyJSON({
        position: [4, 5, 6],
        rotation: [0.4, 0.5, 0.6],
        scale:    [3, 3, 3]
    });

    expect(entity.object3D.position.toArray()).toEqual([4, 5, 6]);
    expect(entity.object3D.rotation.x).toBeCloseTo(0.4);
    expect(entity.object3D.rotation.y).toBeCloseTo(0.5);
    expect(entity.object3D.rotation.z).toBeCloseTo(0.6);
    expect(entity.object3D.scale.toArray()).toEqual([3, 3, 3]);
});


test("Transform round-trip preserves all values", () =>
{
    const a = makeEntity();
    const ta = a.addComponent(new Transform());
    a.object3D.position.set(7, 8, 9);
    a.object3D.rotation.set(0.5, 1.0, 1.5);
    a.object3D.scale.set(0.5, 0.5, 0.5);

    const json = ta.toJSON();

    const b = makeEntity();
    const tb = b.addComponent(new Transform());
    tb.applyJSON(json);

    expect(b.object3D.position.toArray()).toEqual(a.object3D.position.toArray());
    expect(b.object3D.scale.toArray()).toEqual(a.object3D.scale.toArray());
});


/* RENDERABLE *****************************************************************/

test("Renderable.toJSON captures the kind", () =>
{
    const entity     = makeEntity();
    const renderable = entity.addComponent(new Renderable("wall.stone.straight"));

    expect(renderable.toJSON()).toEqual({ kind: "wall.stone.straight" });
});


test("Renderable mounts a placeholder mesh when the asset can't be resolved", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingAssets  = { get: () => { throw new Error("not loaded"); } };

    const entity = makeEntity();
    const renderable = entity.addComponent(new Renderable("ghost.kind", failingAssets));

    const world = new World(new Grid(4, 4));
    expect(() => world.addEntity(entity)).not.toThrow();
    expect(entity.object3D.children.length).toBe(1);
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
});


test("Renderable.reattach swaps the mesh for a fresh clone (used by manifest reload)", () =>
{
    const meshA = new THREE.Mesh();
    const meshB = new THREE.Mesh();
    let nextMesh = meshA;
    const assets = { get: () => nextMesh };

    const entity = makeEntity();
    const renderable = entity.addComponent(new Renderable("any.kind", assets));

    const world = new World(new Grid(4, 4));
    world.addEntity(entity);

    expect(entity.object3D.children.length).toBe(1);
    expect(entity.object3D.children[0]).toBe(meshA);

    nextMesh = meshB;
    renderable.reattach();

    expect(entity.object3D.children.length).toBe(1);
    expect(entity.object3D.children[0]).toBe(meshB);
});


/* GRID PLACEMENT *************************************************************/

test("GridPlacement.toJSON captures cx, cz, and rotationStep", () =>
{
    const placement = new GridPlacement(3, 5, 2);
    expect(placement.toJSON()).toEqual({ cx: 3, cz: 5, rotationStep: 2 });
});


test("GridPlacement constructor rejects out-of-range rotationStep", () =>
{
    expect(() => new GridPlacement(0, 0, 4)).toThrow();
    expect(() => new GridPlacement(0, 0, -1)).toThrow();
    expect(() => new GridPlacement(0, 0, 1.5)).toThrow();
});


test("GridPlacement applies position and rotation when added to a world", () =>
{
    const world  = new World(new Grid(8, 8));
    const entity = makeEntity();
    entity.addComponent(new GridPlacement(2, 3, 1));

    world.addEntity(entity);

    const expected = world.grid.cellToWorld(2, 3);
    expect(entity.object3D.position.x).toBe(expected.x);
    expect(entity.object3D.position.z).toBe(expected.z);
    expect(entity.object3D.position.y).toBe(0);
    expect(entity.object3D.rotation.y).toBeCloseTo(Math.PI / 2);
});


test("GridPlacement rotationStep maps to the correct quarter turns", () =>
{
    const world = new World(new Grid(4, 4));

    const cases = [
        [0, 0],
        [1, Math.PI / 2],
        [2, Math.PI],
        [3, 3 * Math.PI / 2]
    ];

    for(const [step, expected] of cases)
    {
        const entity = makeEntity();
        entity.addComponent(new GridPlacement(0, 0, step));
        world.addEntity(entity);
        expect(entity.object3D.rotation.y).toBeCloseTo(expected);
        world.removeEntity(entity);
    }
});


test("GridPlacement defaults — neither walkable nor blocks", () =>
{
    const placement = new GridPlacement(1, 1);
    expect(placement.walkable).toBe(false);
    expect(placement.blocks).toBe(false);
});


test("GridPlacement walkable: true registers floor on add and clears on remove", () =>
{
    const world  = new World(new Grid(4, 4));
    const entity = makeEntity();
    entity.addComponent(new GridPlacement(2, 1, 0, { walkable: true }));

    world.addEntity(entity);
    expect(world.grid.isWalkable(2, 1)).toBe(true);
    expect(world.grid.floorCells.has("2,1")).toBe(true);

    world.removeEntity(entity);
    expect(world.grid.isWalkable(2, 1)).toBe(false);
    expect(world.grid.floorCells.has("2,1")).toBe(false);
});


test("GridPlacement blocks: true registers blocker on add and clears on remove", () =>
{
    const world  = new World(new Grid(4, 4));
    const floor  = makeEntity("floor");
    const blocker = makeEntity("blocker");

    floor.addComponent(new GridPlacement(2, 2, 0, { walkable: true }));
    blocker.addComponent(new GridPlacement(2, 2, 0, { blocks: true }));

    world.addEntity(floor);
    world.addEntity(blocker);

    expect(world.grid.blockedCells.has("2,2")).toBe(true);
    expect(world.grid.isWalkable(2, 2)).toBe(false);

    world.removeEntity(blocker);
    expect(world.grid.blockedCells.has("2,2")).toBe(false);
    expect(world.grid.isWalkable(2, 2)).toBe(true);
});


test("GridPlacement default flags do not touch floor or blocked sets", () =>
{
    const world  = new World(new Grid(4, 4));
    const entity = makeEntity();
    entity.addComponent(new GridPlacement(0, 0, 0));

    world.addEntity(entity);

    expect(world.grid.floorCells.size).toBe(0);
    expect(world.grid.blockedCells.size).toBe(0);
});


test("GridPlacement.toJSON omits flags when false, includes them when true", () =>
{
    const plain = new GridPlacement(3, 5, 2);
    expect(plain.toJSON()).toEqual({ cx: 3, cz: 5, rotationStep: 2 });

    const floor = new GridPlacement(3, 5, 0, { walkable: true });
    expect(floor.toJSON()).toEqual({ cx: 3, cz: 5, rotationStep: 0, walkable: true });

    const blocker = new GridPlacement(3, 5, 0, { blocks: true });
    expect(blocker.toJSON()).toEqual({ cx: 3, cz: 5, rotationStep: 0, blocks: true });

    const both = new GridPlacement(3, 5, 0, { walkable: true, blocks: true });
    expect(both.toJSON()).toEqual({ cx: 3, cz: 5, rotationStep: 0, walkable: true, blocks: true });
});


test("GridPlacement constructor rejects non-boolean flag values", () =>
{
    expect(() => new GridPlacement(0, 0, 0, { walkable: "yes" })).toThrow();
    expect(() => new GridPlacement(0, 0, 0, { blocks: 1 })).toThrow();
});


test("GridPlacement.moveTo updates cx / cz; toJSON reflects the new cell", () =>
{
    const placement = new GridPlacement(2, 3, 1, { blocks: true });
    placement.moveTo(7, 9);

    expect(placement.cx).toBe(7);
    expect(placement.cz).toBe(9);
    // Other fields untouched
    expect(placement.rotationStep).toBe(1);
    expect(placement.blocks).toBe(true);
    expect(placement.toJSON()).toEqual({ cx: 7, cz: 9, rotationStep: 1, blocks: true });
});


test("GridPlacement.surfaceY defaults to 0 when omitted from options", () =>
{
    const placement = new GridPlacement(0, 0, 0);
    expect(placement.surfaceY).toBe(0);
});


test("GridPlacement.surfaceY accepts a finite number via options", () =>
{
    const placement = new GridPlacement(0, 0, 0, { surfaceY: 0.85 });
    expect(placement.surfaceY).toBe(0.85);
});


test("GridPlacement constructor rejects non-finite surfaceY values", () =>
{
    expect(() => new GridPlacement(0, 0, 0, { surfaceY: "high" })).toThrow();
    expect(() => new GridPlacement(0, 0, 0, { surfaceY: NaN     })).toThrow();
    expect(() => new GridPlacement(0, 0, 0, { surfaceY: Infinity })).toThrow();
});


test("GridPlacement applies surfaceY to object3D.position.y on add", () =>
{
    const world  = new World(new Grid(4, 4, 4));
    const entity = new Entity("decor.candle.triple", new THREE.Object3D());
    entity.addComponent(new GridPlacement(2, 3, 0, { surfaceY: 0.85 }));

    world.addEntity(entity);

    expect(entity.object3D.position.y).toBeCloseTo(0.85);
});


test("GridPlacement.toJSON omits surfaceY when 0; includes it when non-zero", () =>
{
    const flat = new GridPlacement(3, 5, 0);
    expect(flat.toJSON().surfaceY).toBeUndefined();

    const lifted = new GridPlacement(3, 5, 0, { surfaceY: 0.85 });
    expect(lifted.toJSON()).toEqual({ cx: 3, cz: 5, rotationStep: 0, surfaceY: 0.85 });
});


/* GridPlacement — xOffset / zOffset + walk-grid stamps ***********************/

test("GridPlacement.xOffset / zOffset default to 0 when omitted", () =>
{
    const placement = new GridPlacement(0, 0, 0);
    expect(placement.xOffset).toBe(0);
    expect(placement.zOffset).toBe(0);
});


test("GridPlacement constructor rejects non-finite xOffset / zOffset", () =>
{
    expect(() => new GridPlacement(0, 0, 0, { xOffset: "x" })).toThrow();
    expect(() => new GridPlacement(0, 0, 0, { xOffset: NaN })).toThrow();
    expect(() => new GridPlacement(0, 0, 0, { zOffset: Infinity })).toThrow();
});


test("GridPlacement.toJSON omits xOffset / zOffset when 0; includes when non-zero", () =>
{
    const centred = new GridPlacement(3, 5, 0);
    expect(centred.toJSON().xOffset).toBeUndefined();
    expect(centred.toJSON().zOffset).toBeUndefined();

    const nudged = new GridPlacement(3, 5, 0, { xOffset: 1, zOffset: -2 });
    expect(nudged.toJSON()).toEqual({ cx: 3, cz: 5, rotationStep: 0, xOffset: 1, zOffset: -2 });
});


test("GridPlacement applies xOffset / zOffset to object3D.position on add", () =>
{
    const world  = new World(new Grid(8, 8, 4));
    const entity = new Entity("decor.test", new THREE.Object3D());
    entity.addComponent(new GridPlacement(2, 3, 0, { xOffset: 0.5, zOffset: -0.25 }));

    world.addEntity(entity);

    const base = world.grid.cellToWorld(2, 3);
    expect(entity.object3D.position.x).toBeCloseTo(base.x + 0.5);
    expect(entity.object3D.position.z).toBeCloseTo(base.z - 0.25);
});


test("GridPlacement stamps walk-grid on add and reverts on remove for a blocking entity", () =>
{
    const grid     = new Grid(4, 4, 4);
    const world    = new World(grid);
    world.walkGrid = makeMockWalkGrid();
    world.assets   = makeMockAssetsWith1x1Cube();

    const entity = new Entity("decor.cube", new THREE.Object3D());
    const placement = entity.addComponent(new GridPlacement(0, 0, 0, { blocks: true }));

    world.addEntity(entity);
    expect(placement.stampedSubCells.length).toBeGreaterThan(0);
    expect(world.walkGrid.applyStamp).toHaveBeenCalledOnce();
    expect(world.walkGrid.applyStamp).toHaveBeenCalledWith(placement.stampedSubCells);

    world.removeEntity(entity);
    expect(world.walkGrid.revertStamp).toHaveBeenCalledOnce();
    expect(placement.stampedSubCells.length).toBe(0);
});


test("GridPlacement skips walk-grid stamp for a non-blocking entity (e.g. a floor)", () =>
{
    const grid     = new Grid(4, 4, 4);
    const world    = new World(grid);
    world.walkGrid = makeMockWalkGrid();
    world.assets   = makeMockAssetsWith1x1Cube();

    const entity = new Entity("floor.test", new THREE.Object3D());
    const placement = entity.addComponent(new GridPlacement(0, 0, 0, { walkable: true }));

    world.addEntity(entity);

    expect(placement.stampedSubCells).toEqual([]);
    expect(world.walkGrid.applyStamp).not.toHaveBeenCalled();
});


test("GridPlacement skips walk-grid stamp when world has no assets", () =>
{
    const world = new World(new Grid(4, 4, 4));  // assets = null
    const entity = new Entity("decor.cube", new THREE.Object3D());
    const placement = entity.addComponent(new GridPlacement(0, 0, 0, { blocks: true }));

    world.addEntity(entity);

    expect(placement.stampedSubCells).toEqual([]);
});


test("GridPlacement.setOffset revert-applies the stamp and updates position", () =>
{
    const grid     = new Grid(4, 4, 4);
    const world    = new World(grid);
    world.walkGrid = makeMockWalkGrid();
    world.assets   = makeMockAssetsWith1x1Cube();

    const entity = new Entity("decor.cube", new THREE.Object3D());
    const placement = entity.addComponent(new GridPlacement(0, 0, 0, { blocks: true }));

    world.addEntity(entity);

    const initialStamp = placement.stampedSubCells;
    expect(world.walkGrid.applyStamp).toHaveBeenCalledOnce();

    placement.setOffset(1, 0);

    expect(world.walkGrid.revertStamp).toHaveBeenCalledWith(initialStamp);
    expect(world.walkGrid.applyStamp).toHaveBeenCalledTimes(2);
    expect(placement.xOffset).toBe(1);
    expect(placement.zOffset).toBe(0);

    const base = grid.cellToWorld(0, 0);
    expect(entity.object3D.position.x).toBeCloseTo(base.x + 1);
});


test("GridPlacement.setOffset on a detached placement updates fields without stamping", () =>
{
    const placement = new GridPlacement(0, 0, 0);

    placement.setOffset(0.5, 0.5);

    expect(placement.xOffset).toBe(0.5);
    expect(placement.zOffset).toBe(0.5);
    expect(placement.stampedSubCells).toEqual([]);
});


test("GridPlacement.setOffset rejects non-finite values", () =>
{
    const placement = new GridPlacement(0, 0, 0);
    expect(() => placement.setOffset(NaN, 0)).toThrow();
    expect(() => placement.setOffset(0, Infinity)).toThrow();
});


function makeMockWalkGrid()
{
    return {
        mainCellSize: 4,
        subCellSize:  1,
        subsPerMain:  4,
        applyStamp:   vi.fn(),
        revertStamp:  vi.fn(),
        mainToSub:    (cx, cz) => ({ sx: cx * 4, sz: cz * 4 })
    };
}


function makeMockAssetsWith1x1Cube()
{
    return {
        getMeta: () => ({}),
        getAabb: () => ({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } })
    };
}
