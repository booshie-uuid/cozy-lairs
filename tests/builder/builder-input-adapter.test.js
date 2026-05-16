import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { Emitter } from "../../scripts/modules/engine/emitter.js";
import { BuilderInputAdapter } from "../../scripts/modules/builder/builder-input-adapter.js";
import { Tool } from "../../scripts/modules/builder/tools/tool.js";


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

class StubInput extends Emitter {}


function makeGrid()
{
    return {
        cellSize: 4,
        isInBounds(cx, cz) { return cx >= 0 && cx < 10 && cz >= 0 && cz < 10; },
        worldToCell(x, z)  { return { cx: Math.floor(x / 4), cz: Math.floor(z / 4) }; }
    };
}


class StubTool extends Tool
{
    constructor()
    {
        super();
        this.onCellHover = vi.fn();
        this.onCellClick = vi.fn();
        this.rotate = vi.fn();
    }
    buildGhost() { return null; }
}


function setup({ targetType = "cell" } = {})
{
    const input = new StubInput();
    const scene = new THREE.Scene();
    const grid = makeGrid();
    const canvas = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 })
    };
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);

    const tool = new StubTool();
    tool.targetType = targetType;

    const adapter = new BuilderInputAdapter({
        input,
        scene,
        grid,
        canvas,
        editor: { world: { grid, scene } }
    });
    adapter.setCamera(camera);
    adapter.setTool(tool);
    adapter.install();

    // Provide deterministic raycast resolution for the dispatch tests.
    adapter.screenToCell = vi.fn(() => ({ cx: 3, cz: 5 }));
    adapter.screenToWallEdge = vi.fn(() => ({ cx: 3, cz: 5, side: "north" }));

    return { adapter, input, tool, camera };
}


/******************************************************************************/
/* POINTER DISPATCH                                                           */
/******************************************************************************/

test("pointermove with a cell tool dispatches onCellHover with the raycast cell", () =>
{
    const { input, tool } = setup({ targetType: "cell" });
    input.emit("pointermove", { x: 50, y: 50 });
    expect(tool.onCellHover).toHaveBeenCalledWith({ cx: 3, cz: 5 });
});


test("pointerdown left with a cell tool dispatches onCellClick(cell, 'left')", () =>
{
    const { input, tool } = setup({ targetType: "cell" });
    input.emit("pointerdown", { x: 50, y: 50, button: 0 });
    expect(tool.onCellClick).toHaveBeenCalledWith({ cx: 3, cz: 5 }, "left");
});


test("right click (down + up without drag) swaps the active tool to NoopTool", () =>
{
    const { adapter, input, tool } = setup({ targetType: "cell" });
    expect(adapter.tool).toBe(tool);

    input.emit("pointerdown", { x: 50, y: 50, button: 2 });
    input.emit("pointerup",   { x: 51, y: 50, button: 2 });

    expect(adapter.tool).not.toBe(tool);
    expect(adapter.tool.targetType).toBe("none");
    expect(tool.onCellClick).not.toHaveBeenCalled();
});


test("right drag (down + up far away) does NOT cancel the tool", () =>
{
    const { adapter, input, tool } = setup({ targetType: "cell" });
    expect(adapter.tool).toBe(tool);

    input.emit("pointerdown", { x: 50, y: 50, button: 2 });
    input.emit("pointerup",   { x: 120, y: 90, button: 2 });

    expect(adapter.tool).toBe(tool);
});


test("pointerdown middle (button=1) doesn't dispatch anything", () =>
{
    const { input, tool } = setup({ targetType: "cell" });
    input.emit("pointerdown", { x: 50, y: 50, button: 1 });
    expect(tool.onCellClick).not.toHaveBeenCalled();
});


test("a NoopTool ignores pointermove dispatches (targetType='none')", () =>
{
    const { adapter, input } = setup({ targetType: "cell" });
    adapter.setTool(new (class extends Tool {
        constructor() { super(); this.targetType = "none"; this.onCellHover = vi.fn(); }
    })());

    input.emit("pointermove", { x: 50, y: 50 });
    expect(adapter.tool.onCellHover).not.toHaveBeenCalled();
});


/******************************************************************************/
/* WALL EDGE DISPATCH                                                         */
/******************************************************************************/

test("pointermove with a wallEdge tool dispatches onWallEdgeHover", () =>
{
    const { input, tool } = setup({ targetType: "wallEdge" });
    tool.onWallEdgeHover = vi.fn();

    input.emit("pointermove", { x: 50, y: 50 });
    expect(tool.onWallEdgeHover).toHaveBeenCalledWith({ cx: 3, cz: 5, side: "north" });
});


test("pointerdown left with a wallEdge tool dispatches onWallEdgeClick(edge, 'left')", () =>
{
    const { input, tool } = setup({ targetType: "wallEdge" });
    tool.onWallEdgeClick = vi.fn();

    input.emit("pointerdown", { x: 50, y: 50, button: 0 });
    expect(tool.onWallEdgeClick).toHaveBeenCalledWith({ cx: 3, cz: 5, side: "north" }, "left");
});


/******************************************************************************/
/* KEY DISPATCH                                                               */
/******************************************************************************/

test("KeyQ dispatches tool.rotate('ccw')", () =>
{
    const { input, tool } = setup();
    input.emit("keydown", { code: "KeyQ", repeat: false });
    expect(tool.rotate).toHaveBeenCalledWith("ccw");
});


test("KeyE dispatches tool.rotate('cw')", () =>
{
    const { input, tool } = setup();
    input.emit("keydown", { code: "KeyE", repeat: false });
    expect(tool.rotate).toHaveBeenCalledWith("cw");
});


test("Escape cancels the active tool and reverts to NoopTool", () =>
{
    const { adapter, input, tool } = setup({ targetType: "cell" });
    expect(adapter.tool).toBe(tool);

    input.emit("keydown", { code: "Escape", repeat: false });

    expect(adapter.tool).not.toBe(tool);
    expect(adapter.tool.targetType).toBe("none");
});


test("auto-repeated Q/E key events are ignored", () =>
{
    const { input, tool } = setup();
    input.emit("keydown", { code: "KeyQ", repeat: true });
    expect(tool.rotate).not.toHaveBeenCalled();
});


test("key events suppressed while a text input is focused", () =>
{
    const input = new StubInput();
    const grid = makeGrid();
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
    const tool = new StubTool();
    const adapter = new BuilderInputAdapter({
        input, scene: new THREE.Scene(), grid, canvas,
        editor: { world: { grid } },
        isTextInputFocused: () => true
    });
    adapter.setTool(tool);
    adapter.install();

    input.emit("keydown", { code: "KeyQ", repeat: false });
    expect(tool.rotate).not.toHaveBeenCalled();
});


/******************************************************************************/
/* INSTALL / UNINSTALL                                                        */
/******************************************************************************/

test("uninstall stops dispatching pointer events", () =>
{
    const { adapter, input, tool } = setup();
    adapter.uninstall();

    input.emit("pointermove", { x: 50, y: 50 });
    input.emit("pointerdown", { x: 50, y: 50, button: 0 });
    expect(tool.onCellHover).not.toHaveBeenCalled();
    expect(tool.onCellClick).not.toHaveBeenCalled();
});


test("install is idempotent — calling twice doesn't double-subscribe", () =>
{
    const { adapter, input, tool } = setup();
    adapter.install();   // already installed once in setup

    input.emit("pointermove", { x: 50, y: 50 });
    expect(tool.onCellHover).toHaveBeenCalledTimes(1);
});


test("setTool deactivates the old tool before activating the new", () =>
{
    const { adapter, tool } = setup();
    const deactivateSpy = vi.spyOn(tool, "deactivate");

    const newTool = new StubTool();
    adapter.setTool(newTool);

    expect(deactivateSpy).toHaveBeenCalled();
    expect(adapter.tool).toBe(newTool);
});


/******************************************************************************/
/* ENTITY DISPATCH + ARROW-KEY NUDGE                                          */
/******************************************************************************/

class StubSelectTool extends Tool
{
    constructor()
    {
        super();
        this.targetType = "entity";
        this.onEntityClick = vi.fn();
        this.nudge = vi.fn();
    }
    buildGhost() { return null; }
}


test("pointerdown left with an entity tool dispatches onEntityClick with the raycast entity", () =>
{
    const { adapter, input } = setup();
    const tool = new StubSelectTool();
    adapter.setTool(tool);
    const fakeEntity = { kind: "decor.crate" };
    adapter.screenToEntity = vi.fn(() => fakeEntity);

    input.emit("pointerdown", { x: 50, y: 50, button: 0 });

    expect(tool.onEntityClick).toHaveBeenCalledWith(fakeEntity, "left");
});


test("pointerdown left with an entity tool on empty space dispatches onEntityClick(null)", () =>
{
    const { adapter, input } = setup();
    const tool = new StubSelectTool();
    adapter.setTool(tool);
    adapter.screenToEntity = vi.fn(() => null);

    input.emit("pointerdown", { x: 50, y: 50, button: 0 });

    expect(tool.onEntityClick).toHaveBeenCalledWith(null, "left");
});


test("ArrowUp dispatches tool.nudge(0, +1) for an entity tool", () =>
{
    const { adapter, input } = setup();
    const tool = new StubSelectTool();
    adapter.setTool(tool);

    input.emit("keydown", { code: "ArrowUp", repeat: false });
    expect(tool.nudge).toHaveBeenCalledWith(0, 1);
});


test("ArrowDown dispatches tool.nudge(0, -1)", () =>
{
    const { adapter, input } = setup();
    const tool = new StubSelectTool();
    adapter.setTool(tool);

    input.emit("keydown", { code: "ArrowDown", repeat: false });
    expect(tool.nudge).toHaveBeenCalledWith(0, -1);
});


test("ArrowLeft dispatches tool.nudge(-1, 0)", () =>
{
    const { adapter, input } = setup();
    const tool = new StubSelectTool();
    adapter.setTool(tool);

    input.emit("keydown", { code: "ArrowLeft", repeat: false });
    expect(tool.nudge).toHaveBeenCalledWith(-1, 0);
});


test("ArrowRight dispatches tool.nudge(+1, 0)", () =>
{
    const { adapter, input } = setup();
    const tool = new StubSelectTool();
    adapter.setTool(tool);

    input.emit("keydown", { code: "ArrowRight", repeat: false });
    expect(tool.nudge).toHaveBeenCalledWith(1, 0);
});


test("arrow keys are inert for non-entity tools (no nudge method, no crash)", () =>
{
    const { input, tool } = setup({ targetType: "cell" });

    input.emit("keydown", { code: "ArrowUp", repeat: false });

    /* Stub tool has no `nudge` method — it must not be summoned. */
    expect(tool.rotate).not.toHaveBeenCalled();
});


test("Escape on an entity tool still cancels back to NoopTool", () =>
{
    const { adapter, input } = setup();
    const tool = new StubSelectTool();
    adapter.setTool(tool);

    input.emit("keydown", { code: "Escape", repeat: false });

    expect(adapter.tool).not.toBe(tool);
    expect(adapter.tool.targetType).toBe("none");
});
