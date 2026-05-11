import { test, expect } from "vitest";
import * as THREE from "three";

import { World }           from "../../scripts/modules/world/world.js";
import { Grid }            from "../../scripts/modules/world/grid.js";
import { Entity }          from "../../scripts/modules/world/entity.js";
import { GridPlacement }   from "../../scripts/modules/world/components/grid-placement.js";
import { EdgePlacement }   from "../../scripts/modules/world/components/edge-placement.js";
import { CornerPlacement } from "../../scripts/modules/world/components/corner-placement.js";
import { WallTracer }      from "../../scripts/modules/world/wall-tracer.js";


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

function makeStubAssets(kindMap = {})
{
    return {
        get(_id) { return new THREE.Mesh(); },
        getKind(id) { return kindMap[id] || null; }
    };
}


function makeFloorEntity(cx, cz)
{
    const entity = new Entity("floor.stone.basic", new THREE.Object3D());
    entity.addComponent(new GridPlacement(cx, cz, 0, { walkable: true }));
    return entity;
}


function paintFloor(world, cx, cz)
{
    const entity = makeFloorEntity(cx, cz);
    world.addEntity(entity);
    return entity;
}


function setup(kindMap = {}, width = 10, depth = 10)
{
    const world  = new World(new Grid(width, depth, 4));
    const tracer = new WallTracer({ world, assets: makeStubAssets(kindMap) });
    return { world, tracer };
}


function wallEdges(tracer)
{
    return new Set(tracer.walls.keys());
}


function cornerVertices(tracer)
{
    return new Set(tracer.corners.keys());
}


function wallEntities(world)
{
    return [...world.entities].filter(e => e.getComponent(EdgePlacement) !== undefined);
}


function cornerEntities(world)
{
    return [...world.entities].filter(e => e.getComponent(CornerPlacement) !== undefined);
}


/******************************************************************************/
/* WALL TRUTH TABLES                                                          */
/******************************************************************************/

test("single floor tile produces 4 wall edges — one canonical key per side", () =>
{
    const { tracer } = setup();
    paintFloor(tracer.world, 3, 3);

    expect(tracer.walls.size).toBe(4);
    expect(wallEdges(tracer)).toEqual(new Set([
        "3,3,north",
        "3,2,north",
        "3,3,east",
        "2,3,east"
    ]));
});


test("2x1 row of floors produces 6 wall edges — no interior wall between them", () =>
{
    const { tracer } = setup();
    paintFloor(tracer.world, 2, 2);
    paintFloor(tracer.world, 3, 2);

    expect(tracer.walls.size).toBe(6);
    expect(tracer.walls.has("2,2,east")).toBe(false);
});


test("2x2 block produces 8 perimeter walls — no interior walls", () =>
{
    const { tracer } = setup();
    paintFloor(tracer.world, 2, 2);
    paintFloor(tracer.world, 3, 2);
    paintFloor(tracer.world, 2, 3);
    paintFloor(tracer.world, 3, 3);

    expect(tracer.walls.size).toBe(8);
    expect(tracer.walls.has("2,2,east")).toBe(false);
    expect(tracer.walls.has("3,2,north")).toBe(false);
    expect(tracer.walls.has("2,2,north")).toBe(false);
    expect(tracer.walls.has("2,3,east")).toBe(false);
});


test("removing a floor from a 2x2 reopens the now-exposed edges", () =>
{
    const { tracer } = setup();
    const a = paintFloor(tracer.world, 2, 2);
    paintFloor(tracer.world, 3, 2);
    paintFloor(tracer.world, 2, 3);
    paintFloor(tracer.world, 3, 3);

    expect(tracer.walls.size).toBe(8);

    tracer.world.removeEntity(a);

    expect(tracer.walls.size).toBe(8);
    expect(tracer.walls.has("2,2,east")).toBe(true);
    expect(tracer.walls.has("2,2,north")).toBe(true);
});


test("idempotent: re-adding the same floor cell produces the same wall set", () =>
{
    const { tracer } = setup();
    paintFloor(tracer.world, 2, 2);
    const snapshot = wallEdges(tracer);

    paintFloor(tracer.world, 2, 2);
    expect(wallEdges(tracer)).toEqual(snapshot);
});


test("incremental adds produce the same end state regardless of order", () =>
{
    const a = setup();
    paintFloor(a.world, 1, 4);
    paintFloor(a.world, 2, 4);
    paintFloor(a.world, 3, 4);

    const b = setup();
    paintFloor(b.world, 2, 4);
    paintFloor(b.world, 1, 4);
    paintFloor(b.world, 3, 4);

    expect(wallEdges(a.tracer)).toEqual(wallEdges(b.tracer));
    expect(cornerVertices(a.tracer)).toEqual(cornerVertices(b.tracer));
});


test("grid-boundary cells are walled on the boundary side (OOB counts as non-floor)", () =>
{
    const { world, tracer } = setup();
    paintFloor(world, 0, 0);

    expect(tracer.walls.size).toBe(4);
    expect(tracer.walls.has("-1,0,east")).toBe(true);
    expect(tracer.walls.has("0,-1,north")).toBe(true);
});


/******************************************************************************/
/* CORNER PIECES                                                              */
/******************************************************************************/

test("single floor tile produces 4 corner pieces — one per vertex", () =>
{
    const { tracer } = setup();
    paintFloor(tracer.world, 3, 3);

    expect(tracer.corners.size).toBe(4);
    expect(cornerVertices(tracer)).toEqual(new Set([
        "3,3", "4,3", "3,4", "4,4"
    ]));
});


test("corner piece orientations match the V3 SE / SW / NW / NE pattern", () =>
{
    const { world, tracer } = setup();
    paintFloor(world, 3, 3);

    const cornerByVertex = new Map();
    for(const [key, entity] of tracer.corners.entries())
    {
        cornerByVertex.set(key, entity.getComponent(CornerPlacement).corner);
    }

    // For a single floor at (3, 3):
    //   Vertex (3, 3) — SW vertex of the floor cell, walls go N + E → SW corner orientation
    //   Vertex (4, 3) — SE vertex, walls go N + W → SE
    //   Vertex (3, 4) — NW vertex, walls go S + E → NW
    //   Vertex (4, 4) — NE vertex, walls go S + W → NE
    expect(cornerByVertex.get("3,3")).toBe("SW");
    expect(cornerByVertex.get("4,3")).toBe("SE");
    expect(cornerByVertex.get("3,4")).toBe("NW");
    expect(cornerByVertex.get("4,4")).toBe("NE");
});


test("2x2 block has 4 corner pieces — interior vertex (between the four floors) has no corner", () =>
{
    const { world, tracer } = setup();
    paintFloor(world, 2, 2);
    paintFloor(world, 3, 2);
    paintFloor(world, 2, 3);
    paintFloor(world, 3, 3);

    expect(tracer.corners.size).toBe(4);
    expect(cornerVertices(tracer)).toEqual(new Set([
        "2,2", "4,2", "2,4", "4,4"
    ]));
    // The interior vertex (3, 3) is surrounded by floors — no walls meet there.
    expect(tracer.corners.has("3,3")).toBe(false);
});


test("L-shape interior corner has the expected inward orientation", () =>
{
    // Build an L:
    //    F F F
    //    F F .
    //    F . .
    const { world, tracer } = setup();
    paintFloor(world, 0, 0);
    paintFloor(world, 0, 1);
    paintFloor(world, 0, 2);
    paintFloor(world, 1, 1);
    paintFloor(world, 1, 2);
    paintFloor(world, 2, 2);

    // Interior corner is at vertex (2, 2). Cells around the vertex:
    //   SW (1, 1) = floor, NW (1, 2) = floor, NE (2, 2) = floor,
    //   SE (2, 1) = non-floor.
    // Walls go S + E from this vertex — the L wraps the SE non-floor
    // quadrant, arms point S and E → NW corner orientation.
    const interior = tracer.corners.get("2,2");
    expect(interior).toBeTruthy();
    expect(interior.getComponent(CornerPlacement).corner).toBe("NW");
});


test("removing a floor cleans up its corner pieces", () =>
{
    const { world, tracer } = setup();
    paintFloor(world, 3, 3);
    expect(tracer.corners.size).toBe(4);

    const sole = [...world.entities].find(e =>
        e.getComponent(GridPlacement)?.walkable);
    world.removeEntity(sole);

    expect(tracer.corners.size).toBe(0);
});


/******************************************************************************/
/* WALL ENTITY GEOMETRY                                                       */
/******************************************************************************/

test("edge with corners at both endpoints places no wall entity (corner arms cover it)", () =>
{
    // A single floor cell has corners at all 4 vertices, so each wall edge
    // has corners at both endpoints. The corner pieces' arms cover the
    // entire edge between them; placing an additional half-wall would
    // Z-fight with the arms.
    const { world, tracer } = setup();
    paintFloor(world, 3, 3);

    expect(wallEntities(world).length).toBe(0);
    expect(cornerEntities(world).length).toBe(4);
    // The edge keys are still tracked (presence is real), but their entity
    // arrays are empty.
    expect(tracer.walls.size).toBe(4);
    for(const entities of tracer.walls.values())
    {
        expect(entities.length).toBe(0);
    }
});


test("interior cell of a 3x1 strip uses full straight walls on its two long sides", () =>
{
    // 3x1 row: cells (0,4), (1,4), (2,4). The middle cell (1,4) has walls on
    // its north and south sides. Each wall's endpoints are at vertices (1,4),
    // (2,4), (1,5), (2,5). At each of those vertices, only one vertical wall
    // exists (the strip's outer edge), no perpendicular wall → no corner.
    // So the middle cell's walls are full straights.
    const { world, tracer } = setup();
    paintFloor(world, 0, 4);
    paintFloor(world, 1, 4);
    paintFloor(world, 2, 4);

    // Check the wall set for the middle cell's north side
    const northKey = "1,4,north";
    expect(tracer.walls.has(northKey)).toBe(true);
    const middleNorth = tracer.walls.get(northKey);
    expect(middleNorth.length).toBe(1);
    expect(middleNorth[0].kind).toBe("wall.stone.straight");
});


test("end-cap cell of a strip has its end wall covered by corner arms only", () =>
{
    // 3x1 row: end cell (0, 4). Its west side meets corners at both endpoints
    // (SW and NW corners of the strip). The corner-piece arms at those
    // vertices cover the whole edge — no additional half-wall is placed.
    const { world, tracer } = setup();
    paintFloor(world, 0, 4);
    paintFloor(world, 1, 4);
    paintFloor(world, 2, 4);

    const westKey = "-1,4,east";
    expect(tracer.walls.has(westKey)).toBe(true);
    expect(tracer.walls.get(westKey).length).toBe(0);
});


test("wall placement uses the floor cell's perspective for orientation", () =>
{
    // The middle cell of a 3x1 strip has full straight walls on its two
    // long sides (no corners at either endpoint). Use that to verify
    // EdgePlacement is built using the floor cell's coords + side.
    const { world } = setup();
    paintFloor(world, 0, 4);
    paintFloor(world, 1, 4);
    paintFloor(world, 2, 4);

    const middleNorth = wallEntities(world).find(e =>
    {
        const ep = e.getComponent(EdgePlacement);
        return ep.cx === 1 && ep.cz === 4 && ep.side === "north";
    });
    expect(middleNorth).toBeTruthy();
});


/******************************************************************************/
/* DISPOSE                                                                    */
/******************************************************************************/

/******************************************************************************/
/* WALL DECOR CASCADE                                                         */
/******************************************************************************/

test("cascade-removes wall decor when the underlying wall disappears", () =>
{
    const { world } = setup({ "decor.banner.blue": "decor.wall" });
    paintFloor(world, 3, 3);

    const banner = new Entity("decor.banner.blue", new THREE.Object3D());
    banner.addComponent(new EdgePlacement(3, 3, "north"));
    world.addEntity(banner);
    expect(world.entities.has(banner)).toBe(true);

    paintFloor(world, 3, 4);

    expect(world.entities.has(banner)).toBe(false);
});


test("wall decor is preserved when the wall is rebuilt with new geometry", () =>
{
    const { world } = setup({ "decor.banner.blue": "decor.wall" });
    paintFloor(world, 3, 3);

    const banner = new Entity("decor.banner.blue", new THREE.Object3D());
    banner.addComponent(new EdgePlacement(3, 3, "north"));
    world.addEntity(banner);

    paintFloor(world, 4, 3);

    expect(world.entities.has(banner)).toBe(true);
});


test("cascade ignores non-decor.wall entities even when they sit on a removed edge", () =>
{
    const { world } = setup();
    paintFloor(world, 3, 3);

    const stray = new Entity("decor.barrel", new THREE.Object3D());
    stray.addComponent(new EdgePlacement(3, 3, "north"));
    world.addEntity(stray);

    paintFloor(world, 3, 4);

    expect(world.entities.has(stray)).toBe(true);
});


/******************************************************************************/
/* DISPOSE                                                                    */
/******************************************************************************/

test("dispose unsubscribes from world events and clears wall + corner sets", () =>
{
    const { world, tracer } = setup();
    paintFloor(world, 3, 3);
    expect(tracer.walls.size).toBe(4);
    expect(tracer.corners.size).toBe(4);

    tracer.dispose();

    expect(tracer.walls.size).toBe(0);
    expect(tracer.corners.size).toBe(0);

    paintFloor(world, 5, 5);
    expect(tracer.walls.size).toBe(0);
    expect(tracer.corners.size).toBe(0);
});
