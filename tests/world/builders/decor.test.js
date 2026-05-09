import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World } from "../../../scripts/modules/world/world.js";
import { Grid }  from "../../../scripts/modules/world/grid.js";
import { GridPlacement } from "../../../scripts/modules/world/components/grid-placement.js";

import { addBarrel, addCrate } from "../../../scripts/modules/world/builders/decor.js";


const mockAssets = { get: () => new THREE.Group() };


function makeRoomWorld()
{
    const world = new World(new Grid(10, 12, 4));
    // pretend buildEmptyRoom marked these as floor
    for(let cx = 1; cx <= 8; cx++)
    {
        for(let cz = 1; cz <= 10; cz++)
        {
            world.grid.markFloor(cx, cz);
        }
    }
    return world;
}


test("addBarrel creates an entity with a blocking GridPlacement at the cell", () =>
{
    const world  = makeRoomWorld();
    const before = world.entities.size;

    const entity = addBarrel(world, mockAssets, 2, 7);

    expect(entity).not.toBeNull();
    expect(entity.kind).toBe("decor.barrel");
    expect(world.entities.size).toBe(before + 1);

    const placement = entity.getComponent(GridPlacement);
    expect(placement.cx).toBe(2);
    expect(placement.cz).toBe(7);
    expect(placement.blocks).toBe(true);
    expect(placement.walkable).toBe(false);

    expect(world.grid.isWalkable(2, 7)).toBe(false);
});


test("addCrate creates an entity with a blocking GridPlacement", () =>
{
    const world  = makeRoomWorld();
    const entity = addCrate(world, mockAssets, 7, 3);

    expect(entity).not.toBeNull();
    expect(entity.kind).toBe("decor.crate");

    const placement = entity.getComponent(GridPlacement);
    expect(placement.blocks).toBe(true);
    expect(world.grid.isWalkable(7, 3)).toBe(false);
});


test("addBarrel skips placement and warns when no floor exists at the cell", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const world = makeRoomWorld();
    const before = world.entities.size;

    // (0, 0) is outside the room footprint, no floor was marked there
    const entity = addBarrel(world, mockAssets, 0, 0);

    expect(entity).toBeNull();
    expect(world.entities.size).toBe(before);
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(world.grid.blockedCells.has(world.grid.cellKey(0, 0))).toBe(false);

    consoleWarnSpy.mockRestore();
});


test("addCrate skips placement and warns for out-of-bounds cells", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const world  = makeRoomWorld();
    const entity = addCrate(world, mockAssets, 99, 99);

    expect(entity).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
});
