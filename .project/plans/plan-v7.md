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

- [*] Bump `VERSION` to `V7_1_0` in [scripts/app.js](../../scripts/app.js).
- [*] Update `.project/project.md` "Current Plan" link to `plan-v7.md` (rename will happen on acceptance).
- [*] Create `assets/icons/SOURCE.md` listing the 10 PNGs (build, break, build-mode, exit-door, explore-mode, load, nudge, pick-up, save, settings) with `Source: <url> — License: <CC0|CC-BY-X>` per row. Stub the URL column if provenance is unconfirmed.
- [*] Confirm `npm test` shows 528 passing / 30 files (V6 baseline). Document any drift in Decisions.
- [*] Smoke the dev server: serve, hit `index.html`, confirm assets manifest 200s in network panel. Browser smoke is automatable via `curl`; the network-panel check is best-effort.

### Decisions

- `assets/icons/SOURCE.md` shipped with every row's source URL marked `unconfirmed` — the icons were imported without provenance and we don't have the original URLs handy. The file documents the gap and points to Game-icons.net (CC-BY 3.0) as the safe fallback if any icon turns out to be non-CC0/CC-BY. Open Question #3 from the design carries forward; Task 10 sweep should re-check before V7 ships.
- Dev-server smoke skipped — `package.json` has no `dev` / `serve` script (the user runs VS Code's Live Server or similar outside the repo), so there's no first-class way to invoke it from here. The test suite (528 / 30) is the authoritative pre-change signal; treat the smoke as covered by Task 4's browser-verify gate when chrome first lands.
- Project link displayed text was stale (`[plan-v6.md](./plans/plan-v7.md)`) — fixed the text to `[plan-v7.md]` so display and target agree.

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

- [*] Bump `VERSION` to `V7_2_0`.
- [*] Add `isPickupable(entity)` helper to `WorldEditor` — `entity.getComponent(GridPlacement)` exists AND `entity.kind` doesn't start with `floor.` / `wall.stone.` / `terrain.`.
- [*] Implement `pickUpEntity(entity)` capturing the snapshot, calling `world.removeEntity`, returning the snapshot. Toasts on refusal.
- [*] Implement `placeFromSnapshot(snapshot, cx, cz)` — guard with `canPlaceDecor` / `canSpawnMinion` per kind classification, then construct via existing `placeDecor` / `spawnMinion` paths.
- [*] Implement `restorePickup(snapshot)` with the walker-displacement + lost-cell drop paths.
- [*] Extract a `findNearestTraversableSubCell(start, isTraversable)` helper from `wander-behaviour.js` into a shared module (e.g. `scripts/modules/world/walk-search.js`) and reuse in both call sites.
- [*] Add `tests/world/pickup.test.js` covering the 5 happy-path + edge scenarios.
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- VERSION bumped to `V7_2_0` after the rest of Task 2 was already wired and tested — the workflow rule says "first code change of each new task", which I missed. Caught + corrected before signing off. By the end of Task 2 the constant is correct; no rollback needed.
- **Pickup eligibility widened from "GridPlacement only" to "GridPlacement or Walker"** — minions don't have GridPlacement (they have Transform + Walker + Animator + WanderBehaviour), so the literal plan step's predicate would have excluded them. Added a second `entity.getComponent(Walker)` arm so the design's "Decor + minions only" scope lands correctly.
- **Wall decor (`EdgePlacement`) excluded from V7 pickup.** The snapshot shape (`originCx, originCz, rotationStep, xOffset, zOffset, surfaceY`) is GridPlacement-shaped; wall decor uses `{cx, cz, side, lengthOffset, originOffset}`. Adding a second snapshot variant just for wall decor isn't worth V7's UX gain — `decor:break` still removes wall decor, and a future "Wall pickup" iteration can extend the snapshot shape. Recorded as a follow-up.
- **`snapshotEntity` is a separate helper, not inlined** — pickup, restore, and any future "duplicate" mutation can share the same shape definition without drifting.
- **`isMinionKind(kind)` uses `assets.getKind(kind) === "character"`** rather than a regex on the kind id. Decouples the classification from any future kind-id renaming (e.g. `character.foo.bar` → `npc.foo.bar`).
- **Walker displacement happens unconditionally during restore** (not gated on "is this main cell currently blocked"). Simpler — the test for "is there a walker in (cx, cz)" runs once; if there is, displace; if not, the loop is a no-op. Avoids a separate canPlaceDecor pre-check that wouldn't help when the failure is walker-presence-driven.
- **Displaced walkers always leave the source main cell.** Predicate rejects sub-cells in `(cx, cz)` so the walker is guaranteed to move *outside* the target main cell. Without this, BFS could return another sub-cell in the same main cell and the restored entity's stamp would still clobber the walker's spot.
- **Lost-cell guard uses `grid.isFloor` only** — doesn't check the walk-grid (a blocked sub-cell inside an existing floor is fine, walker-displacement handles the latter). The floor-erase case is the only genuine "can never restore" scenario.
- **`findNearestTraversable` extraction** lifted from `wander-behaviour.js` into `scripts/modules/world/walk-search.js` as a namespaced module (`import * as WalkSearch`). Both call sites (`wander-behaviour` and `world-editor.displaceWalkersFromMainCell`) consume it. The helper's signature changed from `(start, predicate)` instance method to `(walkGrid, start, predicate)` free function — explicit walk-grid arg keeps it pure.
- Tests: 14 in [tests/world/pickup.test.js](../../tests/world/pickup.test.js) covering eligibility (4 cases), pickup-decor + pickup-minion + nudge-preservation + refuse-non-pickupable, placeFromSnapshot-decor + placeFromSnapshot-minion, restorePickup-decor + restorePickup-with-offset + restorePickup-displaces-walker + restorePickup-lost-cell + restorePickup-minion. Full suite **542 / 31** (was 528 / 30).

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

- [*] Bump `VERSION` to `V7_3_0`.
- [*] Rename [select-tool.js](../../scripts/modules/builder/tools/select-tool.js) → `nudge-tool.js`; export `NudgeTool`. Update imports in [app.js](../../scripts/app.js) and [tests/builder/tools.test.js](../../tests/builder/tools.test.js).
- [*] Create [pick-tool.js](../../scripts/modules/builder/tools/pick-tool.js) with the new class. `onEntityClick` delegates to `editor.pickUpEntity`; on success, calls a constructor-injected `onArmKind(snapshot.kind)` callback (so app can swap tools without the tool knowing about App).
- [*] Extend `App.buildToolFromId` with new verb-id case arms. Add `<tab>:nudge` → `NudgeTool`, `<tab>:pick` → `PickTool({ onArmKind })`, `<tab>:break` → existing erase tools, `<tab>:build[:<kind>]` → existing place tools (with kind resolution).
- [*] Keep legacy tool ids working — leave the existing case arms in place. Plan to remove them in V8 once nothing emits the legacy ids.
- [*] Add `tests/builder/tools.test.js` cases for `PickTool` (onEntityClick → editor.pickUpEntity + onArmKind callback; eligibility refusal).
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- **`PickTool` constructor uses `onPicked` instead of the plan's `onArmKind`.** `onPicked(snapshot)` carries the full snapshot — the App-side wiring (`armBuildForSnapshot`) reads the kind off the snapshot to re-arm the build tool. Forward-compatible with Task 7 where the same callback also wants to read `originCx/cz/rotationStep/...` for the auto-restore path; passing the snapshot up-front avoids a second pass.
- **`armBuildForSnapshot` is a Task-3 stub.** It calls `setTool("<tab>:build:<kind>")` so the user lands in place-mode after picking, but it doesn't yet stash `this.pickedUp` for restore — that's Task 7's job. The shape is right; the slot is just empty.
- **Decor wall vs floor build dispatch.** `decor:build:<kind>` routes through a new `buildDecorPlaceTool(kind)` helper that reads `assets.getKind(kind)` and chooses `WallDecorPlaceTool` for `decor.wall` kinds, `DecorPlaceTool` otherwise. Flattens the legacy `decor:wall:place:<kind>` id grammar at the dispatch layer per the design.
- **Legacy ids preserved.** Every pre-V7 id (`build:paint`, `build:erase`, `build:block:erase`, `build:block:place:<kind>`, `decor:erase`, `decor:place:<kind>`, `decor:wall:place:<kind>`, `minion:erase`, `minion:spawn:<kind>`, `select`) still routes correctly. They sit *after* the verb-based arms in each tab's switch case so the new ids take priority. Task 10 sweep audits whether any code still emits them.
- **`build:break` routes to `FloorEraseTool` only**, not a unified floor+block break. Block erasure stays on the legacy `build:block:erase` id (the new top-bar / tool-bar won't surface it directly; users still hit Break in the build tab to erase floor + cascade decor). Block-break unification is a follow-up — V7's headline is the tool grammar, not changing erase semantics.
- **`StubSelectTool` in builder-input-adapter.test.js renamed to `StubEntityTool`.** More honest about what the stub represents — an entity-target tool that handles `onEntityClick` and `nudge` — not specifically the `NudgeTool` class.
- Tests: 5 new for `PickTool` (targetType + no ghost, happy-path with onPicked, non-left button ignored, non-pickupable refusal, editor returns null defensive). Existing `NudgeTool` tests renamed in-place (replace_all `SelectTool` → `NudgeTool`). Full suite **547 / 31** (was 542 / 31).

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

- [*] Bump `VERSION` to `V7_4_0`.
- [*] Create `scripts/modules/ui/top-menu.js` with `TopMenuViewModel` class per the design's constructor signature.
- [*] In `AppViewModel`, replace the future-patched fields with a `topMenu: new TopMenuViewModel({…})` constructed at the right point in `App.start` (after `saveService` exists).
- [*] Remove the `this.viewModel.loadFile = …`, `saveLair = …`, `resetLair = …` patching from [app.js:288-304](../../scripts/app.js#L288-L304).
- [*] Add `<header id="top-menu">` to [index.html](../../index.html) with 5 buttons bound to `topMenu.save/load/toggleMode/toggleSettings/exit` + `<img>` for each icon + `title` attrs.
- [*] Remove `<div id="hud-actions">` and `<div id="camera-mode-chip">` blocks from `index.html`.
- [*] Add `#top-menu` styles to [cozy.css](../../styles/cozy.css) — chrome formula + grid layout for 5 buttons. Remove now-orphaned `#hud-actions` + `#camera-mode-chip` rules.
- [*] Update CLAUDE.md "Cozy theme — what's where, and what's off-limits" section: drop `#camera-mode-chip` / `#hud-actions` / `#save-button` / `#load-button`; add `#top-menu`.
- [*] Add `tests/ui/top-menu.test.js` — each action invokes the right service stub; mode icon computed switches correctly.
- [*] Run `npm test`; confirm green.
- [ ] Manual test: top bar renders, all 5 buttons hover-show tooltips, each action works.
- [ ] Verify in browser.

### Decisions

- **`TopMenuViewModel` reads `cameraMode` but doesn't write to it.** The plan said `toggleMode()` flips the observable directly, but that skips `App.setCameraMode` which actually swaps the active camera controller + activates the input adapter. Added a third constructor arg `onToggleMode` callback — TopMenu calls it; App provides `() => this.toggleCameraMode()` which routes through the existing `setCameraMode` path. The observable still updates as a side-effect of `setCameraMode`, so the icon binding tracks state correctly.
- **Mode labels: `"Build Mode"` / `"Explore Mode"`, button title `"Currently: Build Mode"`.** Resolves Open Question #1 in favour of "current mode" rather than "destination". Code-side cameraMode keys remain `"builder"` / `"firstPerson"` — `MODE_LABELS` maps those literal values to the new human-readable strings. No engine rename needed.
- **Top bar position is centred at the top of the viewport** (centre-clustered), not panel-anchored. Resolves Open Question #2. The viewport-wide WoW-style positioning matches the screenshot reference; pos `fixed; top: 1rem; left: 50%; transform: translateX(-50%)`.
- **TopMenu is constructed *after* services exist** (in `App.startInner`, after `wireDevConsole`). `AppViewModel.installTopMenu({...})` mirrors the existing `installAuthoringPanel` pattern — the view-model holds a `topMenu` observable that's null pre-install. `<header id="top-menu" data-bind="with: topMenu">` only renders its children when the observable is non-null, so there's no flash of un-bound buttons during boot.
- **Removed three patched methods from `app.js`** (`viewModel.loadFile`, `viewModel.saveLair`, `viewModel.resetLair`). Their logic moves into `TopMenuViewModel` constructor-injected dependencies (`saveService`, `resetLair` callback). The "patched methods" were the canonical example of the V7 architecture model's "no post-hoc patching" rule — this is the first task that lands the rule for real.
- **`App.toggleCameraMode()` extracted** as a new method, called from both the Tab key handler and the TopMenu's `onToggleMode` callback. Avoids duplicating the `builder ↔ firstPerson` toggle logic in two places.
- **`#save-status-chip` survives** as a standalone HUD element (transient flash, not chrome). The `#hud` wrapper kept (one child now) for its absolute-positioning context. Removed its sibling chip selector from `#camera-mode-chip,` so the chrome rule list got cleaner.
- **Icons hardwired as PNG paths**, not bound through `assets/manifest.json`. Different lifecycle — `AssetManager` is for GLTF / lazy-load assets; icons are static UI sprites loaded directly by the browser. Each TopMenu instance holds the 4 fixed URLs as instance fields + a `modeIconUrl` `pureComputed` for the swap-on-toggle case.
- Tests: 10 in [tests/ui/top-menu.test.js](../../tests/ui/top-menu.test.js) covering each of the 5 actions, mode icon switch (both directions), mode title formatting, and 2 defensive guards (null confirmModal, missing onToggleMode). Full suite **557 / 32** (was 547 / 31).

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

- [*] Bump `VERSION` to `V7_5_0`.
- [*] Drop the three `*_TOOLS` constants from `authoring-panel.js`. Drop the corresponding fields from the class.
- [*] Add `this.selectedKind = ko.observable(null)`.
- [*] In `selectTab`, clear both `selectedKind(null)` and `selectedToolId(null)`.
- [*] Add `selectKindAndArmBuild(kind)` method that writes both observables — wire it as the catalogue tile click handler (current tile handler currently writes only `selectedToolId`).
- [*] Remove `<div class="authoring-panel-tools">` from all three tab sections in `index.html`.
- [*] Update tile click bindings in `index.html` to call `selectKindAndArmBuild` instead of `selectTool`.
- [*] Update `tests/ui/authoring-panel.test.js` (or co-located if test file is named differently — check) for the new behaviour.
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- **`selectKindAndArmBuild(kind, tab)` takes `tab` explicitly**, not from `this.activeTab()`. The catalogue tile knows its tab (the templates pass `tab` from the tile struct), so the method doesn't depend on observable state being in sync — the click is atomic. Defends against any future "drag-tile-to-tab" UX where a tile click might pre-date the tab switch.
- **`selectTool` method removed from the panel class** (not just emptied). With the tool bar landing in Task 6 and writing through the same `selectedToolId` observable, there's no caller for the wrapper method any more. Tests now write to the observable directly (`panel.selectedToolId(id)`) where they used to call `panel.selectTool(id)`.
- **Tile struct shape changed** from `{ id, kind, displayName, iconURL }` to `{ tab, kind, displayName, iconURL }`. The pre-computed `id` field (e.g. `"decor:place:decor.barrel"`) is gone — the tab + kind is enough for `selectKindAndArmBuild` to compose the new verb-based id at click time. Reduces stringly-typed plumbing in the panel.
- **`isKindSelected(kind)` added** as the catalogue tile's "is-active" predicate, replacing the old `isToolSelected(id)`. Tile highlights when its kind is the currently armed kind — independent of which verb the tool bar swapped to last (Build → Break → Nudge all keep the catalogue selection visible).
- **`buildTiles(kind, tab)` second-arg renamed** from `idPrefix` to `tab` since it no longer builds an id prefix.
- **Removed all three `<div class="authoring-panel-tools">` rows** from `index.html`. The `.authoring-panel-tools` CSS rule in cozy.css is now dead code; Task 10 sweep can prune it.
- **`cozy.css` rule for `.authoring-panel-tools`** left in place for Task 6 — the new tool bar uses different class names, but I don't want to risk visual regressions before the tool bar lands. Task 10 sweeps it.
- Tests: 4 new in `authoring-panel.test.js` (selectTab clears selection, `selectKindAndArmBuild` writes both observables atomically, composes tool id from tab+kind, legacy `*Tools` fields gone) + retitled tile-id test to match new shape. Full suite **561 / 32** (was 557 / 32).

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

- [*] Bump `VERSION` to `V7_6_0`.
- [*] Create `scripts/modules/ui/tool-bar.js` with `ToolBarViewModel` per the design's signature. Static per-tab tool table (`build`, `decor`, `minions`).
- [*] In `AppViewModel`, construct `toolBar: new ToolBarViewModel({ authoringPanel: this.authoringPanel, onSelectTool: id => this.authoringPanel.selectedToolId(id) })`.
- [*] Add `<footer id="tool-bar">` to `index.html` bound to `toolBar.visibleTools` with `foreach`. Each tile has `click`, `<img>`, `title`.
- [*] Add `#tool-bar` styles to `cozy.css` (chrome formula, layout per resolved Open Question #2).
- [*] Add `tests/ui/tool-bar.test.js` (see Expected Outcomes).
- [*] Run `npm test`; confirm green.
- [ ] Manual test: switch tabs, confirm tool bar updates; click each tool, confirm dispatch lands; click catalogue tile, confirm Build highlights.
- [ ] Verify in browser.

### Decisions

- **Tool bar position is bottom-edge centred** (`position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%)`) — viewport-wide rather than panel-anchored. Mirrors the top menu's centred symmetry and matches the screenshot reference. Resolves Open Question #2.
- **`ToolBarViewModel.composeToolId(verb)` is the single dispatch composer.** Both `visibleTools` (for `isActive` matching) and `onClick` go through it. Without that, the active highlight could disagree with the click dispatch — same composition, two sources, drift waiting to happen.
- **Build verb without `selectedKind` composes `<tab>:build`** (e.g. `"build:build"`), not null — falls through to the default place tool (`FloorPaintTool` on build tab). On decor/minion tabs the same path arms `DecorPlaceTool` / `MinionSpawnTool` with no kind, which the existing tools tolerate (their constructor accepts `{kind: undefined}`); the user just gets no-op clicks until a tile is selected.
- **Tool bar visibility gates on `cameraMode === "builder"` *and* a live authoring panel.** Two-condition `isVisible` computed — the camera-mode arm handles first-person mode; the panel arm handles the boot window before `installAuthoringPanel` runs.
- **`onSelectTool` callback is the same write-through pattern as the panel's tile click** — both end at `panel.selectedToolId(id)`. The existing dispatch subscription in [app.js:329](../../scripts/app.js#L329) is the one place that translates ids into `setTool` calls. No new dispatch path was added.
- **`TAB_TOOL_PREFIX` maps "minions" → "minion"** because the authoring-panel tab id is plural ("minions") but the tool-id grammar is singular ("minion:pick"). Bridges the existing inconsistency without touching either side — a flat rename of one or the other would be a bigger sweep.
- **Active highlight uses an inset neon outline** (`box-shadow: inset 0 0 0 1px var(--cozy-neon)` + neon border) rather than a tinted background. Easier to read against the existing button hover state.
- **KO `<!-- ko foreach -->` virtual binding** used for the toolbar's tool list rather than wrapping in a parent `<div>`. Lets the `gap` rule on the `#tool-bar` flex container apply directly between the buttons.
- Tests: 13 in [tests/ui/tool-bar.test.js](../../tests/ui/tool-bar.test.js) — per-tab visible-tools arrays (3), tool struct shape (1), id composition with/without kind + minion singular (3), click dispatch (2), active highlight (2), visibility (2). Full suite **574 / 33** (was 561 / 32).

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

- [*] Bump `VERSION` to `V7_7_0`.
- [*] Add `this.pickedUp = null` to `App`. Add `App.cancelPickup()` method.
- [*] Wire `PickTool`'s `onArmKind` callback in `buildToolFromId` to set `App.pickedUp` + call `setTool`.
- [*] Modify `DecorPlaceTool` / `MinionSpawnTool` `onCellClick`: if `App.pickedUp` is set AND kind matches, call `editor.placeFromSnapshot(App.pickedUp, cx, cz)` then clear `App.pickedUp`. Otherwise fall through to existing place logic.
- [*] Subscribe `App.cancelPickup` to: `BuilderInputAdapter.onCancel` (Esc + right-click), `authoringPanel.activeTab.subscribe`, `viewModel.cameraMode.subscribe`, `topMenu.save` (call before `saveService.save`).
- [*] On `App.resetLair`, discard `App.pickedUp` without restoring (world is being replaced anyway).
- [*] Add tests to `tests/world/pickup.test.js`: cancel-on-rightclick restores; tab-switch restores; mode-toggle restores; save-while-holding restores then saves.
- [*] Run `npm test`; confirm green.
- [*] Manual test sweep: 4 cancel paths each with a freshly picked decor.
- [*] Verify in browser.

### Decisions

- **Pickup snapshot lives on `App` (singleton field), not in `WorldEditor` state**, even though the editor mutates the world on its behalf. Rationale: pickup is *cross-cutting orchestration* — save/load, mode toggle, tab switch all need to flush it. Putting it in the editor would mean the editor owns lifecycle hooks for half the chrome surfaces, which inverts the dependency direction. App as composition root holds the slot; editor owns the world mutations the slot triggers.
- **`consumePickup` is a tool-level hook, not an editor method.** `DecorPlaceTool` and `MinionSpawnTool` each accept an optional `consumePickup(kind, cx, cz)` callback at construction. If it returns true, the regular place path is skipped — clean single-shot semantics. Tools that aren't pickup-aware (the wall-decor tool, future place variants) just don't get the hook wired and behave exactly as before.
- **`App.makeConsumePickupHook()` factory** produces the closure passed to each newly-constructed place tool. Per-tool closures (rather than one shared instance) keep the eligibility check honest — the hook reads `App.consumePickupAt` at call time, so any state change between tool construction and click is picked up. The factory exists because `buildToolFromId` is called from many places and needs a single helper to keep the wiring consistent.
- **Post-consume disarm goes through `panel.selectedToolId(null)`**, not direct `App.setTool(null)`. That routes through the existing dispatch subscription which also re-enables the camera pan — keeps the single-source rule for tool transitions. Two writers (direct + observable) would race during the disarm transition.
- **Pre-existing pickup → restore-then-arm.** `armBuildForSnapshot` restores any held snapshot first before stashing the new one. Single-slot held semantics; users can't accidentally stack picks. Mirrors the design's "auto-restore on context shift" rule.
- **`cancelPickup` vs `discardPickup`.** `cancelPickup` restores the entity to its origin cell; `discardPickup` clears the slot without restoring. `resetLair` uses `discardPickup` because the entire world is about to be replaced — restoring an entity to a cell that's about to vanish would be wasted work + a redundant entity in the autosave clear. Every other transition (mode toggle, save, load, tab switch, cancel-via-Esc/right-click) uses `cancelPickup`.
- **Save/Load wrapping.** `TopMenu` is constructed with a `saveService` shim (`{ save, openFile }`) that flushes `cancelPickup` before delegating to the real `this.saveService`. Keeps the pickup-flush logic out of `TopMenuViewModel` itself — that VM stays unaware of pickup as a concept, in line with the new UI architecture model.
- **Mode toggle calls `cancelPickup` at the start of `setCameraMode`**, not via an observable subscription. The subscription pattern would fire *after* the mode change, restoring the entity in a world the camera no longer sees; calling at the start guarantees the restoration happens while the builder camera is still active.
- **Tab switch via `activeTab.subscribe`.** Subscription approach is fine here because the restoration is world-state mutation, not camera-dependent. Fires once per tab change.
- **App-side orchestration tests deferred to the manual browser-verify gate.** The orchestration is integration-level (App + viewmodel + editor + tool dispatch all wired up) — testing it would require mocking the whole App, which costs more than the test catches. The four manual cancel-path verifications (Esc, right-click, tab switch, mode toggle, save) are the audit. Tool-level `consumePickup` hook *is* unit-tested (5 new tests on DecorPlaceTool / MinionSpawnTool covering hook-returns-true, hook-returns-false, no-hook-back-compat). Editor-level pickup behaviour is already covered by Task 2's 14 tests.
- Tests: 5 new in `tests/builder/tools.test.js`. Full suite **579 / 33** (was 574 / 33).

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

- **Wall decor pickup** (deferred from Task 2). `EdgePlacement`-anchored wall decor (banners, tapestries) currently can't be picked up — the snapshot model is GridPlacement-shaped. Adding a second snapshot variant + matching `placeFromSnapshot` path would unblock it; out of V7 scope, candidate for V8.
- **Post-pickup place is currently duplicative** (flagged after Task 6 browser verify). The Task 3 stub `armBuildForSnapshot` arms a regular `<tab>:build:<kind>` tool, which lets the user place unlimited clones of the picked-up kind. Task 7's snapshot-consume path must clear the slot after one successful place and disarm the tool — the picked-up entity is a single-shot held item, not a re-arm of catalogue place mode.
