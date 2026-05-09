import { DevConsoleViewModel } from "../engine/dev/dev-console-view-model.js";
import { ToastQueue }          from "./toast-queue.js";


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


class AppViewModel
{
    constructor({ version })
    {
        this.version = version;

        this.loadStatus = ko.observable("Initialising");
        this.loadProgress = ko.observable({ loaded: 0, total: 0 });
        this.isReady = ko.observable(false);

        this.cameraMode = ko.observable("builder");
        this.saveStatus = ko.observable("saved");

        this.dev = new DevConsoleViewModel();

        this.toasts = ko.observableArray([]);
        this.toastQueue = new ToastQueue(this.toasts);

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
    }

    toast(message, level = "info")
    {
        return this.toastQueue.push(message, level);
    }
}

export { AppViewModel };
