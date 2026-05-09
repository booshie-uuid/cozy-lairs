import { test, expect } from "vitest";
import * as THREE from "three";

import { World } from "../../../scripts/modules/world/world.js";
import { Grid }  from "../../../scripts/modules/world/grid.js";

import { buildEmptyRoom } from "../../../scripts/modules/world/builders/empty-room.js";


const mockAssets =
{
    get: () => new THREE.Group()
};


function buildRoom({ x0 = 0, z0 = 0, width = 4, depth = 4 } = {})
{
    const world = new World(new Grid(20, 20, 4));
    buildEmptyRoom(world, mockAssets, { x0, z0, width, depth });
    return world;
}


function entitiesByKind(world, kind)
{
    return [...world.entities].filter(e => e.kind === kind);
}


test("entity counts for a 6x8 room match expected composition", () =>
{
    const world = buildRoom({ x0: 2, z0: 1, width: 6, depth: 8 });

    // 6×8 floor tiles = 48
    // Each side has 2 corner cells (half walls) and (length - 2) interior cells (full walls):
    //   south + north: 2 × ((6 - 2) full + 2 half) = 8 full + 4 half
    //   west  + east : 2 × ((8 - 2) full + 2 half) = 12 full + 4 half
    //   total walls   = 20 full + 8 half
    // Plus 4 corner pieces.
    expect(entitiesByKind(world, "floor.stone.basic").length).toBe(48);
    expect(entitiesByKind(world, "wall.stone.corner").length).toBe(4);
    expect(entitiesByKind(world, "wall.stone.half").length).toBe(8);
    expect(entitiesByKind(world, "wall.stone.straight").length).toBe(20);
    expect(world.entities.size).toBe(80);
});


test("entity counts for a minimum 2x2 room", () =>
{
    const world = buildRoom({ width: 2, depth: 2 });

    expect(entitiesByKind(world, "floor.stone.basic").length).toBe(4);
    expect(entitiesByKind(world, "wall.stone.corner").length).toBe(4);
    expect(entitiesByKind(world, "wall.stone.half").length).toBe(8);
    expect(entitiesByKind(world, "wall.stone.straight").length).toBe(0);
});


test("each side has half-walls only at the two end cells", () =>
{
    const world = buildRoom({ width: 4, depth: 4 });

    expect(entitiesByKind(world, "wall.stone.half").length).toBe(8);
    expect(entitiesByKind(world, "wall.stone.straight").length).toBe(8);
});


test("corners are placed at the four room vertex coordinates", () =>
{
    const world = buildRoom({ x0: 1, z0: 2, width: 3, depth: 5 });
    const corners = entitiesByKind(world, "wall.stone.corner");

    const positions = corners.map(c => `${c.object3D.position.x},${c.object3D.position.z}`);
    const S = world.grid.cellSize;

    const expected = [
        `${1 * S},${2 * S}`,
        `${(1 + 3) * S},${2 * S}`,
        `${1 * S},${(2 + 5) * S}`,
        `${(1 + 3) * S},${(2 + 5) * S}`
    ];

    for(const expectedPos of expected)
    {
        expect(positions).toContain(expectedPos);
    }
});


test("throws on width or depth less than 2", () =>
{
    const world = new World(new Grid(10, 10, 4));
    expect(() => buildEmptyRoom(world, mockAssets, { x0: 0, z0: 0, width: 1, depth: 4 })).toThrow();
    expect(() => buildEmptyRoom(world, mockAssets, { x0: 0, z0: 0, width: 4, depth: 1 })).toThrow();
    expect(() => buildEmptyRoom(world, mockAssets, { x0: 0, z0: 0, width: 0, depth: 4 })).toThrow();
    expect(() => buildEmptyRoom(world, mockAssets, { x0: 0, z0: 0, width: 4, depth: 1.5 })).toThrow();
});


test("offsets the room footprint by x0/z0", () =>
{
    const world = buildRoom({ x0: 3, z0: 4, width: 2, depth: 2 });
    const floors = entitiesByKind(world, "floor.stone.basic");
    const S = world.grid.cellSize;

    const floorPositions = floors.map(f => ({
        x: f.object3D.position.x,
        z: f.object3D.position.z
    }));

    const expectedCells = [
        { cx: 3, cz: 4 }, { cx: 4, cz: 4 },
        { cx: 3, cz: 5 }, { cx: 4, cz: 5 }
    ];

    for(const { cx, cz } of expectedCells)
    {
        const x = cx * S + S / 2;
        const z = cz * S + S / 2;
        const found = floorPositions.some(p =>
            Math.abs(p.x - x) < 1e-6 && Math.abs(p.z - z) < 1e-6
        );
        expect(found).toBe(true);
    }
});


test("floor tiles register as walkable cells on the grid", () =>
{
    const world = buildRoom({ x0: 2, z0: 1, width: 6, depth: 8 });

    expect(world.grid.walkableCells().length).toBe(48);

    for(let dx = 0; dx < 6; dx++)
    {
        for(let dz = 0; dz < 8; dz++)
        {
            expect(world.grid.isWalkable(2 + dx, 1 + dz)).toBe(true);
        }
    }
});
