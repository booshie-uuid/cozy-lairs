# Design V7 — UI Overhaul + Pick-up Mechanic + UI Architecture Model
Date: 2026-05-17

## Summary

V7 reshapes the in-game UI around two new horizontal bars — a **top menu bar** (Save / Load / Mode / Settings / Exit) and a **bottom tool bar** (Pick / Build / Break / Nudge, varying per active catalogue tab). The existing right-edge authoring panel survives but sheds its tool buttons; only the tabbed catalogue remains there. A new **Pick-up mechanic** lets the user remove a placed decor or minion back into a held-cursor state for re-placement, with cancel-restoring the original cell. Alongside the chrome rework, V7 lands a **UI architecture model** — one view-model per surface, constructor-injected dependencies, no post-hoc patching — so future UI work doesn't accrete one-off integration patterns. Tooltips, ten sourced PNG icons, a load-lifecycle visibility contract, and an expanded decor catalogue (forcing scroll) ship with it.

## Architecture

### Top-level chrome layout

- **`#top-menu`** — fixed-position `<header>` at the top of the viewport. Five icon buttons in left-cluster / centre / right-cluster groupings: Save, Load, Mode-toggle, Settings, Exit. Replaces `#hud-actions` and `#camera-mode-chip`.
- **`#tool-bar`** — fixed-position `<footer>` at the bottom. Renders the variable-width tool palette for the current authoring-panel tab.
- **`#authoring-panel`** — unchanged in position (right edge in builder mode). Loses its `BUILD_TOOLS` / `DECOR_TOOLS` / `MINION_TOOLS` button rows; keeps the tab strip + catalogue grid only.

### UI architecture model (applies to every chrome surface)

V7 adopts a single contract for every chrome surface — top menu, tool bar, authoring panel, confirm modal, dev console, future settings panel, future inventory, etc. The goal is "if you're touching the UI, you already know where everything lives."

- **One view-model per surface.** Each chrome surface owns one `***ViewModel` class under `scripts/modules/ui/`. The view-model holds the surface's KO observables, presentation-only state, and the methods that templates bind to.
- **Constructor injection, no post-hoc patching.** View-models receive their dependencies as constructor args — services (`saveService`, `devConsole`), observables (`cameraMode`, `selectedKind`), and parent callbacks. Once constructed, a view-model's public surface is frozen for the lifetime of the binding. The current `this.viewModel.loadFile = () => …` patching in [app.js:288-304](../../scripts/app.js#L288-L304) goes away.
- **`AppViewModel` is the composition root.** Its job is to construct each surface view-model in the right order with the right wiring, expose them as named fields, and run `ko.applyBindings(viewModel)` once. After bindings, the App singleton does no further view-model mutation — it only calls into services.
- **Services hold business logic; view-models translate.** `WorldEditor`, `SaveService`, `AssetManager`, `DevConsole`, the new `Pickup` state manager all stay services (plain classes). View-models call services; services emit events / update observables back. Templates never reach past their view-model.

Communication rules (and their direction):

- **Parent → child:** dependency injection at construction.
- **Child → parent:** callbacks passed at construction (e.g. `onModeToggle`).
- **Sibling → sibling:** via the parent — no direct refs between view-models.
- **View-model → service:** plain method call (`saveService.save()`).
- **Service → view-model:** `Emitter` event subscription set up at construction, or shared observable.

CLAUDE.md gets a corresponding "UI architecture" note so the rule travels.

### Load lifecycle visibility contract

Single rule for all post-load chrome: **everything is hidden until `viewModel.isReady()` flips true**, and the loading overlay is the only thing visible during the asset-download phase. Specifically, the visibility predicates of `#top-menu`, `#tool-bar`, `#authoring-panel`, `#min-viewport-overlay` all gain `isReady` as a conjunction. The existing `#loading-overlay` `fadeOut: isReady` binding stays the seam — when it fades, every other surface fades in.

## Components

### `TopMenuViewModel` (new — `scripts/modules/ui/top-menu.js`)

Constructor signature:

```javascript
new TopMenuViewModel({
    saveService,        // service: triggers save / load file picker
    devConsole,         // service: toggleOpen()
    cameraMode,         // ko.observable: shared with AppViewModel
    confirmModal,       // service: show()
    resetLair           // callback: parent triggers reset
});
```

Public surface (templates bind to these):

- `save()` → `saveService.save()`
- `load()` → `saveService.openFile()`
- `toggleMode()` → flips `cameraMode` ("builder" ↔ "explore")
- `toggleSettings()` → `devConsole.toggleOpen()`
- `exit()` → `confirmModal.show({ … onConfirm: resetLair })`
- `modeIconUrl` → `ko.pureComputed` returning `assets/icons/build-mode.png` or `assets/icons/explore-mode.png` based on `cameraMode`

Five `<button>` bindings in `index.html` under `<header id="top-menu">`. Each has `title="…"` (title-case tooltip) and an `<img>` from `assets/icons/`. Layout: two left, one centre, two right.

### `ToolBarViewModel` (new — `scripts/modules/ui/tool-bar.js`)

Constructor:

```javascript
new ToolBarViewModel({
    authoringPanel,     // sibling VM (read-only access to activeTab, selectedKind)
    onSelectTool        // callback: (toolId) => panel.selectedToolId(toolId)
});
```

Public surface:

- `visibleTools` → `ko.pureComputed` returning an array of `{ id, label, iconURL, isActive }` derived from `authoringPanel.activeTab()` via a static table:

  | Tab     | Tools                                          |
  |---------|------------------------------------------------|
  | build   | `build:build`, `build:break`                   |
  | decor   | `decor:pick`, `decor:build`, `decor:break`, `decor:nudge` |
  | minions | `minion:pick`, `minion:build`, `minion:break`  |

- `onClick(toolId)` → composes `toolId` with `selectedKind` if applicable (e.g. `decor:build` → `decor:build:decor.barrel`) and calls `onSelectTool`.

Click on a toolbar button flows through the same `panel.selectedToolId` observable as a catalogue tile click — single dispatch point in [app.js:329](../../scripts/app.js#L329).

### `AuthoringPanel` (modified — `scripts/modules/ui/authoring-panel.js`)

- Drops `BUILD_TOOLS` / `DECOR_TOOLS` / `MINION_TOOLS` constants and their HTML rendering.
- Gains `selectedKind` observable — set whenever a catalogue tile is clicked, cleared on tab switch.
- Catalogue tile click writes both `selectedKind(kind)` and `selectedToolId("<tab>:build:<kind>")` so the same tile click selects the kind *and* arms the Build tool.
- Today's `decor:place:<kind>` tool id is renamed `decor:build:<kind>` for vocabulary consistency. Same for `decor:wall:place:<kind>` → `decor:build:<kind>` (the wall vs floor distinction is asset-meta-driven inside the tool dispatcher, not at the id level).

### `App` orchestration (modified — `scripts/app.js`)

- Stops mutating `viewModel.loadFile` / `saveLair` / `resetLair` post-construction. Those become methods on `TopMenuViewModel` constructed with the right service refs.
- `buildToolFromId` gets explicit case arms for the new verb-prefixed ids (`<tab>:pick`, `<tab>:build`, `<tab>:break`, `<tab>:nudge`). Routes to the existing `Tool` subclasses with the now-required kind argument resolved from the id suffix.
- Adds `App.pickedUp = null` field — the single-slot pickup snapshot.
- Adds `App.cancelPickup()` — checks `pickedUp` and dispatches to `WorldEditor.restorePickup` if non-null.
- `BuilderInputAdapter.onCancel` callback now calls `App.cancelPickup()` in addition to the existing tool deactivation.

### `PickupSnapshot` shape

```javascript
{
    kind:          "decor.barrel",
    originCx:      4,
    originCz:      5,
    rotationStep:  2,
    xOffset:       0.5,
    zOffset:      -0.25,
    surfaceY:      0.85    // present for surface-placeables
}
```

Lives on `App.pickedUp` (null when idle). Plain object, no class — the snapshot is data, not behaviour.

### `WorldEditor` extensions (modified — `scripts/modules/world/world-editor.js`)

Three new mutation methods:

- `pickUpEntity(entity)` → captures snapshot from the entity's `GridPlacement`, removes entity via `world.removeEntity`, returns the snapshot. Refuses non-pickup-able kinds (floors, tracer walls, terrain blocks per V7 scope, anything without a GridPlacement).
- `placeFromSnapshot(snapshot, cx, cz)` → instantiates fresh entity at `cx, cz` with `rotationStep: 0, xOffset: 0, zOffset: 0` (catalogue-style placement). Returns true on success, false + toast on placement refusal.
- `restorePickup(snapshot)` → re-instantiates entity at `snapshot.originCx, originCz` with all preserved orientation/offset state. If a walker sits on the origin sub-cell, calls `walker.teleportTo(nearestFreeSub)` first to displace it. If origin cell is no longer a floor at all (degenerate path), drops snapshot and toasts `"Lost held [X] — original cell is no longer available."`.

### New tool classes (`scripts/modules/builder/tools/`)

- **`PickTool`** — `targetType: "entity"`. `onEntityClick(entity, "left")` calls `editor.pickUpEntity(entity)` if eligible (delegates eligibility to editor). One subclass per applicable tab (`DecorPickTool`, `MinionPickTool`) only because their target predicate differs slightly — could fold into a single class with a `kindFilter` constructor arg.
- **`NudgeTool`** — renamed `SelectTool` (existing). Vocabulary cleanup, no behaviour change.

`BreakTool` is *not* a new class — `build:break` routes to `FloorEraseTool`, `decor:break` routes to `DecorEraseTool`, `minion:break` routes to `MinionEraseTool`. The verb name unifies; the implementations stay. Same for `build:build` → `FloorPaintTool`, `decor:build:<kind>` → `DecorPlaceTool({kind})` (or `WallDecorPlaceTool` when meta says wall), `minion:build:<kind>` → `MinionSpawnTool({kind})`.

### Tooltips

`title` attribute on every top-menu and tool-bar button. Browser-native tooltip — no custom component, no hover-delay tuning needed. Title-case names: `"Save"`, `"Load"`, `"Build Mode"` (or `"Explore Mode"`), `"Settings"`, `"Exit"`, `"Pick Up"`, `"Build"`, `"Break"`, `"Nudge"`.

If a future polish pass wants a custom tooltip component (animated, themed, multi-line), it can replace the `title` attribute with a binding — no surface code outside the tooltip implementation needs to change.

### Catalogue scrollbar enabling

`.authoring-panel-content` is currently `overflow-y: auto`, so scrollbar appears automatically when content overflows. V7 adds enough decor kinds to the manifest (target: ~12 decor.floor entries) to force the overflow. Asset selection is opportunistic — pick from existing KayKit Dungeon Remastered models not yet in the manifest. The catalogue's scroll behaviour itself needs no code change; this is a content task.

## Data Flow

### Catalogue + toolbar click paths

```
Tile click          → AuthoringPanel.selectedKind(kind)
                    → AuthoringPanel.selectedToolId("<tab>:build:<kind>")
                    → App.setTool(id)
                      → buildToolFromId routes verb+kind to Tool subclass
                      → BuilderInputAdapter.setTool(tool)
                      → ToolBar's "Build" button highlights (computed off selectedToolId)

Toolbar button click → ToolBarViewModel.onClick(verbId)
                     → resolves selectedKind from AuthoringPanel
                     → AuthoringPanel.selectedToolId("<tab>:<verb>[:<kind>]")
                     → same App.setTool dispatch path as above

Tab switch          → AuthoringPanel.activeTab(newTab)
                     → selectedKind(null), selectedToolId(null)
                     → BuilderInputAdapter swaps to NoopTool
                     → ToolBarViewModel.visibleTools recomputes (per-tab table)
```

Single dispatch path through `selectedToolId` — tiles and toolbar buttons both write into it. The existing subscription in [app.js:329](../../scripts/app.js#L329) stays the one place that routes ids into `setTool`.

### Pick-up state machine

```
[Idle] ──click pick toolbar──▶ [Armed]
[Armed] ──click decor/minion──▶ pickEntity: snapshot stored, entity removed
                                 set tool to "<tab>:build:<kind>" (re-arms Build)
                                ▶ [Holding]
[Holding] ──click valid floor──▶ placeFromSnapshot: new entity at clicked cell,
                                  original orientation/offsets DISCARDED
                                  (matches catalogue-style placement) ▶ [Idle]
[Holding] ──right-click / Esc / tab switch / mode change──▶ restorePickup:
                                  re-create entity at origin cell,
                                  PRESERVE rotation/offset/surfaceY,
                                  displace any walker on the origin sub-cell ▶ [Idle]
```

### Top-menu flows

- **Save / Load** — direct service call (`saveService.save()` / `.openFile()`).
- **Mode toggle** — flips `viewModel.cameraMode` observable; Tab key writes the same observable.
- **Settings** — `devConsole.toggleOpen()`. Backtick keyboard shortcut keeps working.
- **Exit** — opens existing confirm modal → `app.resetLair()`.

### Load lifecycle

```
boot          → isReady(false), loading-overlay visible, all chrome hidden
assets loaded → assets.preload finishes → isReady(true) → overlay fadeOut
                → top-menu, tool-bar, authoring-panel render (visible binding flips)
```

No flash of "save button before world exists" — every chrome surface has `isReady` in its visibility predicate.

## Error Handling

### Pickup edge cases — the "auto-restore on context shift" rule

Any state transition that takes the user out of `Holding` *must* restore the snapshot first. The single rule: **if `App.pickedUp !== null` when the user changes camera mode, tab, or triggers save/load/reset/exit, call `restorePickup` synchronously before letting that transition complete.**

Specifically:

- **Pick a *second* entity while still holding the first** → `restorePickup` first (single-slot inventory), then `pickUpEntity` the new one.
- **Mode toggle while holding** → restore, then flip `cameraMode`.
- **Save while holding** → restore, then `saveService.save()` (so the persisted world is consistent — no "ghost slot" in the save).
- **Load / reset while holding** → discard the snapshot (the world is being replaced anyway).
- **Tab switch in authoring panel while holding** → restore.

Enforced by `WorldEditor.restorePickup()` being idempotent + safe to call from every transition point. Each top-menu / panel surface calls it; no shared global hook.

### Restoration with a blocked origin

If the origin sub-cell is no longer walkable (e.g. a walker wandered onto it), `restorePickup` does this in order: revert any walker stamp on the origin sub-cell (via `walker.teleportTo(nearestFreeSub)`), re-place the entity. If the cell genuinely can't accept the entity (floor erased), the snapshot is *dropped* and a warning toast fires: `"Lost held [X] — original cell is no longer available."`. The lost-state is a degenerate path; the toast is the user-visible audit trail.

### Tool-id parsing

`buildToolFromId` already falls back to `NoopTool` + `console.warn` on unknown ids. V7 keeps that. The new verb-based ids get explicit case arms; anything else warns. Toolbar buttons can't physically emit an id for a tool not in `visibleTools`, so the test surface for parser failure stays the dev-id-spoofing case.

### Missing icons

If an `<img src>` from `assets/icons/` fails (404), the button shows the broken-image glyph but the tooltip still reads the button's `title`. No fatal — tooltip is the fallback affordance.

### Load lifecycle

Existing fatal-overlay path handles asset-load failure — no V7 change. `isReady` only flips after preload resolves successfully, so a failed preload keeps all chrome hidden and the loading overlay visible until the fatal overlay takes over.

## Testing Strategy

### View-model unit tests

Each new view-model class gets its own file under `tests/ui/`:

- **`tests/ui/top-menu.test.js`** — each of the 5 actions invokes the correct service stub (`saveService.save`, `saveService.openFile`, `cameraMode` write, `devConsole.toggleOpen`, `confirmModal.show`). Mode-toggle icon `pureComputed` returns the right URL for each mode.
- **`tests/ui/tool-bar.test.js`** — `visibleTools` returns the expected ID array per `activeTab` value; clicking a button writes through `selectedToolId`; `selectedKind` dependency wired so Build/Break know what to operate on.
- **`tests/ui/authoring-panel.test.js`** — extend existing: `selectedKind` clears on tab switch; tile click writes both `selectedKind` and `selectedToolId`; old tool button constants gone so the panel renders catalogue tiles only.

### Pickup state machine

`tests/world/pickup.test.js` (new):

- `pickUpEntity` stores snapshot, removes entity, returns id; subsequent `pickUpEntity` auto-restores the previous one first.
- `placeFromSnapshot` at a new cell creates a fresh entity with `rotationStep: 0, xOffset: 0, zOffset: 0` (catalogue-style placement).
- `restorePickup` re-creates the entity at origin with preserved orientation/offsets.
- Walker on origin sub-cell is displaced to nearest free sub-cell during restore.
- `restorePickup` with origin no-longer-walkable drops snapshot + toasts the warning.
- Cancel paths (`onCancel` from adapter; explicit `cancelPickup` from save/mode/tab transitions) all route to restore.

### Integration

`tests/builder/builder-input-adapter.test.js` extends to cover the toolbar dispatch loop end-to-end with a stub `AuthoringPanel.selectedKind`; verifies clicking a toolbar button while a kind is selected fires the right `setTool` id.

### Manual / browser-only coverage

- Load lifecycle: no chrome flash during asset download.
- Icon coverage: verify each PNG renders (no broken-image glyph) on first paint.
- Scroll behavior: with the extra decor entries added, the Decor catalogue scrolls smoothly inside the panel.

Test count budget: ~25-35 new tests across the three new view-models + pickup module. Existing 528 → ~560.

## Open Questions

1. **Mode-toggle icon labelling** — does the button always show the *current* mode's icon (button title `"Currently: Build Mode"`) or the *target* mode's icon (button title `"Switch to Explore Mode"`)? Recommend the **current** mode — matches how Tab key labels its destination. Plan task can confirm before wiring.
2. **Tool bar position** — fixed-bottom across the full viewport, or anchored to the authoring-panel's bottom edge (right-aligned)? Screenshot suggests viewport-wide centred. Plan task will commit one way.
3. **Icon attribution** — `assets/icons/SOURCE.md` per the CLAUDE.md convention requires per-asset CC0/CC-BY attribution. Need source provenance for the 10 PNGs in `assets/icons/` before V7 lands (assumed Game-icons.net but unconfirmed).
