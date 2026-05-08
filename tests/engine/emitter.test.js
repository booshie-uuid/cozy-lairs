import { test, expect, afterEach, vi } from "vitest";
import { Emitter } from "../../scripts/modules/engine/emitter.js";

afterEach(() =>
{
    Emitter._devSink = null;
});


test("subscribers fire on emit with the payload", () =>
{
    const emitter = new Emitter();
    const seen = [];
    emitter.on("ping", payload => seen.push(payload));

    emitter.emit("ping", { value: 42 });

    expect(seen).toEqual([{ value: 42 }]);
});


test("multiple subscribers all fire, in subscription order", () =>
{
    const emitter = new Emitter();
    const order = [];
    emitter.on("e", () => order.push("a"));
    emitter.on("e", () => order.push("b"));
    emitter.on("e", () => order.push("c"));

    emitter.emit("e");

    expect(order).toEqual(["a", "b", "c"]);
});


test("off removes a subscriber", () =>
{
    const emitter = new Emitter();
    const seen = [];
    const handler = () => seen.push("called");

    emitter.on("e", handler);
    emitter.off("e", handler);
    emitter.emit("e");

    expect(seen).toEqual([]);
});


test("emit with no subscribers is a no-op", () =>
{
    const emitter = new Emitter();
    expect(() => emitter.emit("nothing", {})).not.toThrow();
});


test("an exception in one handler does not stop other handlers", () =>
{
    const emitter = new Emitter();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen = [];

    emitter.on("e", () => { throw new Error("boom"); });
    emitter.on("e", () => seen.push("survived"));

    emitter.emit("e");

    expect(seen).toEqual(["survived"]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
});


test("dev sink fires once per emit with (emitter, event, payload)", () =>
{
    const emitter = new Emitter();
    const captured = [];
    Emitter._devSink = (em, event, payload) =>
    {
        captured.push({ em, event, payload });
    };

    emitter.emit("ping", { value: 1 });

    expect(captured.length).toBe(1);
    expect(captured[0].em).toBe(emitter);
    expect(captured[0].event).toBe("ping");
    expect(captured[0].payload).toEqual({ value: 1 });
});


test("dev sink fires even when there are no direct subscribers", () =>
{
    const emitter = new Emitter();
    let fired = 0;
    Emitter._devSink = () => { fired += 1; };

    emitter.emit("ping");

    expect(fired).toBe(1);
});


test("dev sink null is the default and has no side effect", () =>
{
    const emitter = new Emitter();
    expect(Emitter._devSink).toBe(null);
    expect(() => emitter.emit("anything")).not.toThrow();
});


test("dev sink exception does not break direct subscribers", () =>
{
    const emitter = new Emitter();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen = [];

    emitter.on("e", () => seen.push("subscriber ran"));
    Emitter._devSink = () => { throw new Error("sink boom"); };

    emitter.emit("e");

    expect(seen).toEqual(["subscriber ran"]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
});
