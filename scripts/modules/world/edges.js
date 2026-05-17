/******************************************************************************/
/* EDGE GEOMETRY HELPERS                                                      */
/******************************************************************************/

// Shared cell-side / wall-edge primitives. Consumed by WorldEditor and
// WallTracer; both used to maintain their own copies before V7.11.

const SIDES = ["north", "south", "east", "west"];

const OPPOSITE_SIDE =
{
    north: "south",
    south: "north",
    east:  "west",
    west:  "east"
};


function neighbourCell(cx, cz, side)
{
    switch(side)
    {
        case "north": return { ncx: cx,     ncz: cz + 1 };
        case "south": return { ncx: cx,     ncz: cz - 1 };
        case "east":  return { ncx: cx + 1, ncz: cz     };
        case "west":  return { ncx: cx - 1, ncz: cz     };
    }
    throw new Error(`Edges.neighbourCell: invalid side "${side}".`);
}


// Canonical key for the same physical edge regardless of which cell+side
// names it (e.g. cell A's "north" and cell B's "south" map to one key).
function edgeKey(cx, cz, side)
{
    switch(side)
    {
        case "north": return `${cx},${cz},north`;
        case "south": return `${cx},${cz - 1},north`;
        case "east":  return `${cx},${cz},east`;
        case "west":  return `${cx - 1},${cz},east`;
    }
    throw new Error(`Edges.edgeKey: invalid side "${side}".`);
}


// Resolve an edge to its floor-bearing cell + side.
function floorSideOf(grid, cx, cz, side)
{
    if(grid.isFloor(cx, cz)) { return { cx, cz, side }; }
    const { ncx, ncz } = neighbourCell(cx, cz, side);
    return { cx: ncx, cz: ncz, side: OPPOSITE_SIDE[side] };
}


// Vertex at the "lower" end of an edge (relative to the edge's owning cell).
function endpointLow(cx, cz, side)
{
    switch(side)
    {
        case "north": return [cx,     cz + 1];
        case "south": return [cx,     cz    ];
        case "east":  return [cx + 1, cz    ];
        case "west":  return [cx,     cz    ];
    }
    throw new Error(`Edges.endpointLow: invalid side "${side}".`);
}


function endpointHigh(cx, cz, side)
{
    switch(side)
    {
        case "north": return [cx + 1, cz + 1];
        case "south": return [cx + 1, cz    ];
        case "east":  return [cx + 1, cz + 1];
        case "west":  return [cx,     cz + 1];
    }
    throw new Error(`Edges.endpointHigh: invalid side "${side}".`);
}


export
{
    SIDES,
    OPPOSITE_SIDE,
    neighbourCell,
    edgeKey,
    floorSideOf,
    endpointLow,
    endpointHigh
};
