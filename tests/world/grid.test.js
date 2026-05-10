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


test("isFloor returns true for marked floor cells regardless of blocker state", () =>
{
    const grid = new Grid(4, 4);
    expect(grid.isFloor(1, 1)).toBe(false);

    grid.markFloor(1, 1);
    expect(grid.isFloor(1, 1)).toBe(true);

    // Blocker on top — still a floor cell (unlike isWalkable, which returns false here).
    grid.setBlocked(1, 1);
    expect(grid.isFloor(1, 1)).toBe(true);
    expect(grid.isWalkable(1, 1)).toBe(false);
});


test("isFloor returns false for out-of-bounds without throwing", () =>
{
    const grid = new Grid(4, 4);
    expect(grid.isFloor(-1, 0)).toBe(false);
    expect(grid.isFloor(99, 99)).toBe(false);
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


/* isAvailable + findClosestAvailable ******************************************/


test("isAvailable — walkable + empty cell returns true", () =>
{
    const grid = new Grid(4, 4);
    grid.markFloor(1, 1);
    expect(grid.isAvailable(1, 1)).toBe(true);
});


test("isAvailable — walkable + occupied returns false", () =>
{
    const grid = new Grid(4, 4);
    grid.markFloor(1, 1);
    grid.setOccupant(1, 1, { id: "x" });
    expect(grid.isAvailable(1, 1)).toBe(false);
});


test("isAvailable — walkable + occupied by excludeOccupant returns true", () =>
{
    const grid = new Grid(4, 4);
    const me = { id: "me" };
    grid.markFloor(1, 1);
    grid.setOccupant(1, 1, me);
    expect(grid.isAvailable(1, 1, me)).toBe(true);
    expect(grid.isAvailable(1, 1, { id: "other" })).toBe(false);
});


test("isAvailable — non-walkable cell returns false even when empty", () =>
{
    const grid = new Grid(4, 4);
    // No floor marked
    expect(grid.isAvailable(0, 0)).toBe(false);

    grid.markFloor(2, 2);
    grid.setBlocked(2, 2);
    expect(grid.isAvailable(2, 2)).toBe(false);
});


test("isAvailable — out-of-bounds returns false without throwing", () =>
{
    const grid = new Grid(4, 4);
    expect(grid.isAvailable(-1, 0)).toBe(false);
    expect(grid.isAvailable(0, 4)).toBe(false);
});


test("findClosestAvailable — returns the start cell if it's already available", () =>
{
    const grid = new Grid(4, 4);
    grid.markFloor(2, 2);
    expect(grid.findClosestAvailable(2, 2)).toEqual({ cx: 2, cz: 2 });
});


test("findClosestAvailable — returns nearest neighbour when start is occupied", () =>
{
    const grid = new Grid(4, 4);
    for(let cx = 0; cx < 4; cx++)
    {
        for(let cz = 0; cz < 4; cz++) { grid.markFloor(cx, cz); }
    }
    grid.setOccupant(2, 2, { id: "blocker" });

    const result = grid.findClosestAvailable(2, 2);
    expect(result).not.toBeNull();
    // Any 8-neighbour of (2, 2) qualifies — the BFS picks the queue head.
    const dx = Math.abs(result.cx - 2);
    const dz = Math.abs(result.cz - 2);
    expect(Math.max(dx, dz)).toBe(1);
});


test("findClosestAvailable — respects excludeOccupant (treats own cell as available)", () =>
{
    const grid = new Grid(4, 4);
    const me = { id: "me" };
    grid.markFloor(2, 2);
    grid.setOccupant(2, 2, me);

    expect(grid.findClosestAvailable(2, 2, me)).toEqual({ cx: 2, cz: 2 });
});


test("findClosestAvailable — returns null when grid has no available cell", () =>
{
    const grid = new Grid(2, 2);
    // No floors marked anywhere — nothing is walkable
    expect(grid.findClosestAvailable(0, 0)).toBeNull();
});


test("findClosestAvailable — ring-by-ring search finds further cell when inner ring is occupied", () =>
{
    const grid = new Grid(5, 5);
    for(let cx = 0; cx < 5; cx++)
    {
        for(let cz = 0; cz < 5; cz++) { grid.markFloor(cx, cz); }
    }
    // Block start + all 8 neighbours
    grid.setOccupant(2, 2, { id: "x" });
    for(let dz = -1; dz <= 1; dz++)
    {
        for(let dx = -1; dx <= 1; dx++)
        {
            if(dx === 0 && dz === 0) { continue; }
            grid.setOccupant(2 + dx, 2 + dz, { id: "ring" });
        }
    }

    const result = grid.findClosestAvailable(2, 2);
    expect(result).not.toBeNull();
    const dx = Math.abs(result.cx - 2);
    const dz = Math.abs(result.cz - 2);
    expect(Math.max(dx, dz)).toBe(2);
});
