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


let TopMenuViewModel;

beforeAll(async () =>
{
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.ko = createKoStub();
    ({ TopMenuViewModel } = await import("../../scripts/modules/ui/top-menu.js"));
});


/******************************************************************************/
/* FIXTURES                                                                   */
/******************************************************************************/

function setup({ cameraMode = "builder" } = {})
{
    const ko = globalThis.window.ko;
    const saveService  = { save: vi.fn(), openFile: vi.fn() };
    const devConsole   = { toggleOpen: vi.fn() };
    const confirmModal = { show: vi.fn() };
    const resetLair    = vi.fn();
    const onToggleMode = vi.fn();

    const topMenu = new TopMenuViewModel({
        saveService,
        devConsole,
        cameraMode:   ko.observable(cameraMode),
        confirmModal,
        resetLair,
        onToggleMode
    });

    return { topMenu, saveService, devConsole, confirmModal, resetLair, onToggleMode };
}


/******************************************************************************/
/* ACTIONS                                                                    */
/******************************************************************************/

test("save() invokes saveService.save", () =>
{
    const { topMenu, saveService } = setup();
    topMenu.save();
    expect(saveService.save).toHaveBeenCalledTimes(1);
});


test("load() invokes saveService.openFile", () =>
{
    const { topMenu, saveService } = setup();
    topMenu.load();
    expect(saveService.openFile).toHaveBeenCalledTimes(1);
});


test("toggleMode() invokes the injected onToggleMode callback", () =>
{
    const { topMenu, onToggleMode } = setup();
    topMenu.toggleMode();
    expect(onToggleMode).toHaveBeenCalledTimes(1);
});


test("toggleSettings() invokes devConsole.toggleOpen", () =>
{
    const { topMenu, devConsole } = setup();
    topMenu.toggleSettings();
    expect(devConsole.toggleOpen).toHaveBeenCalledTimes(1);
});


test("exit() opens the confirm modal with resetLair as the onConfirm callback", () =>
{
    const { topMenu, confirmModal, resetLair } = setup();
    topMenu.exit();

    expect(confirmModal.show).toHaveBeenCalledTimes(1);
    const args = confirmModal.show.mock.calls[0][0];
    expect(args.title).toBe("Reset lair?");
    expect(typeof args.onConfirm).toBe("function");
    /* Invoking the captured onConfirm fires resetLair. */
    args.onConfirm();
    expect(resetLair).toHaveBeenCalledTimes(1);
});


/******************************************************************************/
/* MODE ICON + TITLE                                                          */
/******************************************************************************/

test("modeIconUrl returns the build-mode icon while cameraMode is 'builder'", () =>
{
    const { topMenu } = setup({ cameraMode: "builder" });
    expect(topMenu.modeIconUrl()).toBe("assets/icons/build-mode.png");
});


test("modeIconUrl returns the explore-mode icon while cameraMode is 'firstPerson'", () =>
{
    const { topMenu } = setup({ cameraMode: "firstPerson" });
    expect(topMenu.modeIconUrl()).toBe("assets/icons/explore-mode.png");
});


test("modeTitle reads the current mode (not the destination)", () =>
{
    const { topMenu } = setup({ cameraMode: "builder" });
    expect(topMenu.modeTitle()).toBe("Currently: Build Mode");

    const { topMenu: explore } = setup({ cameraMode: "firstPerson" });
    expect(explore.modeTitle()).toBe("Currently: Explore Mode");
});


/******************************************************************************/
/* DEFENSIVE GUARDS                                                           */
/******************************************************************************/

test("exit() is a no-op when confirmModal is null", () =>
{
    const ko = globalThis.window.ko;
    const topMenu = new TopMenuViewModel({
        saveService:  { save: vi.fn(), openFile: vi.fn() },
        devConsole:   { toggleOpen: vi.fn() },
        cameraMode:   ko.observable("builder"),
        confirmModal: null,
        resetLair:    vi.fn(),
        onToggleMode: vi.fn()
    });
    /* Should not throw. */
    topMenu.exit();
});


test("toggleMode() is a no-op when no callback is provided", () =>
{
    const ko = globalThis.window.ko;
    const topMenu = new TopMenuViewModel({
        saveService:  { save: vi.fn(), openFile: vi.fn() },
        devConsole:   { toggleOpen: vi.fn() },
        cameraMode:   ko.observable("builder"),
        confirmModal: { show: vi.fn() },
        resetLair:    vi.fn(),
        onToggleMode: undefined
    });
    topMenu.toggleMode();   // should not throw
});
