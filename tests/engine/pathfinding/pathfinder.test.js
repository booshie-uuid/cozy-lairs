import { test, expect } from "vitest";

import { WalkGrid }      from "../../../scripts/modules/world/walk-grid.js";
import * as Pathfinder   from "../../../scripts/modules/engine/pathfinding/index.js";


function openGrid(width, depth, blockers = [])
{
    const wg = new WalkGrid(width, depth);
    for(const { sx, sz } of blockers) { wg.applyStamp([{ sx, sz }]); }
    return wg;
}


function basicTraversable(walkGrid)
{
    return (sx, sz) => walkGrid.isWalkable(sx, sz);
}


function isContiguousAndWalkable(walkGrid, path)
{
    for(let i = 0; i < path.length; i++)
    {
        if(!walkGrid.isWalkable(path[i].sx, path[i].sz)) { return false; }
        if(i === 0) { continue; }
        const dx = Math.abs(path[i].sx - path[i - 1].sx);
        const dz = Math.abs(path[i].sz - path[i - 1].sz);
        if(dx > 1 || dz > 1)     { return false; }
        if(dx === 0 && dz === 0) { return false; }
    }
    return true;
}


test("open grid — orthogonal path length matches Manhattan distance", () =>
{
    const wg = openGrid(5, 1);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 4, sz: 0 }, basicTraversable(wg));

    expect(path).not.toBeNull();
    expect(path.length).toBe(5);
    expect(path[0]).toEqual({ sx: 0, sz: 0 });
    expect(path[4]).toEqual({ sx: 4, sz: 0 });
});


test("open grid — diagonal target produces an unbroken diagonal path", () =>
{
    const wg = openGrid(4, 4);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 3, sz: 3 }, basicTraversable(wg));

    expect(path).not.toBeNull();
    // Both corners of every diagonal step are open → reconstruction leaves
    // diagonals intact for smooth straight-line traversal. 4 cells total.
    expect(path.length).toBe(4);
    expect(path[0]).toEqual({ sx: 0, sz: 0 });
    expect(path[path.length - 1]).toEqual({ sx: 3, sz: 3 });
});


test("routes around a single blocker", () =>
{
    const wg = openGrid(5, 5, [{ sx: 2, sz: 2 }]);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 4, sz: 4 }, basicTraversable(wg));

    expect(path).not.toBeNull();
    expect(isContiguousAndWalkable(wg, path)).toBe(true);
    expect(path[0]).toEqual({ sx: 0, sz: 0 });
    expect(path[path.length - 1]).toEqual({ sx: 4, sz: 4 });
    expect(path.some(p => p.sx === 2 && p.sz === 2)).toBe(false);
});


test("routes around a wall-shaped cluster of blockers", () =>
{
    // vertical wall at sx=2, sz=0..3 leaves a gap at sz=4 the path must use
    const wg = openGrid(6, 6, [
        { sx: 2, sz: 0 },
        { sx: 2, sz: 1 },
        { sx: 2, sz: 2 },
        { sx: 2, sz: 3 }
    ]);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 5, sz: 0 }, basicTraversable(wg));

    expect(path).not.toBeNull();
    expect(isContiguousAndWalkable(wg, path)).toBe(true);
    expect(path.some(p => p.sx === 2 && p.sz <= 3)).toBe(false);
    expect(path[0]).toEqual({ sx: 0, sz: 0 });
    expect(path[path.length - 1]).toEqual({ sx: 5, sz: 0 });
});


test("returns null when no path exists (start fully walled off)", () =>
{
    // Block all three neighbours of the start cell, including the diagonal —
    // (1,1) is the only reachable cell from (0,0) once the orthogonals are
    // blocked, so without it the start is fully sealed.
    const wg = openGrid(4, 4, [
        { sx: 1, sz: 0 },
        { sx: 0, sz: 1 },
        { sx: 1, sz: 1 }
    ]);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 3, sz: 3 }, basicTraversable(wg));

    expect(path).toBeNull();
});


test("diagonal step allowed even when both orthogonal corners are blocked", () =>
{
    // S B    A perfect single-cell diagonal (0,0) → (1,1) traces y = x and
    // B E    `worldToSub` floor-rounds directly from (0,0) to (1,1) at the
    //        midpoint without ever entering either corner cell. The walker
    //        slips through the corner point; blockers on the orthogonal
    //        neighbours are bypassed.
    const wg = openGrid(2, 2, [
        { sx: 1, sz: 0 },
        { sx: 0, sz: 1 }
    ]);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 1, sz: 1 }, basicTraversable(wg));

    expect(path).toEqual([
        { sx: 0, sz: 0 },
        { sx: 1, sz: 1 }
    ]);
});


test("diagonal step taken directly — no orthogonal intermediate spliced", () =>
{
    // One blocker at (1, 0). Single-cell diagonal stays as a single step;
    // walker traverses straight-line and never enters the corner cell.
    const wg = openGrid(2, 2, [{ sx: 1, sz: 0 }]);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 1, sz: 1 }, basicTraversable(wg));

    expect(path).toEqual([
        { sx: 0, sz: 0 },
        { sx: 1, sz: 1 }
    ]);
});


test("start === end returns a single-cell path", () =>
{
    const wg = openGrid(4, 4);
    const path = Pathfinder.findPath(wg, { sx: 2, sz: 2 }, { sx: 2, sz: 2 }, basicTraversable(wg));

    expect(path).toEqual([{ sx: 2, sz: 2 }]);
});


test("returns null when start is untraversable", () =>
{
    const wg = openGrid(4, 4, [{ sx: 0, sz: 0 }]);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 3, sz: 3 }, basicTraversable(wg));

    expect(path).toBeNull();
});


test("returns null when end is untraversable", () =>
{
    const wg = openGrid(4, 4, [{ sx: 3, sz: 3 }]);
    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 3, sz: 3 }, basicTraversable(wg));

    expect(path).toBeNull();
});


test("returns null when start or end is out-of-bounds", () =>
{
    const wg = openGrid(4, 4);
    const predicate = basicTraversable(wg);

    expect(Pathfinder.findPath(wg, { sx: -1, sz: 0 }, { sx: 3, sz: 3 }, predicate)).toBeNull();
    expect(Pathfinder.findPath(wg, { sx:  0, sz: 0 }, { sx: 4, sz: 0 }, predicate)).toBeNull();
});


test("custom traversable predicate filters cells beyond the walk-grid's own state", () =>
{
    const wg = openGrid(5, 5);

    // Caller's predicate excludes sub-cell (2, 2) even though the walk-grid
    // itself has refcount=0 there. Simulates "not on a floor cell" filtering
    // applied on top of the obstacle map.
    const isTraversable = (sx, sz) => wg.isWalkable(sx, sz) && !(sx === 2 && sz === 2);

    const path = Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 4, sz: 4 }, isTraversable);

    expect(path).not.toBeNull();
    expect(path.some(c => c.sx === 2 && c.sz === 2)).toBe(false);
});


test("throws when no predicate is supplied", () =>
{
    const wg = openGrid(4, 4);
    expect(() =>
        Pathfinder.findPath(wg, { sx: 0, sz: 0 }, { sx: 3, sz: 3 })
    ).toThrow();
});
