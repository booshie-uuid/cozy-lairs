import { test, expect } from "vitest";
import * as THREE from "three";

import { World }         from "../../../scripts/modules/world/world.js";
import { Grid }          from "../../../scripts/modules/world/grid.js";
import { Entity }        from "../../../scripts/modules/world/entity.js";
import { EdgePlacement } from "../../../scripts/modules/world/components/edge-placement.js";
import * as Errors       from "../../../scripts/modules/engine/errors.js";


function placeOnEdge(cx, cz, side, lengthOffset = 0, originOffset = 0)
{
    const world  = new World(new Grid(10, 10, 4));
    const entity = new Entity("test", new THREE.Object3D());
    entity.addComponent(new EdgePlacement(cx, cz, side, lengthOffset, originOffset));
    world.addEntity(entity);
    return entity;
}


test("south side: position at south edge, rotation 0", () =>
{
    const e = placeOnEdge(2, 1, "south");
    expect(e.object3D.position.x).toBeCloseTo(10);
    expect(e.object3D.position.z).toBeCloseTo(4);
    expect(e.object3D.rotation.y).toBeCloseTo(0);
});


test("north side: position at north edge, rotation π", () =>
{
    const e = placeOnEdge(2, 1, "north");
    expect(e.object3D.position.x).toBeCloseTo(10);
    expect(e.object3D.position.z).toBeCloseTo(8);
    expect(e.object3D.rotation.y).toBeCloseTo(Math.PI);
});


test("west side: position at west edge, rotation π/2", () =>
{
    const e = placeOnEdge(2, 1, "west");
    expect(e.object3D.position.x).toBeCloseTo(8);
    expect(e.object3D.position.z).toBeCloseTo(6);
    expect(e.object3D.rotation.y).toBeCloseTo(Math.PI / 2);
});


test("east side: position at east edge, rotation -π/2", () =>
{
    const e = placeOnEdge(2, 1, "east");
    expect(e.object3D.position.x).toBeCloseTo(12);
    expect(e.object3D.position.z).toBeCloseTo(6);
    expect(e.object3D.rotation.y).toBeCloseTo(-Math.PI / 2);
});


test("lengthOffset shifts X for south/north sides", () =>
{
    expect(placeOnEdge(2, 1, "south", +1).object3D.position.x).toBeCloseTo(11);
    expect(placeOnEdge(2, 1, "south", -1).object3D.position.x).toBeCloseTo(9);
    expect(placeOnEdge(2, 1, "north", +1).object3D.position.x).toBeCloseTo(11);
});


test("lengthOffset shifts Z for east/west sides", () =>
{
    expect(placeOnEdge(2, 1, "west",  +1).object3D.position.z).toBeCloseTo(7);
    expect(placeOnEdge(2, 1, "west",  -1).object3D.position.z).toBeCloseTo(5);
    expect(placeOnEdge(2, 1, "east",  -1).object3D.position.z).toBeCloseTo(5);
});


test("originOffset on south side shifts world X by offset (cos=1, sin=0)", () =>
{
    const e = placeOnEdge(2, 1, "south", 0, -1);
    expect(e.object3D.position.x).toBeCloseTo(9);
    expect(e.object3D.position.z).toBeCloseTo(4);
});


test("originOffset on west side shifts world Z by offset (cos=0, sin=1)", () =>
{
    const e = placeOnEdge(2, 1, "west", 0, -1);
    expect(e.object3D.position.x).toBeCloseTo(8);
    expect(e.object3D.position.z).toBeCloseTo(7);
});


test("invalid side throws PlacementError", () =>
{
    expect(() => new EdgePlacement(0, 0, "diagonal")).toThrow(Errors.PlacementError);
    expect(() => new EdgePlacement(0, 0, "")).toThrow(Errors.PlacementError);
});


test("toJSON captures all five fields", () =>
{
    const placement = new EdgePlacement(3, 5, "north", 1, -1);
    expect(placement.toJSON()).toEqual({
        cx:           3,
        cz:           5,
        side:         "north",
        lengthOffset: 1,
        originOffset: -1
    });
});


test("default lengthOffset and originOffset are 0", () =>
{
    const placement = new EdgePlacement(0, 0, "south");
    expect(placement.lengthOffset).toBe(0);
    expect(placement.originOffset).toBe(0);
});
