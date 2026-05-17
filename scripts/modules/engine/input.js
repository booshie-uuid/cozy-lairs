import { Emitter } from "./emitter.js";


/******************************************************************************/
/* INPUT                                                                      */
/******************************************************************************/

class Input extends Emitter
{
    constructor(target = window)
    {
        super();
        this.target = target;
        this.keys = new Set();
        this.preventDefaultCodes = new Set();

        this.onKeydown = this.onKeydown.bind(this);
        this.onKeyup = this.onKeyup.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.onPointerLockChange = this.onPointerLockChange.bind(this);

        target.addEventListener("keydown", this.onKeydown);
        target.addEventListener("keyup", this.onKeyup);
        target.addEventListener("blur", this.onBlur);
        target.addEventListener("pointermove", this.onPointerMove);
        target.addEventListener("pointerdown", this.onPointerDown);
        target.addEventListener("pointerup", this.onPointerUp);
        target.addEventListener("wheel", this.onWheel, { passive: false });

        document.addEventListener("pointerlockchange", this.onPointerLockChange);
    }

    isDown(code)
    {
        return this.keys.has(code);
    }

    preventDefaultFor(code)
    {
        this.preventDefaultCodes.add(code);
    }

    requestPointerLock(element)
    {
        if(element && typeof element.requestPointerLock === "function")
        {
            element.requestPointerLock();
        }
    }

    exitPointerLock()
    {
        if(typeof document.exitPointerLock === "function")
        {
            document.exitPointerLock();
        }
    }

    dispose()
    {
        this.target.removeEventListener("keydown", this.onKeydown);
        this.target.removeEventListener("keyup", this.onKeyup);
        this.target.removeEventListener("blur", this.onBlur);
        this.target.removeEventListener("pointermove", this.onPointerMove);
        this.target.removeEventListener("pointerdown", this.onPointerDown);
        this.target.removeEventListener("pointerup", this.onPointerUp);
        this.target.removeEventListener("wheel", this.onWheel);

        document.removeEventListener("pointerlockchange", this.onPointerLockChange);
        
        this.keys.clear();
        this.handlers.clear();
    }


    /* HANDLERS ***************************************************************/

    onKeydown(event)
    {
        // preventDefault must run on repeats so held shortcut keys (Tab,
        // KeyS) keep suppressing their browser defaults.
        if(this.preventDefaultCodes.has(event.code))
        {
            event.preventDefault();
        }

        if(event.repeat) { return; }

        // Ctrl+S is a save shortcut, not a movement input — keeping
        // Ctrl-modified keys out of `keys` stops them nudging the camera.
        if(!event.ctrlKey && !event.metaKey)
        {
            this.keys.add(event.code);
        }

        this.emit("keydown",
        {
            code:   event.code,
            key:    event.key,
            ctrl:   event.ctrlKey,
            shift:  event.shiftKey,
            alt:    event.altKey,
            meta:   event.metaKey,
            repeat: false
        });
    }

    onKeyup(event)
    {
        this.keys.delete(event.code);
        this.emit("keyup",
        {
            code:  event.code,
            key:   event.key,
            ctrl:  event.ctrlKey,
            shift: event.shiftKey,
            alt:   event.altKey,
            meta:  event.metaKey
        });
    }

    onPointerMove(event)
    {
        this.emit("pointermove",
        {
            x:       event.clientX,
            y:       event.clientY,
            dx:      event.movementX || 0,
            dy:      event.movementY || 0,
            button:  event.button,
            buttons: event.buttons,
            target:  event.target
        });
    }

    onPointerDown(event)
    {
        this.emit("pointerdown",
        {
            x:       event.clientX,
            y:       event.clientY,
            button:  event.button,
            buttons: event.buttons,
            target:  event.target
        });
    }

    onPointerUp(event)
    {
        this.emit("pointerup",
        {
            x:       event.clientX,
            y:       event.clientY,
            button:  event.button,
            buttons: event.buttons,
            target:  event.target
        });
    }

    onWheel(event)
    {
        this.emit("wheel",
        {
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ,
            target: event.target
        });
    }

    onPointerLockChange()
    {
        this.emit("pointerlockchange",
        {
            locked: document.pointerLockElement !== null
        });
    }

    onBlur()
    {
        // Browsers swallow keyup when focus moves to a native dialog or
        // another window, so a held key would stick "on" indefinitely.
        this.keys.clear();
    }
}

export { Input };
