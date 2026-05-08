const ko = window.ko;


/******************************************************************************/
/* APP VIEW MODEL                                                             */
/******************************************************************************/

/*
 * Root KO view-model bound to the page. Per-frame stats (FPS, draw calls)
 * deliberately live elsewhere — too noisy for KO subscribers on the main HUD.
 */

class AppViewModel
{
    constructor({ version })
    {
        this.version = version;

        this.loadStatus   = ko.observable("Initialising");
        this.loadProgress = ko.observable({ loaded: 0, total: 0 });
        this.isReady      = ko.observable(false);

        this.cameraMode = ko.observable("builder");
        this.saveStatus = ko.observable("saved");

        this.loadPercent = ko.pureComputed(() =>
        {
            const { loaded, total } = this.loadProgress();
            if(total <= 0) { return 0; }
            return Math.round((loaded / total) * 100);
        });
    }
}

export { AppViewModel };
