/******************************************************************************/
/* GAME LOOP                                                                  */
/******************************************************************************/

const DEFAULT_FIXED_DT = 1 / 60;
// Cap the accumulator so a backgrounded tab returning to focus doesn't
// spawn thousands of catch-up ticks.
const MAX_ACCUMULATED_SECONDS = 0.25;
const MS_PER_SECOND = 1000;
const FRAME_WINDOW = 30;


class GameLoop
{
    constructor({ fixedDt = DEFAULT_FIXED_DT, onFixedUpdate, onFrameUpdate } = {})
    {
        this.fixedDt = fixedDt;
        this.onFixedUpdate = onFixedUpdate || (() => {});
        this.onFrameUpdate = onFrameUpdate || (() => {});

        this.running = false;
        this.rafId = null;
        this.lastTime = 0;
        this.accumulator = 0;

        this.frameMsRing = new Array(FRAME_WINDOW).fill(0);
        this.frameMsIndex = 0;
        this.frameMsCount = 0;
        this.simTicksWindow = 0;
        this.simTickWindowStart = 0;
        this.simTickRate = 0;

        this.tick = this.tick.bind(this);
    }

    get frameMs()
    {
        if(this.frameMsCount === 0) { return 0; }
        let sum = 0;
        for(let i = 0; i < this.frameMsCount; i++) { sum += this.frameMsRing[i]; }
        return sum / this.frameMsCount;
    }

    get fps()
    {
        const ms = this.frameMs;
        return ms > 0 ? MS_PER_SECOND / ms : 0;
    }

    start()
    {
        if(this.running) { return; }
        this.running = true;
        this.lastTime = performance.now() / MS_PER_SECOND;
        this.accumulator = 0;
        this.rafId = requestAnimationFrame(this.tick);
    }

    stop()
    {
        if(!this.running) { return; }
        this.running = false;
        if(this.rafId !== null)
        {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    step(realDt)
    {
        if(realDt > MAX_ACCUMULATED_SECONDS)
        {
            realDt = MAX_ACCUMULATED_SECONDS;
        }

        this.accumulator += realDt;

        let ticks = 0;
        while(this.accumulator >= this.fixedDt)
        {
            this.onFixedUpdate(this.fixedDt);
            this.accumulator -= this.fixedDt;
            ticks += 1;
        }

        const alpha = this.accumulator / this.fixedDt;
        this.onFrameUpdate(alpha);

        this.recordFrame(realDt, ticks);
    }

    tick()
    {
        if(!this.running) { return; }

        const now = performance.now() / MS_PER_SECOND;
        const realDt = now - this.lastTime;
        this.lastTime = now;

        this.step(realDt);

        this.rafId = requestAnimationFrame(this.tick);
    }

    recordFrame(realDt, ticks)
    {
        const frameMs = realDt * MS_PER_SECOND;
        this.frameMsRing[this.frameMsIndex] = frameMs;
        this.frameMsIndex = (this.frameMsIndex + 1) % FRAME_WINDOW;
        if(this.frameMsCount < FRAME_WINDOW) { this.frameMsCount += 1; }

        this.simTicksWindow += ticks;
        const now = (typeof performance !== "undefined" && performance.now)
            ? performance.now()
            : Date.now();
        if(this.simTickWindowStart === 0) { this.simTickWindowStart = now; }
        const elapsed = now - this.simTickWindowStart;
        if(elapsed >= MS_PER_SECOND)
        {
            this.simTickRate = (this.simTicksWindow * MS_PER_SECOND) / elapsed;
            this.simTicksWindow = 0;
            this.simTickWindowStart = now;
        }
    }
}

export { GameLoop };
