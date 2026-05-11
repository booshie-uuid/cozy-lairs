import * as THREE from "three";


/******************************************************************************/
/* ICON RENDERER                                                              */
/******************************************************************************/

const ICON_SIZE = 96;

const CAMERA_FOV = 35;
const CAMERA_DIRECTION = new THREE.Vector3(1, 0.9, 1).normalize();
const CAMERA_DISTANCE_FACTOR = 1.6;

const LIGHT_SKY = 0xffffff;
const LIGHT_GROUND = 0x556677;
const LIGHT_INTENSITY = 1.5;

const FALLBACK_BG     = "#2c1a47";   // --cozy-purple-soft
const FALLBACK_BORDER = "#3eaa70";   // --cozy-neon-dim
const FALLBACK_TEXT   = "#f0eaff";   // --cozy-text
const FALLBACK_FONT   = "12px system-ui, sans-serif";


class IconRenderer
{
    constructor()
    {
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.light = null;
        this.initFailed = false;
    }

    renderCatalogue(assets)
    {
        const result = new Map();
        for(const id of assets.listAllIds())
        {
            const kind = this.safeGetKind(assets, id);
            if(kind === null) { continue; }

            const dataURL = this.renderEntry(assets, id);
            result.set(id, dataURL);
        }
        return result;
    }

    dispose()
    {
        if(this.renderer)
        {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.scene = null;
        this.camera = null;
        this.light = null;
    }


    /* INTERNAL ***************************************************************/

    renderEntry(assets, id)
    {
        try
        {
            return this.renderMesh(assets, id);
        }
        catch(err)
        {
            console.warn(`[IconRenderer] ${id} fell back to text tile:`, err && err.message ? err.message : err);
            const displayName = this.safeGetDisplayName(assets, id) || id;
            return this.renderTextFallback(displayName);
        }
    }

    renderMesh(assets, id)
    {
        this.ensureRenderer();

        const mesh = assets.get(id);

        this.scene.clear();
        this.scene.add(this.light);
        this.scene.add(mesh);

        const bbox = new THREE.Box3().setFromObject(mesh);
        this.frameCamera(bbox);

        this.renderer.render(this.scene, this.camera);
        const dataURL = this.renderer.domElement.toDataURL("image/png");

        this.scene.remove(mesh);
        return dataURL;
    }

    ensureRenderer()
    {
        if(this.initFailed)
        {
            throw new Error("WebGLRenderer init previously failed.");
        }
        if(this.renderer) { return; }

        try
        {
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.setSize(ICON_SIZE, ICON_SIZE);
            this.renderer.setClearColor(0x000000, 0);

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
            this.light = new THREE.HemisphereLight(LIGHT_SKY, LIGHT_GROUND, LIGHT_INTENSITY);
        }
        catch(err)
        {
            this.initFailed = true;
            throw err;
        }
    }

    frameCamera(bbox)
    {
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const centre = new THREE.Vector3();
        bbox.getCenter(centre);

        const extent = Math.max(size.x, size.y, size.z, 0.1);
        const distance = extent * CAMERA_DISTANCE_FACTOR / Math.tan((CAMERA_FOV / 2) * Math.PI / 180);

        const offset = CAMERA_DIRECTION.clone().multiplyScalar(distance);
        this.camera.position.copy(centre).add(offset);
        this.camera.lookAt(centre);
    }

    renderTextFallback(displayName)
    {
        const canvas = document.createElement("canvas");
        canvas.width = ICON_SIZE;
        canvas.height = ICON_SIZE;
        const ctx = canvas.getContext("2d");

        // jsdom returns null without the optional `canvas` npm package.
        if(!ctx)
        {
            const safe = (displayName || "?").replace(/[^\x20-\x7e]/g, "?");
            return `data:image/png;base64,${btoa(`placeholder:${safe}`)}`;
        }

        ctx.fillStyle = FALLBACK_BG;
        ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);

        ctx.strokeStyle = FALLBACK_BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, ICON_SIZE - 2, ICON_SIZE - 2);

        ctx.fillStyle = FALLBACK_TEXT;
        ctx.font = FALLBACK_FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const lines = this.wrapLines(ctx, displayName, ICON_SIZE - 12);
        const lineHeight = 14;
        const startY = ICON_SIZE / 2 - ((lines.length - 1) * lineHeight) / 2;
        for(let i = 0; i < lines.length; i++)
        {
            ctx.fillText(lines[i], ICON_SIZE / 2, startY + i * lineHeight);
        }

        return canvas.toDataURL("image/png");
    }

    wrapLines(ctx, text, maxWidth)
    {
        const words = text.split(/\s+/);
        const lines = [];
        let current = "";
        for(const word of words)
        {
            const candidate = current ? `${current} ${word}` : word;
            if(ctx.measureText(candidate).width > maxWidth && current)
            {
                lines.push(current);
                current = word;
            }
            else
            {
                current = candidate;
            }
        }
        if(current) { lines.push(current); }
        return lines.slice(0, 3);
    }

    safeGetKind(assets, id)
    {
        try { return assets.getKind(id); }
        catch(_err) { return null; }
    }

    safeGetDisplayName(assets, id)
    {
        try { return assets.getDisplayName(id); }
        catch(_err) { return null; }
    }
}

export { IconRenderer };
