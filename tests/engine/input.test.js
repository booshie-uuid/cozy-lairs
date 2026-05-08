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


test("repeat flag is included in keydown payload", () =>
{
    input = new Input(window);
    const seen = [];
    input.on("keydown", p => seen.push(p));

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", repeat: true }));

    expect(seen[0].repeat).toBe(true);
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
