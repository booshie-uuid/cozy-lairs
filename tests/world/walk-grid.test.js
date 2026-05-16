import { test, expect } from "vitest";
import { WalkGrid, DEFAULT_SUB_CELL_SIZE, DEFAULT_SUBS_PER_MAIN } from "../../scripts/modules/world/walk-grid.js";
import * as Errors from "../../scripts/modules/engine/errors.js";


/******************************************************************************/
/* CONSTRUCTION                                                               */
/******************************************************************************/

test("defaults: 1m sub-cells, 4 subs per main", () =>
{
    const wg = new WalkGrid(80, 80);

    expect(wg.subCellSize).toBe(DEFAULT_SUB_CELL_SIZE);
    expect(wg.subsPerMain).toBe(DEFAULT_SUBS_PER_MAIN);
    expect(wg.mainCellSize).toBe(4);
    expect(wg.width).toBe(80);
    expect(wg.depth).toBe(80);
});


test("refcount buffer is sized width * depth and initialised to zero", () =>
{
    const wg = new WalkGrid(10, 6);

    expect(wg.refcounts.length).toBe(60);
    expect(wg.refcounts.every(v => v === 0)).toBe(true);
});


test("constructor rejects non-positive dimensions", () =>
{
    expect(() => new WalkGrid(0, 10)).toThrow(Errors.GridBoundsError);
    expect(() => new WalkGrid(10, 0)).toThrow(Errors.GridBoundsError);
    expect(() => new WalkGrid(-1, 10)).toThrow(Errors.GridBoundsError);
    expect(() => new WalkGrid(10, -1)).toThrow(Errors.GridBoundsError);
    expect(() => new WalkGrid(NaN, 10)).toThrow(Errors.GridBoundsError);
});


test("constructor rejects non-positive subCellSize and non-integer subsPerMain", () =>
{
    expect(() => new WalkGrid(10, 10, 0)).toThrow(Errors.GridBoundsError);
    expect(() => new WalkGrid(10, 10, -1)).toThrow(Errors.GridBoundsError);
    expect(() => new WalkGrid(10, 10, 1, 0)).toThrow(Errors.GridBoundsError);
    expect(() => new WalkGrid(10, 10, 1, 1.5)).toThrow(Errors.GridBoundsError);
});


/******************************************************************************/
/* WALKABILITY                                                                */
/******************************************************************************/

test("isWalkable returns true for an empty cell, false once stamped", () =>
{
    const wg = new WalkGrid(8, 8);

    expect(wg.isWalkable(2, 3)).toBe(true);

    wg.applyStamp([{ sx: 2, sz: 3 }]);
    expect(wg.isWalkable(2, 3)).toBe(false);
});


test("isWalkable returns false for out-of-bounds without throwing", () =>
{
    const wg = new WalkGrid(8, 8);

    expect(wg.isWalkable(-1, 0)).toBe(false);
    expect(wg.isWalkable(0, 8)).toBe(false);
    expect(wg.isWalkable(99, 99)).toBe(false);
});


test("isWalkableAtWorld queries by world coords using subCellSize", () =>
{
    const wg = new WalkGrid(8, 8);

    wg.applyStamp([{ sx: 3, sz: 5 }]);

    // Sub-cell (3, 5) covers world [3, 4] x [5, 6].
    expect(wg.isWalkableAtWorld(3.5, 5.5)).toBe(false);
    expect(wg.isWalkableAtWorld(2.5, 5.5)).toBe(true);
    expect(wg.isWalkableAtWorld(3.5, 6.5)).toBe(true);
});


/******************************************************************************/
/* STAMP / REVERT                                                             */
/******************************************************************************/

test("applyStamp then revertStamp leaves cell walkable again", () =>
{
    const wg = new WalkGrid(8, 8);
    const stamp = [{ sx: 1, sz: 1 }, { sx: 1, sz: 2 }];

    wg.applyStamp(stamp);
    expect(wg.isWalkable(1, 1)).toBe(false);
    expect(wg.isWalkable(1, 2)).toBe(false);

    wg.revertStamp(stamp);
    expect(wg.isWalkable(1, 1)).toBe(true);
    expect(wg.isWalkable(1, 2)).toBe(true);
});


test("overlapping stamps compose via refcount; one revert keeps the other intact", () =>
{
    const wg = new WalkGrid(8, 8);
    const cellA = { sx: 4, sz: 4 };

    wg.applyStamp([cellA]);
    wg.applyStamp([cellA]);

    wg.revertStamp([cellA]);
    expect(wg.isWalkable(4, 4)).toBe(false); // still blocked by the other stamp

    wg.revertStamp([cellA]);
    expect(wg.isWalkable(4, 4)).toBe(true);
});


test("applyStamp silently skips out-of-bounds entries", () =>
{
    const wg = new WalkGrid(4, 4);

    expect(() => wg.applyStamp([{ sx: -1, sz: 0 }, { sx: 4, sz: 0 }, { sx: 2, sz: 2 }])).not.toThrow();
    expect(wg.isWalkable(2, 2)).toBe(false);
});


test("revertStamp on a zero-refcount cell is a no-op (no underflow)", () =>
{
    const wg = new WalkGrid(4, 4);

    expect(() => wg.revertStamp([{ sx: 1, sz: 1 }])).not.toThrow();
    expect(wg.isWalkable(1, 1)).toBe(true);
    // Subsequent apply still works correctly.
    wg.applyStamp([{ sx: 1, sz: 1 }]);
    expect(wg.isWalkable(1, 1)).toBe(false);
});


/******************************************************************************/
/* COORD HELPERS                                                              */
/******************************************************************************/

test("worldToSub floors to the sub-cell's low corner", () =>
{
    const wg = new WalkGrid(8, 8);

    expect(wg.worldToSub(0, 0)).toEqual({ sx: 0, sz: 0 });
    expect(wg.worldToSub(0.99, 0.99)).toEqual({ sx: 0, sz: 0 });
    expect(wg.worldToSub(1, 1)).toEqual({ sx: 1, sz: 1 });
    expect(wg.worldToSub(3.5, 7.2)).toEqual({ sx: 3, sz: 7 });
});


test("subToWorld returns the centre of the sub-cell", () =>
{
    const wg = new WalkGrid(8, 8);

    expect(wg.subToWorld(0, 0)).toEqual({ x: 0.5, z: 0.5 });
    expect(wg.subToWorld(3, 5)).toEqual({ x: 3.5, z: 5.5 });
});


test("subToWorld + worldToSub round-trip lands in the same sub-cell", () =>
{
    const wg = new WalkGrid(8, 8);

    for(let sx = 0; sx < 8; sx++)
    {
        for(let sz = 0; sz < 8; sz++)
        {
            const { x, z }              = wg.subToWorld(sx, sz);
            const { sx: rsx, sz: rsz }  = wg.worldToSub(x, z);
            expect(rsx).toBe(sx);
            expect(rsz).toBe(sz);
        }
    }
});


test("mainToSub returns the low-corner sub-cell of the main cell", () =>
{
    const wg = new WalkGrid(80, 80);

    expect(wg.mainToSub(0, 0)).toEqual({ sx: 0, sz: 0 });
    expect(wg.mainToSub(1, 1)).toEqual({ sx: 4, sz: 4 });
    expect(wg.mainToSub(7, 7)).toEqual({ sx: 28, sz: 28 });
});


/******************************************************************************/
/* CLEAR                                                                      */
/******************************************************************************/

test("clear resets every cell to walkable", () =>
{
    const wg = new WalkGrid(4, 4);

    wg.applyStamp([{ sx: 0, sz: 0 }, { sx: 1, sz: 2 }, { sx: 3, sz: 3 }]);
    wg.applyStamp([{ sx: 1, sz: 2 }]); // refcount of 2 on (1, 2)

    wg.clear();
    expect(wg.isWalkable(0, 0)).toBe(true);
    expect(wg.isWalkable(1, 2)).toBe(true);
    expect(wg.isWalkable(3, 3)).toBe(true);
    expect(wg.refcounts.every(v => v === 0)).toBe(true);
});
