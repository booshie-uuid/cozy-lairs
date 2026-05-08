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
        this.manifestPath     = manifestPath;
        this.progressCallback = progressCallback;

        this._loader     = new GLTFLoader();
        this._index      = new Map();
        this._cache      = new Map();
        this._inFlight   = new Map();
        this._loaded     = 0;
        this._coreTotal  = 0;
    }

    get cacheSize()
    {
        return this._cache.size;
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

        this._validateManifest(json);

        this._index.clear();
        for(const entry of json.assets)
        {
            this._index.set(entry.id, entry);
        }
    }

    async preloadCore()
    {
        const coreEntries = [...this._index.values()].filter(e => e.tier === "core");

        this._coreTotal = coreEntries.length;
        this._loaded    = 0;

        if(coreEntries.length === 0) { return; }

        const results  = await Promise.allSettled(coreEntries.map(entry => this._loadEntry(entry, true)));
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
        const entry = this._index.get(id);
        if(!entry)
        {
            throw new Errors.AssetLoadError(`Asset id "${id}" is not in the manifest.`);
        }
        return this._loadEntry(entry, false);
    }

    get(id)
    {
        const cached = this._cache.get(id);
        if(!cached)
        {
            throw new Errors.AssetLoadError(`Asset "${id}" is not loaded. Did you forget preloadCore()?`);
        }
        return this._cloneAsset(cached);
    }

    has(id)
    {
        return this._cache.has(id);
    }


    /* INTERNAL ***************************************************************/

    _validateManifest(json)
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

    _loadEntry(entry, reportProgress)
    {
        if(this._cache.has(entry.id))
        {
            return Promise.resolve(this._cache.get(entry.id));
        }

        const inFlight = this._inFlight.get(entry.id);
        if(inFlight)
        {
            return inFlight;
        }

        const promise = new Promise((resolve, reject) =>
        {
            this._loader.load(
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
                            hasSkinnedMesh: this._containsSkinnedMesh(root)
                        };
                        this._cache.set(entry.id, bundle);
                        this._inFlight.delete(entry.id);

                        if(reportProgress)
                        {
                            this._loaded += 1;
                            this.progressCallback(this._loaded, this._coreTotal, entry.id);
                        }

                        resolve(bundle);
                    }
                    catch(err)
                    {
                        this._inFlight.delete(entry.id);
                        const wrapped = err instanceof Errors.AssetLoadError
                            ? err
                            : new Errors.AssetLoadError(`Failed to process asset "${entry.id}": ${err && err.message ? err.message : err}`);
                        reject(wrapped);
                    }
                },
                undefined,
                err =>
                {
                    this._inFlight.delete(entry.id);
                    reject(new Errors.AssetLoadError(`Failed to load asset "${entry.id}" from ${entry.path}: ${err && err.message ? err.message : err}`));
                }
            );
        });

        this._inFlight.set(entry.id, promise);
        return promise;
    }

    _containsSkinnedMesh(root)
    {
        let found = false;
        root.traverse(node =>
        {
            if(node.isSkinnedMesh) { found = true; }
        });
        return found;
    }

    _cloneAsset(bundle)
    {
        return bundle.hasSkinnedMesh ? SkeletonUtils.clone(bundle.root) : bundle.root.clone(true);
    }
}

export { AssetManager };
