import { test, expect, vi, beforeEach, afterEach } from "vitest";

import { ToastQueue } from "../../scripts/modules/ui/toast-queue.js";


function makeStubSink()
{
    const items = [];
    return {
        items,
        push(item)        { items.push(item); },
        remove(predicate)
        {
            for(let i = items.length - 1; i >= 0; i--)
            {
                if(predicate(items[i])) { items.splice(i, 1); }
            }
        }
    };
}


let queue;

afterEach(() =>
{
    if(queue) { queue.clear(); queue = null; }
    vi.useRealTimers();
});


test("constructor throws if the sink lacks push/remove", () =>
{
    expect(() => new ToastQueue(null)).toThrow();
    expect(() => new ToastQueue({})).toThrow();
    expect(() => new ToastQueue({ push: () => {} })).toThrow();
});


test("push adds a toast with id, message, level to the sink", () =>
{
    const sink = makeStubSink();
    queue = new ToastQueue(sink);

    queue.push("hello", "info");
    queue.push("world", "error");

    expect(sink.items.length).toBe(2);
    expect(sink.items[0].message).toBe("hello");
    expect(sink.items[0].level).toBe("info");
    expect(sink.items[1].level).toBe("error");
    expect(sink.items[0].id).not.toBe(sink.items[1].id);
});


test("push defaults level to info", () =>
{
    const sink = makeStubSink();
    queue = new ToastQueue(sink);
    queue.push("just a notice");
    expect(sink.items[0].level).toBe("info");
});


test("toast auto-dismisses after the configured timeout", () =>
{
    vi.useFakeTimers();
    const sink = makeStubSink();
    queue = new ToastQueue(sink, { dismissMs: 1000 });

    queue.push("transient", "info");
    expect(sink.items.length).toBe(1);

    vi.advanceTimersByTime(999);
    expect(sink.items.length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(sink.items.length).toBe(0);
});


test("dismiss removes a specific toast and cancels its timer", () =>
{
    vi.useFakeTimers();
    const cancelSpy = vi.fn();
    const sink = makeStubSink();
    queue = new ToastQueue(sink,
    {
        dismissMs:       1000,
        scheduleTimeout: (fn, ms) => setTimeout(fn, ms),
        cancelTimeout:   handle   => { cancelSpy(); clearTimeout(handle); }
    });

    const id = queue.push("dismiss me");
    queue.push("keep me");

    queue.dismiss(id);

    expect(sink.items.length).toBe(1);
    expect(sink.items[0].message).toBe("keep me");
    expect(cancelSpy).toHaveBeenCalledTimes(1);
});


test("clear empties the sink and cancels every pending timer", () =>
{
    vi.useFakeTimers();
    const sink = makeStubSink();
    queue = new ToastQueue(sink, { dismissMs: 1000 });

    queue.push("a");
    queue.push("b");
    queue.push("c");
    expect(sink.items.length).toBe(3);

    queue.clear();
    expect(sink.items.length).toBe(0);

    // Timers should be cancelled — advancing past dismissMs must not throw or refire.
    expect(() => vi.advanceTimersByTime(2000)).not.toThrow();
});


test("dismiss after auto-dismiss is a no-op (timer already cleared)", () =>
{
    vi.useFakeTimers();
    const sink = makeStubSink();
    queue = new ToastQueue(sink, { dismissMs: 1000 });

    const id = queue.push("transient");
    vi.advanceTimersByTime(1000);
    expect(sink.items.length).toBe(0);

    expect(() => queue.dismiss(id)).not.toThrow();
});


test("ids are monotonically increasing per queue instance", () =>
{
    const sink = makeStubSink();
    queue = new ToastQueue(sink);

    const a = queue.push("a");
    const b = queue.push("b");
    queue.dismiss(a);
    const c = queue.push("c");

    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
});
