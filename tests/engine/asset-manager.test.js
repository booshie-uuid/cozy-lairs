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


/******************************************************************************/
/* CATALOGUE FIELDS                                                           */
/******************************************************************************/

test("loadManifest preserves kind, displayName, and meta on annotated entries", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            {
                id: "decor.barrel", path: "b.gltf", type: "gltf", tier: "core",
                kind: "decor.floor", displayName: "Barrel",
                meta: { cost: 5, requiresUnlock: false }
            }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(manager.getKind("decor.barrel")).toBe("decor.floor");
    expect(manager.getDisplayName("decor.barrel")).toBe("Barrel");
    expect(manager.getMeta("decor.barrel")).toEqual({ cost: 5, requiresUnlock: false });
});


test("loadManifest defaults kind/displayName to null and meta to {} on unannotated entries", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "wall.straight", path: "w.gltf", type: "gltf", tier: "core" }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(manager.getKind("wall.straight")).toBe(null);
    expect(manager.getDisplayName("wall.straight")).toBe(null);
    expect(manager.getMeta("wall.straight")).toEqual({});
});


test("getMeta round-trips an arbitrary nested object verbatim", async () =>
{
    const nested = { tags: ["dungeon", "stone"], cost: { gold: 10, wood: 2 }, requiresUnlock: true };
    installMockFetch({
        version: 1,
        assets: [
            {
                id: "decor.special", path: "s.gltf", type: "gltf", tier: "core",
                kind: "decor.floor", displayName: "Special", meta: nested
            }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(manager.getMeta("decor.special")).toEqual(nested);
});


test("listByKind returns only entries matching the requested kind", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "decor.barrel", path: "a.gltf", type: "gltf", tier: "core", kind: "decor.floor", displayName: "Barrel" },
            { id: "decor.crate",  path: "b.gltf", type: "gltf", tier: "core", kind: "decor.floor", displayName: "Crate" },
            { id: "decor.banner", path: "c.gltf", type: "gltf", tier: "world", kind: "decor.wall", displayName: "Banner" },
            { id: "char.minion",  path: "d.gltf", type: "gltf", tier: "core", kind: "character", displayName: "Minion" },
            { id: "wall.basic",   path: "e.gltf", type: "gltf", tier: "core" }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(manager.listByKind("decor.floor")).toEqual([
        { id: "decor.barrel", displayName: "Barrel" },
        { id: "decor.crate",  displayName: "Crate" }
    ]);
    expect(manager.listByKind("decor.wall")).toEqual([
        { id: "decor.banner", displayName: "Banner" }
    ]);
    expect(manager.listByKind("character")).toEqual([
        { id: "char.minion", displayName: "Minion" }
    ]);
    expect(manager.listByKind("decor.nope")).toEqual([]);
});


test("getKind / getDisplayName / getMeta throw AssetLoadError for unknown id", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "known", path: "k.gltf", type: "gltf", tier: "core" }]
    });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(() => manager.getKind("ghost")).toThrow(Errors.AssetLoadError);
    expect(() => manager.getDisplayName("ghost")).toThrow(Errors.AssetLoadError);
    expect(() => manager.getMeta("ghost")).toThrow(Errors.AssetLoadError);
});


test("listAllIds returns every manifest id in declaration order", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "one",   path: "1.gltf", type: "gltf", tier: "core" },
            { id: "two",   path: "2.gltf", type: "gltf", tier: "core" },
            { id: "three", path: "3.gltf", type: "gltf", tier: "world" }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(manager.listAllIds()).toEqual(["one", "two", "three"]);
});


/******************************************************************************/
/* AABB CACHE                                                                 */
/******************************************************************************/

function meshAt(minX, minZ, maxX, maxZ)
{
    const geometry = new THREE.BoxGeometry(maxX - minX, 1, maxZ - minZ);
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set((minX + maxX) / 2, 0.5, (minZ + maxZ) / 2);
    return mesh;
}


test("preloadCore caches an AABB for each core-tier asset", async () =>
{
    installMockFetch({
        version: 1,
        assets: [
            { id: "small", path: "s.gltf", type: "gltf", tier: "core" },
            { id: "wide",  path: "w.gltf", type: "gltf", tier: "core" }
        ]
    });

    const manager = new AssetManager("/manifest.json");
    patchLoader(manager, (path) =>
    {
        const root = new THREE.Group();
        if(path === "s.gltf") { root.add(meshAt(-0.5, -0.5, 0.5, 0.5)); }
        else                  { root.add(meshAt(-3,   -1,   3,   1));   }
        return root;
    });

    await manager.loadManifest();
    await manager.preloadCore();

    const small = manager.getAabb("small");
    const wide  = manager.getAabb("wide");

    expect(small).toBeInstanceOf(THREE.Box3);
    expect(small.min.x).toBeCloseTo(-0.5);
    expect(small.max.x).toBeCloseTo(0.5);

    expect(wide.min.x).toBeCloseTo(-3);
    expect(wide.max.x).toBeCloseTo(3);
    expect(wide.min.z).toBeCloseTo(-1);
    expect(wide.max.z).toBeCloseTo(1);
});


test("getAabb returns null for an unloaded world-tier id, then a Box3 once loaded", async () =>
{
    installMockFetch({
        version: 1,
        assets: [{ id: "lazy", path: "l.gltf", type: "gltf", tier: "world" }]
    });

    const manager = new AssetManager("/manifest.json");
    patchLoader(manager, () =>
    {
        const root = new THREE.Group();
        root.add(meshAt(-1, -1, 1, 1));
        return root;
    });

    await manager.loadManifest();

    // Before lazy load — null.
    expect(manager.getAabb("lazy")).toBeNull();

    await manager.load("lazy");

    const aabb = manager.getAabb("lazy");
    expect(aabb).toBeInstanceOf(THREE.Box3);
    expect(aabb.min.x).toBeCloseTo(-1);
    expect(aabb.max.x).toBeCloseTo(1);
});


test("getAabb returns null for an unknown id (no throw)", async () =>
{
    installMockFetch({ version: 1, assets: [] });

    const manager = new AssetManager("/manifest.json");
    await manager.loadManifest();

    expect(manager.getAabb("never.heard.of")).toBeNull();
});


/******************************************************************************/
/* RELOAD                                                                     */
/******************************************************************************/

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
