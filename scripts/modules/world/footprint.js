/******************************************************************************/
/* FOOTPRINT                                                                  */
/******************************************************************************/

/*
 * Pure-function module: projects an entity's local AABB through its placement
 * transform onto the walk-grid, returning the list of sub-cells it occupies.
 *
 * Primitives are dispatched off `meta.collision` from the asset record:
 *   - `aabb` (default) — coverage-thresholded box stamp; rotation-aware.
 *   - `wall-corner`    — L-shape stamp for `wall.stone.corner`; arm tips only.
 *
 * Unknown primitive or missing AABB warns and falls back to an empty footprint
 * (entity blocks nothing rather than crashing the load).
 */

const MIN_SUB_CELL_COVERAGE = 0.05;


/******************************************************************************/
/* PUBLIC                                                                     */
/******************************************************************************/

function computeFootprint(options)
{
    const { kind, assets } = options;

    const meta = (assets && assets.getMeta(kind)) || {};
    const primitive = meta.collision || "aabb";
    const stamper = STAMPERS[primitive];

    if(!stamper)
    {
        console.warn(`footprint: unknown collision primitive "${primitive}" for kind "${kind}" — falling back to AABB.`);
        return STAMPERS.aabb(options);
    }

    return stamper(options);
}


/******************************************************************************/
/* AABB PRIMITIVE                                                             */
/******************************************************************************/

function aabbStamp(options)
{
    const { kind, assets, walkGrid, worldTransform } = options;

    const aabb = assets.getAabb(kind);

    if(!aabb)
    {
        console.warn(`footprint.aabb: no AABB cached for kind "${kind}" — emitting empty footprint.`);
        return { subCells: [] };
    }

    const transform = resolveWorldTransform(options, walkGrid);

    const localCorners =
    [
        { x: aabb.min.x, z: aabb.min.z },
        { x: aabb.max.x, z: aabb.min.z },
        { x: aabb.min.x, z: aabb.max.z },
        { x: aabb.max.x, z: aabb.max.z }
    ];

    let worldMinX = Infinity, worldMaxX = -Infinity;
    let worldMinZ = Infinity, worldMaxZ = -Infinity;

    for(const corner of localCorners)
    {
        const rotated = rotateYRadians(corner.x, corner.z, transform.rotationRadians);
        const wx = rotated.x + transform.x;
        const wz = rotated.z + transform.z;
        if(wx < worldMinX) { worldMinX = wx; }
        if(wx > worldMaxX) { worldMaxX = wx; }
        if(wz < worldMinZ) { worldMinZ = wz; }
        if(wz > worldMaxZ) { worldMaxZ = wz; }
    }

    return { subCells: subCellsByCoverage(worldMinX, worldMinZ, worldMaxX, worldMaxZ, walkGrid.subCellSize) };
}


function resolveWorldTransform(options, walkGrid)
{
    if(options.worldTransform)
    {
        return options.worldTransform;
    }

    const { cx, cz, rotationStep, xOffset = 0, zOffset = 0 } = options;
    const half = walkGrid.mainCellSize / 2;

    return {
        x:               cx * walkGrid.mainCellSize + half + xOffset,
        z:               cz * walkGrid.mainCellSize + half + zOffset,
        rotationRadians: rotationStep * (Math.PI / 2)
    };
}


/******************************************************************************/
/* WALL-CORNER PRIMITIVE                                                      */
/******************************************************************************/

/*
 * Corner pieces are vertex-anchored: `vx, vz` are vertex coords on the main
 * grid; `corner` is one of SE / SW / NW / NE per `CornerPlacement`. Each
 * orientation stamps EIGHT sub-cells — the 2×2 junction block centred on the
 * vertex (1m wall thickness straddling each boundary, four quadrants total)
 * plus a 2-cell extension along each arm (one full sub-cell beyond the
 * junction on each arm's two-cell-wide thickness band).
 *
 * The previous 7-cell layout omitted the junction quadrant on the L's
 * convex (outer) side, which left an unstamped apex sub-cell that minions
 * could walk through — the very point where two wall sections meet.
 *
 * Deltas measured from the vertex sub-coord
 * `(vsx, vsz) = mainToSub(vx, vz)`.
 */

const ARMS_BY_CORNER =
{
    /* SE corner: arms run -X (west) and +Z (north). Junction + west-arm + north-arm extensions. */
    SE:
    [
        { dsx: -1, dsz: -1 }, { dsx:  0, dsz: -1 },
        { dsx: -1, dsz:  0 }, { dsx:  0, dsz:  0 },
        { dsx: -2, dsz: -1 }, { dsx: -2, dsz:  0 },
        { dsx: -1, dsz:  1 }, { dsx:  0, dsz:  1 }
    ],
    /* SW corner: arms run +X (east) and +Z (north). */
    SW:
    [
        { dsx: -1, dsz: -1 }, { dsx:  0, dsz: -1 },
        { dsx: -1, dsz:  0 }, { dsx:  0, dsz:  0 },
        { dsx:  1, dsz: -1 }, { dsx:  1, dsz:  0 },
        { dsx: -1, dsz:  1 }, { dsx:  0, dsz:  1 }
    ],
    /* NW corner: arms run +X (east) and -Z (south). */
    NW:
    [
        { dsx: -1, dsz: -1 }, { dsx:  0, dsz: -1 },
        { dsx: -1, dsz:  0 }, { dsx:  0, dsz:  0 },
        { dsx:  1, dsz: -1 }, { dsx:  1, dsz:  0 },
        { dsx: -1, dsz: -2 }, { dsx:  0, dsz: -2 }
    ],
    /* NE corner: arms run -X (west) and -Z (south). */
    NE:
    [
        { dsx: -1, dsz: -1 }, { dsx:  0, dsz: -1 },
        { dsx: -1, dsz:  0 }, { dsx:  0, dsz:  0 },
        { dsx: -2, dsz: -1 }, { dsx: -2, dsz:  0 },
        { dsx: -1, dsz: -2 }, { dsx:  0, dsz: -2 }
    ]
};


function wallCornerStamp(options)
{
    const { vx, vz, corner, walkGrid } = options;

    const arms = ARMS_BY_CORNER[corner];

    if(!arms)
    {
        console.warn(`footprint.wall-corner: unknown corner "${corner}" — emitting empty footprint.`);
        return { subCells: [] };
    }

    const { sx: vsx, sz: vsz } = walkGrid.mainToSub(vx, vz);

    const subCells = arms.map(arm => ({ sx: vsx + arm.dsx, sz: vsz + arm.dsz }));
    return { subCells };
}


/******************************************************************************/
/* INTERNAL                                                                   */
/******************************************************************************/

function rotateYRadians(x, z, theta)
{
    /* Three.js Y-rotation: (x, z) → (x·cos(θ) + z·sin(θ), -x·sin(θ) + z·cos(θ)). */
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return { x: x * cos + z * sin, z: -x * sin + z * cos };
}


const COVERAGE_EPSILON = 1e-9;


function subCellsByCoverage(minX, minZ, maxX, maxZ, subCellSize)
{
    const subArea = subCellSize * subCellSize;
    const threshold = MIN_SUB_CELL_COVERAGE * subArea - COVERAGE_EPSILON;

    const sxStart = Math.floor(minX / subCellSize);
    const sxEnd   = Math.floor((maxX - 1e-9) / subCellSize);
    const szStart = Math.floor(minZ / subCellSize);
    const szEnd   = Math.floor((maxZ - 1e-9) / subCellSize);

    const subCells = [];

    for(let sz = szStart; sz <= szEnd; sz++)
    {
        const cellMinZ = sz * subCellSize;
        const cellMaxZ = cellMinZ + subCellSize;

        for(let sx = sxStart; sx <= sxEnd; sx++)
        {
            const cellMinX = sx * subCellSize;
            const cellMaxX = cellMinX + subCellSize;

            const overlapX = Math.min(maxX, cellMaxX) - Math.max(minX, cellMinX);
            const overlapZ = Math.min(maxZ, cellMaxZ) - Math.max(minZ, cellMinZ);

            if(overlapX <= 0 || overlapZ <= 0) { continue; }

            const area = overlapX * overlapZ;
            if(area >= threshold) { subCells.push({ sx, sz }); }
        }
    }

    return subCells;
}


const STAMPERS =
{
    "aabb":        aabbStamp,
    "wall-corner": wallCornerStamp
};


export { computeFootprint, MIN_SUB_CELL_COVERAGE };
