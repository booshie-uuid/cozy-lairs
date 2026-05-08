import { test, expect } from "vitest";
import * as THREE from "three";

import { World }           from "../../../scripts/modules/world/world.js";
import { Grid }            from "../../../scripts/modules/world/grid.js";
import { Entity }          from "../../../scripts/modules/world/entity.js";
import { CornerPlacement } from "../../../scripts/modules/world/components/corner-placement.js";
import * as Errors         from "../../../scripts/modules/engine/errors.js";


function placeAtCorner(corner, vx = 2, vz = 1)
{
    const world  = new World(new Grid(10, 10, 4));
    const entity = new Entity("test", new THREE.Object3D());
    entity.addComponent(new CornerPlacement(vx, vz, corner));
    world.addEntity(entity);
    return entity;
}


test("position is at vertex world coords (vx*S, 0, vz*S)", () =>
{
    const e = placeAtCorner("SE", 3, 2);
    expect(e.object3D.position.x).toBeCloseTo(12);
    expect(e.object3D.position.y).toBeCloseTo(0);
    expect(e.object3D.position.z).toBeCloseTo(8);
});


test("SE corner has rotation 0 (matches asset default)", () =>
{
    expect(placeAtCorner("SE").object3D.rotation.y).toBeCloseTo(0);
});


test("SW corner has rotation π/2", () =>
{
    expect(placeAtCorner("SW").object3D.rotation.y).toBeCloseTo(Math.PI / 2);
});


test("NW corner has rotation π", () =>
{
    expect(placeAtCorner("NW").object3D.rotation.y).toBeCloseTo(Math.PI);
});


test("NE corner has rotation 3π/2", () =>
{
    expect(placeAtCorner("NE").object3D.rotation.y).toBeCloseTo(3 * Math.PI / 2);
});


test("invalid corner label throws PlacementError", () =>
{
    expect(() => new CornerPlacement(0, 0, "Middle")).toThrow(Errors.PlacementError);
    expect(() => new CornerPlacement(0, 0, "se")).toThrow(Errors.PlacementError);
    expect(() => new CornerPlacement(0, 0, "")).toThrow(Errors.PlacementError);
});


test("toJSON captures vx, vz, corner", () =>
{
    const placement = new CornerPlacement(5, 6, "NW");
    expect(placement.toJSON()).toEqual({ vx: 5, vz: 6, corner: "NW" });
});
