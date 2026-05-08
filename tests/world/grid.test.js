import { test, expect } from "vitest";
import { Grid } from "../../scripts/modules/world/grid.js";
import * as Errors from "../../scripts/modules/engine/errors.js";


test("default cell size is 2 metres", () =>
{
    const grid = new Grid(10, 10);
    expect(grid.cellSize).toBe(2);
});


test("cellToWorld returns the centre of the cell", () =>
{
    const grid = new Grid(4, 4);

    expect(grid.cellToWorld(0, 0)).toEqual({ x: 1, z: 1 });
    expect(grid.cellToWorld(1, 0)).toEqual({ x: 3, z: 1 });
    expect(grid.cellToWorld(2, 3)).toEqual({ x: 5, z: 7 });
});


test("worldToCell rounds down to the cell's low corner", () =>
{
    const grid = new Grid(4, 4);

    expect(grid.worldToCell(0, 0)).toEqual({ cx: 0, cz: 0 });
    expect(grid.worldToCell(1.99, 1.99)).toEqual({ cx: 0, cz: 0 });
    expect(grid.worldToCell(2, 2)).toEqual({ cx: 1, cz: 1 });
    expect(grid.worldToCell(5, 7)).toEqual({ cx: 2, cz: 3 });
});


test("worldToCell + cellToWorld round-trip lands within the same cell", () =>
{
    const grid = new Grid(8, 8);

    for(let cx = 0; cx < 8; cx++)
    {
        for(let cz = 0; cz < 8; cz++)
        {
            const { x, z }            = grid.cellToWorld(cx, cz);
            const { cx: rcx, cz: rcz } = grid.worldToCell(x, z);
            expect(rcx).toBe(cx);
            expect(rcz).toBe(cz);
        }
    }
});


test("snapToEdge snaps to the nearest integer multiple of cellSize", () =>
{
    const grid = new Grid(10, 10);

    expect(grid.snapToEdge(0.4, 0.4)).toEqual({ x: 0, z: 0 });
    expect(grid.snapToEdge(1.1, 0.9)).toEqual({ x: 2, z: 0 });
    expect(grid.snapToEdge(3.5, 4.5)).toEqual({ x: 4, z: 4 });
    expect(grid.snapToEdge(5.0, 5.0)).toEqual({ x: 6, z: 6 });
});


test("isInBounds rejects negative cells and cells past the grid extent", () =>
{
    const grid = new Grid(4, 4);

    expect(grid.isInBounds(0, 0)).toBe(true);
    expect(grid.isInBounds(3, 3)).toBe(true);
    expect(grid.isInBounds(4, 0)).toBe(false);
    expect(grid.isInBounds(0, 4)).toBe(false);
    expect(grid.isInBounds(-1, 2)).toBe(false);
    expect(grid.isInBounds(2, -1)).toBe(false);
});


test("setOccupant + getOccupant round-trip", () =>
{
    const grid = new Grid(4, 4);
    const fakeEntity = { id: "test" };

    grid.setOccupant(2, 1, fakeEntity);

    expect(grid.getOccupant(2, 1)).toBe(fakeEntity);
    expect(grid.getOccupant(0, 0)).toBe(null);
});


test("clearOccupant removes the occupant", () =>
{
    const grid = new Grid(4, 4);
    grid.setOccupant(1, 1, { id: "t" });
    grid.clearOccupant(1, 1);
    expect(grid.getOccupant(1, 1)).toBe(null);
});


test("setOccupant on out-of-bounds throws GridBoundsError", () =>
{
    const grid = new Grid(4, 4);
    expect(() => grid.setOccupant(5, 0, {})).toThrow(Errors.GridBoundsError);
    expect(() => grid.setOccupant(0, -1, {})).toThrow(Errors.GridBoundsError);
});


test("clearOccupant on out-of-bounds throws GridBoundsError", () =>
{
    const grid = new Grid(4, 4);
    expect(() => grid.clearOccupant(5, 0)).toThrow(Errors.GridBoundsError);
});


test("getOccupant on out-of-bounds returns null without throwing", () =>
{
    const grid = new Grid(4, 4);
    expect(grid.getOccupant(99, 99)).toBe(null);
});
