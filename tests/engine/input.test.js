// @vitest-environment jsdom

import { test, expect, afterEach, vi } from "vitest";
import { Input } from "../../scripts/modules/engine/input.js";


let input;

afterEach(() =>
{
    if(input)
    {
        input.dispose();
        input = null;
    }
});


test("keydown adds code to _keys and emits a normalised payload", () =>
{
    input = new Input(window);
    const seen = [];
    input.on("keydown", payload => seen.push(payload));

    window.dispatchEvent(new KeyboardEvent("keydown",
    {
        code:     "KeyW",
        key:      "w",
        ctrlKey:  false,
        shiftKey: true,
        altKey:   false,
        metaKey:  false
    }));

    expect(input.isDown("KeyW")).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0].code).toBe("KeyW");
    expect(seen[0].key).toBe("w");
    expect(seen[0].shift).toBe(true);
    expect(seen[0].ctrl).toBe(false);
});


test("keyup removes code from _keys and emits", () =>
{
    input = new Input(window);
    const upPayloads = [];
    input.on("keyup", p => upPayloads.push(p));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a" }));
    window.dispatchEvent(new KeyboardEvent("keyup",   { code: "KeyA", key: "a" }));

    expect(input.isDown("KeyA")).toBe(false);
    expect(upPayloads.length).toBe(1);
    expect(upPayloads[0].code).toBe("KeyA");
});


test("multiple modifier keys pass through on keydown", () =>
{
    input = new Input(window);
    const seen = [];
    input.on("keydown", p => seen.push(p));

    window.dispatchEvent(new KeyboardEvent("keydown",
    {
        code:     "KeyS",
        key:      "S",
        ctrlKey:  true,
        shiftKey: true,
        altKey:   true,
        metaKey:  true
    }));

    expect(seen[0].ctrl).toBe(true);
    expect(seen[0].shift).toBe(true);
    expect(seen[0].alt).toBe(true);
    expect(seen[0].meta).toBe(true);
});


test("auto-repeated keydowns are suppressed entirely (not emitted, not added to _keys)", () =>
{
    input = new Input(window);
    const seen = [];
    input.on("keydown", p => seen.push(p));

    // First press emits and registers as down.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", repeat: false }));
    expect(seen.length).toBe(1);
    expect(input.isDown("KeyR")).toBe(true);

    // Auto-repeats while held: suppressed.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", repeat: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", repeat: true }));
    expect(seen.length).toBe(1);
});


test("preventDefault still fires on auto-repeats so held browser shortcuts stay suppressed", () =>
{
    input = new Input(window);
    input.preventDefaultFor("Tab");

    const event = new KeyboardEvent("keydown", { code: "Tab", repeat: true, cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
});


test("isDown is false for codes that have not been pressed", () =>
{
    input = new Input(window);
    expect(input.isDown("KeyZ")).toBe(false);
});


test("multiple keys can be held simultaneously", () =>
{
    input = new Input(window);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));

    expect(input.isDown("KeyW")).toBe(true);
    expect(input.isDown("KeyA")).toBe(true);
    expect(input.isDown("KeyD")).toBe(false);
});


test("wheel events are emitted with deltaX/Y/Z", () =>
{
    input = new Input(window);
    const seen = [];
    input.on("wheel", p => seen.push(p));

    window.dispatchEvent(new WheelEvent("wheel", { deltaX: 1, deltaY: -2, deltaZ: 0.5 }));

    expect(seen.length).toBe(1);
    expect(seen[0].deltaX).toBe(1);
    expect(seen[0].deltaY).toBe(-2);
    expect(seen[0].deltaZ).toBe(0.5);
});


test("dispose removes listeners — no further events fire after disposal", () =>
{
    input = new Input(window);
    const seen = [];
    input.on("keydown", p => seen.push(p));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" }));
    expect(seen.length).toBe(1);

    input.dispose();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" }));
    expect(seen.length).toBe(1);

    input = null;
});


test("pointerlockchange emits with derived `locked` boolean", () =>
{
    input = new Input(window);
    const seen = [];
    input.on("pointerlockchange", p => seen.push(p));

    Object.defineProperty(document, "pointerLockElement",
    {
        configurable: true,
        get: () => document.body
    });

    document.dispatchEvent(new Event("pointerlockchange"));

    expect(seen.length).toBe(1);
    expect(seen[0].locked).toBe(true);
});


test("keys pressed with Ctrl held are not registered as `down`", () =>
{
    input = new Input(window);
    const seen = [];
    input.on("keydown", p => seen.push(p));

    window.dispatchEvent(new KeyboardEvent("keydown",
    {
        code:    "KeyS",
        key:     "s",
        ctrlKey: true
    }));

    expect(seen.length).toBe(1);          // event still fires
    expect(seen[0].ctrl).toBe(true);
    expect(input.isDown("KeyS")).toBe(false);  // but movement state stays clean
});


test("keys pressed with Meta (Cmd) held are not registered as `down`", () =>
{
    input = new Input(window);

    window.dispatchEvent(new KeyboardEvent("keydown",
    {
        code:    "KeyS",
        key:     "s",
        metaKey: true
    }));

    expect(input.isDown("KeyS")).toBe(false);
});


test("window blur clears all held keys", () =>
{
    input = new Input(window);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(input.isDown("KeyW")).toBe(true);
    expect(input.isDown("KeyD")).toBe(true);

    window.dispatchEvent(new Event("blur"));

    expect(input.isDown("KeyW")).toBe(false);
    expect(input.isDown("KeyD")).toBe(false);
});
