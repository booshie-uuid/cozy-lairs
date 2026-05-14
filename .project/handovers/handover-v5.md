# Handover — Cumulative State Through V5 (2026-05-14)

A starter brief for the next Claude Code session. Read this before doing anything substantive. Treat the references below as authoritative — this file is a snapshot in time and will rot.

This handover extends, but does not replace, [handover-v4.md](./handover-v4.md). Read V4's first for the engine + builder foundations; this one only documents what changed in V5.

---

## Project orientation

**Cozy Lairs** is a browser-based 3D lair-builder game. Three.js (r171, vendored) + Knockout.js (UMD) + LZ-string (UMD, new in V5) + Vitest. No build step — the page is served as static HTML. Aesthetic is "cozy villain" / witchy arcade, NOT terminal/IDE chrome.

Currently at **V5.13.0**. **440 tests passing** across 28 files.

---

## What V5 shipped

- **Larger map** — Grid from 10×12 to **20×20** cells. Starter room still 6×6 but recentred to (7, 7). Player spawn moved to match.
- **Schema-v2 save format** — dictionary tables (kinds, components) + enum encoding (side, corner) + LZ-string wrap. UTF-16 LZ for `localStorage`; base64-LZ-in-JSON for files. Hard cut on v1 — old autosaves silently cleared on boot, old files refused with a toast.
- **Load-from-file** — `Ctrl+O` hotkey + visible Load button + confirm modal before clobbering current lair. New events on `SaveService` (`loadRequested`, `loadFailed`).
- **Auto-resume from localStorage** — boot path tries `loadFromAutosave` first; falls back to `buildFreshWorld()` on empty / corrupt slot. Players carry their lair across page refreshes without thinking about it.
- **Reset button** — `Ctrl+...` no hotkey; button-only. Clears autosave, clears FSA file handle, wipes the world, rebuilds the starter. Confirm modal pattern shared with Load.
- **Save button + flashing chip** — Ctrl+S was previously hidden; now a visible Save button. The save-status chip is hidden by default and pops in for 3.5 s on each save / autosave / failure event (opacity + small upward translate animation).
- **Catalogue expansion** — six new decors (bed, table, chair, candle.triple, chest, bottles) and three new skeleton variants (Mage, Rogue, Warrior). All `tier: "core"`.
- **Surface placement** (mid-execution scope expansion) — table marked as a surface; candle.triple and bottles marked as surface-placeable. Stacking a candle on a table works end-to-end including save/load round-trip and cascade-removal of placeables when the surface is erased.
- **Future-proofing for nudging** — the surface design (data model, `placeDecor` signature, ghost positioning hook) explicitly accommodates eventual X/Z nudging, multi-placeable-per-surface, and a floor-mode toggle without schema changes.

---

## New architectural surfaces

### Save format stack (V5 net-new)

- **`libs/lz-string/lz-string.min.js`** — vendored UMD, pinned at 1.5.0. Loaded as a classic `<script>` in `index.html` before the bootstrap module. Modules access via `const LZString = window.LZString;` (same pattern as KO). Re-vendoring instructions in CLAUDE.md.
- **`scripts/modules/world/save-codec.js`** (new) — pure-function module. Exports `encodeForStorage` / `decodeForStorage` / `encodeForFile` / `decodeForFile` plus enum helpers (`encodeSide` / `decodeSide` / `encodeCorner` / `decodeCorner`). Decode functions return `{ snapshot, error }` rather than throwing — callers map error categories to toast copy without try/catch. `LZString` is read lazily via an internal `lz()` accessor so tests can polyfill `window.LZString` in `beforeAll`.
- **`scripts/modules/world/world-serializer.js`** — v1 code path removed entirely. `toJSON(world, options)` emits the v2 dict-encoded shape (`{ v: 2, kinds, components, entities }`). Accepts `options.skipKinds` (used to exclude the player + tracer-derived walls / corners). `fromJSONv2(world, snapshot, assets, options)` consumes that shape; also accepts `skipKinds` for symmetry on legacy snapshots. Uses `world.clear()` to wipe before reconstruction.
- **`scripts/modules/engine/save-service.js`** — autosave + file save now route through `save-codec`. New `clearAutosave()` and `clearFileHandle()` methods. New `openFile()` async method with FSA + `<input>` fallback. Two new events: `loadRequested` / `loadFailed`. Size reporting now in actual bytes (autosave: `encoded.length × 2` because localStorage is UTF-16; file: `encoded.length` because ASCII).

### `SAVE_SKIP_KINDS` (V5 net-new)

A constant in `scripts/app.js` listing kinds we never persist:
- `PLAYER_KIND` — no stateful component to round-trip; always re-spawned via `App.spawnPlayer()`.
- `wall.stone.straight` / `wall.stone.half` / `wall.stone.corner` — WallTracer-derived from floor topology.

Applied in both directions:
- `WorldEditor` → `getSnapshot` passes it to `toJSON` so new saves omit them.
- `App.applyAutosaveSnapshot` / `applyLoadedSnapshot` pass it to `fromJSONv2` so legacy snapshots that still carry the derived kinds are filtered on load.

**CRITICAL** — if WallTracer (or any future tracer) gains additional auto-produced kinds, each new kind MUST be added to `SAVE_SKIP_KINDS`. Otherwise a load-time duplication bug recurs: tracer reacts to each loaded floor by building its own walls + corners, then the snapshot's walls + corners are added on top → two complete sets → corner map overwrites and orphans one of each pair. Symptom: "corner-touching edges don't update properly after reload." See plan-v5 "Issues and Adjustments" for the full debug history, and CLAUDE.md → "Derived entities are not persisted".

### UI additions

- **`scripts/modules/ui/confirm-modal.js`** (new) — `ConfirmModalViewModel` with `show({ title, message, actionLabel, onConfirm })` / `hide()` / `cancel()` / `confirm()`. Single instance owned by `AppViewModel`. Used by Load and Reset. Escape-to-cancel wired in `App.wireConfirmModal()` (gated on `isTextInputFocused()`). Backdrop click does nothing (intentional — protects against accidental dismissal).
- **`#hud-actions`** (new) — flex container at bottom-right wrapping the three HUD buttons (`#save-button`, `#load-button`, `#reset-button`). Shared `#hud-actions button` CSS rule keeps them visually consistent (chunky cozy chrome). Hotkeys: Ctrl+S (save), Ctrl+O (load). Reset is button-only.
- **`#save-status-chip`** — re-purposed from persistent to transient. `AppViewModel.flashSaveStatus(message)` updates the text + flips `saveStatusVisible` true, with a 3.5 s timer to flip back to false. CSS animates opacity + a small upward translate.
- **KO late-binding pattern** — `viewModel.loadFile` / `saveLair` / `resetLair` are attached as arrow-function shims to `AppViewModel` *between* `new AppViewModel()` and `ko.applyBindings`. The shims close over `App` so they dereference `this.saveService` lazily on click; this side-steps a `ReferenceError` KO throws if a binding's expression evaluates a property that doesn't exist on the bound view-model at `applyBindings` time.

### Surface placement (V5 net-new)

- **Manifest meta** — two new optional fields. Object-shaped so the schema can grow:
    - `meta.surface = { surfaceY: <number> }` — marks the entry as a surface. Top-of-surface Y in world units. Future: could grow `surfaceFootprint`, `slots`, `surfaceX` / `surfaceZ` for wall anchors.
    - `meta.placeableOnSurface: true` — boolean. Eligible to sit on floor *or* a surface.
- **`GridPlacement.surfaceY`** — optional constructor field (default 0). `onAddedToWorld` sets `object3D.position.y = surfaceY`. `toJSON` emits only when non-zero. Constructor rejects non-finite values.
- **`WorldEditor` queries**: `findSurfaceAtCell(cx, cz)` returns the surface at a cell (or null). `findSurfacePlaceablesAtCell(cx, cz)` returns entities with `surfaceY > 0` at a cell. `getPlacementYFor(kind, cx, cz)` returns the Y a decor of that kind should sit at on that cell.
- **`canPlaceDecor` branches** — if the kind is `placeableOnSurface` AND a surface exists at the cell, allowed iff no other surface-placeable already sits there (V5's "one per cell" rule). Else: existing floor-decor rules.
- **`placeDecor` Y / blocks logic** — surface-placed decor has `blocks: false` (the surface beneath owns the cell-blocking). This makes the cascade order safe: placeables removed before the surface, then the surface's `clearBlocked` fires exactly once.
- **`removeDecor` cascade** — when removing a surface entity, scans for entities at the cell with `surfaceY > 0` and removes them first.
- **`Tool.positionGhostAtCell(cx, cz, yOffset = 0)`** — base method extended with an optional Y offset. `DecorPlaceTool.onCellHover` calls `editor.getPlacementYFor(kind, cx, cz)` and passes the result so the ghost previews at the right height.

### `World.clear()` (V5 net-new)

Removes every entity (snapshot-then-iterate to avoid mutation-during-iteration). Used by both `fromJSONv2` and `App.resetLair`.

### Test count delta

- V4 baseline: **385** tests across 27 files.
- V5 final: **440** tests across 28 files (+55 tests, +1 file).

The new file is `tests/world/save-codec.test.js`. Other tests landed in existing files (`world-editor.test.js`, `world-serializer.test.js`, `save-service.test.js`, `world.test.js`, `components.test.js`, `wall-tracer.test.js`).

---

## V5+ long-term user intent (additions to V4+)

V4's intent list (cost system, tech-tree, minion-driven construction, dual catalogue, free Y-rotation, move-player tool) is unchanged and still in memory at `~/.claude/projects/.../memory/project_v4_future_intent.md`.

V5 surfaced these additional intents the user explicitly named:

- **Nudging** (free X/Z decor offset within a cell). Likely a `GridPlacement.xOffset` / `zOffset` field, mirroring how V5 added `surfaceY`. Unlocks several downstream features (below).
- **Multi-placeable per surface** — locked behind nudging arrival. V5 enforces one placeable per surface cell as a *validation rule*, not a schema invariant. Lifting the rule needs no schema change.
- **Multi-surface per cell** — same lock. V5's `findSurfaceAtCell` returns the "first match", forward-compatible.
- **Floor-mode placement toggle** — when nudging ships, a hotkey (likely `X`) toggles between "place on surface" and "place on floor under surface". V5's `getPlacementYFor` / `placeDecor` signatures will grow an optional `target: "auto" | "surface" | "floor"` parameter; current default `"auto"` (surface wins) is preserved.
- **Catalogue indicator for surface-placeable decor** — deferred. Currently no visual hint in the AuthoringPanel tile that a decor can sit on a surface; discoverability comes from hovering a surface cell.
- **Ghost-Y polish** — the ghost mesh hovers ~0.18 m above where the placed entity actually lands (the existing `GHOST_Y` offset in `Tool.positionGhostAtCell`, originally added to avoid Z-fighting with the 0.15 m floor tile). User flagged but accepted in V5. Could suppress `GHOST_Y` when `yOffset > 0` later.

---

## Known polish gaps

Unchanged from V4 (recorded in plan-v4 "Issues and Adjustments"):

- **WallTracer T-/+-junction polish** — vertices with 3+ walls skip the corner piece (no native KayKit geometry). Acceptable.
- **Minion mesh visually clips with interior corner pieces** — cell-based collision doesn't see corner-piece arms.
- **Block / wall geometry overlap** — `terrain.block` placed adjacent to walls has a tiny visual overlap. Largely moot once minion-dig replaces manual block placement.

New in V5 (see plan-v5 "Issues and Adjustments" for full debug history):

- **Ghost-Y offset on surface placement** — covered under V5+ long-term intent above.

---

## Recent close-out additions (not in CLAUDE.md or any plan)

- **`.project/package-deploy.js`** — Node utility. Copies the deploy manifest (`index.html` + `assets/` + `libs/` + `scripts/` + `styles/`) into `.project/deploy/`. Excludes everything else (node_modules, tests, .project, .claude, package*.json, vitest.config.js, git/IDE folders) by virtue of not naming them. Wipes the output directory each run for reproducible bundling. Run: `node .project/package-deploy.js`.
- **`.gitignore`** — added `.project/deploy/` to keep the bundle out of commits.
- **`.project/designs/design-v5-surfaces.md`** — surface-placement design addendum. Pointer to it from the top of `design-v5.md`. First time the project has used the addendum pattern; expect future mid-version scope expansions to follow.
- **`.project/handovers/handover-v5.md`** — this file.

---

## Run / test cheatsheet

| Task | Command |
| --- | --- |
| Run all tests once | `npm test` |
| Watch tests | `npm run test:watch` |
| Run a single test file | `npx vitest run tests/path/to/file.test.js` |
| Regenerate project stats | `node .project/stats.js` |
| Bundle a deploy | `node .project/package-deploy.js` |

App runs by opening `index.html` from a static server. No build step.

---

## Suggested next-session opener

If the user opens with "let's start V6" (or any forward-planning phrasing):

1. Read `.project/project.md` to confirm what it points at.
2. Read `~/.claude/projects/.../memory/project_v4_future_intent.md` AND scan this file's "V5+ long-term user intent" section.
3. Use the `brainstorm` skill — V5 surfaced nudging as the natural next big arc (unlocks multi-placement, multi-surface, floor-mode toggle). Other live candidates: move-player tool, cost system, minion-driven construction.
4. After design is accepted (renamed to `design-v6.md`), use `create-plan`.
5. Then `execute-plan`.

If the user opens with a bug / tweak / small task, just dive in. V5 is shipping-stable.

If the user wants to deploy: `node .project/package-deploy.js` produces `.project/deploy/`; upload that directory verbatim to a static webserver.

---

## Anti-patterns to avoid (additions to V4's list)

V4's anti-patterns still apply. New in V5:

- **Don't persist derived data.** Walls, corners, and the player avatar are excluded via `SAVE_SKIP_KINDS`. If you add a new auto-traced kind, add it here too — otherwise a load-time duplication bug surfaces (see CLAUDE.md → "Derived entities are not persisted").
- **Don't attach KO-bound view-model methods AFTER `applyBindings`.** KO evaluates binding expressions during `applyBindings`; a missing `click: foo` throws `ReferenceError: foo is not defined`. Attach shims between `new AppViewModel()` and `ko.applyBindings`; let them dereference late-bound dependencies lazily.
- **Don't conflate string-length with byte-count.** localStorage is UTF-16 (2 bytes/char); ASCII files are 1 byte/char. The save-size reporting fix in plan-v5 issues lists the exact correction.
- **Don't tick the verify step until the user signs off** ("looks good" / "proceed" / "ship it" / "ok to go" / "looks ok let's move on"). The verify step is the user's, not the agent's.
- **Don't write a new design version mid-execution for a scope expansion.** Use a design addendum (`design-vN-<topic>.md`) instead, and append tasks to the existing plan-vN.md. V5's `design-v5-surfaces.md` is the precedent.
