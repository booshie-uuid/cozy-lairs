/******************************************************************************/
/* CAMERA CONTROLLER                                                          */
/******************************************************************************/

// Base class for cameras. Subclasses declare their input subscriptions
// once (via `subscribe(event, handler)` in the constructor) and the base
// installs/uninstalls them on activate/deactivate. Per-subclass setup
// outside the input plane goes in `onActivate` / `onDeactivate` hooks.

class CameraController
{
    constructor(input = null)
    {
        this.input = input;
        this.camera = null;
        this.subscriptions = [];
    }

    subscribe(event, handler)
    {
        this.subscriptions.push({ event, handler });
    }

    activate()
    {
        if(this.input)
        {
            for(const { event, handler } of this.subscriptions)
            {
                this.input.on(event, handler);
            }
        }
        this.onActivate();
    }

    deactivate()
    {
        if(this.input)
        {
            for(const { event, handler } of this.subscriptions)
            {
                this.input.off(event, handler);
            }
        }
        this.onDeactivate();
    }

    // Subclass hooks — override instead of activate/deactivate so the
    // subscription scaffolding stays in the base.
    onActivate() {}
    onDeactivate() {}

    fixedUpdate(_dt)    {}
    frameUpdate(_alpha) {}
}

export { CameraController };
