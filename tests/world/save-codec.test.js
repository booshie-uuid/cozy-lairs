// @vitest-environment jsdom
import { describe, test, expect, beforeAll } from "vitest";

import lzString          from "lz-string";
import * as SaveCodec    from "../../scripts/modules/world/save-codec.js";

beforeAll(() =>
{
    window.LZString = lzString;
});


function v2Snapshot(entities = [])
{
    return {
        v: 2,
        kinds:      ["decor.barrel", "wall.stone.straight", "wall.stone.corner"],
        components: ["Transform", "GridPlacement", "EdgePlacement", "CornerPlacement"],
        entities
    };
}


describe("save-codec enum helpers", () =>
{
    test("encodes each side name to its index", () =>
    {
        expect(SaveCodec.encodeSide("south")).toBe(0);
        expect(SaveCodec.encodeSide("north")).toBe(1);
        expect(SaveCodec.encodeSide("west")).toBe(2);
        expect(SaveCodec.encodeSide("east")).toBe(3);
    });

    test("decodes each side index back to its name", () =>
    {
        expect(SaveCodec.decodeSide(0)).toBe("south");
        expect(SaveCodec.decodeSide(1)).toBe("north");
        expect(SaveCodec.decodeSide(2)).toBe("west");
        expect(SaveCodec.decodeSide(3)).toBe("east");
    });

    test("encodes each corner name to its index", () =>
    {
        expect(SaveCodec.encodeCorner("NW")).toBe(0);
        expect(SaveCodec.encodeCorner("NE")).toBe(1);
        expect(SaveCodec.encodeCorner("SW")).toBe(2);
        expect(SaveCodec.encodeCorner("SE")).toBe(3);
    });

    test("decodes each corner index back to its name", () =>
    {
        expect(SaveCodec.decodeCorner(0)).toBe("NW");
        expect(SaveCodec.decodeCorner(1)).toBe("NE");
        expect(SaveCodec.decodeCorner(2)).toBe("SW");
        expect(SaveCodec.decodeCorner(3)).toBe("SE");
    });

    test("throws on unknown side names / indices", () =>
    {
        expect(() => SaveCodec.encodeSide("up")).toThrow(/Unknown side/);
        expect(() => SaveCodec.decodeSide(7)).toThrow(/Unknown side/);
    });

    test("throws on unknown corner names / indices", () =>
    {
        expect(() => SaveCodec.encodeCorner("middle")).toThrow(/Unknown corner/);
        expect(() => SaveCodec.decodeCorner(7)).toThrow(/Unknown corner/);
    });
});


describe("save-codec storage path", () =>
{
    test("round-trips an empty v2 snapshot", () =>
    {
        const snapshot = v2Snapshot();
        const encoded  = SaveCodec.encodeForStorage(snapshot);
        const result   = SaveCodec.decodeForStorage(encoded);

        expect(result.error).toBeNull();
        expect(result.snapshot).toEqual(snapshot);
    });

    test("round-trips a snapshot with entities + every enum value", () =>
    {
        const snapshot = v2Snapshot([
            [0, [[1, { cx: 3, cz: 4, rotationStep: 0 }]]],
            [1, [[2, { cx: 0, cz: 0, side: 0 }]]],
            [1, [[2, { cx: 1, cz: 0, side: 1 }]]],
            [1, [[2, { cx: 0, cz: 1, side: 2 }]]],
            [1, [[2, { cx: 0, cz: 0, side: 3 }]]],
            [2, [[3, { vx: 0, vz: 0, corner: 0 }]]],
            [2, [[3, { vx: 1, vz: 0, corner: 1 }]]],
            [2, [[3, { vx: 0, vz: 1, corner: 2 }]]],
            [2, [[3, { vx: 1, vz: 1, corner: 3 }]]]
        ]);

        const encoded = SaveCodec.encodeForStorage(snapshot);
        const result  = SaveCodec.decodeForStorage(encoded);

        expect(result.error).toBeNull();
        expect(result.snapshot).toEqual(snapshot);
    });

    test("produces a UTF-16-encoded string", () =>
    {
        const encoded = SaveCodec.encodeForStorage(v2Snapshot());

        expect(typeof encoded).toBe("string");
        expect(encoded.length).toBeGreaterThan(0);
    });

    test("returns an error on empty / non-string input", () =>
    {
        expect(SaveCodec.decodeForStorage("").error).toBeTruthy();
        expect(SaveCodec.decodeForStorage(null).error).toBeTruthy();
        expect(SaveCodec.decodeForStorage(undefined).error).toBeTruthy();
    });

    test("returns an error on a v1 raw-JSON payload (legacy autosave)", () =>
    {
        const v1String = JSON.stringify({ version: 1, entities: [] });
        const encoded  = lzString.compressToUTF16(v1String);

        const result = SaveCodec.decodeForStorage(encoded);

        expect(result.snapshot).toBeNull();
        expect(result.error).toBeTruthy();
        expect(result.error.message).toMatch(/schema version is not 2/);
    });

    test("returns an error on garbled UTF-16 input", () =>
    {
        const result = SaveCodec.decodeForStorage("not-real-lz");

        expect(result.snapshot).toBeNull();
        expect(result.error).toBeTruthy();
    });
});


describe("save-codec file path", () =>
{
    test("round-trips an empty v2 snapshot via the outer JSON wrapper", () =>
    {
        const snapshot = v2Snapshot();
        const text     = SaveCodec.encodeForFile(snapshot);
        const result   = SaveCodec.decodeForFile(text);

        expect(result.error).toBeNull();
        expect(result.snapshot).toEqual(snapshot);
    });

    test("produces parseable JSON with v:2 and an lz field", () =>
    {
        const text  = SaveCodec.encodeForFile(v2Snapshot());
        const outer = JSON.parse(text);

        expect(outer.v).toBe(2);
        expect(typeof outer.lz).toBe("string");
        expect(outer.lz.length).toBeGreaterThan(0);
    });

    test("returns an error on non-JSON input", () =>
    {
        const result = SaveCodec.decodeForFile("not json at all {{{");

        expect(result.snapshot).toBeNull();
        expect(result.error.message).toMatch(/isn't a Cozy Lairs save/);
    });

    test("returns an error on a v1-style file (missing outer v field)", () =>
    {
        const v1FileText = JSON.stringify({ version: 1, entities: [] });
        const result     = SaveCodec.decodeForFile(v1FileText);

        expect(result.snapshot).toBeNull();
        expect(result.error.message).toMatch(/Save format too old/);
    });

    test("returns an error on outer wrapper with wrong v", () =>
    {
        const wrongV = JSON.stringify({ v: 3, lz: "anything" });
        const result = SaveCodec.decodeForFile(wrongV);

        expect(result.error.message).toMatch(/Save format too old/);
    });

    test("returns an error on outer wrapper with missing lz field", () =>
    {
        const noLz   = JSON.stringify({ v: 2 });
        const result = SaveCodec.decodeForFile(noLz);

        expect(result.error.message).toMatch(/corrupted/);
    });

    test("returns an error on outer wrapper with a corrupted lz blob", () =>
    {
        const bad    = JSON.stringify({ v: 2, lz: "@@@not-base64@@@" });
        const result = SaveCodec.decodeForFile(bad);

        expect(result.error.message).toMatch(/corrupted/);
    });

    test("returns an error on lz blob decoding to an inner snapshot with wrong v", () =>
    {
        const innerJson = JSON.stringify({ v: 1, entities: [] });
        const innerLz   = lzString.compressToBase64(innerJson);
        const text      = JSON.stringify({ v: 2, lz: innerLz });

        const result = SaveCodec.decodeForFile(text);

        expect(result.snapshot).toBeNull();
        expect(result.error.message).toMatch(/schema version is not 2/);
    });
});
