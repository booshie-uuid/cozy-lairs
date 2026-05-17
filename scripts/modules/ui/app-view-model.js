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

const MIN_VIEWPORT_WIDTH  = 1024;
const MIN_VIEWPORT_HEIGHT = 640;

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

        // Single-slot queue that drives the save-status chip — owns the
        // dismiss timer so AppViewModel doesn't carry its own setTimeout
        // bookkeeping. Custom sink writes to the chip's observables
        // instead of a list since the chip renders one item, not a tray.
        this.saveStatusQueue = new ToastQueue(
        {
            push:   toast => { this.saveStatus(toast.message); this.saveStatusVisible(true); },
            remove: _pred => { this.saveStatusVisible(false); }
        },
        { dismissMs: SAVE_STATUS_VISIBLE_MS });

        this.catalogueIcons = ko.observable(new Map());
        this.authoringPanel = ko.observable(null);
        this.topMenu = ko.observable(null);
        this.toolBar = ko.observable(null);
        this.controlsDismissed = ko.observable(false);

        this.dev = new DevConsoleViewModel();

        this.toasts = ko.observableArray([]);
        this.toastQueue = new ToastQueue(this.toasts);

        // Hints use a separate tray so teaching prompts don't compete
        // with the warning/error feed in the top-right toast lane.
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
            
            if(width === 0 && height === 0) { return false; }
            
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
        // Clear before push so the prior message's timer doesn't fire
        // after this message and hide the chip prematurely.
        this.saveStatusQueue.clear();
        this.saveStatusQueue.push(message, "info");
    }

    // Deferred-install methods follow a uniform contract: each chrome
    // surface that depends on a service constructed asynchronously is
    // built here rather than in the constructor. The matching observable
    // is null until install completes, so `with: surface` bindings
    // collapse to nothing and KO's visibility checks see a falsy value.
    // Surfaces with no async deps (confirmModal, dev) are constructed
    // eagerly in the constructor; their dev console "actions" map is
    // installed late via `dev.installActions(...)`.

    // Gate: needs the loaded asset manager. App calls this after
    // `assets.preloadCore()` resolves. Also constructs the tool bar
    // since it depends on the panel for tab / kind state.
    installAuthoringPanel(assets)
    {
        const panel = new AuthoringPanel({
            assets,
            catalogueIcons: this.catalogueIcons,
            cameraMode:     this.cameraMode
        });
        this.authoringPanel(panel);

        // Route through panel.selectedToolId so app.js's subscription is the
        // single source of dispatch.
        this.toolBar(new ToolBarViewModel({
            authoringPanel: panel,
            cameraMode:     this.cameraMode,
            onSelectTool:   toolId => panel.selectedToolId(toolId)
        }));
    }

    // Gate: needs the save service (built after the world) and the
    // pickup-aware save shim from App. Mode toggle + lair reset are
    // closures owned by App; they exist from start() but invoke
    // logic that depends on the world being built.
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
