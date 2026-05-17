const ko = window.ko;


/******************************************************************************/
/* TOP MENU VIEW MODEL                                                        */
/******************************************************************************/

const ICON_BASE = "assets/icons";

const MODE_LABELS = {
    builder: "Build Mode",
    firstPerson: "Explore Mode"
};


class TopMenuViewModel
{
    constructor({ saveService, devConsole, cameraMode, confirmModal, resetLair, onToggleMode })
    {
        this.saveService = saveService;
        this.devConsole = devConsole;
        this.cameraMode = cameraMode;
        this.confirmModal = confirmModal;
        this.resetLair = resetLair;
        this.onToggleMode = onToggleMode;

        this.modeIconUrl = ko.pureComputed(() =>
            this.cameraMode() === "builder"
                ? `${ICON_BASE}/build-mode.png`
                : `${ICON_BASE}/explore-mode.png`);

        // Title shows the *current* mode, matching how status chips
        // elsewhere label state rather than the next action.
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
