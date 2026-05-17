import * as THREE from "three";


/******************************************************************************/
/* RENDERABLE                                                                 */
/******************************************************************************/

const PLACEHOLDER_COLOR = 0xff00ff;
const PLACEHOLDER_SIZE = 1;


class Renderable
{
    constructor(kind, assets)
    {
        this.kind = kind;
        this.assets = assets;
        this.entity = null;
        this.mesh = null;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(_world)
    {
        this.reattach();
    }

    onRemovedFromWorld(_world)
    {
        this.detach();
    }

    reattach()
    {
        this.detach();

        let mesh;
        try
        {
            mesh = this.assets.get(this.kind);
        }
        catch(err)
        {
            console.warn(`[Renderable] Could not load asset "${this.kind}":`, err && err.message ? err.message : err);
            mesh = this.buildPlaceholder();
        }

        const meta = this.readMeta();

        if(typeof meta.scale === "number")   { mesh.scale.setScalar(meta.scale); }
        if(typeof meta.yOffset === "number") { mesh.position.y = meta.yOffset; }
        if(typeof meta.zOffset === "number") { mesh.position.z = meta.zOffset; }

        this.entity.object3D.add(mesh);
        this.mesh = mesh;
    }

    readMeta()
    {
        if(typeof this.assets.getMeta !== "function") { return {}; }
        try { return this.assets.getMeta(this.kind) || {}; }
        catch(_err) { return {}; }
    }

    toJSON()
    {
        return { kind: this.kind };
    }

    detach()
    {
        if(this.mesh)
        {
            this.entity.object3D.remove(this.mesh);
            this.mesh = null;
        }
    }

    buildPlaceholder()
    {
        const geometry = new THREE.BoxGeometry(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
        const material = new THREE.MeshBasicMaterial({ color: PLACEHOLDER_COLOR, wireframe: true });
        
        return new THREE.Mesh(geometry, material);
    }
}

export { Renderable };
