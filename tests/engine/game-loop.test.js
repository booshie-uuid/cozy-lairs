import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { GameLoop } from "../../scripts/modules/engine/game-loop.js";


beforeEach(() =>
{
    let rafId = 0;
    globalThis.requestAnimationFrame = vi.fn(() => ++rafId);
    globalThis.cancelAnimationFrame  = vi.fn();
    globalThis.performance = globalThis.performance || { now: () => Date.now() };
});

afterEach(() =>
{
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
});


function makeLoop(fixedDt = 1 / 60)
{
    const onFixedUpdate = vi.fn();
    const onFrameUpdate = vi.fn();
    const loop = new GameLoop({ fixedDt, onFixedUpdate, onFrameUpdate });
    return { loop, onFixedUpdate, onFrameUpdate };
}


test("step(fixedDt) fires exactly one fixed update", () =>
{
    const { loop, onFixedUpdate } = makeLoop();
    loop.step(1 / 60);
    expect(onFixedUpdate).toHaveBeenCalledTimes(1);
});


test("step accumulates partial dt across calls until a full tick fires", () =>
{
    const { loop, onFixedUpdate } = makeLoop(1 / 60);
    loop.step(1 / 120);
    expect(onFixedUpdate).toHaveBeenCalledTimes(0);
    loop.step(1 / 120);
    expect(onFixedUpdate).toHaveBeenCalledTimes(1);
});


test("step with 3x fixedDt fires three ticks in one call", () =>
{
    const { loop, onFixedUpdate } = makeLoop(1 / 60);
    loop.step(3 / 60);
    expect(onFixedUpdate).toHaveBeenCalledTimes(3);
});


test("step clamps oversized realDt at 0.25 s (spiral-of-death prevention)", () =>
{
    const { loop, onFixedUpdate } = makeLoop(1 / 60);
    loop.step(10);
    expect(onFixedUpdate).toHaveBeenCalledTimes(15);
});


test("frame update fires once per step regardless of fixed-tick count", () =>
{
    const { loop, onFrameUpdate } = makeLoop();
    loop.step(0);
    loop.step(1 / 60);
    loop.step(5 / 60);
    expect(onFrameUpdate).toHaveBeenCalledTimes(3);
});


test("frame update receives interpolation alpha in [0, 1)", () =>
{
    const { loop, onFrameUpdate } = makeLoop(1 / 60);
    loop.step(1 / 90);
    const alpha = onFrameUpdate.mock.calls[0][0];
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
});


test("fixed update receives the configured fixedDt", () =>
{
    const { loop, onFixedUpdate } = makeLoop(1 / 30);
    loop.step(1 / 30);
    expect(onFixedUpdate).toHaveBeenCalledWith(1 / 30);
});


test("start is idempotent (double-start does not duplicate frames)", () =>
{
    const { loop } = makeLoop();
    loop.start();
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
});


test("stop is idempotent and does not throw if loop never started", () =>
{
    const { loop } = makeLoop();
    expect(() => loop.stop()).not.toThrow();
    loop.start();
    loop.stop();
    expect(() => loop.stop()).not.toThrow();
});


test("constructor accepts default callbacks if none provided", () =>
{
    const loop = new GameLoop();
    expect(() => loop.step(1 / 60)).not.toThrow();
});


/* STATS **********************************************************************/

test("frameMs is a rolling average of recent step durations", () =>
{
    const { loop } = makeLoop();
    expect(loop.frameMs).toBe(0);   // no samples yet

    loop.step(0.020);              // 20 ms
    loop.step(0.020);
    loop.step(0.020);

    expect(loop.frameMs).toBeCloseTo(20, 4);
});


test("fps is derived from frameMs (1000 / frameMs)", () =>
{
    const { loop } = makeLoop();
    loop.step(1 / 60);
    loop.step(1 / 60);
    loop.step(1 / 60);

    expect(loop.fps).toBeCloseTo(60, 1);
});


test("frameMs window caps at 30 samples (older samples roll out)", () =>
{
    const { loop } = makeLoop();

    for(let i = 0; i < 30; i++) { loop.step(0.020); }
    expect(loop.frameMs).toBeCloseTo(20, 4);

    // Push 30 more samples at a different duration; window should be entirely new.
    for(let i = 0; i < 30; i++) { loop.step(0.010); }
    expect(loop.frameMs).toBeCloseTo(10, 4);
});


test("fps and frameMs are zero before any step is taken", () =>
{
    const { loop } = makeLoop();
    expect(loop.frameMs).toBe(0);
    expect(loop.fps).toBe(0);
});
