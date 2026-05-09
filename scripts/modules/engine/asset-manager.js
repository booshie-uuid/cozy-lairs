import * as THREE         from "three";
import { GLTFLoader }      from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils  from "three/addons/utils/SkeletonUtils.js";

import * as Errors from "./errors.js";


/******************************************************************************/
/* ASSET MANAGER                                                              */
/******************************************************************************/

/*
 * Manifest-driven asset loading. Gameplay code only sees flat dot-id strings
 * (e.g. "wall.stone.straight") — file paths stay inside the manifest.
 *
 * Skinned-mesh clones go through SkeletonUtils.clone; the standard Three.js
 * clone shares skeletons across instances and breaks rigged characters.
 */

const VALID_TIERS = new Set(["core", "world"]);
const VALID_TYPES = new Set(["gltf"]);


class AssetManager
{
    constructor(manifestPath, progressCallback = () => {})
    {
        this.manifestPath = manifestPath;
        this.progressCallback = progressCallback;

        this.loader = new GLTFLoader();
        this.index = new Map();
        this.cache = new Map();
        this.inFlight = new Map();
        this.loaded = 0;
        this.coreTotal = 0;
    }

    get cacheSize()
    {
        return this.cache.size;
    }

    async loadManifest()
    {
        let response;
        try
        {
            response = await fetch(this.manifestPath);
        }
        catch(err)
        {
            throw new Errors.ManifestError(`Failed to fetch manifest at ${this.manifestPath}: ${err.message}`);
        }

        if(!response.ok)
        {
            throw new Errors.ManifestError(`Manifest fetch returned HTTP ${response.status} for ${this.manifestPath}`);
        }

        let json;
        try
        {
            json = await response.json();
        }
        catch(err)
        {
            throw new Errors.ManifestError(`Manifest is not valid JSON: ${err.message}`);
        }

        this.validateManifest(json);

        this.index.clear();
        for(const entry of json.assets)
        {
            this.index.set(entry.id, entry);
        }
    }

    async preloadCore()
    {
        const coreEntries = [...this.index.values()].filter(e => e.tier === "core");

        this.coreTotal = coreEntries.length;
        this.loaded = 0;

        if(coreEntries.length === 0) { return; }

        const results = await Promise.allSettled(coreEntries.map(entry => this.loadEntry(entry, true)));
        const failures = results.filter(r => r.status === "rejected");

        if(failures.length > 0)
        {
            const messages = failures.map(f =>
            {
                const reason = f.reason;
                return reason && reason.message ? reason.message : String(reason);
            });
            throw new Errors.AssetLoadError(
                `Failed to preload ${failures.length} of ${coreEntries.length} core assets:\n  - ${messages.join("\n  - ")}`
            );
        }
    }

    async load(id)
    {
        const entry = this.index.get(id);
        if(!entry)
        {
            throw new Errors.AssetLoadError(`Asset id "${id}" is not in the manifest.`);
        }
        return this.loadEntry(entry, false);
    }

    get(id)
    {
        const cached = this.cache.get(id);
        if(!cached)
        {
            throw new Errors.AssetLoadError(`Asset "${id}" is not loaded. Did you forget preloadCore()?`);
        }
        return this.cloneAsset(cached);
    }

    getAnimations(id)
    {
        const cached = this.cache.get(id);
        if(!cached)
        {
            throw new Errors.AssetLoadError(`Asset "${id}" is not loaded. Did you forget preloadCore()?`);
        }
        return cached.animations;
    }

    has(id)
    {
        return this.cache.has(id);
    }

    async reload()
    {
        this.cache.clear();
        this.inFlight.clear();
        this.index.clear();
        this.loaded = 0;
        this.coreTotal = 0;

        await this.loadManifest();
        await this.preloadCore();
    }


    /* INTERNAL ***************************************************************/

    validateManifest(json)
    {
        if(!json || typeof json !== "object")
        {
            throw new Errors.ManifestError("Manifest root must be an object.");
        }
        if(!Array.isArray(json.assets))
        {
            throw new Errors.ManifestError("Manifest must have an `assets` array.");
        }

        const seen = new Set();
        for(let i = 0; i < json.assets.length; i++)
        {
            const entry = json.assets[i];
            const where = `assets[${i}]`;

            if(typeof entry.id   !== "string") { throw new Errors.ManifestError(`${where}.id must be a string.`); }
            if(typeof entry.path !== "string") { throw new Errors.ManifestError(`${where}.path must be a string.`); }
            if(typeof entry.type !== "string") { throw new Errors.ManifestError(`${where}.type must be a string.`); }
            if(typeof entry.tier !== "string") { throw new Errors.ManifestError(`${where}.tier must be a string.`); }

            if(!VALID_TYPES.has(entry.type))
            {
                throw new Errors.ManifestError(`${where}.type "${entry.type}" is not supported (expected one of: ${[...VALID_TYPES].join(", ")}).`);
            }
            if(!VALID_TIERS.has(entry.tier))
            {
                throw new Errors.ManifestError(`${where}.tier "${entry.tier}" is not recognised (expected one of: ${[...VALID_TIERS].join(", ")}).`);
            }
            if(seen.has(entry.id))
            {
                throw new Errors.ManifestError(`${where}.id "${entry.id}" is a duplicate.`);
            }
            seen.add(entry.id);
        }
    }

    loadEntry(entry, reportProgress)
    {
        if(this.cache.has(entry.id))
        {
            return Promise.resolve(this.cache.get(entry.id));
        }

        const inFlight = this.inFlight.get(entry.id);
        if(inFlight)
        {
            return inFlight;
        }

        const promise = new Promise((resolve, reject) =>
        {
            this.loader.load(
                entry.path,
                gltf =>
                {
                    try
                    {
                        const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
                        if(!root)
                        {
                            throw new Errors.AssetLoadError(`Asset "${entry.id}" loaded from ${entry.path} but has no scene.`);
                        }
                        const bundle =
                        {
                            root,
                            animations:     gltf.animations || [],
                            hasSkinnedMesh: this.containsSkinnedMesh(root)
                        };
                        this.cache.set(entry.id, bundle);
                        this.inFlight.delete(entry.id);

                        if(reportProgress)
                        {
                            this.loaded += 1;
                            this.progressCallback(this.loaded, this.coreTotal, entry.id);
                        }

                        resolve(bundle);
                    }
                    catch(err)
                    {
                        this.inFlight.delete(entry.id);
                        const wrapped = err instanceof Errors.AssetLoadError
                            ? err
                            : new Errors.AssetLoadError(`Failed to process asset "${entry.id}": ${err && err.message ? err.message : err}`);
                        reject(wrapped);
                    }
                },
                undefined,
                err =>
                {
                    this.inFlight.delete(entry.id);
                    reject(new Errors.AssetLoadError(`Failed to load asset "${entry.id}" from ${entry.path}: ${err && err.message ? err.message : err}`));
                }
            );
        });

        this.inFlight.set(entry.id, promise);
        return promise;
    }

    containsSkinnedMesh(root)
    {
        let found = false;
        root.traverse(node =>
        {
            if(node.isSkinnedMesh) { found = true; }
        });
        return found;
    }

    cloneAsset(bundle)
    {
        return bundle.hasSkinnedMesh ? SkeletonUtils.clone(bundle.root) : bundle.root.clone(true);
    }
}

export { AssetManager };
