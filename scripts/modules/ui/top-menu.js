const ko = window.ko;


/******************************************************************************/
/* TOP MENU VIEW MODEL                                                        */
/******************************************************************************/

/*
 * Bound to `#top-menu` in index.html. Five icon buttons in a left / centre /
 * right layout: Save, Load, Mode-toggle, Settings, Exit. Replaces the
 * pre-V7 `#hud-actions` + `#camera-mode-chip` chrome.
 *
 * Constructor takes its dependencies as named refs (services + shared
 * observables + parent callbacks). No post-hoc patching — once constructed,
 * the public surface is frozen for the lifetime of the binding.
 */

const ICON_BASE = "assets/icons";

/*
 * Code-side camera-mode keys are `"builder"` and `"firstPerson"`. The V7
 * design talks about "Build / Explore" — `"Explore Mode"` is the human label
 * for the `"firstPerson"` mode, not a third state.
 */
const MODE_LABELS = {
    builder:     "Build Mode",
    firstPerson: "Explore Mode"
};


class TopMenuViewModel
{
    constructor({ saveService, devConsole, cameraMode, confirmModal, resetLair, onToggleMode })
    {
        this.saveService = saveService;
        this.devConsole  = devConsole;
        this.cameraMode  = cameraMode;
        this.confirmModal = confirmModal;
        this.resetLair = resetLair;
        this.onToggleMode = onToggleMode;

        this.modeIconUrl = ko.pureComputed(() =>
            this.cameraMode() === "builder"
                ? `${ICON_BASE}/build-mode.png`
                : `${ICON_BASE}/explore-mode.png`);

        /* Button title shows the *current* mode rather than the destination —
         * mirrors the design's recommendation, and how status chips elsewhere
         * in the UI label their current state, not their next one. */
        this.modeTitle = ko.pureComputed(() =>
            `Currently: ${MODE_LABELS[this.cameraMode()] || "Builder Mode"}`);

        this.saveIconUrl     = `${ICON_BASE}/save.png`;
        this.loadIconUrl     = `${ICON_BASE}/load.png`;
        this.settingsIconUrl = `${ICON_BASE}/settings.png`;
        this.exitIconUrl     = `${ICON_BASE}/exit-door.png`;
    }

    save()
    {
        if(this.saveService) { this.saveService.save(); }
    }

    load()
    {
        if(this.saveService) { this.saveService.openFile(); }
    }

    toggleMode()
    {
        if(typeof this.onToggleMode === "function") { this.onToggleMode(); }
    }

    toggleSettings()
    {
        if(this.devConsole) { this.devConsole.toggleOpen(); }
    }

    exit()
    {
        if(!this.confirmModal || typeof this.resetLair !== "function") { return; }

        this.confirmModal.show({
            title:       "Reset lair?",
            message:     "Reset to a fresh starter room? Your current work will be lost.",
            actionLabel: "Reset",
            onConfirm:   this.resetLair
        });
    }
}


export { TopMenuViewModel };
