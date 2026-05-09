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


test("markFloor + unmarkFloor round-trip via isWalkable", () =>
{
    const grid = new Grid(4, 4);

    expect(grid.isWalkable(1, 1)).toBe(false);

    grid.markFloor(1, 1);
    expect(grid.isWalkable(1, 1)).toBe(true);

    grid.unmarkFloor(1, 1);
    expect(grid.isWalkable(1, 1)).toBe(false);
});


test("setBlocked overrides floor for isWalkable", () =>
{
    const grid = new Grid(4, 4);

    grid.markFloor(2, 2);
    expect(grid.isWalkable(2, 2)).toBe(true);

    grid.setBlocked(2, 2);
    expect(grid.isWalkable(2, 2)).toBe(false);

    grid.clearBlocked(2, 2);
    expect(grid.isWalkable(2, 2)).toBe(true);
});


test("isWalkable truth table — floor, blocker, neither", () =>
{
    const grid = new Grid(4, 4);

    grid.markFloor(0, 0);
    grid.markFloor(1, 0);
    grid.setBlocked(1, 0);

    expect(grid.isWalkable(0, 0)).toBe(true);  // floor, not blocked
    expect(grid.isWalkable(1, 0)).toBe(false); // floor, blocked
    expect(grid.isWalkable(2, 0)).toBe(false); // no floor
});


test("isWalkable returns false for out-of-bounds without throwing", () =>
{
    const grid = new Grid(4, 4);
    expect(grid.isWalkable(-1, 0)).toBe(false);
    expect(grid.isWalkable(0, 4)).toBe(false);
    expect(grid.isWalkable(99, 99)).toBe(false);
});


test("markFloor / unmarkFloor / setBlocked / clearBlocked throw GridBoundsError on out-of-bounds", () =>
{
    const grid = new Grid(4, 4);
    expect(() => grid.markFloor(5, 0)).toThrow(Errors.GridBoundsError);
    expect(() => grid.unmarkFloor(0, -1)).toThrow(Errors.GridBoundsError);
    expect(() => grid.setBlocked(4, 4)).toThrow(Errors.GridBoundsError);
    expect(() => grid.clearBlocked(-1, -1)).toThrow(Errors.GridBoundsError);
});


test("walkableCells filters blockers and returns parsed cell coords", () =>
{
    const grid = new Grid(4, 4);

    grid.markFloor(0, 0);
    grid.markFloor(1, 0);
    grid.markFloor(2, 0);
    grid.setBlocked(1, 0);

    const cells = grid.walkableCells();
    const sorted = [...cells].sort((a, b) => a.cx - b.cx);

    expect(sorted).toEqual([
        { cx: 0, cz: 0 },
        { cx: 2, cz: 0 }
    ]);
});


test("walkableCells returns empty array when nothing is marked", () =>
{
    const grid = new Grid(4, 4);
    expect(grid.walkableCells()).toEqual([]);
});
