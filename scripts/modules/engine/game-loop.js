/******************************************************************************/
/* GAME LOOP                                                                  */
/******************************************************************************/

/*
 * Fixed-timestep simulation with variable-rate render. `onFixedUpdate(dt)`
 * fires N times per RAF (deterministic 60 Hz default), `onFrameUpdate(alpha)`
 * fires once with the interpolation alpha. The accumulator is capped at
 * MAX_ACCUMULATED_SECONDS so a backgrounded tab returning to focus doesn't
 * spawn thousands of catch-up ticks.
 */

const DEFAULT_FIXED_DT          = 1 / 60;
const MAX_ACCUMULATED_SECONDS   = 0.25;
const MS_PER_SECOND             = 1000;


class GameLoop
{
    constructor({ fixedDt = DEFAULT_FIXED_DT, onFixedUpdate, onFrameUpdate } = {})
    {
        this.fixedDt       = fixedDt;
        this.onFixedUpdate = onFixedUpdate || (() => {});
        this.onFrameUpdate = onFrameUpdate || (() => {});

        this._running     = false;
        this._rafId       = null;
        this._lastTime    = 0;
        this._accumulator = 0;

        this._tick = this._tick.bind(this);
    }

    start()
    {
        if(this._running) { return; }
        this._running     = true;
        this._lastTime    = performance.now() / MS_PER_SECOND;
        this._accumulator = 0;
        this._rafId       = requestAnimationFrame(this._tick);
    }

    stop()
    {
        if(!this._running) { return; }
        this._running = false;
        if(this._rafId !== null)
        {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    step(realDt)
    {
        if(realDt > MAX_ACCUMULATED_SECONDS)
        {
            realDt = MAX_ACCUMULATED_SECONDS;
        }

        this._accumulator += realDt;

        while(this._accumulator >= this.fixedDt)
        {
            this.onFixedUpdate(this.fixedDt);
            this._accumulator -= this.fixedDt;
        }

        const alpha = this._accumulator / this.fixedDt;
        this.onFrameUpdate(alpha);
    }

    _tick()
    {
        if(!this._running) { return; }

        const now = performance.now() / MS_PER_SECOND;
        const realDt = now - this._lastTime;
        this._lastTime = now;

        this.step(realDt);

        this._rafId = requestAnimationFrame(this._tick);
    }
}

export { GameLoop };
