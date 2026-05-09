// @vitest-environment jsdom
import { test, expect, vi, beforeEach, afterEach } from "vitest";

import { SaveService } from "../../scripts/modules/engine/save-service.js";
import * as Errors     from "../../scripts/modules/engine/errors.js";


function makeMockHandle()
{
    const writes = [];
    const writable =
    {
        write: vi.fn(async chunk => { writes.push(chunk); }),
        close: vi.fn(async () => {})
    };
    const handle =
    {
        createWritable: vi.fn(async () => writable),
        _writes:        writes
    };
    return { handle, writable };
}


function makeMemoryStorage()
{
    const map = new Map();
    return {
        getItem(key)
        {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value)
        {
            map.set(key, String(value));
        },
        removeItem(key) { map.delete(key); },
        clear()         { map.clear(); },
        get size()      { return map.size; },
        _map: map
    };
}


function makeQuotaStorage()
{
    return {
        getItem: () => null,
        setItem: () =>
        {
            const err = new Error("Quota exceeded");
            err.name = "QuotaExceededError";
            throw err;
        },
        removeItem: () => {},
        clear:      () => {}
    };
}


let originalPicker;

beforeEach(() =>
{
    originalPicker = window.showSaveFilePicker;
});

afterEach(() =>
{
    if(originalPicker === undefined) { delete window.showSaveFilePicker; }
    else                             { window.showSaveFilePicker = originalPicker; }
    vi.useRealTimers();
});


/* SAVE — FSA PATH ************************************************************/

test("first save with FSA support shows the picker, retains the handle, and emits `saved`", async () =>
{
    const { handle, writable } = makeMockHandle();
    window.showSaveFilePicker  = vi.fn(async () => handle);

    const snapshot = { version: 1, entities: [] };
    const service  = new SaveService({ getSnapshot: () => snapshot, storage: makeMemoryStorage() });

    const events = [];
    service.on("saved",       p => events.push({ type: "saved", payload: p }));
    service.on("saveFailed",  p => events.push({ type: "saveFailed", payload: p }));

    await service.save();

    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(handle.createWritable).toHaveBeenCalledTimes(1);
    expect(writable.write).toHaveBeenCalledWith(JSON.stringify(snapshot));
    expect(writable.close).toHaveBeenCalled();
    expect(service.hasFileHandle).toBe(true);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("saved");
    expect(events[0].payload.mode).toBe("fsa");
});


test("second save with retained handle does not re-prompt the picker", async () =>
{
    const { handle } = makeMockHandle();
    window.showSaveFilePicker = vi.fn(async () => handle);

    const service = new SaveService({ getSnapshot: () => ({ a: 1 }), storage: makeMemoryStorage() });

    await service.save();
    await service.save();

    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(handle.createWritable).toHaveBeenCalledTimes(2);
});


test("picker cancellation (AbortError) emits `saveFailed`, not `saved`", async () =>
{
    window.showSaveFilePicker = vi.fn(async () =>
    {
        const err = new Error("user cancelled");
        err.name  = "AbortError";
        throw err;
    });

    const service = new SaveService({ getSnapshot: () => ({}), storage: makeMemoryStorage() });

    let saved = 0;
    let failed = null;
    service.on("saved",      () => { saved += 1; });
    service.on("saveFailed", err => { failed = err; });

    await service.save();

    expect(saved).toBe(0);
    expect(failed).toBeInstanceOf(Errors.SaveError);
    expect(service.hasFileHandle).toBe(false);
});


/* SAVE — DOWNLOAD FALLBACK ***************************************************/

test("save falls back to a download anchor when showSaveFilePicker is unavailable", async () =>
{
    delete window.showSaveFilePicker;

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    const originalCreate  = URL.createObjectURL;
    const originalRevoke  = URL.revokeObjectURL;
    URL.createObjectURL   = createObjectURL;
    URL.revokeObjectURL   = revokeObjectURL;

    try
    {
        const service = new SaveService({ getSnapshot: () => ({ entities: [] }), storage: makeMemoryStorage() });
        const events  = [];
        service.on("saved", p => events.push(p));

        await service.save();

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledTimes(1);
        expect(events.length).toBe(1);
        expect(events[0].mode).toBe("download");
    }
    finally
    {
        clickSpy.mockRestore();
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
    }
});


/* AUTOSAVE *******************************************************************/

test("autosave writes the snapshot to localStorage at every interval", () =>
{
    vi.useFakeTimers();

    const storage = makeMemoryStorage();
    const service = new SaveService({
        getSnapshot:        () => ({ version: 1, entities: [{ kind: "x", components: {} }] }),
        autosaveIntervalMs: 1000,
        storage
    });

    service.startAutosave();

    vi.advanceTimersByTime(1000);
    expect(storage.getItem("cozy-lairs.autosave")).toBe(JSON.stringify({ version: 1, entities: [{ kind: "x", components: {} }] }));
    expect(service.lastAutosaveSize).toBeGreaterThan(0);
    expect(service.lastAutosaveAt).toBeGreaterThan(0);

    vi.advanceTimersByTime(1000);
    expect(storage.getItem("cozy-lairs.autosave")).toBeTruthy();

    service.dispose();
});


test("autosave catches QuotaExceededError and emits saveFailed without crashing the timer", () =>
{
    vi.useFakeTimers();

    const service = new SaveService({
        getSnapshot:        () => ({ version: 1, entities: [] }),
        autosaveIntervalMs: 500,
        storage:            makeQuotaStorage()
    });

    let failed = null;
    service.on("saveFailed", err => { failed = err; });

    service.startAutosave();
    vi.advanceTimersByTime(500);

    expect(failed).toBeInstanceOf(Errors.SaveError);
    expect(failed.message).toMatch(/quota/i);

    // Timer keeps ticking (no crash).
    vi.advanceTimersByTime(500);
    service.dispose();
});


test("dispose stops the autosave timer", () =>
{
    vi.useFakeTimers();

    const storage = makeMemoryStorage();
    let calls = 0;
    const service = new SaveService({
        getSnapshot:        () => ({ tick: calls++ }),
        autosaveIntervalMs: 500,
        storage
    });

    service.startAutosave();
    vi.advanceTimersByTime(500);
    expect(storage.getItem("cozy-lairs.autosave")).toBeTruthy();

    service.dispose();
    storage.clear();
    vi.advanceTimersByTime(2000);

    expect(storage.getItem("cozy-lairs.autosave")).toBe(null);
});


test("loadFromAutosave returns the parsed snapshot, or null when missing/invalid", () =>
{
    const storage = makeMemoryStorage();
    const service = new SaveService({ getSnapshot: () => ({}), storage });

    expect(service.loadFromAutosave()).toBe(null);

    const snapshot = { version: 1, entities: [] };
    storage.setItem("cozy-lairs.autosave", JSON.stringify(snapshot));
    expect(service.loadFromAutosave()).toEqual(snapshot);

    storage.setItem("cozy-lairs.autosave", "{ not valid json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(service.loadFromAutosave()).toBe(null);
    warnSpy.mockRestore();
});


/* CONSTRUCTOR VALIDATION *****************************************************/

test("constructor throws if getSnapshot is not a function", () =>
{
    expect(() => new SaveService({ getSnapshot: null })).toThrow();
    expect(() => new SaveService({})).toThrow();
});


/* FORCE FAIL (DEV CONSOLE) ***************************************************/

test("forceFailNextSave: next save emits saveFailed with a synthetic SaveError", async () =>
{
    const { handle } = makeMockHandle();
    window.showSaveFilePicker = vi.fn(async () => handle);

    const service = new SaveService({ getSnapshot: () => ({}), storage: makeMemoryStorage() });

    let saved = 0;
    let failed = null;
    service.on("saved",      () => { saved += 1; });
    service.on("saveFailed", err => { failed = err; });

    service.forceFailNextSave();
    await service.save();

    expect(saved).toBe(0);
    expect(failed).toBeInstanceOf(Errors.SaveError);
    expect(failed.message).toMatch(/forced/i);
    expect(window.showSaveFilePicker).not.toHaveBeenCalled();
});


test("forceFailNextSave only affects the very next save call", async () =>
{
    const { handle } = makeMockHandle();
    window.showSaveFilePicker = vi.fn(async () => handle);

    const service = new SaveService({ getSnapshot: () => ({}), storage: makeMemoryStorage() });

    const events = [];
    service.on("saved",      () => events.push("saved"));
    service.on("saveFailed", () => events.push("saveFailed"));

    service.forceFailNextSave();
    await service.save();
    await service.save();

    expect(events).toEqual(["saveFailed", "saved"]);
});
