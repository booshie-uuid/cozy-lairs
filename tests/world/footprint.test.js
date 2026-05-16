import { test, expect, vi, beforeEach, afterEach } from "vitest";
import * as Footprint from "../../scripts/modules/world/footprint.js";
import { WalkGrid }    from "../../scripts/modules/world/walk-grid.js";


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

function makeAssets(records)
{
    return {
        getMeta: (kind) => (records[kind] ? records[kind].meta : null),
        getAabb: (kind) => (records[kind] ? records[kind].aabb : null)
    };
}


function aabb(minX, minZ, maxX, maxZ)
{
    return { min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 1, z: maxZ } };
}


function sortSubCells(cells)
{
    return [...cells].sort((a, b) => (a.sz - b.sz) || (a.sx - b.sx));
}


let warnSpy;

beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(()  => { warnSpy.mockRestore(); });


/******************************************************************************/
/* IDENTITY                                                                   */
/******************************************************************************/

test("centred 4×4 floor at cell (0,0) stamps every sub-cell of that main cell", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = makeAssets({ "floor.test": { meta: {}, aabb: aabb(-2, -2, 2, 2) } });

    const { subCells } = Footprint.computeFootprint({
        kind: "floor.test", cx: 0, cz: 0, rotationStep: 0, assets, walkGrid
    });

    expect(subCells.length).toBe(16);
    // Sub-cells span sx in [0, 3] and sz in [0, 3].
    const xs = new Set(subCells.map(c => c.sx));
    const zs = new Set(subCells.map(c => c.sz));
    expect([...xs].sort()).toEqual([0, 1, 2, 3]);
    expect([...zs].sort()).toEqual([0, 1, 2, 3]);
});


test("identity placement at non-origin cell offsets the stamp by mainCellSize", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = makeAssets({ "floor.test": { meta: {}, aabb: aabb(-2, -2, 2, 2) } });

    const { subCells } = Footprint.computeFootprint({
        kind: "floor.test", cx: 3, cz: 5, rotationStep: 0, assets, walkGrid
    });

    expect(subCells.length).toBe(16);
    const xs = new Set(subCells.map(c => c.sx));
    const zs = new Set(subCells.map(c => c.sz));
    expect([...xs].sort()).toEqual([12, 13, 14, 15]);
    expect([...zs].sort()).toEqual([20, 21, 22, 23]);
});


/******************************************************************************/
/* ROTATION                                                                   */
/******************************************************************************/

test("90° rotation swaps X/Z extents for a non-square AABB", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    // 6m wide × 2m deep mesh, centred at origin.
    const assets   = makeAssets({ "long.test": { meta: {}, aabb: aabb(-3, -1, 3, 1) } });

    const { subCells } = Footprint.computeFootprint({
        kind: "long.test", cx: 1, cz: 1, rotationStep: 1, assets, walkGrid
    });

    // After 90° rotation, footprint is 2m wide × 6m deep around centre (6, 6).
    // World rect [5, 7] × [3, 9]; sub-cells sx in {5,6}, sz in [3..8] → 12 cells.
    expect(subCells.length).toBe(12);
    const xs = new Set(subCells.map(c => c.sx));
    const zs = new Set(subCells.map(c => c.sz));
    expect([...xs].sort()).toEqual([5, 6]);
    expect([...zs].sort()).toEqual([3, 4, 5, 6, 7, 8]);
});


test("180° rotation of a symmetric AABB matches identity", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = makeAssets({ "floor.test": { meta: {}, aabb: aabb(-2, -2, 2, 2) } });

    const base = sortSubCells(Footprint.computeFootprint({
        kind: "floor.test", cx: 2, cz: 2, rotationStep: 0, assets, walkGrid
    }).subCells);

    const rotated = sortSubCells(Footprint.computeFootprint({
        kind: "floor.test", cx: 2, cz: 2, rotationStep: 2, assets, walkGrid
    }).subCells);

    expect(rotated).toEqual(base);
});


test("270° rotation also swaps X/Z extents (mirrors 90° for symmetric AABBs)", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = makeAssets({ "long.test": { meta: {}, aabb: aabb(-3, -1, 3, 1) } });

    const r1 = sortSubCells(Footprint.computeFootprint({
        kind: "long.test", cx: 1, cz: 1, rotationStep: 1, assets, walkGrid
    }).subCells);

    const r3 = sortSubCells(Footprint.computeFootprint({
        kind: "long.test", cx: 1, cz: 1, rotationStep: 3, assets, walkGrid
    }).subCells);

    expect(r3).toEqual(r1);
});


/******************************************************************************/
/* OFFSETS                                                                    */
/******************************************************************************/

test("xOffset shifts the stamp by integer sub-cells", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    // 1×1 cube centred at origin.
    const assets   = makeAssets({ "cube.test": { meta: {}, aabb: aabb(-0.5, -0.5, 0.5, 0.5) } });

    const base = Footprint.computeFootprint({
        kind: "cube.test", cx: 0, cz: 0, rotationStep: 0, xOffset: 0, zOffset: 0, assets, walkGrid
    });

    const shifted = Footprint.computeFootprint({
        kind: "cube.test", cx: 0, cz: 0, rotationStep: 0, xOffset: 1, zOffset: 0, assets, walkGrid
    });

    // Each stamp covers 4 sub-cells (centred 1×1 straddles a 2×2 sub-cell block).
    expect(base.subCells.length).toBe(4);
    expect(shifted.subCells.length).toBe(4);

    const baseXs    = sortSubCells(base.subCells).map(c => c.sx);
    const shiftedXs = sortSubCells(shifted.subCells).map(c => c.sx);
    // Shifted by +1m / +1 sub-cell on X.
    expect(shiftedXs).toEqual(baseXs.map(x => x + 1));
});


test("centred 1×1 cube straddles a 2×2 sub-cell block at the cell centre", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = makeAssets({ "cube.test": { meta: {}, aabb: aabb(-0.5, -0.5, 0.5, 0.5) } });

    const { subCells } = Footprint.computeFootprint({
        kind: "cube.test", cx: 0, cz: 0, rotationStep: 0, assets, walkGrid
    });

    // World rect [1.5, 2.5] × [1.5, 2.5] — 25% of each of 4 sub-cells; >= 20%.
    expect(sortSubCells(subCells)).toEqual([
        { sx: 1, sz: 1 },
        { sx: 2, sz: 1 },
        { sx: 1, sz: 2 },
        { sx: 2, sz: 2 }
    ]);
});


/******************************************************************************/
/* COVERAGE THRESHOLD                                                         */
/******************************************************************************/

test("coverage threshold rejects intrusions below MIN_SUB_CELL_COVERAGE", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    expect(Footprint.MIN_SUB_CELL_COVERAGE).toBe(0.05);

    // 0.02m × 1m sliver at the low-X edge of cell (0, 0). Each touched
    // sub-cell sees 0.02 × 1 = 0.02 area, below the 0.05 threshold.
    const assets = makeAssets({ "sliver.test": { meta: {}, aabb: aabb(-2, -1, -1.98, 0) } });

    const { subCells } = Footprint.computeFootprint({
        kind: "sliver.test", cx: 0, cz: 0, rotationStep: 0, assets, walkGrid
    });

    expect(subCells).toEqual([]);
});


test("coverage threshold accepts intrusions at or above MIN_SUB_CELL_COVERAGE", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    expect(Footprint.MIN_SUB_CELL_COVERAGE).toBe(0.05);

    // 0.06m × 1m strip aligned to one sub-cell on Z (local z = -1..0 maps to
    // world z = 1..2, the full extent of sub-cell sz=1). Stamp area =
    // 0.06 × 1 = 0.06, just above the 0.05 threshold.
    const assets = makeAssets({ "strip.test": { meta: {}, aabb: aabb(-2, -1, -1.94, 0) } });

    const { subCells } = Footprint.computeFootprint({
        kind: "strip.test", cx: 0, cz: 0, rotationStep: 0, assets, walkGrid
    });

    expect(subCells).toEqual([{ sx: 0, sz: 1 }]);
});


/******************************************************************************/
/* FALLBACKS                                                                  */
/******************************************************************************/

test("missing meta defaults to AABB primitive", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = makeAssets({ "floor.test": { meta: null, aabb: aabb(-2, -2, 2, 2) } });

    const { subCells } = Footprint.computeFootprint({
        kind: "floor.test", cx: 0, cz: 0, rotationStep: 0, assets, walkGrid
    });

    expect(subCells.length).toBe(16);
    expect(warnSpy).not.toHaveBeenCalled();
});


test("missing AABB warns and emits empty footprint", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = { getMeta: () => ({}), getAabb: () => null };

    const { subCells } = Footprint.computeFootprint({
        kind: "ghost.test", cx: 0, cz: 0, rotationStep: 0, assets, walkGrid
    });

    expect(subCells).toEqual([]);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/no AABB cached/i);
});


test("unknown collision primitive warns and falls back to AABB", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = makeAssets({
        "weird.test": { meta: { collision: "spaghetti" }, aabb: aabb(-2, -2, 2, 2) }
    });

    const { subCells } = Footprint.computeFootprint({
        kind: "weird.test", cx: 0, cz: 0, rotationStep: 0, assets, walkGrid
    });

    // Fallback AABB stamps the full 4x4.
    expect(subCells.length).toBe(16);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/unknown collision primitive/i);
});


/******************************************************************************/
/* WALL-CORNER PRIMITIVE                                                      */
/******************************************************************************/

function cornerAssets()
{
    // Manifest entry for wall.stone.corner declares the wall-corner primitive.
    return makeAssets({ "wall.stone.corner": { meta: { collision: "wall-corner" }, aabb: null } });
}


function sortByXZ(cells)
{
    return [...cells].sort((a, b) => (a.sx - b.sx) || (a.sz - b.sz));
}


test("SE corner stamps 2×2 junction + west/north arm extensions (8 sub-cells)", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = cornerAssets();
    const vx = 3, vz = 5;
    const vsx = vx * 4, vsz = vz * 4;

    const { subCells } = Footprint.computeFootprint({
        kind: "wall.stone.corner", vx, vz, corner: "SE", assets, walkGrid
    });

    expect(sortByXZ(subCells)).toEqual(sortByXZ([
        { sx: vsx - 2, sz: vsz - 1 }, { sx: vsx - 2, sz: vsz + 0 },                                  // west-arm tip
        { sx: vsx - 1, sz: vsz - 1 }, { sx: vsx - 1, sz: vsz + 0 }, { sx: vsx - 1, sz: vsz + 1 },     // junction west col + north-arm
        { sx: vsx + 0, sz: vsz - 1 }, { sx: vsx + 0, sz: vsz + 0 }, { sx: vsx + 0, sz: vsz + 1 }      // junction east col (incl. apex) + north-arm
    ]));
});


test("SW corner stamps 2×2 junction + east/north arm extensions (8 sub-cells)", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = cornerAssets();
    const vx = 3, vz = 5;
    const vsx = vx * 4, vsz = vz * 4;

    const { subCells } = Footprint.computeFootprint({
        kind: "wall.stone.corner", vx, vz, corner: "SW", assets, walkGrid
    });

    expect(sortByXZ(subCells)).toEqual(sortByXZ([
        { sx: vsx - 1, sz: vsz - 1 }, { sx: vsx - 1, sz: vsz + 0 }, { sx: vsx - 1, sz: vsz + 1 },
        { sx: vsx + 0, sz: vsz - 1 }, { sx: vsx + 0, sz: vsz + 0 }, { sx: vsx + 0, sz: vsz + 1 },
        { sx: vsx + 1, sz: vsz - 1 }, { sx: vsx + 1, sz: vsz + 0 }
    ]));
});


test("NW corner stamps 2×2 junction + east/south arm extensions (8 sub-cells)", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = cornerAssets();
    const vx = 3, vz = 5;
    const vsx = vx * 4, vsz = vz * 4;

    const { subCells } = Footprint.computeFootprint({
        kind: "wall.stone.corner", vx, vz, corner: "NW", assets, walkGrid
    });

    expect(sortByXZ(subCells)).toEqual(sortByXZ([
        { sx: vsx - 1, sz: vsz - 2 }, { sx: vsx - 1, sz: vsz - 1 }, { sx: vsx - 1, sz: vsz + 0 },
        { sx: vsx + 0, sz: vsz - 2 }, { sx: vsx + 0, sz: vsz - 1 }, { sx: vsx + 0, sz: vsz + 0 },
        { sx: vsx + 1, sz: vsz - 1 }, { sx: vsx + 1, sz: vsz + 0 }
    ]));
});


test("NE corner stamps 2×2 junction + west/south arm extensions (8 sub-cells)", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = cornerAssets();
    const vx = 3, vz = 5;
    const vsx = vx * 4, vsz = vz * 4;

    const { subCells } = Footprint.computeFootprint({
        kind: "wall.stone.corner", vx, vz, corner: "NE", assets, walkGrid
    });

    expect(sortByXZ(subCells)).toEqual(sortByXZ([
        { sx: vsx - 2, sz: vsz - 1 }, { sx: vsx - 2, sz: vsz + 0 },
        { sx: vsx - 1, sz: vsz - 2 }, { sx: vsx - 1, sz: vsz - 1 }, { sx: vsx - 1, sz: vsz + 0 },
        { sx: vsx + 0, sz: vsz - 2 }, { sx: vsx + 0, sz: vsz - 1 }, { sx: vsx + 0, sz: vsz + 0 }
    ]));
});


test("all four corner orientations produce distinct sub-cell sets", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = cornerAssets();
    const vx = 5, vz = 5;

    const sets = ["SE", "SW", "NW", "NE"].map(corner =>
    {
        const { subCells } = Footprint.computeFootprint({
            kind: "wall.stone.corner", vx, vz, corner, assets, walkGrid
        });
        return new Set(subCells.map(c => `${c.sx},${c.sz}`));
    });

    for(let i = 0; i < sets.length; i++)
    {
        for(let j = i + 1; j < sets.length; j++)
        {
            expect(sets[i]).not.toEqual(sets[j]);
        }
    }
});


test("unknown corner orientation warns and emits empty footprint", () =>
{
    const walkGrid = new WalkGrid(80, 80);
    const assets   = cornerAssets();

    const { subCells } = Footprint.computeFootprint({
        kind: "wall.stone.corner", vx: 3, vz: 5, corner: "ZZ", assets, walkGrid
    });

    expect(subCells).toEqual([]);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/unknown corner/i);
});
