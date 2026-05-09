import { Emitter } from "./emitter.js";


/******************************************************************************/
/* INPUT                                                                      */
/******************************************************************************/

/*
 * Single source of truth for keyboard, pointer, and wheel input. Subscribers
 * receive normalised payloads; `isDown(code)` polls held keys.
 *
 *   keydown            { code, key, ctrl, shift, alt, meta, repeat }
 *   keyup              { code, key, ctrl, shift, alt, meta }
 *   pointermove        { x, y, dx, dy, button, buttons }
 *   pointerdown        { x, y, button, buttons }
 *   pointerup          { x, y, button, buttons }
 *   wheel              { deltaX, deltaY, deltaZ }
 *   pointerlockchange  { locked: boolean }
 *
 * Pointer dx/dy come from `event.movementX/Y` so they remain meaningful under
 * pointer-lock (where x/y stop updating).
 *
 * Held-key state rules:
 *   - Keys pressed with Ctrl or Meta held are NOT added to `keys`. Ctrl+S
 *     is a save shortcut, not a movement input — without this, every Ctrl+S
 *     would also nudge the camera back.
 *   - `keys` is cleared on `window.blur`. The browser may swallow keyup
 *     events when focus moves to a native dialog or another window, which
 *     would otherwise leave a movement key stuck "on" indefinitely.
 *   - Auto-repeated keydowns are suppressed before emit/keys.add. No
 *     consumer in the codebase wants them — cameras poll `isDown(code)`,
 *     command bindings already gate on `!event.repeat`. preventDefault
 *     still fires on repeats so held shortcut keys (Tab, KeyS) keep
 *     suppressing their browser defaults.
 */

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

    allowDefaultFor(code)
    {
        this.preventDefaultCodes.delete(code);
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
        if(this.preventDefaultCodes.has(event.code))
        {
            event.preventDefault();
        }

        if(event.repeat) { return; }

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
            buttons: event.buttons
        });
    }

    onPointerDown(event)
    {
        this.emit("pointerdown",
        {
            x:       event.clientX,
            y:       event.clientY,
            button:  event.button,
            buttons: event.buttons
        });
    }

    onPointerUp(event)
    {
        this.emit("pointerup",
        {
            x:       event.clientX,
            y:       event.clientY,
            button:  event.button,
            buttons: event.buttons
        });
    }

    onWheel(event)
    {
        this.emit("wheel",
        {
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ
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
        this.keys.clear();
    }
}

export { Input };
