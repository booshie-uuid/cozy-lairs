/******************************************************************************/
/* CAMERA CONTROLLER                                                          */
/******************************************************************************/

/*
 * Abstract base. Subclasses own a THREE.Camera, override the hooks they need,
 * and get swapped on the Renderer via `setActiveCamera(controller.camera)`.
 *
 *   activate()           — subscribe to input, claim exclusive resources
 *   deactivate()         — unsubscribe and release
 *   fixedUpdate(dt)      — sim-rate logic
 *   frameUpdate(alpha)   — render-rate logic (damping, lerps)
 */

class CameraController
{
    constructor()
    {
        this.camera = null;
    }

    activate()           {}
    deactivate()         {}
    fixedUpdate(_dt)     {}
    frameUpdate(_alpha)  {}
}

export { CameraController };
