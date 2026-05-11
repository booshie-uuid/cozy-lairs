// @vitest-environment jsdom

import { test, expect, beforeAll } from "vitest";


/******************************************************************************/
/* MINIMAL KO STUB                                                            */
/******************************************************************************/

/*
 * AuthoringPanel reads `window.ko` at module load. jsdom + Vitest don't run
 * the real knockout UMD reliably (the `var A = this || (0,eval)("this")`
 * dance lands on a module-private scope under ESM, so `A.ko` never makes it
 * to the real window). For unit-test purposes a small subset of KO is
 * enough — observables and pureComputed with the subscribe/notify semantics
 * the panel relies on.
 */

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
        // Trivial implementation — evaluates `reader` on every read. Sufficient
        // for tests; the real KO caches + tracks dependencies.
        const fn = function() { return reader(); };
        fn.subscribe = () => ({ dispose() {} });
        return fn;
    }

    return { observable, pureComputed };
}


let AuthoringPanel;

beforeAll(async () =>
{
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.ko = createKoStub();
    ({ AuthoringPanel } = await import("../../scripts/modules/ui/authoring-panel.js"));
});


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

function makeAssets(entries)
{
    return {
        listByKind(kind)
        {
            return entries
                .filter(e => e.kind === kind)
                .map(e => ({ id: e.id, displayName: e.displayName }));
        }
    };
}


function setup({ entries = [], icons = new Map(), cameraMode = "builder" } = {})
{
    const ko = globalThis.window.ko;
    const panel = new AuthoringPanel({
        assets:         makeAssets(entries),
        catalogueIcons: ko.observable(icons),
        cameraMode:     ko.observable(cameraMode)
    });
    return { panel, ko };
}


/******************************************************************************/
/* TABS                                                                       */
/******************************************************************************/

test("initial active tab is 'build'", () =>
{
    const { panel } = setup();
    expect(panel.activeTab()).toBe("build");
});


test("selectTab updates the active tab", () =>
{
    const { panel } = setup();
    panel.selectTab("decor");
    expect(panel.activeTab()).toBe("decor");
});


/******************************************************************************/
/* TOOL SELECTION                                                             */
/******************************************************************************/

test("initial selected tool id is null", () =>
{
    const { panel } = setup();
    expect(panel.selectedToolId()).toBe(null);
});


test("selectTool updates the selected tool id observable", () =>
{
    const { panel } = setup();
    panel.selectTool("build:paint");
    expect(panel.selectedToolId()).toBe("build:paint");
});


test("isToolSelected returns true for the active tool only", () =>
{
    const { panel } = setup();
    panel.selectTool("build:paint");
    expect(panel.isToolSelected("build:paint")).toBe(true);
    expect(panel.isToolSelected("build:erase")).toBe(false);
});


/******************************************************************************/
/* CATALOGUE TILES                                                            */
/******************************************************************************/

test("decorTiles computed pulls only kind='decor.floor' entries", () =>
{
    const { panel } = setup({
        entries: [
            { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel" },
            { id: "decor.crate",  kind: "decor.floor", displayName: "Crate"  },
            { id: "decor.banner", kind: "decor.wall",  displayName: "Banner" },
            { id: "char.skel",    kind: "character",   displayName: "Skel"   }
        ]
    });
    const tiles = panel.decorTiles();
    expect(tiles.length).toBe(2);
    expect(tiles.map(t => t.kind)).toEqual(["decor.barrel", "decor.crate"]);
});


test("wallDecorTiles computed pulls only kind='decor.wall' entries", () =>
{
    const { panel } = setup({
        entries: [
            { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel" },
            { id: "decor.banner", kind: "decor.wall",  displayName: "Banner" },
            { id: "decor.torch",  kind: "decor.wall",  displayName: "Torch"  }
        ]
    });
    const tiles = panel.wallDecorTiles();
    expect(tiles.length).toBe(2);
    expect(tiles.map(t => t.displayName)).toEqual(["Banner", "Torch"]);
});


test("minionTiles computed pulls only kind='character' entries", () =>
{
    const { panel } = setup({
        entries: [
            { id: "char.skel",    kind: "character",   displayName: "Skel" },
            { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel" }
        ]
    });
    const tiles = panel.minionTiles();
    expect(tiles.length).toBe(1);
    expect(tiles[0].kind).toBe("char.skel");
});


test("tile ids encode the tool prefix and the asset kind", () =>
{
    const { panel } = setup({
        entries: [
            { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel" },
            { id: "decor.banner", kind: "decor.wall",  displayName: "Banner" },
            { id: "char.skel",    kind: "character",   displayName: "Skel" }
        ]
    });
    expect(panel.decorTiles()[0].id).toBe("decor:place:decor.barrel");
    expect(panel.wallDecorTiles()[0].id).toBe("decor:wall:place:decor.banner");
    expect(panel.minionTiles()[0].id).toBe("minion:spawn:char.skel");
});


test("tile iconURL pulls from the catalogueIcons map; null if missing", () =>
{
    const icons = new Map([["decor.barrel", "data:image/png;base64,abc"]]);
    const { panel } = setup({
        entries: [
            { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel" },
            { id: "decor.crate",  kind: "decor.floor", displayName: "Crate"  }
        ],
        icons
    });
    const tiles = panel.decorTiles();
    expect(tiles[0].iconURL).toBe("data:image/png;base64,abc");
    expect(tiles[1].iconURL).toBe(null);
});


/******************************************************************************/
/* VISIBILITY                                                                 */
/******************************************************************************/

test("isVisible is true when cameraMode is 'builder'", () =>
{
    const { panel } = setup({ cameraMode: "builder" });
    expect(panel.isVisible()).toBe(true);
});


test("isVisible reacts to cameraMode changes", () =>
{
    const ko = globalThis.window.ko;
    const cameraMode = ko.observable("builder");
    const panel = new AuthoringPanel({
        assets:         makeAssets([]),
        catalogueIcons: ko.observable(new Map()),
        cameraMode
    });

    expect(panel.isVisible()).toBe(true);
    cameraMode("firstPerson");
    expect(panel.isVisible()).toBe(false);
});
