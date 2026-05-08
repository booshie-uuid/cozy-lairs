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
 */

class Input extends Emitter
{
    constructor(target = window)
    {
        super();
        this.target = target;
        this._keys  = new Set();
        this._preventDefaultCodes = new Set();

        this._onKeydown           = this._onKeydown.bind(this);
        this._onKeyup             = this._onKeyup.bind(this);
        this._onPointerMove       = this._onPointerMove.bind(this);
        this._onPointerDown       = this._onPointerDown.bind(this);
        this._onPointerUp         = this._onPointerUp.bind(this);
        this._onWheel             = this._onWheel.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);

        target.addEventListener("keydown",     this._onKeydown);
        target.addEventListener("keyup",       this._onKeyup);
        target.addEventListener("pointermove", this._onPointerMove);
        target.addEventListener("pointerdown", this._onPointerDown);
        target.addEventListener("pointerup",   this._onPointerUp);
        target.addEventListener("wheel",       this._onWheel, { passive: false });
        document.addEventListener("pointerlockchange", this._onPointerLockChange);
    }

    isDown(code)
    {
        return this._keys.has(code);
    }

    preventDefaultFor(code)
    {
        this._preventDefaultCodes.add(code);
    }

    allowDefaultFor(code)
    {
        this._preventDefaultCodes.delete(code);
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
        this.target.removeEventListener("keydown",     this._onKeydown);
        this.target.removeEventListener("keyup",       this._onKeyup);
        this.target.removeEventListener("pointermove", this._onPointerMove);
        this.target.removeEventListener("pointerdown", this._onPointerDown);
        this.target.removeEventListener("pointerup",   this._onPointerUp);
        this.target.removeEventListener("wheel",       this._onWheel);
        document.removeEventListener("pointerlockchange", this._onPointerLockChange);
        this._keys.clear();
        this._handlers.clear();
    }


    /* HANDLERS ***************************************************************/

    _onKeydown(event)
    {
        if(this._preventDefaultCodes.has(event.code))
        {
            event.preventDefault();
        }

        this._keys.add(event.code);
        this.emit("keydown",
        {
            code:   event.code,
            key:    event.key,
            ctrl:   event.ctrlKey,
            shift:  event.shiftKey,
            alt:    event.altKey,
            meta:   event.metaKey,
            repeat: event.repeat
        });
    }

    _onKeyup(event)
    {
        this._keys.delete(event.code);
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

    _onPointerMove(event)
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

    _onPointerDown(event)
    {
        this.emit("pointerdown",
        {
            x:       event.clientX,
            y:       event.clientY,
            button:  event.button,
            buttons: event.buttons
        });
    }

    _onPointerUp(event)
    {
        this.emit("pointerup",
        {
            x:       event.clientX,
            y:       event.clientY,
            button:  event.button,
            buttons: event.buttons
        });
    }

    _onWheel(event)
    {
        this.emit("wheel",
        {
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ
        });
    }

    _onPointerLockChange()
    {
        this.emit("pointerlockchange",
        {
            locked: document.pointerLockElement !== null
        });
    }
}

export { Input };
