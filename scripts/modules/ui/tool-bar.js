const ko = window.ko;


/******************************************************************************/
/* TOOL BAR VIEW MODEL                                                        */
/******************************************************************************/

const ICON_BASE = "assets/icons";

const VERB_ICONS = {
    pick:  `${ICON_BASE}/pick-up.png`,
    build: `${ICON_BASE}/build.png`,
    break: `${ICON_BASE}/break.png`,
    nudge: `${ICON_BASE}/nudge.png`
};

const VERB_LABELS = {
    pick:  "Pick Up",
    build: "Build",
    break: "Break",
    nudge: "Nudge"
};

// Tab ids are user-facing labels (plural "minions"); tool-id prefixes are
// singular ("minion:", "decor:", "build:").
const TAB_TOOL_PREFIX = {
    build:   "build",
    decor:   "decor",
    minions: "minion"
};

const TAB_VERBS = {
    build:   ["build", "break"],
    decor:   ["pick", "build", "break", "nudge"],
    minions: ["pick", "build", "break"]
};


class ToolBarViewModel
{
    constructor({ authoringPanel, cameraMode, onSelectTool })
    {
        this.authoringPanel = authoringPanel;
        this.cameraMode = cameraMode;
        this.onSelectTool = onSelectTool;

        this.visibleTools = ko.pureComputed(() => this.computeVisibleTools());
        this.isVisible    = ko.pureComputed(() =>
            this.cameraMode() === "builder" && !!this.authoringPanel);
    }

    onClick(verb)
    {
        const toolId = this.composeToolId(verb);
        if(!toolId) { return; }
        if(typeof this.onSelectTool === "function") { this.onSelectTool(toolId); }
    }


    /* INTERNAL ***************************************************************/

    computeVisibleTools()
    {
        if(!this.authoringPanel) { return []; }
        const tab = this.authoringPanel.activeTab();
        const verbs = TAB_VERBS[tab] || [];
        const activeToolId = this.authoringPanel.selectedToolId();

        return verbs.map(verb =>
        {
            const toolId = this.composeToolId(verb);
            return {
                verb,
                toolId,
                label:    VERB_LABELS[verb],
                iconURL:  VERB_ICONS[verb],
                isActive: toolId !== null && activeToolId === toolId
            };
        });
    }

    composeToolId(verb)
    {
        if(!this.authoringPanel) { return null; }
        const tab = this.authoringPanel.activeTab();
        const prefix = TAB_TOOL_PREFIX[tab];
        if(!prefix) { return null; }

        if(verb === "build")
        {
            const kind = this.authoringPanel.selectedKind();
            return kind ? `${prefix}:build:${kind}` : `${prefix}:build`;
        }
        return `${prefix}:${verb}`;
    }
}


export { ToolBarViewModel };
