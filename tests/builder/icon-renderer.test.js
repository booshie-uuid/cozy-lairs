// @vitest-environment jsdom

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";

import { IconRenderer } from "../../scripts/modules/builder/icon-renderer.js";


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

let consoleWarnSpy;

beforeEach(() =>
{
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() =>
{
    consoleWarnSpy.mockRestore();
});


function makeAssets(entries)
{
    // entries: { id, kind, displayName, mesh? }[]
    const byId = new Map(entries.map(e => [e.id, e]));
    return {
        listAllIds() { return entries.map(e => e.id); },
        getKind(id)
        {
            const e = byId.get(id);
            return e ? (e.kind ?? null) : null;
        },
        getDisplayName(id)
        {
            const e = byId.get(id);
            return e ? (e.displayName ?? null) : null;
        },
        get(id)
        {
            const e = byId.get(id);
            if(!e || !e.mesh) { throw new Error(`Asset "${id}" not loaded.`); }
            return e.mesh;
        }
    };
}


/******************************************************************************/
/* TESTS                                                                      */
/******************************************************************************/

test("renderCatalogue returns a Map with an entry per kind-annotated id", () =>
{
    const renderer = new IconRenderer();
    const assets = makeAssets([
        { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel", mesh: new THREE.Mesh() },
        { id: "decor.crate",  kind: "decor.floor", displayName: "Crate",  mesh: new THREE.Mesh() },
        { id: "wall.basic",   kind: null,          displayName: null }     // no kind → skipped
    ]);

    const result = renderer.renderCatalogue(assets);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(2);
    expect(result.has("decor.barrel")).toBe(true);
    expect(result.has("decor.crate")).toBe(true);
    expect(result.has("wall.basic")).toBe(false);
});


test("each dataURL is a PNG data URL", () =>
{
    const renderer = new IconRenderer();
    const assets = makeAssets([
        { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel", mesh: new THREE.Mesh() }
    ]);

    const result = renderer.renderCatalogue(assets);
    const dataURL = result.get("decor.barrel");

    expect(typeof dataURL).toBe("string");
    expect(dataURL.startsWith("data:image/png")).toBe(true);
});


test("entries that throw on assets.get fall back to a text tile (no exception)", () =>
{
    // jsdom has no WebGL — every entry will fail the WebGL init and fall through
    // to text-fallback regardless. This test exercises the explicit "asset
    // not loaded" path on top of that.
    const renderer = new IconRenderer();
    const assets = makeAssets([
        { id: "decor.ghost", kind: "decor.floor", displayName: "Ghost" }    // no mesh
    ]);

    const result = renderer.renderCatalogue(assets);
    const dataURL = result.get("decor.ghost");

    expect(dataURL.startsWith("data:image/png")).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalled();
});


test("entries with no displayName fall back to the id as the tile label", () =>
{
    const renderer = new IconRenderer();
    const assets = makeAssets([
        { id: "decor.bare", kind: "decor.floor", displayName: null }
    ]);

    // Just verifying no exception and a valid dataURL is produced.
    const result = renderer.renderCatalogue(assets);
    expect(result.get("decor.bare").startsWith("data:image/png")).toBe(true);
});


test("dispose tears down the WebGL renderer (idempotent)", () =>
{
    const renderer = new IconRenderer();
    renderer.dispose();        // no-op when never initialised
    renderer.dispose();        // double-dispose is safe
    expect(renderer.renderer).toBe(null);
});


test("renderCatalogue called twice on the same renderer is idempotent", () =>
{
    const renderer = new IconRenderer();
    const assets = makeAssets([
        { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel", mesh: new THREE.Mesh() }
    ]);

    const a = renderer.renderCatalogue(assets);
    const b = renderer.renderCatalogue(assets);

    expect(a.size).toBe(1);
    expect(b.size).toBe(1);
    // Same input + deterministic fallback → same dataURL each call.
    expect(a.get("decor.barrel")).toBe(b.get("decor.barrel"));
});
