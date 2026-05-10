import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World }  from "../../../scripts/modules/world/world.js";
import { Grid }   from "../../../scripts/modules/world/grid.js";
import { Entity } from "../../../scripts/modules/world/entity.js";
import { GridPlacement } from "../../../scripts/modules/world/components/grid-placement.js";
import { Walker }        from "../../../scripts/modules/world/components/walker.js";

import { addBarrel, addCrate } from "../../../scripts/modules/world/builders/decor.js";
import { PLAYER_MARKER }       from "../../../scripts/modules/engine/player-marker.js";


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


/* PLACEMENT-ON-OCCUPANT *******************************************************/


test("addBarrel teleports a walker occupant via Walker.teleportTo, then places", () =>
{
    const world = makeRoomWorld();

    // Spawn an entity with a Walker that registers occupancy at (4, 4).
    const minion = new Entity("character.test", new THREE.Object3D());
    const walker = minion.addComponent(new Walker({ speed: 1 }));
    const spawn = world.grid.cellToWorld(4, 4);
    minion.object3D.position.set(spawn.x, 0, spawn.z);
    world.addEntity(minion);
    expect(world.grid.getOccupant(4, 4)).toBe(minion);

    const teleportSpy = vi.spyOn(walker, "teleportTo");

    const barrel = addBarrel(world, mockAssets, 4, 4);

    expect(barrel).not.toBeNull();
    expect(teleportSpy).toHaveBeenCalledTimes(1);
    const [tx, tz] = teleportSpy.mock.calls[0];
    // Walker should be teleported to a cell that's walkable AND not the
    // newly-blocked one.
    expect(world.grid.isWalkable(tx, tz)).toBe(true);
    expect(tx === 4 && tz === 4).toBe(false);

    // After placement, (4, 4) should be a blocked decor cell.
    expect(world.grid.blockedCells.has(world.grid.cellKey(4, 4))).toBe(true);
});


test("addBarrel skips placement when no free cell exists for occupant displacement", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Tiny 1×1 grid: only one walkable cell, occupied by the walker. BFS
    // can't find anywhere else to put them.
    const world = new World(new Grid(1, 1, 4));
    world.grid.markFloor(0, 0);

    const minion = new Entity("character.test", new THREE.Object3D());
    minion.addComponent(new Walker({ speed: 1 }));
    world.addEntity(minion);
    expect(world.grid.getOccupant(0, 0)).toBe(minion);

    const before = world.entities.size;
    const result = addBarrel(world, mockAssets, 0, 0);

    expect(result).toBeNull();
    expect(world.entities.size).toBe(before);
    expect(world.grid.blockedCells.has(world.grid.cellKey(0, 0))).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
});


test("addBarrel skips placement when occupant has no Walker", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const world = makeRoomWorld();
    // Manually register an entity-shaped object with no Walker as the
    // occupant of (4, 4). Simulates a future occupant kind that lacks
    // a Walker — placement should refuse rather than strand it.
    const stranger = new Entity("oddity", new THREE.Object3D());
    world.grid.setOccupant(4, 4, stranger);

    const result = addBarrel(world, mockAssets, 4, 4);

    expect(result).toBeNull();
    expect(world.grid.blockedCells.has(world.grid.cellKey(4, 4))).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
});


test("addBarrel routes PLAYER_MARKER occupant through world.playerDisplaceHandler, then places", () =>
{
    const world = makeRoomWorld();
    world.grid.setOccupant(5, 5, PLAYER_MARKER);

    const handlerCalls = [];
    world.playerDisplaceHandler = (cell) => { handlerCalls.push(cell); };

    const result = addBarrel(world, mockAssets, 5, 5);

    expect(result).not.toBeNull();
    expect(handlerCalls.length).toBe(1);
    const free = handlerCalls[0];
    expect(world.grid.isWalkable(free.cx, free.cz)).toBe(true);
    expect(free.cx === 5 && free.cz === 5).toBe(false);
    expect(world.grid.blockedCells.has(world.grid.cellKey(5, 5))).toBe(true);
});


test("addBarrel with PLAYER_MARKER occupant skips placement when no displace handler is set", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const world = makeRoomWorld();
    world.grid.setOccupant(5, 5, PLAYER_MARKER);
    // No playerDisplaceHandler set on world.

    const result = addBarrel(world, mockAssets, 5, 5);

    expect(result).toBeNull();
    expect(world.grid.blockedCells.has(world.grid.cellKey(5, 5))).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
});
