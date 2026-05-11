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

const BUILD_TOOLS =
[
    { id: "build:paint",       label: "Paint Floor" },
    { id: "build:erase",       label: "Erase Floor" },
    { id: "build:block:erase", label: "Erase Block" }
];

const DECOR_TOOLS =
[
    { id: "decor:erase", label: "Remove Decor" }
];

const MINION_TOOLS =
[
    { id: "minion:erase", label: "Remove Minion" }
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

        this.buildTools = BUILD_TOOLS;
        this.decorTools = DECOR_TOOLS;
        this.minionTools = MINION_TOOLS;

        this.isVisible = ko.pureComputed(() => this.cameraMode() === "builder");

        this.decorTiles = ko.pureComputed(() => this.buildTiles("decor.floor", "decor:place"));
        this.wallDecorTiles = ko.pureComputed(() => this.buildTiles("decor.wall", "decor:wall:place"));
        this.minionTiles = ko.pureComputed(() => this.buildTiles("character", "minion:spawn"));
        this.blockTiles = ko.pureComputed(() => this.buildTiles("terrain.block", "build:block:place"));
    }

    selectTab(tabId)
    {
        this.activeTab(tabId);
    }

    selectTool(toolId)
    {
        this.selectedToolId(toolId);
    }

    isToolSelected(toolId)
    {
        return this.selectedToolId() === toolId;
    }

    buildTiles(kind, idPrefix)
    {
        if(!this.assets) { return []; }
        const entries = this.assets.listByKind(kind);
        const icons = this.catalogueIcons() || new Map();
        return entries.map(entry => ({
            id:          `${idPrefix}:${entry.id}`,
            kind:        entry.id,
            displayName: entry.displayName || entry.id,
            iconURL:     icons.get(entry.id) || null
        }));
    }
}

export { AuthoringPanel };
