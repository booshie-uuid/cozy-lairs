# Plan: V7 — UI Overhaul + Pick-up Mechanic + UI Architecture Model

## Context

Implements [design-v7.md](../designs/design-v7.md): a top menu bar, a bottom tool bar, a pick-up mechanic that snapshots stateful meta for restore-on-cancel, a load-lifecycle visibility contract that prevents chrome flashing during asset download, and a unifying UI architecture model (one view-model per surface, constructor-injected dependencies, no post-hoc patching) that future UI surfaces conform to.

Sequenced to maximise autonomous runtime between human-intervention checkpoints. Tasks marked **Verification: automated** can auto-progress on a green test suite. Tasks marked **Verification: browser** need the user to physically check the change before sign-off. The longest autonomous stretch is Tasks 1-3 (foundations + tool classes); Tasks 4, 6, 7, 8, 9, 10 are the browser-verify checkpoints.

The V6 plan completed with VERSION at `V6_11_0`. The first code change of Task 1 bumps the `VERSION` constant to `V7_1_0`.

---

## Task 1: Environment bootstrap + icon attribution

### Objective

Bump the plan version, confirm the icon set is complete + correctly attributed, and smoke-test the dev environment before any V7 code changes land.

### Expected Outcomes

- `scripts/app.js` `VERSION` constant set to `V7_1_0`.
- `.project/project.md` "Current Plan" link updated to point at `plan-v7.md` (the rename happens at design / plan acceptance — confirm before writing).
- `assets/icons/SOURCE.md` exists with CC0/CC-BY attribution for each of the 10 PNG icons (per CLAUDE.md icon-sourcing rule).
- `npm test` reports the pre-V7 baseline (528 passing / 30 files) — no regression from the V6 ending state.
- Dev server confirmed serving `index.html`; manifest loads without 404s.

### Risks / Constraints

- Verification: automated.
- Icon provenance is the Open Question #3 from the design. If the user can't confirm Game-icons.net, the SOURCE.md content stays a stub and the question carries forward.

### Steps

- [ ] Bump `VERSION` to `V7_1_0` in [scripts/app.js](../../scripts/app.js).
- [ ] Update `.project/project.md` "Current Plan" link to `plan-v7.md` (rename will happen on acceptance).
- [ ] Create `assets/icons/SOURCE.md` listing the 10 PNGs (build, break, build-mode, exit-door, explore-mode, load, nudge, pick-up, save, settings) with `Source: <url> — License: <CC0|CC-BY-X>` per row. Stub the URL column if provenance is unconfirmed.
- [ ] Confirm `npm test` shows 528 passing / 30 files (V6 baseline). Document any drift in Decisions.
- [ ] Smoke the dev server: serve, hit `index.html`, confirm assets manifest 200s in network panel. Browser smoke is automatable via `curl`; the network-panel check is best-effort.

### Decisions

<!-- Filled in during execution. -->

---

## Task 2: WorldEditor pickup methods

### Objective

Land the data-layer of the pick-up mechanic — pickup snapshot capture, fresh-cell placement, and origin restoration — with no UI yet. Pure model work, fully unit-testable.

### Expected Outcomes

- `WorldEditor.pickUpEntity(entity)` captures `{ kind, originCx, originCz, rotationStep, xOffset, zOffset, surfaceY }` from the entity's `GridPlacement`, removes the entity via `world.removeEntity`, and returns the snapshot. Refuses non-pickup-able kinds (floors, tracer walls, terrain blocks) with a `null` return.
- `WorldEditor.placeFromSnapshot(snapshot, cx, cz)` instantiates a fresh entity at the requested cell with `rotationStep: 0, xOffset: 0, zOffset: 0` — catalogue-style placement. Returns `true` on success, `false` + toast on placement refusal.
- `WorldEditor.restorePickup(snapshot)` re-instantiates at `snapshot.originCx, originCz` with all preserved orientation/offset/surfaceY state. Displaces any walker on the origin sub-cell via `walker.teleportTo(nearestFreeSub)`. If the cell is no longer a floor, drops the snapshot + toasts `"Lost held [X] — original cell is no longer available."`.
- `tests/world/pickup.test.js` covers pickup → restore round-trip, pickup → place round-trip, blocked-origin displacement, lost-cell degradation, eligibility refusals.
- Test count rises by ~10-12.

### Risks / Constraints

- Verification: automated.
- The "find nearest free sub-cell" helper for walker displacement is non-trivial — there's a similar BFS already in [wander-behaviour.js](../../scripts/modules/world/components/wander-behaviour.js)'s `findNearestTraversable`. Extract or reuse.
- Surface-placeables (`blocks: false, surfaceY > 0`) are pickup-able but don't stamp the walk-grid — restore needs no displacement check for them.

### Steps

- [ ] Bump `VERSION` to `V7_2_0`.
- [ ] Add `isPickupable(entity)` helper to `WorldEditor` — `entity.getComponent(GridPlacement)` exists AND `entity.kind` doesn't start with `floor.` / `wall.stone.` / `terrain.`.
- [ ] Implement `pickUpEntity(entity)` capturing the snapshot, calling `world.removeEntity`, returning the snapshot. Toasts on refusal.
- [ ] Implement `placeFromSnapshot(snapshot, cx, cz)` — guard with `canPlaceDecor` / `canSpawnMinion` per kind classification, then construct via existing `placeDecor` / `spawnMinion` paths.
- [ ] Implement `restorePickup(snapshot)` with the walker-displacement + lost-cell drop paths.
- [ ] Extract a `findNearestTraversableSubCell(start, isTraversable)` helper from `wander-behaviour.js` into a shared module (e.g. `scripts/modules/world/walk-search.js`) and reuse in both call sites.
- [ ] Add `tests/world/pickup.test.js` covering the 5 happy-path + edge scenarios.
- [ ] Run `npm test`; confirm green — auto-progress.

### Decisions

<!-- Filled in during execution. -->

---

## Task 3: PickTool + NudgeTool rename + verb-based tool ids

### Objective

Land the new builder tool surface for pickup, rename `SelectTool` → `NudgeTool` for vocabulary consistency, and extend `App.buildToolFromId` to parse the new `<tab>:<verb>[:<kind>]` id format. No UI surfacing yet — this is the dispatch plumbing.

### Expected Outcomes

- `scripts/modules/builder/tools/pick-tool.js` defines `PickTool` (`targetType: "entity"`, no ghost). `onEntityClick(entity, "left")` calls `editor.pickUpEntity(entity)` and arms the appropriate `<tab>:build:<kind>` tool with the returned snapshot's kind.
- `scripts/modules/builder/tools/select-tool.js` → renamed to `nudge-tool.js`; export name changes `SelectTool` → `NudgeTool`. Imports across the codebase updated. The Decor tab still uses it; behaviour identical.
- `App.buildToolFromId` recognises new verb ids: `<tab>:pick`, `<tab>:build[:<kind>]`, `<tab>:break`, `<tab>:nudge`. Maps to existing tool classes per the design's verb table.
- Old tool ids (`build:paint`, `build:erase`, `decor:erase`, `decor:place:<kind>`, …) continue to work as aliases — V7 doesn't break callers in the same release.
- `tests/builder/tools.test.js` extends to cover `PickTool` + `NudgeTool` (the latter just a rename — existing select-tool tests carry over with import path updated).

### Risks / Constraints

- Verification: automated.
- Two name surfaces collide on rename: the class export AND the file name. Audit all imports first.
- The Pick-tool can be used in both Decor and Minion tabs — likely one class with the editor handling eligibility, not two subclasses. Confirm during implementation.

### Steps

- [ ] Bump `VERSION` to `V7_3_0`.
- [ ] Rename [select-tool.js](../../scripts/modules/builder/tools/select-tool.js) → `nudge-tool.js`; export `NudgeTool`. Update imports in [app.js](../../scripts/app.js) and [tests/builder/tools.test.js](../../tests/builder/tools.test.js).
- [ ] Create [pick-tool.js](../../scripts/modules/builder/tools/pick-tool.js) with the new class. `onEntityClick` delegates to `editor.pickUpEntity`; on success, calls a constructor-injected `onArmKind(snapshot.kind)` callback (so app can swap tools without the tool knowing about App).
- [ ] Extend `App.buildToolFromId` with new verb-id case arms. Add `<tab>:nudge` → `NudgeTool`, `<tab>:pick` → `PickTool({ onArmKind })`, `<tab>:break` → existing erase tools, `<tab>:build[:<kind>]` → existing place tools (with kind resolution).
- [ ] Keep legacy tool ids working — leave the existing case arms in place. Plan to remove them in V8 once nothing emits the legacy ids.
- [ ] Add `tests/builder/tools.test.js` cases for `PickTool` (onEntityClick → editor.pickUpEntity + onArmKind callback; eligibility refusal).
- [ ] Run `npm test`; confirm green — auto-progress.

### Decisions

<!-- Filled in during execution. -->

---

## Task 4: TopMenuViewModel + integration

### Objective

Land the top-edge horizontal bar with Save / Load / Mode-toggle / Settings / Exit buttons. Replace the existing `#hud-actions` + `#camera-mode-chip` HUD elements. First task following the new UI architecture model — constructor-injected dependencies, no post-hoc patching.

### Expected Outcomes

- `scripts/modules/ui/top-menu.js` defines `TopMenuViewModel` with the 5 actions + `modeIconUrl` computed.
- Constructor receives `{ saveService, devConsole, cameraMode, confirmModal, resetLair }` — no closures captured outside the file.
- `#top-menu` `<header>` lands in `index.html` with 5 icon `<button>`s + `title` attrs (title-case).
- CSS in [cozy.css](../../styles/cozy.css) styles the bar with the standard chrome formula. Layout: two left, one centre, two right. The mode button reads `viewModel.topMenu().modeIconUrl()`.
- `#hud-actions` and `#camera-mode-chip` HTML + CSS removed (and their CLAUDE.md "in scope for cozy.css" entry updated).
- `Tab` keyboard shortcut continues to toggle camera mode.
- Save-status chip (`#save-status-chip`) stays as-is — it's a transient flash, not chrome.

### Risks / Constraints

- **Verification: browser.** Visual check: top bar appears, icons render, hover shows tooltips, each action fires.
- The `loadFile`, `saveLair`, `resetLair` methods currently sit on `viewModel` (patched in `app.js`). Moving them into `TopMenuViewModel` means anything else that referenced them (HTML bindings, tests) needs to migrate to `viewModel.topMenu.XXX`. Grep for callers first.

### Steps

- [ ] Bump `VERSION` to `V7_4_0`.
- [ ] Create `scripts/modules/ui/top-menu.js` with `TopMenuViewModel` class per the design's constructor signature.
- [ ] In `AppViewModel`, replace the future-patched fields with a `topMenu: new TopMenuViewModel({…})` constructed at the right point in `App.start` (after `saveService` exists).
- [ ] Remove the `this.viewModel.loadFile = …`, `saveLair = …`, `resetLair = …` patching from [app.js:288-304](../../scripts/app.js#L288-L304).
- [ ] Add `<header id="top-menu">` to [index.html](../../index.html) with 5 buttons bound to `topMenu.save/load/toggleMode/toggleSettings/exit` + `<img>` for each icon + `title` attrs.
- [ ] Remove `<div id="hud-actions">` and `<div id="camera-mode-chip">` blocks from `index.html`.
- [ ] Add `#top-menu` styles to [cozy.css](../../styles/cozy.css) — chrome formula + grid layout for 5 buttons. Remove now-orphaned `#hud-actions` + `#camera-mode-chip` rules.
- [ ] Update CLAUDE.md "Cozy theme — what's where, and what's off-limits" section: drop `#camera-mode-chip` / `#hud-actions` / `#save-button` / `#load-button`; add `#top-menu`.
- [ ] Add `tests/ui/top-menu.test.js` — each action invokes the right service stub; mode icon computed switches correctly.
- [ ] Run `npm test`; confirm green.
- [ ] Manual test: top bar renders, all 5 buttons hover-show tooltips, each action works.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

---

## Task 5: AuthoringPanel cleanup + selectedKind observable

### Objective

Strip the tool button rows from the authoring panel (those now live in the tool bar), introduce `selectedKind` so the tool bar can read what's chosen, and rewrite catalogue tile clicks to emit verb-based tool ids.

### Expected Outcomes

- `BUILD_TOOLS` / `DECOR_TOOLS` / `MINION_TOOLS` constants removed from [authoring-panel.js](../../scripts/modules/ui/authoring-panel.js).
- `AuthoringPanel.selectedKind = ko.observable(null)` — set when a tile is clicked, cleared on tab switch.
- Catalogue tile click handler now writes both `selectedKind(kind)` and `selectedToolId("<tab>:build:<kind>")`.
- HTML tool-row `<div class="authoring-panel-tools">` blocks removed from all three tab sections in `index.html`.
- Existing catalogue grid rendering stays.
- `authoring-panel.test.js` extended: tile click sets both observables; tab switch clears `selectedKind`; old constants gone.

### Risks / Constraints

- Verification: automated.
- Removing the Select Decor button from the Decor tab tools is part of this task; the Nudge tool will reappear in Task 6 via the new tool bar.
- Tab-switch must clear `selectedToolId` too, otherwise stale tool ids leak across tabs.

### Steps

- [ ] Bump `VERSION` to `V7_5_0`.
- [ ] Drop the three `*_TOOLS` constants from `authoring-panel.js`. Drop the corresponding fields from the class.
- [ ] Add `this.selectedKind = ko.observable(null)`.
- [ ] In `selectTab`, clear both `selectedKind(null)` and `selectedToolId(null)`.
- [ ] Add `selectKindAndArmBuild(kind)` method that writes both observables — wire it as the catalogue tile click handler (current tile handler currently writes only `selectedToolId`).
- [ ] Remove `<div class="authoring-panel-tools">` from all three tab sections in `index.html`.
- [ ] Update tile click bindings in `index.html` to call `selectKindAndArmBuild` instead of `selectTool`.
- [ ] Update `tests/ui/authoring-panel.test.js` (or co-located if test file is named differently — check) for the new behaviour.
- [ ] Run `npm test`; confirm green — auto-progress.

### Decisions

<!-- Filled in during execution. -->

---

## Task 6: ToolBarViewModel + integration

### Objective

Land the bottom-edge horizontal tool bar that reads the active tab + selected kind from `AuthoringPanel` and surfaces the appropriate Pick / Build / Break / Nudge buttons. This is the second new chrome surface following the UI architecture model.

### Expected Outcomes

- `scripts/modules/ui/tool-bar.js` defines `ToolBarViewModel` with `visibleTools` computed and `onClick(verbId)` method.
- Constructor receives `{ authoringPanel, onSelectTool }` — clean injection.
- `<footer id="tool-bar">` lands in `index.html` with a `foreach: visibleTools` over button elements. Each button has an `<img>` + `title` attr.
- CSS in [cozy.css](../../styles/cozy.css) styles the bar — same chrome formula, horizontal layout, centred or panel-aligned per the design's Open Question #2.
- Tool bar visible only in builder mode (`isReady && cameraMode === "builder"`).
- `tests/ui/tool-bar.test.js` covers per-tab `visibleTools`, click → `onSelectTool` callback, `isActive` highlighting.
- Removing the in-panel Nudge button from Task 5 is "replaced" by the bottom-bar Nudge button — net: no Decor functionality lost.

### Risks / Constraints

- **Verification: browser.** Visual + dispatch: each toolbar button arms the correct tool; the Build button highlights when a tile is selected; Pick/Break work end-to-end.
- The tool-bar may visually overlap with the authoring panel if both are right-anchored. Open Question #2 from the design — confirm the position before wiring CSS.

### Steps

- [ ] Bump `VERSION` to `V7_6_0`.
- [ ] Create `scripts/modules/ui/tool-bar.js` with `ToolBarViewModel` per the design's signature. Static per-tab tool table (`build`, `decor`, `minions`).
- [ ] In `AppViewModel`, construct `toolBar: new ToolBarViewModel({ authoringPanel: this.authoringPanel, onSelectTool: id => this.authoringPanel.selectedToolId(id) })`.
- [ ] Add `<footer id="tool-bar">` to `index.html` bound to `toolBar.visibleTools` with `foreach`. Each tile has `click`, `<img>`, `title`.
- [ ] Add `#tool-bar` styles to `cozy.css` (chrome formula, layout per resolved Open Question #2).
- [ ] Add `tests/ui/tool-bar.test.js` (see Expected Outcomes).
- [ ] Run `npm test`; confirm green.
- [ ] Manual test: switch tabs, confirm tool bar updates; click each tool, confirm dispatch lands; click catalogue tile, confirm Build highlights.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

---

## Task 7: Pickup orchestration — cancelPickup + auto-restore on context shifts

### Objective

Wire the pickup state machine into the app's existing transition points so any context change (right-click, Esc, tab switch, mode toggle, save, load, reset) auto-restores the held entity. Closes the model+UI loop landed in Tasks 2 + 6.

### Expected Outcomes

- `App.pickedUp = null` field added; `App.cancelPickup()` checks the slot and dispatches to `WorldEditor.restorePickup` if non-null.
- `PickTool`'s `onArmKind` callback (set in `buildToolFromId`) sets `App.pickedUp = snapshot` and arms the place tool via `App.setTool("<tab>:build:<kind>")`.
- When the user clicks a valid floor with the place tool active AND `App.pickedUp` is set, `App.placeFromSnapshot` runs (instead of vanilla `placeDecor`) and clears the slot.
- Auto-restore hooks added at: `BuilderInputAdapter.onCancel`, `AuthoringPanel.selectTab`, `cameraMode` observable subscription, `saveService.save` (call ahead of save), `App.resetLair` (clear without restore — world replaced).
- `tests/world/pickup.test.js` extends with the cancel-path + auto-restore-on-tab-switch + auto-restore-on-save scenarios.

### Risks / Constraints

- **Verification: browser.** Full flow: pick a chair, click empty cell to place; pick a barrel, right-click to restore; pick a candle, switch tabs to restore; pick a minion, hit Tab to restore.
- The auto-restore hook on `cameraMode` change is subscribed via `cameraMode.subscribe(…)` — careful not to fire on the initial value.

### Steps

- [ ] Bump `VERSION` to `V7_7_0`.
- [ ] Add `this.pickedUp = null` to `App`. Add `App.cancelPickup()` method.
- [ ] Wire `PickTool`'s `onArmKind` callback in `buildToolFromId` to set `App.pickedUp` + call `setTool`.
- [ ] Modify `DecorPlaceTool` / `MinionSpawnTool` `onCellClick`: if `App.pickedUp` is set AND kind matches, call `editor.placeFromSnapshot(App.pickedUp, cx, cz)` then clear `App.pickedUp`. Otherwise fall through to existing place logic.
- [ ] Subscribe `App.cancelPickup` to: `BuilderInputAdapter.onCancel` (Esc + right-click), `authoringPanel.activeTab.subscribe`, `viewModel.cameraMode.subscribe`, `topMenu.save` (call before `saveService.save`).
- [ ] On `App.resetLair`, discard `App.pickedUp` without restoring (world is being replaced anyway).
- [ ] Add tests to `tests/world/pickup.test.js`: cancel-on-rightclick restores; tab-switch restores; mode-toggle restores; save-while-holding restores then saves.
- [ ] Run `npm test`; confirm green.
- [ ] Manual test sweep: 4 cancel paths each with a freshly picked decor.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

---

## Task 8: Load lifecycle visibility gate

### Objective

Eliminate the "chrome flashes during asset download" bug. Every post-load chrome surface gates on `isReady`; the loading overlay is the only thing visible until preload resolves.

### Expected Outcomes

- `#top-menu` `data-bind="visible: isReady"`.
- `#tool-bar` `data-bind="visible: isReady() && cameraMode() === 'builder'"`.
- `#authoring-panel` predicate extended with `isReady &&` conjunction.
- `#min-viewport-overlay` `data-bind="visible: isReady() && viewportTooSmall()"`.
- No chrome visible before `isReady` flips true; loading overlay covers the page.
- After `isReady`, all chrome reveals per its individual visibility predicate.

### Risks / Constraints

- **Verification: browser.** Reload the page with throttled network to slow asset download; confirm no chrome flashes before the loading bar finishes.
- Some surfaces may rely on the chrome being available pre-`isReady` for layout measurement — sanity-check Authoring Panel's `cameraMode === "builder"` computed.

### Steps

- [ ] Bump `VERSION` to `V7_8_0`.
- [ ] Edit `index.html` visibility predicates for the four surfaces above.
- [ ] Sweep for any CSS rule that assumes chrome is mounted at boot — adjust if any.
- [ ] Manual test: throttle network to Slow 3G in DevTools, reload. Confirm loading overlay alone is visible; chrome appears after the fade. No size-flash on the min-viewport overlay during initial measurement.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

---

## Task 9: Decor catalogue expansion

### Objective

Add ~6-8 new KayKit decor.floor entries to the manifest so the Decor catalogue overflows its container and triggers the scrollbar. Lets us visually confirm the scroll affordance works inside the new chrome layout.

### Expected Outcomes

- `assets/manifest.json` gains 6-8 new `decor.floor` entries from existing KayKit Dungeon Remastered models not yet in the manifest.
- Each entry has `id`, `path`, `type: "gltf"`, `tier: "world"`, `kind: "decor.floor"`, `displayName`, and any required `meta` (scale / yOffset).
- `IconRenderer` produces thumbnails for the new entries at boot.
- Decor catalogue overflows the panel content area; scrollbar appears and works.

### Risks / Constraints

- **Verification: browser.** Scroll behaviour is visual.
- KayKit model selection is opportunistic — pick visually distinct items that exercise different `meta.scale` / `meta.yOffset` shapes.
- World-tier (lazy-loaded) entries don't block boot; first hover may briefly show the placeholder thumbnail before the icon renders.

### Steps

- [ ] Bump `VERSION` to `V7_9_0`.
- [ ] Survey `assets/kaykit/dungeon-remastered/models/gltf/` for unused decor models suitable for the floor category. Aim for variety (containers, furniture, props).
- [ ] Add 6-8 entries to `assets/manifest.json` per the schema. Pick `displayName`s that fit the cozy-villain aesthetic.
- [ ] Confirm `IconRenderer` boot-time pass produces thumbnails for all entries.
- [ ] Manual test: switch to Decor tab, scroll the catalogue, confirm every new tile renders + the scrollbar appears and scrolls smoothly.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

---

## Task 10: Final browser verify + cleanup

### Objective

Full V7 sweep — exercise every new flow end-to-end, sweep for dead code from Tasks 4-7 (legacy bindings, orphaned CSS, unused tool ids), and finalise the CLAUDE.md UI architecture note.

### Expected Outcomes

- All 10 icons render in-browser; no broken-image glyphs.
- All 5 top-menu actions work (Save / Load / Mode / Settings / Exit).
- All 4 tool-bar tools work across all 3 tabs (Pick on Decor + Minions; Build/Break on all; Nudge on Decor).
- Pickup flow exercised in all 5 cancel paths (right-click, Esc, tab switch, mode toggle, save).
- Save/load round-trip: nudged + picked-up-then-placed decor survive the round-trip.
- CLAUDE.md updated with UI architecture model note (one VM per surface, constructor injection rule).
- Legacy `decor:place:<kind>` / `build:paint` etc. ids audited — flag any that are still emitted; remove or leave as documented aliases per Task 3.

### Risks / Constraints

- **Verification: browser.** Final-task gate — user signs off after exercising all flows.

### Steps

- [ ] Bump `VERSION` to `V7_10_0`.
- [ ] Add the "UI architecture model" note to [CLAUDE.md](../../.claude/CLAUDE.md) (one VM per surface; constructor injection; AppViewModel as composition root; communication direction rules — verbatim from the design's Architecture section).
- [ ] Grep for legacy tool-id callers (`decor:place`, `decor:wall:place`, `build:paint`, etc.) — confirm whether the verb-based aliases route through cleanly.
- [ ] Sweep `cozy.css` for rules referencing removed selectors (`#hud-actions`, `#camera-mode-chip`, `.authoring-panel-tools`).
- [ ] Manual: every top-menu action.
- [ ] Manual: every tool-bar tool across all 3 tabs.
- [ ] Manual: pickup flow — 5 cancel paths.
- [ ] Manual: save → reload → confirm placement state.
- [ ] Manual: load lifecycle — no chrome flash.
- [ ] Manual: catalogue scrollbar in Decor tab.
- [ ] Run `npm test` final; confirm green.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

---

### Notable Deviations from Design

<!-- Filled in during execution. -->

---

### Issues and Adjustments

<!-- Filled in during execution based on testing and user feedback. -->
