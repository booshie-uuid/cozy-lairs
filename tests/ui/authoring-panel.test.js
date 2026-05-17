// @vitest-environment jsdom

import { test, expect, beforeAll } from "vitest";


/******************************************************************************/
/* MINIMAL KO STUB                                                            */
/******************************************************************************/

// The real KO UMD doesn't initialise reliably under jsdom + ESM — its
// `var A = this || (0,eval)("this")` bootstrap lands on a module-private
// scope so `A.ko` never reaches the real window. Stub the subset the
// panel touches: observables + pureComputed with subscribe/notify.

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


test("selectTab clears the selected kind and tool id", () =>
{
    const { panel } = setup();
    panel.selectKindAndArmBuild("decor.barrel", "decor");
    expect(panel.selectedKind()).toBe("decor.barrel");
    expect(panel.selectedToolId()).toBe("decor:build:decor.barrel");

    panel.selectTab("minions");
    expect(panel.selectedKind()).toBe(null);
    expect(panel.selectedToolId()).toBe(null);
});


/******************************************************************************/
/* TOOL + KIND SELECTION                                                      */
/******************************************************************************/

test("initial selectedToolId and selectedKind are null", () =>
{
    const { panel } = setup();
    expect(panel.selectedToolId()).toBe(null);
    expect(panel.selectedKind()).toBe(null);
});


test("selectKindAndArmBuild writes both kind and tool id atomically", () =>
{
    const { panel } = setup();
    panel.selectKindAndArmBuild("decor.barrel", "decor");
    expect(panel.selectedKind()).toBe("decor.barrel");
    expect(panel.selectedToolId()).toBe("decor:build:decor.barrel");
});


test("selectKindAndArmBuild composes the tool id from tab + verb + kind", () =>
{
    const { panel } = setup();
    panel.selectKindAndArmBuild("terrain.block.basic", "build");
    expect(panel.selectedToolId()).toBe("build:build:terrain.block.basic");

    panel.selectKindAndArmBuild("character.skeleton.minion", "minion");
    expect(panel.selectedToolId()).toBe("minion:build:character.skeleton.minion");
});


test("isKindSelected returns true only for the currently armed kind", () =>
{
    const { panel } = setup();
    panel.selectKindAndArmBuild("decor.crate", "decor");
    expect(panel.isKindSelected("decor.crate")).toBe(true);
    expect(panel.isKindSelected("decor.barrel")).toBe(false);
});


test("legacy *Tools constants are no longer fields on the panel", () =>
{
    const { panel } = setup();
    expect(panel.buildTools).toBeUndefined();
    expect(panel.decorTools).toBeUndefined();
    expect(panel.minionTools).toBeUndefined();
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


test("tiles carry their owning tab plus the asset kind for the new dispatch", () =>
{
    const { panel } = setup({
        entries: [
            { id: "decor.barrel", kind: "decor.floor", displayName: "Barrel" },
            { id: "decor.banner", kind: "decor.wall",  displayName: "Banner" },
            { id: "char.skel",    kind: "character",   displayName: "Skel" }
        ]
    });
    expect(panel.decorTiles()[0]).toMatchObject({ tab: "decor", kind: "decor.barrel" });
    expect(panel.wallDecorTiles()[0]).toMatchObject({ tab: "decor", kind: "decor.banner" });
    expect(panel.minionTiles()[0]).toMatchObject({ tab: "minion", kind: "char.skel" });
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
