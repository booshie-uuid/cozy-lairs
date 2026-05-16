// @vitest-environment jsdom

import { test, expect, vi, beforeAll } from "vitest";


/******************************************************************************/
/* MINIMAL KO STUB                                                            */
/******************************************************************************/

function createKoStub()
{
    function observable(initial)
    {
        let value = initial;
        const subs = [];
        const fn = function(next)
        {
            if(arguments.length === 0) { return value; }
            value = next;
            for(const s of subs) { s(value); }
        };
        fn.subscribe = (cb) => { subs.push(cb); return { dispose() {} }; };
        return fn;
    }

    function pureComputed(reader)
    {
        const fn = function() { return reader(); };
        fn.subscribe = () => ({ dispose() {} });
        return fn;
    }

    return { observable, pureComputed };
}


let ToolBarViewModel;

beforeAll(async () =>
{
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.ko = createKoStub();
    ({ ToolBarViewModel } = await import("../../scripts/modules/ui/tool-bar.js"));
});


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

function makePanelStub({ activeTab = "decor", selectedKind = null, selectedToolId = null } = {})
{
    const ko = globalThis.window.ko;
    return {
        activeTab:       ko.observable(activeTab),
        selectedKind:    ko.observable(selectedKind),
        selectedToolId:  ko.observable(selectedToolId)
    };
}


function setup({ activeTab = "decor", selectedKind = null, selectedToolId = null, cameraMode = "builder" } = {})
{
    const ko = globalThis.window.ko;
    const panel = makePanelStub({ activeTab, selectedKind, selectedToolId });
    const onSelectTool = vi.fn();

    const toolBar = new ToolBarViewModel({
        authoringPanel: panel,
        cameraMode:     ko.observable(cameraMode),
        onSelectTool
    });

    return { toolBar, panel, onSelectTool };
}


/******************************************************************************/
/* VISIBLE TOOLS PER TAB                                                      */
/******************************************************************************/

test("build tab exposes [build, break]", () =>
{
    const { toolBar } = setup({ activeTab: "build" });
    expect(toolBar.visibleTools().map(t => t.verb)).toEqual(["build", "break"]);
});


test("decor tab exposes [pick, build, break, nudge]", () =>
{
    const { toolBar } = setup({ activeTab: "decor" });
    expect(toolBar.visibleTools().map(t => t.verb)).toEqual(["pick", "build", "break", "nudge"]);
});


test("minions tab exposes [pick, build, break]", () =>
{
    const { toolBar } = setup({ activeTab: "minions" });
    expect(toolBar.visibleTools().map(t => t.verb)).toEqual(["pick", "build", "break"]);
});


test("each visible tool carries a verb, toolId, label, iconURL, isActive", () =>
{
    const { toolBar } = setup({ activeTab: "decor" });
    const pick = toolBar.visibleTools()[0];
    expect(pick).toMatchObject({
        verb: "pick",
        toolId: "decor:pick",
        label: "Pick Up"
    });
    expect(pick.iconURL).toContain("pick-up.png");
    expect(typeof pick.isActive).toBe("boolean");
});


/******************************************************************************/
/* TOOL ID COMPOSITION                                                        */
/******************************************************************************/

test("Build verb on decor tab includes selectedKind when armed", () =>
{
    const { toolBar } = setup({ activeTab: "decor", selectedKind: "decor.barrel" });
    const build = toolBar.visibleTools().find(t => t.verb === "build");
    expect(build.toolId).toBe("decor:build:decor.barrel");
});


test("Build verb without selectedKind composes a bare `<tab>:build` id (falls through to default place tool)", () =>
{
    const { toolBar } = setup({ activeTab: "build", selectedKind: null });
    const build = toolBar.visibleTools().find(t => t.verb === "build");
    expect(build.toolId).toBe("build:build");
});


test("minions tab tool ids use the singular 'minion:' prefix", () =>
{
    const { toolBar } = setup({ activeTab: "minions", selectedKind: "character.skeleton" });
    const pick = toolBar.visibleTools().find(t => t.verb === "pick");
    const build = toolBar.visibleTools().find(t => t.verb === "build");
    expect(pick.toolId).toBe("minion:pick");
    expect(build.toolId).toBe("minion:build:character.skeleton");
});


/******************************************************************************/
/* CLICK DISPATCH                                                             */
/******************************************************************************/

test("onClick(verb) calls onSelectTool with the composed id", () =>
{
    const { toolBar, onSelectTool } = setup({ activeTab: "decor", selectedKind: "decor.crate" });
    toolBar.onClick("build");
    expect(onSelectTool).toHaveBeenCalledWith("decor:build:decor.crate");
});


test("onClick(verb) for non-kind verbs uses the bare verb id", () =>
{
    const { toolBar, onSelectTool } = setup({ activeTab: "decor" });
    toolBar.onClick("nudge");
    expect(onSelectTool).toHaveBeenCalledWith("decor:nudge");
});


/******************************************************************************/
/* ACTIVE HIGHLIGHT                                                           */
/******************************************************************************/

test("isActive flips true on the button whose composed id matches selectedToolId", () =>
{
    const { toolBar } = setup({
        activeTab:      "decor",
        selectedKind:   "decor.barrel",
        selectedToolId: "decor:build:decor.barrel"
    });

    const tools = toolBar.visibleTools();
    expect(tools.find(t => t.verb === "build").isActive).toBe(true);
    expect(tools.find(t => t.verb === "pick").isActive).toBe(false);
});


test("isActive on Build follows selectedKind changes — armed kind matches even though selectedToolId path differs", () =>
{
    /* selectedToolId arrived from a catalogue click and carries the same
     * `decor:build:<kind>` shape — confirms the composition lines up. */
    const { toolBar } = setup({
        activeTab:      "decor",
        selectedKind:   "decor.crate",
        selectedToolId: "decor:build:decor.crate"
    });
    expect(toolBar.visibleTools().find(t => t.verb === "build").isActive).toBe(true);
});


/******************************************************************************/
/* VISIBILITY                                                                 */
/******************************************************************************/

test("isVisible is true in builder mode with an attached panel", () =>
{
    const { toolBar } = setup({ cameraMode: "builder" });
    expect(toolBar.isVisible()).toBe(true);
});


test("isVisible is false in first-person mode", () =>
{
    const { toolBar } = setup({ cameraMode: "firstPerson" });
    expect(toolBar.isVisible()).toBe(false);
});
