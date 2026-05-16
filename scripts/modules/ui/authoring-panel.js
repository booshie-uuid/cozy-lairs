const ko = window.ko;


/******************************************************************************/
/* AUTHORING PANEL VIEW-MODEL                                                 */
/******************************************************************************/

/*
 * Tabbed catalogue panel. Each tab owns a grid of catalogue tiles for its
 * domain (terrain blocks, decor, minions). V7 stripped the per-tab tool-button
 * rows that used to sit above the catalogue — those verbs live on the new
 * `#tool-bar` (Pick / Build / Break / Nudge). The panel now only exposes a
 * catalogue + the current selection.
 *
 * Selected state is split across two observables:
 *   - `selectedKind`   — which catalogue tile is currently armed (e.g.
 *                        `"decor.barrel"`). Used by the tool bar to compose
 *                        tool ids like `"decor:build:decor.barrel"`.
 *   - `selectedToolId` — the full tool id currently active. The dispatch
 *                        subscription in `app.js` reads this; both the panel
 *                        (tile click) and the tool bar (verb click) write
 *                        through it.
 *
 * Tab switches clear *both* observables so a stale tile selection doesn't
 * leak into another tab's vocabulary.
 */

const TABS =
[
    { id: "build",   label: "Build"   },
    { id: "decor",   label: "Decor"   },
    { id: "minions", label: "Minions" }
];


class AuthoringPanel
{
    constructor({ assets, catalogueIcons, cameraMode })
    {
        this.assets = assets;
        this.catalogueIcons = catalogueIcons;
        this.cameraMode = cameraMode;

        this.tabs = TABS;
        this.activeTab = ko.observable("build");
        this.selectedToolId = ko.observable(null);
        this.selectedKind = ko.observable(null);

        this.isVisible = ko.pureComputed(() => this.cameraMode() === "builder");

        this.decorTiles     = ko.pureComputed(() => this.buildTiles("decor.floor",   "decor"));
        this.wallDecorTiles = ko.pureComputed(() => this.buildTiles("decor.wall",    "decor"));
        this.minionTiles    = ko.pureComputed(() => this.buildTiles("character",     "minion"));
        this.blockTiles     = ko.pureComputed(() => this.buildTiles("terrain.block", "build"));
    }

    selectTab(tabId)
    {
        this.activeTab(tabId);
        /* Clear selection so the next tab doesn't show a stale highlight or
         * leak a stale kind into the tool bar's verb composition. */
        this.selectedKind(null);
        this.selectedToolId(null);
    }

    /*
     * Catalogue tile click. Sets both observables atomically: kind is what
     * the user picked, toolId composes the build verb with that kind so the
     * existing dispatch subscription arms the matching place tool.
     */
    selectKindAndArmBuild(kind, tab)
    {
        this.selectedKind(kind);
        this.selectedToolId(`${tab}:build:${kind}`);
    }

    isToolSelected(toolId)
    {
        return this.selectedToolId() === toolId;
    }

    isKindSelected(kind)
    {
        return this.selectedKind() === kind;
    }

    buildTiles(kind, tab)
    {
        if(!this.assets) { return []; }
        const entries = this.assets.listByKind(kind);
        const icons = this.catalogueIcons() || new Map();
        return entries.map(entry => ({
            tab,
            kind:        entry.id,
            displayName: entry.displayName || entry.id,
            iconURL:     icons.get(entry.id) || null
        }));
    }
}

export { AuthoringPanel };
