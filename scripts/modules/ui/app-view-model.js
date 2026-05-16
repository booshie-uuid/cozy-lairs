import { DevConsoleViewModel }  from "../engine/dev/dev-console-view-model.js";
import { ToastQueue }           from "./toast-queue.js";
import { AuthoringPanel }       from "./authoring-panel.js";
import { ConfirmModalViewModel } from "./confirm-modal.js";
import { TopMenuViewModel }     from "./top-menu.js";
import { ToolBarViewModel }    from "./tool-bar.js";


const ko = window.ko;


/******************************************************************************/
/* APP VIEW MODEL                                                             */
/******************************************************************************/

/*
 * Root KO view-model bound to the page. Per-frame stats (FPS, draw calls)
 * deliberately live elsewhere — too noisy for KO subscribers on the main HUD.
 *
 * Minimum viewport is 1024×640. Below that, `viewportTooSmall` flips true
 * and the canvas is covered by an overlay (see #min-viewport-overlay).
 */

const MIN_VIEWPORT_WIDTH  = 1024;
const MIN_VIEWPORT_HEIGHT = 640;

// How long the save-status chip stays visible after a save / autosave /
// failure event before fading out. Tuned to be long enough to read but short
// enough that the chip isn't a permanent fixture once the user moves on.
const SAVE_STATUS_VISIBLE_MS = 3500;


class AppViewModel
{
    constructor({ version })
    {
        this.version = version;

        this.loadStatus = ko.observable("Initialising");
        this.loadProgress = ko.observable({ loaded: 0, total: 0 });
        this.isReady = ko.observable(false);

        this.cameraMode = ko.observable("builder");
        this.saveStatus = ko.observable("");
        this.saveStatusVisible = ko.observable(false);
        this.saveStatusFadeTimer = null;
        this.catalogueIcons = ko.observable(new Map());
        this.authoringPanel = ko.observable(null);
        this.topMenu = ko.observable(null);
        this.toolBar = ko.observable(null);
        this.controlsDismissed = ko.observable(false);

        this.dev = new DevConsoleViewModel();

        this.toasts = ko.observableArray([]);
        this.toastQueue = new ToastQueue(this.toasts);

        /* Hints live in a separate centre-top tray so teaching-style prompts
         * ("use arrow keys to nudge decor") don't compete with the warning /
         * error feed that the user reflexively glances at top-right. */
        this.hints = ko.observableArray([]);
        this.hintQueue = new ToastQueue(this.hints);

        this.confirmModal = new ConfirmModalViewModel();

        const initialViewport = (typeof window !== "undefined")
            ? { width: window.innerWidth, height: window.innerHeight }
            : { width: 0, height: 0 };
        this.viewport = ko.observable(initialViewport);

        this.viewportTooSmall = ko.pureComputed(() =>
        {
            const { width, height } = this.viewport();
            
            if(width === 0 && height === 0) { return false; }   // pre-init / SSR
            
            return width < MIN_VIEWPORT_WIDTH || height < MIN_VIEWPORT_HEIGHT;
        });

        this.loadPercent = ko.pureComputed(() =>
        {
            const { loaded, total } = this.loadProgress();

            if(total <= 0) { return 0; }

            return Math.round((loaded / total) * 100);
        });

        this.controlsVisible = ko.pureComputed(() =>
            this.isReady() && !this.controlsDismissed());
    }

    dismissControls()
    {
        this.controlsDismissed(true);
    }

    toast(message, level = "info")
    {
        return this.toastQueue.push(message, level);
    }

    hint(message)
    {
        return this.hintQueue.push(message, "info");
    }

    flashSaveStatus(message)
    {
        this.saveStatus(message);
        this.saveStatusVisible(true);

        if(this.saveStatusFadeTimer !== null)
        {
            clearTimeout(this.saveStatusFadeTimer);
        }
        this.saveStatusFadeTimer = setTimeout(() =>
        {
            this.saveStatusVisible(false);
            this.saveStatusFadeTimer = null;
        }, SAVE_STATUS_VISIBLE_MS);
    }

    installAuthoringPanel(assets)
    {
        const panel = new AuthoringPanel({
            assets,
            catalogueIcons: this.catalogueIcons,
            cameraMode:     this.cameraMode
        });
        this.authoringPanel(panel);

        /* Tool bar shares the panel's tab + kind state, so it lands as soon
         * as the panel does. Verbose write into selectedToolId so the
         * existing dispatch subscription in app.js does the actual setTool
         * call — keeps the dispatch graph single-source. */
        this.toolBar(new ToolBarViewModel({
            authoringPanel: panel,
            cameraMode:     this.cameraMode,
            onSelectTool:   toolId => panel.selectedToolId(toolId)
        }));
    }

    installTopMenu({ saveService, resetLair, onToggleMode })
    {
        this.topMenu(new TopMenuViewModel({
            saveService,
            devConsole:   this.dev,
            cameraMode:   this.cameraMode,
            confirmModal: this.confirmModal,
            resetLair,
            onToggleMode
        }));
    }
}

export { AppViewModel };
