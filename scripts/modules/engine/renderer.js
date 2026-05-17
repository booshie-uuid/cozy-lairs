import * as THREE  from "three";
import * as Errors from "./errors.js";


/******************************************************************************/
/* RENDERER                                                                   */
/******************************************************************************/

// Clamp DPR at 2× to avoid the 4K perf cliff.
const MAX_PIXEL_RATIO = 2;
const CLEAR_COLOR = 0x0a0e14;


class Renderer
{
    constructor(canvasWrapper)
    {
        this.canvasWrapper = canvasWrapper;

        this.canvas = document.createElement("canvas");
        canvasWrapper.appendChild(this.canvas);

        if(!this.canvas.getContext("webgl2") && !this.canvas.getContext("webgl"))
        {
            throw new Errors.WebGLUnavailableError("WebGL is not available in this browser.");
        }

        this.renderer = new THREE.WebGLRenderer(
        {
            canvas:    this.canvas,
            antialias: true,
            alpha:     false
        });
        this.renderer.setClearColor(CLEAR_COLOR, 1);

        this.scene = null;
        this.activeCamera = null;

        this.resizeObserver = new ResizeObserver(entries =>
        {
            for(const entry of entries)
            {
                const { width, height } = entry.contentRect;
                this.setSize(width, height);
            }
        });
        this.resizeObserver.observe(canvasWrapper);
    }

    setActiveCamera(camera)
    {
        this.activeCamera = camera;
        this.syncCameraAspect();
    }

    setScene(scene)
    {
        this.scene = scene;
    }

    get stats()
    {
        const info = this.renderer.info;
        return {
            drawCalls:  info.render.calls,
            triangles:  info.render.triangles,
            geometries: info.memory.geometries,
            textures:   info.memory.textures
        };
    }

    setSize(width, height)
    {
        if(width <= 0 || height <= 0) { return; }

        const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(width, height, false);

        this.syncCameraAspect();
    }

    render()
    {
        if(!this.scene || !this.activeCamera) { return; }
        this.renderer.render(this.scene, this.activeCamera);
    }

    dispose()
    {
        this.resizeObserver.disconnect();
        this.renderer.dispose();
        this.canvas.remove();
    }

    syncCameraAspect()
    {
        if(!this.activeCamera || !this.activeCamera.isPerspectiveCamera) { return; }

        const rect = this.canvasWrapper.getBoundingClientRect();
        if(rect.width <= 0 || rect.height <= 0) { return; }

        this.activeCamera.aspect = rect.width / rect.height;
        this.activeCamera.updateProjectionMatrix();
    }
}

export { Renderer };
