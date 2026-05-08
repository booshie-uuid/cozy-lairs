import { test, expect } from "vitest";
import * as Errors from "../../scripts/modules/engine/errors.js";
import * as Engine from "../../scripts/modules/engine/index.js";


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


test("engine façade re-exports every error class plus Emitter", () =>
{
    expect(Engine.CozyLairsError).toBe(Errors.CozyLairsError);
    expect(Engine.AssetLoadError).toBe(Errors.AssetLoadError);
    expect(Engine.ManifestError).toBe(Errors.ManifestError);
    expect(Engine.SaveError).toBe(Errors.SaveError);
    expect(Engine.WebGLUnavailableError).toBe(Errors.WebGLUnavailableError);
    expect(Engine.GridBoundsError).toBe(Errors.GridBoundsError);
    expect(Engine.PlacementError).toBe(Errors.PlacementError);
    expect(typeof Engine.Emitter).toBe("function");
});
