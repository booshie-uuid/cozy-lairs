import { Emitter } from "../emitter.js";


/******************************************************************************/
/* DEV CONSOLE                                                                */
/******************************************************************************/

const DEFAULT_CAPACITY = 500;
const DEFAULT_POLL_MS = 100;
const PAYLOAD_PREVIEW_LIMIT = 240;
const DEFAULT_NOISY_EVENTS = ["pointermove"];


class DevConsole
{
    constructor(viewModel, { capacity = DEFAULT_CAPACITY, pollMs = DEFAULT_POLL_MS, noisyEvents = DEFAULT_NOISY_EVENTS, now, wallClockNow, sources = {} } = {})
    {
        this.viewModel = viewModel;
        this.capacity = capacity;
        this.pollMs = pollMs;
        this.noisyEvents = new Set(noisyEvents);
        this.now = now || (() => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());
        this.wallClockNow = wallClockNow || (() => Date.now());
        this.sources = sources;

        this.buffer = new Array(capacity).fill(null);
        this.writeAt = 0;
        this.count = 0;
        this.dirty = false;
        this.recording = false;
        this.sink = null;
        this.timer = null;
    }

    install()
    {
        if(this.sink !== null) { return; }
        this.sink = (emitter, event, payload) => this.record(emitter, event, payload);
        Emitter.devSink = this.sink;

        this.timer = setInterval(() => this.tickPoll(), this.pollMs);
    }

    uninstall()
    {
        if(this.sink === null) { return; }
        if(Emitter.devSink === this.sink) { Emitter.devSink = null; }
        this.sink = null;

        if(this.timer !== null)
        {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    toggle()
    {
        this.viewModel.isOpen(!this.viewModel.isOpen());
    }

    setOpen(open)
    {
        this.viewModel.isOpen(!!open);
    }

    clear()
    {
        this.buffer.fill(null);
        this.writeAt = 0;
        this.count = 0;
        this.dirty = true;
        this.flushIfDirty();
    }

    snapshot()
    {
        if(this.count < this.capacity)
        {
            return this.buffer.slice(0, this.count);
        }
        const out = new Array(this.capacity);
        for(let i = 0; i < this.capacity; i++)
        {
            out[i] = this.buffer[(this.writeAt + i) % this.capacity];
        }
        return out;
    }


    /* INTERNAL ***************************************************************/

    record(emitter, event, payload)
    {
        // Re-entrancy guard: a gameplay handler that logs through Emitter
        // would otherwise recurse into the sink it just triggered.
        if(this.recording) { return; }
        if(this.viewModel.isPaused()) { return; }
        if(this.isNoisy(event) && !this.viewModel.showNoisy()) { return; }

        this.recording = true;
        try
        {
            this.buffer[this.writeAt] =
            {
                time:         this.now(),
                wallClock:    this.wallClockNow(),
                emitterClass: emitter && emitter.constructor ? emitter.constructor.name : "Unknown",
                emitterName:  emitter && typeof emitter.name === "string" ? emitter.name : null,
                event,
                payload:      this.capture(payload)
            };
            this.writeAt = (this.writeAt + 1) % this.capacity;
            if(this.count < this.capacity) { this.count += 1; }
            this.dirty = true;
        }
        finally
        {
            this.recording = false;
        }
    }

    tickPoll()
    {
        this.viewModel.nowMs(this.now());
        this.flushIfDirty();
        this.pollStats();
    }

    flushIfDirty()
    {
        if(!this.dirty) { return; }
        this.dirty = false;
        this.viewModel.eventsBuffer(this.snapshot());
    }

    pollStats()
    {
        const { gameLoop, renderer, world, assets, saveService } = this.sources;

        if(gameLoop)
        {
            this.viewModel.fps(gameLoop.fps);
            this.viewModel.frameMs(gameLoop.frameMs);
            this.viewModel.simTickRate(gameLoop.simTickRate);
        }
        if(renderer && renderer.stats)
        {
            const stats = renderer.stats;
            this.viewModel.drawCalls(stats.drawCalls);
            this.viewModel.triangles(stats.triangles);
        }
        if(world && world.entities)
        {
            this.viewModel.entityCount(world.entities.size);
        }
        if(assets && typeof assets.cacheSize === "number")
        {
            this.viewModel.assetCacheSize(assets.cacheSize);
        }
        if(saveService && typeof saveService.lastAutosaveSize === "number")
        {
            this.viewModel.autosaveSize(saveService.lastAutosaveSize);
        }
    }

    isNoisy(event)
    {
        return this.noisyEvents.has(event);
    }

    capture(payload)
    {
        if(payload === null || payload === undefined) { return ""; }
        if(typeof payload !== "object") { return String(payload); }

        let json;
        try
        {
            json = JSON.stringify(payload, (_key, value) =>
            {
                if(value && typeof value === "object")
                {
                    const ctor = value.constructor;
                    if(ctor && ctor !== Object && !Array.isArray(value))
                    {
                        return `[${ctor.name}]`;
                    }
                }
                return value;
            });
        }
        catch(err)
        {
            return `[unserialisable: ${err.message}]`;
        }

        if(json && json.length > PAYLOAD_PREVIEW_LIMIT)
        {
            return json.slice(0, PAYLOAD_PREVIEW_LIMIT) + "…";
        }
        return json || "";
    }
}


export { DevConsole };
