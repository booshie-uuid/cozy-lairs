const ko = window.ko;


/******************************************************************************/
/* AUTHORING PANEL VIEW-MODEL                                                 */
/******************************************************************************/

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
        this.selectedKind(null);
        this.selectedToolId(null);
    }

    selectKindAndArmBuild(kind, tab)
    {
        this.selectedKind(kind);
        this.selectedToolId(`${tab}:build:${kind}`);
    }

    // Right-click / Escape / camera-mode cancel — clear *both* selections
    // so the next press of the Build verb reverts to its default tool
    // (e.g. FloorPaintTool on the Build tab) rather than re-arming the
    // last catalogue kind.
    cancelSelection()
    {
        this.selectedKind(null);
        this.selectedToolId(null);
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
