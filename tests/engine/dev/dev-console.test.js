import { test, expect, vi, beforeEach, afterEach } from "vitest";

import { DevConsole } from "../../../scripts/modules/engine/dev/dev-console.js";
import { Emitter }    from "../../../scripts/modules/engine/emitter.js";


function observable(initial)
{
    let v = initial;
    return function(value)
    {
        if(value === undefined) { return v; }
        v = value;
    };
}


function makeStubViewModel({ showNoisy = false } = {})
{
    return {
        isPaused:       observable(false),
        eventsBuffer:   observable([]),
        isOpen:         observable(false),
        showNoisy:      observable(showNoisy),
        nowMs:          observable(0),

        fps:            observable(0),
        frameMs:        observable(0),
        simTickRate:    observable(0),
        drawCalls:      observable(0),
        triangles:      observable(0),
        entityCount:    observable(0),
        assetCacheSize: observable(0),
        autosaveSize:   observable(0)
    };
}


class TestEmitter extends Emitter {}


let console_;
let emitter;

beforeEach(() =>
{
    Emitter.devSink = null;
});

afterEach(() =>
{
    if(console_) { console_.uninstall(); }
    console_ = null;
    Emitter.devSink = null;
});


/* INSTALL / UNINSTALL ********************************************************/

test("install sets Emitter.devSink and uninstall clears it", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { pollMs: 1000 });

    expect(Emitter.devSink).toBe(null);

    console_.install();
    expect(typeof Emitter.devSink).toBe("function");

    console_.uninstall();
    expect(Emitter.devSink).toBe(null);
});


test("uninstall does not clear another consumer's sink", () =>
{
    const viewModel = makeStubViewModel();
    const otherSink = () => {};
    console_ = new DevConsole(viewModel, { pollMs: 1000 });

    console_.install();
    Emitter.devSink = otherSink;     // someone else takes over

    console_.uninstall();
    expect(Emitter.devSink).toBe(otherSink);
});


/* RING BUFFER ****************************************************************/

test("records every emit while installed up to capacity", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 3, pollMs: 1000 });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("a", { n: 1 });
    emitter.emit("b", { n: 2 });
    emitter.emit("c", { n: 3 });

    const snap = console_.snapshot();
    expect(snap.length).toBe(3);
    expect(snap.map(e => e.event)).toEqual(["a", "b", "c"]);
});


test("ring buffer drops oldest entries when capacity is exceeded", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 3, pollMs: 1000 });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("a", null);
    emitter.emit("b", null);
    emitter.emit("c", null);
    emitter.emit("d", null);  // drops "a"
    emitter.emit("e", null);  // drops "b"

    const snap = console_.snapshot();
    expect(snap.length).toBe(3);
    expect(snap.map(e => e.event)).toEqual(["c", "d", "e"]);
});


test("snapshot order is oldest-to-newest after a wrap", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 4, pollMs: 1000 });
    console_.install();

    emitter = new TestEmitter();
    for(const ev of ["a", "b", "c", "d", "e", "f"])
    {
        emitter.emit(ev, null);
    }

    const events = console_.snapshot().map(e => e.event);
    expect(events).toEqual(["c", "d", "e", "f"]);
});


/* PAUSE **********************************************************************/

test("pausing the view-model stops new entries from being recorded", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 5, pollMs: 1000 });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("before-pause", null);
    viewModel.isPaused(true);
    emitter.emit("paused-1", null);
    emitter.emit("paused-2", null);
    viewModel.isPaused(false);
    emitter.emit("after-pause", null);

    const events = console_.snapshot().map(e => e.event);
    expect(events).toEqual(["before-pause", "after-pause"]);
});


/* RECORDS *********************************************************************/

test("records carry emitter class name and timestamp", () =>
{
    const viewModel = makeStubViewModel();
    let t = 0;
    console_ = new DevConsole(viewModel, { capacity: 5, pollMs: 1000, now: () => t++ });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("first", null);
    emitter.emit("second", null);

    const snap = console_.snapshot();
    expect(snap[0].emitterClass).toBe("TestEmitter");
    expect(snap[1].emitterClass).toBe("TestEmitter");
    expect(snap[0].time).toBe(0);
    expect(snap[1].time).toBe(1);
});


test("records also capture wall-clock time for the absolute-timestamp tooltip", () =>
{
    const viewModel = makeStubViewModel();
    let wall = 1_700_000_000_000;
    console_ = new DevConsole(viewModel, { capacity: 5, pollMs: 1000, wallClockNow: () => wall++ });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("first",  null);
    emitter.emit("second", null);

    const snap = console_.snapshot();
    expect(snap[0].wallClock).toBe(1_700_000_000_000);
    expect(snap[1].wallClock).toBe(1_700_000_000_001);
});


test("payload capture: plain objects round-trip", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 5, pollMs: 1000 });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("plain", { x: 1, y: "two", flag: true });

    expect(console_.snapshot()[0].payload).toBe(JSON.stringify({ x: 1, y: "two", flag: true }));
});


test("payload capture: class instances are replaced with [ClassName]", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 5, pollMs: 1000 });
    console_.install();

    class Widget { constructor(id) { this.id = id; } }
    emitter = new TestEmitter();
    emitter.emit("with-instance", { widget: new Widget(7) });

    expect(console_.snapshot()[0].payload).toBe(JSON.stringify({ widget: "[Widget]" }));
});


test("payload capture: a circular structure does not throw", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 5, pollMs: 1000 });
    console_.install();

    const a = {};
    a.self = a;

    emitter = new TestEmitter();
    expect(() => emitter.emit("loop", a)).not.toThrow();
    expect(console_.snapshot()[0].payload).toMatch(/unserialisable/i);
});


/* NOISY EVENT FILTER *********************************************************/

test("noisy events (default: pointermove) are dropped at capture when showNoisy is false", () =>
{
    const viewModel = makeStubViewModel({ showNoisy: false });
    console_ = new DevConsole(viewModel, { capacity: 10, pollMs: 1000 });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("pointermove", { x: 1 });
    emitter.emit("pointermove", { x: 2 });
    emitter.emit("keydown",     { code: "KeyW" });

    expect(console_.snapshot().map(e => e.event)).toEqual(["keydown"]);
});


test("noisy events are recorded once showNoisy is enabled", () =>
{
    const viewModel = makeStubViewModel({ showNoisy: true });
    console_ = new DevConsole(viewModel, { capacity: 10, pollMs: 1000 });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("pointermove", { x: 1 });
    emitter.emit("pointermove", { x: 2 });
    emitter.emit("keydown",     { code: "KeyW" });

    expect(console_.snapshot().map(e => e.event)).toEqual(["pointermove", "pointermove", "keydown"]);
});


test("noisyEvents option overrides the default exclusion list", () =>
{
    const viewModel = makeStubViewModel({ showNoisy: false });
    console_ = new DevConsole(viewModel, { capacity: 10, pollMs: 1000, noisyEvents: ["heartbeat"] });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("pointermove", null);  // not noisy in this config
    emitter.emit("heartbeat",   null);
    emitter.emit("keydown",     null);

    expect(console_.snapshot().map(e => e.event)).toEqual(["pointermove", "keydown"]);
});


/* CLEAR **********************************************************************/

test("clear empties the buffer and flushes immediately", () =>
{
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 3, pollMs: 1000 });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("a", null);
    emitter.emit("b", null);
    expect(console_.snapshot().length).toBe(2);

    console_.clear();
    expect(console_.snapshot().length).toBe(0);
    expect(viewModel.eventsBuffer().length).toBe(0);
});


/* FLUSH TIMER ****************************************************************/

test("the flush timer copies the snapshot into the view-model's eventsBuffer", () =>
{
    vi.useFakeTimers();
    const viewModel = makeStubViewModel();
    console_ = new DevConsole(viewModel, { capacity: 4, pollMs: 50 });
    console_.install();

    emitter = new TestEmitter();
    emitter.emit("a", null);
    emitter.emit("b", null);
    expect(viewModel.eventsBuffer().length).toBe(0);  // not flushed yet

    vi.advanceTimersByTime(50);
    expect(viewModel.eventsBuffer().length).toBe(2);
    expect(viewModel.eventsBuffer().map(e => e.event)).toEqual(["a", "b"]);

    vi.useRealTimers();
});


/* STATS POLL *****************************************************************/

test("poll timer pulls fps/frameMs/simTickRate from a gameLoop source", () =>
{
    vi.useFakeTimers();
    const viewModel = makeStubViewModel();
    const gameLoop  = { fps: 59.4, frameMs: 16.83, simTickRate: 60 };

    console_ = new DevConsole(viewModel, { pollMs: 50, sources: { gameLoop } });
    console_.install();

    vi.advanceTimersByTime(50);

    expect(viewModel.fps()).toBeCloseTo(59.4);
    expect(viewModel.frameMs()).toBeCloseTo(16.83);
    expect(viewModel.simTickRate()).toBe(60);

    vi.useRealTimers();
});


test("poll timer pulls renderer/world/assets/saveService stats", () =>
{
    vi.useFakeTimers();
    const viewModel   = makeStubViewModel();
    const renderer    = { stats: { drawCalls: 12, triangles: 9384, geometries: 5, textures: 2 } };
    const world       = { entities: new Set([{}, {}, {}]) };
    const assets      = { cacheSize: 7 };
    const saveService = { lastAutosaveSize: 4096 };

    console_ = new DevConsole(viewModel, { pollMs: 50, sources: { renderer, world, assets, saveService } });
    console_.install();

    vi.advanceTimersByTime(50);

    expect(viewModel.drawCalls()).toBe(12);
    expect(viewModel.triangles()).toBe(9384);
    expect(viewModel.entityCount()).toBe(3);
    expect(viewModel.assetCacheSize()).toBe(7);
    expect(viewModel.autosaveSize()).toBe(4096);

    vi.useRealTimers();
});


test("missing stats sources are tolerated (no crash, observables stay at default)", () =>
{
    vi.useFakeTimers();
    const viewModel = makeStubViewModel();

    console_ = new DevConsole(viewModel, { pollMs: 50 });   // no sources at all
    console_.install();

    expect(() => vi.advanceTimersByTime(50)).not.toThrow();
    expect(viewModel.fps()).toBe(0);
    expect(viewModel.entityCount()).toBe(0);

    vi.useRealTimers();
});


test("poll timer updates viewModel.nowMs so relative-time displays can refresh", () =>
{
    vi.useFakeTimers();
    const viewModel = makeStubViewModel();
    let t = 1000;
    console_ = new DevConsole(viewModel, { pollMs: 50, now: () => t });
    console_.install();

    vi.advanceTimersByTime(50);
    expect(viewModel.nowMs()).toBe(1000);

    t = 1500;
    vi.advanceTimersByTime(50);
    expect(viewModel.nowMs()).toBe(1500);

    vi.useRealTimers();
});
