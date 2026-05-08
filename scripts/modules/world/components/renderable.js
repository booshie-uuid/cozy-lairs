import * as THREE from "three";


/******************************************************************************/
/* RENDERABLE                                                                 */
/******************************************************************************/

/*
 * Mounts a manifest-resolved mesh under the entity's Object3D. Only the
 * asset id is serialised; the mesh is regenerated from the AssetManager
 * on load. If the asset can't be resolved, mounts a magenta wireframe
 * placeholder cube and logs a warning — so a missing asset is loudly
 * visible in-world without crashing room construction.
 */

const PLACEHOLDER_COLOR = 0xff00ff;
const PLACEHOLDER_SIZE  = 1;


class Renderable
{
    constructor(kind, assets)
    {
        this.kind   = kind;
        this.assets = assets;
        this.entity = null;
        this._mesh  = null;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(_world)
    {
        let mesh;
        try
        {
            mesh = this.assets.get(this.kind);
        }
        catch(err)
        {
            console.warn(`[Renderable] Could not load asset "${this.kind}":`, err && err.message ? err.message : err);
            mesh = this._buildPlaceholder();
        }
        this.entity.object3D.add(mesh);
        this._mesh = mesh;
    }

    onRemovedFromWorld(_world)
    {
        if(this._mesh)
        {
            this.entity.object3D.remove(this._mesh);
            this._mesh = null;
        }
    }

    toJSON()
    {
        return { kind: this.kind };
    }

    _buildPlaceholder()
    {
        const geometry = new THREE.BoxGeometry(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
        const material = new THREE.MeshBasicMaterial({ color: PLACEHOLDER_COLOR, wireframe: true });
        return new THREE.Mesh(geometry, material);
    }
}

export { Renderable };
