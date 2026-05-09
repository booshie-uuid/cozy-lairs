import { test, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";

import { AssetManager } from "../../scripts/modules/engine/asset-manager.js";
import * as Errors from "../../scripts/modules/engine/errors.js";


/******************************************************************************/
/* MANIFEST FETCH MOCKING                                                     */
/******************************************************************************/

let mockManifest = null;
let fetchSpy     = null;

function installMockFetch(manifest)
{
    mockManifest = manifest;
    fetchSpy = vi.fn(async () =>
    ({
        ok:     true,
        status: 200,
        json:   async () => mockManifest
    }));
    globalThis.fetch = fetchSpy;
}

beforeEach(() =>
{
    mockManifest = null;
    fetchSpy     = null;
});

afterEach(() =>
{
    delete globalThis.fetch;
});


/******************************************************************************/
/* GLTF LOADER PATCH                                                          */
/******************************************************************************/

/*
 * The AssetManager uses an internal GLTFLoader instance. We replace its
 * `.load` method per-test to return canned scenes without touching the
 * filesystem. Each canned response is a Promise-resolving group.
 */

function patchLoader(manager, builder)
{
    manager.loader.load = (path, onLoad, onProgress, onError) =>
    {
        try
        {
            const root = builder(path);
            queueMicrotask(() => onLoad({ scene: root, scenes: [root], animations: [] }));
        }
        catch(err)
        {
            queueMicrotask(() => onError(err));
        }
    };
}


/******************************************************************************/
/* TESTS                                                                      */
/******************************************************************************/

test("loadManifest indexes valid entries", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "a.one", path: "a.gltf", type: "gltf", tier: "core" },
            { id: "a.two", path: "b.gltf", type: "gltf", tier: "world" }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(manager.index.size).toBe(2);
    expect(manager.index.get("a.one").path).toBe("a.gltf");
});


test("loadManifest throws ManifestError for non-array assets field", async () =>
{
    installMockFetch({ version: 1, assets: "not-an-array" });

    const manager = new AssetManager("/manifest.json");
    await expect(manager.loadManifest()).rejects.toThrow(Errors.ManifestError);
});


test("loadManifest throws ManifestError for duplicate ids", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "dup", path: "a.gltf", type: "gltf", tier: "core" },
            { id: "dup", path: "b.gltf", type: "gltf", tier: "core" }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    await expect(manager.loadManifest()).rejects.toThrow(/duplicate/);
});


test("loadManifest throws ManifestError for unknown tier name", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "x", path: "x.gltf", type: "gltf", tier: "weekly" }]
    });

    const manager = new AssetManager("/manifest.json");
    await expect(manager.loadManifest()).rejects.toThrow(/tier/);
});


test("loadManifest throws ManifestError for unknown type", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "x", path: "x.fbx", type: "fbx", tier: "core" }]
    });

    const manager = new AssetManager("/manifest.json");
    await expect(manager.loadManifest()).rejects.toThrow(/type/);
});


test("loadManifest throws ManifestError on missing fields", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "x", tier: "core" }]
    });

    const manager = new AssetManager("/manifest.json");
    await expect(manager.loadManifest()).rejects.toThrow(Errors.ManifestError);
});


test("loadManifest throws ManifestError when fetch returns non-OK", async () =>
{
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));

    const manager = new AssetManager("/manifest.json");
    await expect(manager.loadManifest()).rejects.toThrow(/HTTP 404/);
});


test("preloadCore loads only core-tier entries and reports progress", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "core.one", path: "1.gltf", type: "gltf", tier: "core" },
            { id: "core.two", path: "2.gltf", type: "gltf", tier: "core" },
            { id: "lazy.one", path: "3.gltf", type: "gltf", tier: "world" }
        ]
    });

    const progress = [];
    const manager = new AssetManager("/manifest.json", (loaded, total, id) =>
    {
        progress.push({ loaded, total, id });
    });
    patchLoader(manager, () => new THREE.Group());
    await manager.loadManifest();
    await manager.preloadCore();

    expect(manager.has("core.one")).toBe(true);
    expect(manager.has("core.two")).toBe(true);
    expect(manager.has("lazy.one")).toBe(false);

    expect(progress.length).toBe(2);
    expect(progress[progress.length - 1].loaded).toBe(2);
    expect(progress[progress.length - 1].total).toBe(2);
});


test("get returns a clone, not the cached instance", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "test.group", path: "g.gltf", type: "gltf", tier: "core" }]
    });

    const manager = new AssetManager("/manifest.json");
    patchLoader(manager, () =>
    {
        const root = new THREE.Group();
        root.add(new THREE.Mesh());
        return root;
    });
    await manager.loadManifest();
    await manager.preloadCore();

    const a = manager.get("test.group");
    const b = manager.get("test.group");

    expect(a).not.toBe(b);
    expect(a.children.length).toBe(1);
    expect(b.children.length).toBe(1);
});


test("get throws AssetLoadError for an unknown or unloaded id", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "x", path: "x.gltf", type: "gltf", tier: "world" }]
    });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(() => manager.get("x")).toThrow(Errors.AssetLoadError);
    expect(() => manager.get("never.heard.of")).toThrow(Errors.AssetLoadError);
});


test("load resolves a single non-core asset on demand and caches it", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "lazy", path: "l.gltf", type: "gltf", tier: "world" }]
    });

    const manager = new AssetManager("/manifest.json");
    patchLoader(manager, () => new THREE.Group());
    await manager.loadManifest();

    expect(manager.has("lazy")).toBe(false);
    await manager.load("lazy");
    expect(manager.has("lazy")).toBe(true);
});


test("concurrent load calls share a single in-flight promise", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "lazy", path: "l.gltf", type: "gltf", tier: "world" }]
    });

    let calls = 0;
    const manager = new AssetManager("/manifest.json");
    manager.loader.load = (path, onLoad) =>
    {
        calls += 1;
        queueMicrotask(() => onLoad({ scene: new THREE.Group(), scenes: [], animations: [] }));
    };

    await manager.loadManifest();

    const [a, b] = await Promise.all([manager.load("lazy"), manager.load("lazy")]);

    expect(calls).toBe(1);
    expect(a).toBe(b);
});


test("load rejects with AssetLoadError on loader failure", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "broken", path: "broken.gltf", type: "gltf", tier: "world" }]
    });

    const manager = new AssetManager("/manifest.json");
    manager.loader.load = (path, onLoad, onProgress, onError) =>
    {
        queueMicrotask(() => onError(new Error("file not found")));
    };

    await manager.loadManifest();
    await expect(manager.load("broken")).rejects.toThrow(Errors.AssetLoadError);
});


test("load throws AssetLoadError for unknown id", async () =>
{
    installMockFetch({ version: 1, assets: [] });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    await expect(manager.load("ghost")).rejects.toThrow(Errors.AssetLoadError);
});


test("rejects with AssetLoadError if loaded glTF has no scene", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "no-scene", path: "x.gltf", type: "gltf", tier: "world" }]
    });

    const manager = new AssetManager("/manifest.json");
    manager.loader.load = (path, onLoad) =>
    {
        queueMicrotask(() => onLoad({ scene: null, scenes: [], animations: [] }));
    };
    await manager.loadManifest();

    await expect(manager.load("no-scene")).rejects.toThrow(Errors.AssetLoadError);
});


test("preloadCore aggregates partial failures into a single AssetLoadError", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "ok",   path: "a.gltf", type: "gltf", tier: "core" },
            { id: "bad1", path: "b.gltf", type: "gltf", tier: "core" },
            { id: "bad2", path: "c.gltf", type: "gltf", tier: "core" }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    manager.loader.load = (path, onLoad, onProgress, onError) =>
    {
        if(path === "a.gltf")
        {
            queueMicrotask(() => onLoad({ scene: new THREE.Group(), scenes: [], animations: [] }));
        }
        else
        {
            queueMicrotask(() => onError(new Error(`fail ${path}`)));
        }
    };
    await manager.loadManifest();

    await expect(manager.preloadCore()).rejects.toThrow(/2 of 3/);
    expect(manager.has("ok")).toBe(true);
    expect(manager.has("bad1")).toBe(false);
    expect(manager.has("bad2")).toBe(false);
});


test("cacheSize reflects the number of cached assets", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "one", path: "1.gltf", type: "gltf", tier: "core" },
            { id: "two", path: "2.gltf", type: "gltf", tier: "core" }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    patchLoader(manager, () => new THREE.Group());
    await manager.loadManifest();

    expect(manager.cacheSize).toBe(0);
    await manager.preloadCore();
    expect(manager.cacheSize).toBe(2);
});


test("reload re-fetches the manifest and re-loads core assets", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "x", path: "x.gltf", type: "gltf", tier: "core" }]
    });

    const manager = new AssetManager("/manifest.json");
    patchLoader(manager, () => new THREE.Group());
    await manager.loadManifest();
    await manager.preloadCore();

    expect(manager.cacheSize).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await manager.reload();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(manager.cacheSize).toBe(1);
    expect(manager.has("x")).toBe(true);
});


test("reload picks up manifest entries added since the last load", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "old", path: "old.gltf", type: "gltf", tier: "core" }]
    });

    const manager = new AssetManager("/manifest.json");
    patchLoader(manager, () => new THREE.Group());
    await manager.loadManifest();
    await manager.preloadCore();
    expect(manager.has("old")).toBe(true);
    expect(manager.has("fresh")).toBe(false);

    // Simulate the manifest changing on disk between sessions.
    mockManifest =
    {
        version: 1,
        assets: [
            { id: "old",   path: "old.gltf",   type: "gltf", tier: "core" },
            { id: "fresh", path: "fresh.gltf", type: "gltf", tier: "core" }
        ]
    };

    await manager.reload();

    expect(manager.has("old")).toBe(true);
    expect(manager.has("fresh")).toBe(true);
    expect(manager.cacheSize).toBe(2);
});
