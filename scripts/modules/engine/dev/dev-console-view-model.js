import { formatRelative, formatAbsolute } from "./time-format.js";


const ko = window.ko;


/******************************************************************************/
/* DEV CONSOLE VIEW MODEL                                                     */
/******************************************************************************/

/*
 * Display state for the slide-in dev panel. Capture state lives on the
 * `DevConsole` itself (ring buffer + flush timer); this view-model only
 * holds what the DOM binds to. `filteredEvents` reverses the buffer so the
 * newest entries land at the top of the list.
 *
 * Regex parse failures fall back to "filter not applied" rather than
 * blocking the list — a typing user would see live regex errors otherwise.
 *
 * Event timestamps are stored as absolute `performance.now()` values; the
 * displayed format is "how long ago" derived against `nowMs`, which the
 * DevConsole ticks on its poll cadence. Relative-time formatting beats
 * raw ms-since-page-load because that number grows unbounded and blows
 * out the column width within minutes.
 */

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

        // Filled in by the App on boot (after services exist). No-ops by
        // default so the UI never throws if a button is clicked before bind.
        this.actions =
        {
            toggleCameraMode: () => {},
            dumpWorldJSON:    () => {},
            forceSaveFailure: () => {},
            reloadManifest:   () => {}
        };
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
