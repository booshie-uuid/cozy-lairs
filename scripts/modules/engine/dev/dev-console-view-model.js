import { formatRelative, formatAbsolute } from "./time-format.js";


const ko = window.ko;


/******************************************************************************/
/* DEV CONSOLE VIEW MODEL                                                     */
/******************************************************************************/

const NOOP_ACTIONS =
{
    toggleCameraMode:     () => {},
    toggleDiagnosticGrid: () => {},
    setDiagMode:          () => {},
    dumpWorldJSON:        () => {},
    forceSaveFailure:     () => {},
    reloadManifest:       () => {}
};


class DevConsoleViewModel
{
    constructor()
    {
        this.isOpen = ko.observable(false);
        this.activeTab = ko.observable("events");
        this.eventsBuffer = ko.observableArray([]);
        this.isPaused = ko.observable(false);
        this.showNoisy = ko.observable(false);
        this.emitterFilter = ko.observable("");
        this.eventFilter = ko.observable("");
        this.nowMs = ko.observable(0);

        this.diagMode = ko.observable("off");
        this.diagModeOptions =
        [
            { value: "off",      label: "Off"          },
            { value: "overlay",  label: "Main + Sub"   },
            { value: "sub-only", label: "Sub-grid only" }
        ];

        this.fps = ko.observable(0);
        this.frameMs = ko.observable(0);
        this.simTickRate = ko.observable(0);
        this.drawCalls = ko.observable(0);
        this.triangles = ko.observable(0);
        this.entityCount = ko.observable(0);
        this.assetCacheSize = ko.observable(0);
        this.autosaveSize = ko.observable(0);

        this.fpsDisplay = ko.pureComputed(() => this.fps().toFixed(0));
        this.frameMsDisplay = ko.pureComputed(() => this.frameMs().toFixed(2));
        this.simTickRateDisplay = ko.pureComputed(() => this.simTickRate().toFixed(0));
        this.trianglesDisplay = ko.pureComputed(() => this.triangles().toLocaleString());
        this.autosaveSizeDisplay = ko.pureComputed(() =>
        {
            const bytes = this.autosaveSize();
            if(bytes <= 0)          { return "—"; }
            if(bytes < 1024)        { return `${bytes} B`; }
            if(bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        });

        this.filteredEvents = ko.pureComputed(() =>
        {
            const events = this.eventsBuffer();
            const emitterRegex = this.compileRegex(this.emitterFilter());
            const eventRegex = this.compileRegex(this.eventFilter());

            const out = [];
            for(let i = events.length - 1; i >= 0; i--)
            {
                const entry = events[i];
                if(emitterRegex && !emitterRegex.test(entry.emitterClass)) { continue; }
                if(eventRegex && !eventRegex.test(entry.event)) { continue; }
                out.push(entry);
            }
            return out;
        });

        this.pauseLabel = ko.pureComputed(() => this.isPaused() ? "Resume" : "Pause");

        this.toggleOpen = () => this.isOpen(!this.isOpen());
        this.togglePaused = () => this.isPaused(!this.isPaused());
        this.selectEvents = () => this.activeTab("events");
        this.selectStats = () => this.activeTab("stats");

        this.formatRelativeTime = timeMs => formatRelative(this.nowMs() - timeMs);
        this.formatAbsoluteTime = wallClockMs => formatAbsolute(wallClockMs);

        // Stub until installActions runs — keeps UI buttons safe if the
        // dev console is opened before App.wireDevConsole completes.
        this.actions = NOOP_ACTIONS;
    }

    installActions(actions)
    {
        this.actions = actions;
        // Subscribe AFTER actions are real — wiring against the stub
        // would silently drop the first diagMode change.
        this.diagMode.subscribe(mode => this.actions.setDiagMode(mode));
    }

    compileRegex(pattern)
    {
        if(!pattern) { return null; }
        try
        {
            return new RegExp(pattern, "i");
        }
        catch(_err)
        {
            return null;
        }
    }
}


export { DevConsoleViewModel };
