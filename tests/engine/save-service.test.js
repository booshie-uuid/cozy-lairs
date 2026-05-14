// @vitest-environment jsdom
import { test, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

import lzString from "lz-string";

beforeAll(() => { window.LZString = lzString; });

import { SaveService }    from "../../scripts/modules/engine/save-service.js";
import * as Errors        from "../../scripts/modules/engine/errors.js";
import * as SaveCodec     from "../../scripts/modules/world/save-codec.js";


function v2Snapshot(entities = [])
{
    return { v: 2, kinds: [], components: [], entities };
}


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

    const snapshot = v2Snapshot();
    const service  = new SaveService({ getSnapshot: () => snapshot, storage: makeMemoryStorage() });

    const events = [];
    service.on("saved",       p => events.push({ type: "saved", payload: p }));
    service.on("saveFailed",  p => events.push({ type: "saveFailed", payload: p }));

    await service.save();

    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(handle.createWritable).toHaveBeenCalledTimes(1);

    const written = writable.write.mock.calls[0][0];
    const decoded = SaveCodec.decodeForFile(written);
    expect(decoded.error).toBeNull();
    expect(decoded.snapshot).toEqual(snapshot);

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

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

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

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

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
        const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });
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

test("autosave writes a UTF-16 LZ-encoded v2 snapshot to localStorage", () =>
{
    vi.useFakeTimers();

    const storage  = makeMemoryStorage();
    const snapshot = v2Snapshot([[0, []]]);
    const service  = new SaveService({
        getSnapshot:        () => snapshot,
        autosaveIntervalMs: 1000,
        storage
    });

    service.startAutosave();
    vi.advanceTimersByTime(1000);

    const encoded = storage.getItem("cozy-lairs.autosave");
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = SaveCodec.decodeForStorage(encoded);
    expect(decoded.error).toBeNull();
    expect(decoded.snapshot).toEqual(snapshot);

    expect(service.lastAutosaveSize).toBeGreaterThan(0);
    expect(service.lastAutosaveAt).toBeGreaterThan(0);

    service.dispose();
});


test("autosave catches QuotaExceededError and emits saveFailed without crashing the timer", () =>
{
    vi.useFakeTimers();

    const service = new SaveService({
        getSnapshot:        () => v2Snapshot(),
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
        getSnapshot:        () => v2Snapshot([[0, [], calls++]]),
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


/* LOAD FROM AUTOSAVE *********************************************************/

test("loadFromAutosave returns null when the slot is empty", () =>
{
    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

    expect(service.loadFromAutosave()).toBe(null);
});


test("loadFromAutosave returns the snapshot when the slot holds a v2 LZ blob", () =>
{
    const storage  = makeMemoryStorage();
    const snapshot = v2Snapshot([[0, [[0, { cx: 1, cz: 2, rotationStep: 0 }]]]]);
    storage.setItem("cozy-lairs.autosave", SaveCodec.encodeForStorage(snapshot));

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage });

    expect(service.loadFromAutosave()).toEqual(snapshot);
});


test("loadFromAutosave clears legacy v1 raw-JSON autosaves and returns null", () =>
{
    const storage = makeMemoryStorage();
    storage.setItem("cozy-lairs.autosave", JSON.stringify({ version: 1, entities: [] }));

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage });

    expect(service.loadFromAutosave()).toBe(null);
    expect(storage.getItem("cozy-lairs.autosave")).toBe(null);
});


test("loadFromAutosave clears unreadable autosave strings and returns null", () =>
{
    const storage = makeMemoryStorage();
    storage.setItem("cozy-lairs.autosave", "not a real lz blob at all");

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage });

    expect(service.loadFromAutosave()).toBe(null);
    expect(storage.getItem("cozy-lairs.autosave")).toBe(null);
});


/* CLEAR AUTOSAVE *************************************************************/

test("clearAutosave removes the storage key", () =>
{
    const storage = makeMemoryStorage();
    storage.setItem("cozy-lairs.autosave", "anything");

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage });
    service.clearAutosave();

    expect(storage.getItem("cozy-lairs.autosave")).toBe(null);
});


/* CLEAR FILE HANDLE **********************************************************/

test("clearFileHandle drops the cached FSA handle so the next save re-prompts", async () =>
{
    const { handle } = makeMockHandle();
    window.showSaveFilePicker = vi.fn(async () => handle);

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

    await service.save();
    expect(service.hasFileHandle).toBe(true);
    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(1);

    service.clearFileHandle();
    expect(service.hasFileHandle).toBe(false);

    await service.save();
    expect(window.showSaveFilePicker).toHaveBeenCalledTimes(2);
});


/* OPEN FILE — FSA PATH *******************************************************/

function makeMockOpenHandle(text)
{
    const file = { name: "lair.json", text: vi.fn(async () => text) };
    return { getFile: vi.fn(async () => file), _file: file };
}


test("openFile via FSA: decodes the file and emits loadRequested with the snapshot", async () =>
{
    const snapshot = v2Snapshot([[0, []]]);
    const text     = SaveCodec.encodeForFile(snapshot);
    const handle   = makeMockOpenHandle(text);

    window.showOpenFilePicker = vi.fn(async () => [handle]);

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

    let received = null;
    service.on("loadRequested", payload => { received = payload; });

    await service.openFile();

    expect(window.showOpenFilePicker).toHaveBeenCalledTimes(1);
    expect(handle.getFile).toHaveBeenCalledTimes(1);
    expect(received).not.toBeNull();
    expect(received.snapshot).toEqual(snapshot);
    expect(received.fileName).toBe("lair.json");
});


test("openFile via FSA: AbortError (user cancel) is silent — no events emitted", async () =>
{
    window.showOpenFilePicker = vi.fn(async () =>
    {
        const err = new Error("user cancelled");
        err.name  = "AbortError";
        throw err;
    });

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

    let requested = 0;
    let failed = 0;
    service.on("loadRequested", () => { requested += 1; });
    service.on("loadFailed",    () => { failed    += 1; });

    await service.openFile();

    expect(requested).toBe(0);
    expect(failed).toBe(0);
});


test("openFile via FSA: malformed file emits loadFailed with the codec's error message", async () =>
{
    const handle = makeMockOpenHandle("not a Cozy Lairs save");
    window.showOpenFilePicker = vi.fn(async () => [handle]);

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

    let failed = null;
    service.on("loadFailed", err => { failed = err; });

    await service.openFile();

    expect(failed).toBeInstanceOf(Errors.SaveError);
    expect(failed.message).toMatch(/isn't a Cozy Lairs save/);
});


test("openFile via FSA: v1-style file content emits loadFailed with the 'too old' message", async () =>
{
    const v1FileText = JSON.stringify({ version: 1, entities: [] });
    const handle     = makeMockOpenHandle(v1FileText);
    window.showOpenFilePicker = vi.fn(async () => [handle]);

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

    let failed = null;
    service.on("loadFailed", err => { failed = err; });

    await service.openFile();

    expect(failed.message).toMatch(/Save format too old/);
});


/* OPEN FILE — INPUT FALLBACK *************************************************/

test("openFile creates a transient <input type=\"file\"> and clicks it when FSA is unavailable", async () =>
{
    delete window.showOpenFilePicker;

    const originalCreate = document.createElement.bind(document);
    let lastInput = null;
    let clicked = false;

    document.createElement = function(tag)
    {
        const el = originalCreate(tag);
        if(tag === "input")
        {
            lastInput = el;
            el.click = () => { clicked = true; };
        }
        return el;
    };

    try
    {
        const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });
        const promise = service.openFile();

        expect(lastInput).not.toBeNull();
        expect(lastInput.type).toBe("file");
        expect(lastInput.accept).toMatch(/json/);
        expect(clicked).toBe(true);

        // Resolve the lingering promise by faking a "no file selected" cancel —
        // a real cancel never fires a change event; we simulate it by dispatching
        // change with no files so the listener runs and resolves the await.
        Object.defineProperty(lastInput, "files", { value: [], configurable: true });
        lastInput.dispatchEvent(new Event("change"));
        await promise;
    }
    finally
    {
        document.createElement = originalCreate;
    }
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

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

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

    const service = new SaveService({ getSnapshot: () => v2Snapshot(), storage: makeMemoryStorage() });

    const events = [];
    service.on("saved",      () => events.push("saved"));
    service.on("saveFailed", () => events.push("saveFailed"));

    service.forceFailNextSave();
    await service.save();
    await service.save();

    expect(events).toEqual(["saveFailed", "saved"]);
});
