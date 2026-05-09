import { test, expect } from "vitest";

import { Grid } from "../../../scripts/modules/world/grid.js";
import * as Pathfinder from "../../../scripts/modules/engine/pathfinding/index.js";


/*
 * Helper: build a grid where every cell in the (width × depth) footprint is
 * walkable, then optionally drop a list of blockers on top.
 */
function openGrid(width, depth, blockers = [])
{
    const grid = new Grid(width, depth, 1);
    for(let cx = 0; cx < width; cx++)
    {
        for(let cz = 0; cz < depth; cz++)
        {
            grid.markFloor(cx, cz);
        }
    }
    for(const { cx, cz } of blockers)
    {
        grid.setBlocked(cx, cz);
    }
    return grid;
}


function pathCost(path)
{
    let cost = 0;
    for(let i = 1; i < path.length; i++)
    {
        const dx = Math.abs(path[i].cx - path[i - 1].cx);
        const dz = Math.abs(path[i].cz - path[i - 1].cz);
        cost += (dx === 1 && dz === 1) ? Math.SQRT2 : 1;
    }
    return cost;
}


function isContiguousAndWalkable(grid, path)
{
    for(let i = 0; i < path.length; i++)
    {
        if(!grid.isWalkable(path[i].cx, path[i].cz)) { return false; }
        if(i === 0) { continue; }
        const dx = Math.abs(path[i].cx - path[i - 1].cx);
        const dz = Math.abs(path[i].cz - path[i - 1].cz);
        if(dx > 1 || dz > 1)        { return false; }
        if(dx === 0 && dz === 0)    { return false; }
    }
    return true;
}


test("open grid — straight diagonal returns 4-cell path with cost 3√2", () =>
{
    const grid = openGrid(4, 4);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 3, cz: 3 });

    expect(path).not.toBeNull();
    expect(path.length).toBe(4);
    expect(path[0]).toEqual({ cx: 0, cz: 0 });
    expect(path[3]).toEqual({ cx: 3, cz: 3 });
    expect(pathCost(path)).toBeCloseTo(3 * Math.SQRT2);
});


test("open grid — pure orthogonal returns minimal step path", () =>
{
    const grid = openGrid(5, 1);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 4, cz: 0 });

    expect(path).not.toBeNull();
    expect(path.length).toBe(5);
    expect(pathCost(path)).toBeCloseTo(4);
});


test("routes around a single blocker", () =>
{
    const grid = openGrid(5, 5, [{ cx: 2, cz: 2 }]);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 4, cz: 4 });

    expect(path).not.toBeNull();
    expect(isContiguousAndWalkable(grid, path)).toBe(true);
    expect(path[0]).toEqual({ cx: 0, cz: 0 });
    expect(path[path.length - 1]).toEqual({ cx: 4, cz: 4 });
    expect(path.some(p => p.cx === 2 && p.cz === 2)).toBe(false);
});


test("routes around a wall-shaped cluster of blockers", () =>
{
    // wall along cx=2 from cz=0..3 leaves a gap at cz=4 the path must use
    const grid = openGrid(6, 6, [
        { cx: 2, cz: 0 },
        { cx: 2, cz: 1 },
        { cx: 2, cz: 2 },
        { cx: 2, cz: 3 }
    ]);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 5, cz: 0 });

    expect(path).not.toBeNull();
    expect(isContiguousAndWalkable(grid, path)).toBe(true);
    expect(path.some(p => p.cx === 2 && p.cz <= 3)).toBe(false);
    expect(path[0]).toEqual({ cx: 0, cz: 0 });
    expect(path[path.length - 1]).toEqual({ cx: 5, cz: 0 });
});


test("returns null when no path exists (start fully walled off)", () =>
{
    // walls at every neighbour of (0, 0) including diagonals — completely sealed
    const grid = openGrid(4, 4, [
        { cx: 1, cz: 0 },
        { cx: 0, cz: 1 },
        { cx: 1, cz: 1 }
    ]);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 3, cz: 3 });

    expect(path).toBeNull();
});


test("rejects diagonal corner-cutting between two adjacent blockers", () =>
{
    /*
     * Layout (B = blocker, S = start, E = end):
     *
     *   S B
     *   B E
     *
     * Without corner-cutting prevention the diagonal (0,0) → (1,1) is shortest
     * but it would slip between the two blockers. Pathfinder should find no
     * path because there are no other connections.
     */
    const grid = openGrid(2, 2, [
        { cx: 1, cz: 0 },
        { cx: 0, cz: 1 }
    ]);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 1, cz: 1 });

    expect(path).toBeNull();
});


test("allows diagonals when only one of the two adjacent cells is blocked", () =>
{
    // One blocker at (1, 0). Diagonal (0,0) → (1,1) should still be allowed
    // because (0, 1) is open.
    const grid = openGrid(2, 2, [{ cx: 1, cz: 0 }]);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 1, cz: 1 });

    expect(path).not.toBeNull();
    expect(path).toEqual([
        { cx: 0, cz: 0 },
        { cx: 1, cz: 1 }
    ]);
});


test("octile cost optimality — prefers one diagonal + one orthogonal over two orthogonals", () =>
{
    // From (0,0) to (1,2): octile-optimal cost = √2 + 1 ≈ 2.414
    // (cheaper than two orthogonals + one diagonal anywhere; cheaper than 3 orthogonals = 3)
    const grid = openGrid(4, 4);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 1, cz: 2 });

    expect(path).not.toBeNull();
    expect(pathCost(path)).toBeCloseTo(Math.SQRT2 + 1);
});


test("start === end returns a single-cell path", () =>
{
    const grid = openGrid(4, 4);
    const path = Pathfinder.findPath(grid, { cx: 2, cz: 2 }, { cx: 2, cz: 2 });

    expect(path).toEqual([{ cx: 2, cz: 2 }]);
});


test("returns null when start is non-walkable", () =>
{
    const grid = openGrid(4, 4, [{ cx: 0, cz: 0 }]);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 3, cz: 3 });

    expect(path).toBeNull();
});


test("returns null when end is non-walkable", () =>
{
    const grid = openGrid(4, 4, [{ cx: 3, cz: 3 }]);
    const path = Pathfinder.findPath(grid, { cx: 0, cz: 0 }, { cx: 3, cz: 3 });

    expect(path).toBeNull();
});


test("returns null when start or end is out-of-bounds", () =>
{
    const grid = openGrid(4, 4);

    expect(Pathfinder.findPath(grid, { cx: -1, cz: 0 }, { cx: 3, cz: 3 })).toBeNull();
    expect(Pathfinder.findPath(grid, { cx:  0, cz: 0 }, { cx: 4, cz: 0 })).toBeNull();
});
