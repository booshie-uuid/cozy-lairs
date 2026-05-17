import { test, expect } from "vitest";
import * as Errors from "../../scripts/modules/engine/errors.js";


const SUBCLASS_NAMES = [
    "AssetLoadError",
    "ManifestError",
    "SaveError",
    "WebGLUnavailableError",
    "GridBoundsError",
    "PlacementError"
];


test("CozyLairsError extends Error", () =>
{
    const err = new Errors.CozyLairsError("oops");
    expect(err instanceof Error).toBe(true);
    expect(err.name).toBe("CozyLairsError");
    expect(err.message).toBe("oops");
});


for(const name of SUBCLASS_NAMES)
{
    test(`${name} extends CozyLairsError and Error`, () =>
    {
        const ErrorClass = Errors[name];
        const err = new ErrorClass("test");
        expect(err instanceof Error).toBe(true);
        expect(err instanceof Errors.CozyLairsError).toBe(true);
        expect(err instanceof ErrorClass).toBe(true);
    });

    test(`${name}.name reports the subclass name`, () =>
    {
        const err = new Errors[name]("test");
        expect(err.name).toBe(name);
    });
}


test("error stack is preserved when thrown", () =>
{
    let caught;
    try
    {
        throw new Errors.AssetLoadError("missing");
    }
    catch(err)
    {
        caught = err;
    }

    expect(caught).toBeDefined();
    expect(typeof caught.stack).toBe("string");
    expect(caught.stack.length > 0).toBe(true);
});


