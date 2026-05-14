# Plan: Cozy Lairs V5 — Catalogue Expansion, Compact Saves, Load-from-File

## Context

V5 layers five small-to-medium improvements on the V4 Build Mode MVP:

1. A larger authoring envelope — grid grows from 10×12 to 20×20 cells; starter room stays 6×6 but recentres to offset (7, 7).
2. A schema-v2 save format combining dictionary tables (kinds, components, side / corner enums) with an LZ-string wrap (UTF16 for `localStorage`, base64-in-JSON for file saves). Hard cut on V1: legacy autosaves are silently cleared on boot; V1 files surface a toast.
3. A user-initiated **Load from File** path — Ctrl+O hotkey + visible button, decode-then-confirm flow with a generic confirmation modal.
4. Auto-resume from `localStorage` on boot when a v2 autosave is present (seed of a future "Resume" feature) paired with a **Reset** button that clears the autosave and rebuilds the starter room. Both Reset and Load share the same confirmation modal.
5. Lean catalogue expansion — three missing KayKit skeleton variants (Mage, Rogue, Warrior) plus six decors (bed, table, chair, candle-triple, chest, bottles).

Full design: [.project/designs/design-v5.md](../designs/design-v5.md).

The plan sequences map expansion first (cheapest, establishes the larger baseline that compression is later measured against), then the save-format stack from bottom up (LZ-string vendor + codec → WorldSerializer v2 → SaveService wiring) so each layer ships green and tested before the next consumes it. The confirmation modal lands once (Task 5) and is consumed twice (Tasks 7, 8). Catalogue expansion lands last (Tasks 9, 10) so the new entries are measured against the v2 schema, not the v1 one — addressing the user's "see how effective the new save schema is" goal.

`VERSION` in `scripts/app.js` is bumped as the *first* code change of each task per the project's versioning convention. Plan-v5 uses the `V5_N_0` format throughout; the value advertised after task N completes is `V5.N.0`.

Long-term intent unchanged from V4 (memory: `project_v4_future_intent.md`): costs / tech-tree, inventoried removal, minion-driven construction, dual catalogue surface, free Y-rotation, move-player tool. None ship in V5; the modal and `WorldEditor` surfaces remain compatible.

---

## Task 1: Larger map envelope

### Objective

Expand the grid from 10×12 to 20×20 cells and recentre the starter room. Pure constants change plus an empty-room browser verify to confirm camera framing still feels right.

### Expected Outcomes

- `GRID_WIDTH = 20`, `GRID_DEPTH = 20`, `STARTER_ROOM = { x0: 7, z0: 7, width: 6, depth: 6 }` in `scripts/app.js`. Starter sits in the centre of the larger envelope with 7 cells of buildable room on each side.
- App boots into the larger envelope with the starter room rendered + the player avatar inside it. Builder camera frames the starter at a reasonable distance.
- All 385 existing tests still pass — none of them hardcode the previous grid dimensions, but verify.

### Risks / Constraints

- BuilderCamera default orbit target / distance was tuned for the smaller grid. Likely still acceptable since the camera follows the player into the starter room on boot, but flagged as a browser-verify concern per design Open Questions. Adjust the `BuilderCamera` defaults only if the framing feels off.
- Tests that hardcode `(cx, cz)` against the 10×12 grid will fail. Update them to use grid-relative coordinates or smaller fixtures.
- The new grid is 4× the cell count of the old one. The empty starter room hasn't grown, so `WallTracer` still produces ~24 walls + 4 corners — no perf concern.

### Steps

- [*] Bump `VERSION` to `V5_1_0` in `scripts/app.js`.
- [*] Change `GRID_WIDTH` to `20` and `GRID_DEPTH` to `20` in `scripts/app.js`.
- [*] Change `STARTER_ROOM` to `{ x0: 7, z0: 7, width: 6, depth: 6 }`.
- [*] Run `npm test`. If any tests fail due to hardcoded grid coordinates, update them to use the new constants or move to relative coordinates.
- [*] Verify in browser: app boots into a 20×20 grid with the starter room centred; player spawns inside; Builder camera shows the starter room at a sensible distance. If the camera looks too far / too close, tune `BuilderCamera` defaults and re-verify.

### Decisions

- Moved `PLAYER_SPAWN_CELL` from `{ cx: 2, cz: 2 }` to `{ cx: 7, cz: 7 }`: keeps the same relative position (SW corner of the starter room) the V4 spawn had. The spawn cell tracks the room offset; the plan didn't call this out explicitly but it's a necessary consequence of recentring the starter.
- No tests required changes: every fixture under `tests/` constructs its own small grid (4×4 / 8×8 / 10×10) rather than reading the app-level constants. 385/385 tests still pass.

---

## Task 2: Vendor LZ-string + `save-codec` module

### Objective

Vendor LZ-string@1.5.0 under `libs/`, load it as a classic-script UMD (the KO pattern), and build the `save-codec` module that encodes a v2 snapshot to a string (dict tables + enum encoding + LZ wrap) and decodes back. Tests-only verification; no user-visible change.

### Expected Outcomes

- `libs/lz-string/lz-string.min.js` exists (copied from `node_modules/lz-string/libs/lz-string.min.js`). `package.json` pins `lz-string` at exactly `1.5.0` in `devDependencies`. CLAUDE.md gains a "LZ-string vendoring" note alongside the existing Three.js note.
- `index.html` loads the LZ-string script tag before the bootstrap module. `window.LZString` is available globally.
- New `scripts/modules/world/save-codec.js` exports four functions: `encodeForStorage(snapshot)`, `decodeForStorage(string)`, `encodeForFile(snapshot)`, `decodeForFile(string)`. Storage variant uses `compressToUTF16` / `decompressFromUTF16`; file variant uses `compressToBase64` / `decompressFromBase64` wrapped in `{ "v": 2, "lz": "<base64>" }`.
- Dictionary tables build deterministically (kinds and components ordered by first-use). Enum encoding handles `side` (south=0, north=1, west=2, east=3) and `corner` (nw=0, ne=1, sw=2, se=3). Round-trip identity verified at the snapshot level.
- New `tests/world/save-codec.test.js` covers: round-trip via both pairs; enum encoding all 4 sides and all 4 corners; missing `v` field on file decode → error; wrong `v` (e.g. 1, 3) → error; garbled LZ blob → error; empty snapshot encodes / decodes cleanly.

### Risks / Constraints

- LZ-string is a classic UMD; in modules, alias as `const LZString = window.LZString;` at the top. Do NOT add it as an ES import — there's no module build in V5.
- Codec is a pure-function module — no class, no state. Follows the "Stateless Utilities" pattern from the JS coding style.
- The snapshot the codec operates on is the v2 in-memory object emitted by `WorldSerializer.toJSON` in Task 3. For this task, fabricate test fixtures inline (the serializer doesn't exist yet in v2 form). Task 3 will swap the test fixtures for round-trips through the real serializer.
- The outer JSON wrapper for file saves must be parseable as JSON by an external tool — i.e. `{ "v": 2, "lz": "..." }` is the entire file content. Don't add stray data outside the wrapper.

### Steps

- [*] Bump `VERSION` to `V5_2_0` in `scripts/app.js`.
- [*] Run `npm install lz-string@1.5.0 --save-dev` (or pin the version manually in `package.json` if it's already present at a different version).
- [*] Copy `node_modules/lz-string/libs/lz-string.min.js` to `libs/lz-string/lz-string.min.js`.
- [*] Add a "LZ-string vendoring" subsection to `.claude/CLAUDE.md` matching the Three.js note's style — pinned version, source path, copy instructions.
- [*] Add `<script src="libs/lz-string/lz-string.min.js"></script>` to `index.html` before the bootstrap `<script type="module">`.
- [*] Create `scripts/modules/world/save-codec.js`. Alias `const LZString = window.LZString;` at the top. Export the four functions described in Expected Outcomes. Internal helpers (private to the module): `buildDict(entities, keySelector)`, `encodeSide(s)` / `decodeSide(n)`, `encodeCorner(c)` / `decodeCorner(n)`, `compactEntities(rawEntities, kindDict, componentDict)`, `expandEntities(compactEntities, kindList, componentList)`.
- [*] Create `tests/world/save-codec.test.js` covering all the cases listed in Expected Outcomes. Use small inline fixtures (a single decor entity, a wall with all 4 sides, a corner with all 4 orientations).
- [*] Run `npm test`. All tests pass; new tests added.
- [*] Verify: no browser-side change. (Smoke-test the LZ-string global in the dev console with the page open: `LZString.decompressFromUTF16(LZString.compressToUTF16("hello"))` should return `"hello"`.)

### Decisions

- Pinned `lz-string` exactly at `1.5.0` via `npm install --save-exact` — no caret / tilde range. Re-vendoring instructions added to CLAUDE.md.
- Used a lazy `lz()` accessor inside the codec (rather than `const LZString = window.LZString;` at module load) so tests can polyfill `window.LZString` in `beforeAll` without fighting module-load order. The browser path is unaffected — `window.LZString` is set by the classic-script tag before the bootstrap module runs.
- Codec is thin: just LZ + outer-JSON framing. Dictionary tables and the per-component enum (`side` / `corner`) encoding will live in `WorldSerializer` (Task 3). The codec exports the enum helpers (`encodeSide` / `decodeSide` / `encodeCorner` / `decodeCorner`) so the serializer can use them. The plan's "internal helpers" list included `buildDict` / `compactEntities` / `expandEntities` — deferred to Task 3 because they only make sense alongside the verbose-snapshot ↔ v2-dict translation, which is the serializer's job.
- Decode paths return `{ snapshot, error }` rather than throwing. Error categories map to user-facing copy ("isn't a Cozy Lairs save", "Save format too old", "corrupted") so callers can hand the string straight to a toast.
- Added an extra `lz` field length-check on the file path's outer wrapper (refuses empty `lz`). Cheap; saves a redundant decompress.
- Tests: 20 new, 405/405 passing. The jsdom env provides `window`; the test polyfills `window.LZString` in `beforeAll` using the same lz-string module the codec uses in production.

---

## Task 3: `WorldSerializer` v2 (drop v1)

### Objective

Replace `WorldSerializer.toJSON` / `fromJSON` with v2 equivalents. `toJSON(world)` emits the dict-encoded v2 snapshot object; `fromJSONv2(world, snapshot, assets)` rebuilds entities from it. The v1 code path is removed entirely (hard cut per design). Tests-only verification.

### Expected Outcomes

- `scripts/modules/world/world-serializer.js` exports `toJSON` (returns the v2 snapshot object — `{ v: 2, kinds, components, entities }`) and `fromJSONv2` (consumes that shape). The `SCHEMA_VERSION` constant is updated to `2`. `fromJSON` (v1 entry point) is removed; only `fromJSONv2` remains.
- `toJSON` builds dict tables by first-use ordering, encodes side / corner enums via the `save-codec` helpers, and emits `entities` as `[[kindIdx, [[compIdx, dataObj], ...]], ...]`.
- `fromJSONv2` reverses the encoding: resolves dict tables, decodes enums, constructs entities via `Entity.fromKind(kindString, assets)`, runs `COMPONENT_BUILDERS[componentName](entity, data)` for each component record, and calls `world.addEntity(entity)`. Unknown kinds / unknown components are collected as warnings — same shape as the V4 `fromJSON` result `{ loaded, skipped, warnings }`.
- World-level entity clear happens at the top of `fromJSONv2` (loop `world.removeEntity` over a snapshot of `world.entities`).
- `tests/world/world-serializer.test.js` updated: drop v1 fixtures, add v2 round-trip tests using both inline fixtures and real-world fixtures (the existing JSON files under `tests/data/`). Add a `WallTracer` reconciliation check — loading a snapshot of floor + walls + corners produces the same wall set the tracer would produce from the floor set alone.

### Risks / Constraints

- `WallTracer` is subscribed to `world.entityAdded` / `entityRemoved`. During `fromJSONv2` the loader removes every entity (firing `entityRemoved` per entity) then re-adds the new set (firing `entityAdded` per entity). `WallTracer` will reconcile naturally — but the test must explicitly verify this (it's load-bearing).
- `fromJSONv2` must NOT re-derive walls itself. Walls in the snapshot are persisted entities just like floor / decor; `WallTracer` produces them on load via the same event-driven path it uses at build time.
- The `Renderable` component is auto-added by `Entity.fromKind`; the loader still skips `Renderable` entries explicitly so existing snapshots that recorded `Renderable` data (defensive) don't double-add.
- The `version` field naming changed from `version` to `v` in v2. Tests that asserted `snapshot.version === 1` need to switch to `snapshot.v === 2`.
- Hard cut means no v1 fallback in this function. A v1 snapshot reaching `fromJSONv2` is treated as malformed (returns a warning); the v1 detection + auto-clear lives in `SaveService` (Task 4).

### Steps

- [*] Bump `VERSION` to `V5_3_0` in `scripts/app.js`.
- [*] Update `SCHEMA_VERSION` in `scripts/modules/world/world-serializer.js` to `2`.
- [*] Rewrite `toJSON(world)` to emit the v2 dict-encoded shape. Use `Map<string, number>` for the kinds dict and components dict during the build; convert to arrays at the end.
- [*] Add per-component data shaping inside `toJSON` (or in a helper): replace `side: "south"` with `side: 0` and `corner: "nw"` with `corner: 0` etc., using the codec's encode helpers.
- [*] Rename `fromJSON` to `fromJSONv2`. Add the dict-decode step that translates `[kindIdx, [[compIdx, data], ...]]` records back to `(kindString, componentName, data)` tuples. Decode enum fields back to strings before passing `data` to `COMPONENT_BUILDERS`.
- [*] Remove all v1-specific code paths and the `{ version: 1 }` snapshot shape support.
- [*] Update `tests/world/world-serializer.test.js`: drop v1 fixtures; add v2 round-trip cases; add the WallTracer reconciliation test.
- [*] Update any snapshot fixtures under `tests/data/` to the v2 shape (regenerate via the new `toJSON` if easier).
- [*] Run `npm test`. All tests pass.
- [*] Verify: no browser-side change yet (boot path still uses `loadFromAutosave` which is updated in Task 4).

### Decisions

- Re-exported `SCHEMA_VERSION` from `save-codec` instead of defining a duplicate in the serializer — single source of truth for the schema number. Both modules already agreed on `2`.
- Found that `CornerPlacement` actually uses uppercase corner names (`"NW"` / `"NE"` / `"SW"` / `"SE"`), not the lowercase forms the design + plan described. Fixed `save-codec`'s `CORNER_NAMES` / `CORNER_INDEX` (and the codec tests) to match the real component values. Same indices, just uppercase.
- Deleted `tests/data/world/empty-room-6x8.json` entirely rather than regenerating it as a v2 fixture. A regenerated fixture would have been tautological with the programmatic round-trip test (`toJSON` produces it → assert `fromJSONv2 → toJSON` equals it). Programmatic + inline tests are cleaner; deleted the JSON file. The fixture's round-trip behaviour is now covered by the "round-trip programmatically built world" + the "every side and corner enum" tests.
- Used `Map<string, number>` for kinds + components dict construction during `toJSON`, with a shared `internIndex` helper. First-use ordering is deterministic for a given world iteration order, which is what the plan asked for.
- Discovered while reviewing the boot path that V4's `App.start()` doesn't actually call `loadFromAutosave` or any v1 loader — there's no auto-resume in V4. The design's "V5 keeps that behaviour" is technically introducing the resume, not preserving it. No code change required in Task 3 (the wireSaveService isn't touched); recorded here so Task 4 can wire the auto-resume call site as a *new* path rather than retrofitting an existing one.
- Tests: 12 new (replaced 8 prior). 409/409 passing (385 prior + 20 codec + 4 net new in serializer).

---

## Task 4: `SaveService` through codec + boot auto-resume

### Objective

Route autosave writes / file saves / autosave restore through `save-codec`. Detect v1 autosaves at boot and silently clear them. Add `clearAutosave()` for use by Task 8 (Reset). Hook the auto-resume path to `fromJSONv2`. Tests + a small browser verify (close + reopen tab → lair persists).

### Expected Outcomes

- `SaveService.writeAutosave` calls `WorldSerializer.toJSON(world)` → `save-codec.encodeForStorage(snapshot)` → `storage.setItem`. Output is a UTF-16 LZ string.
- `SaveService.save` calls `WorldSerializer.toJSON(world)` → `save-codec.encodeForFile(snapshot)` → file write / download. Output file is `{ "v": 2, "lz": "<base64>" }`.
- `SaveService.loadFromAutosave` calls `storage.getItem(AUTOSAVE_KEY)` → `save-codec.decodeForStorage(text)`. On any decode error (bad UTF-16 LZ, missing `v`, wrong `v`), silently calls `storage.removeItem(AUTOSAVE_KEY)` and returns `null`. On success returns the v2 snapshot object.
- New `SaveService.clearAutosave()` method: `storage.removeItem(AUTOSAVE_KEY)`. No event emitted (callers do their own coordination).
- `App.start()` is refactored: extract `buildFreshWorld()` from the current cold-start path (paints starter room + spawns player). `start()` becomes: `if (saveService.loadFromAutosave() returns snapshot) → WorldSerializer.fromJSONv2(world, snapshot, assets)`. Otherwise → `buildFreshWorld()`.
- `tests/engine/save-service.test.js` updated: autosave write produces a UTF-16 LZ string (decompress + JSON-parse it inside the test, assert v2 shape); `loadFromAutosave` returns the snapshot for a v2 string; returns `null` and calls `removeItem` for a v1 string; returns `null` and calls `removeItem` for garbage. Quota-exceeded path still emits `saveFailed`. New: `clearAutosave` removes the key.

### Risks / Constraints

- The autosave key (`cozy-lairs.autosave`) is unchanged — v5 inherits v4's storage slot. The hard cut behaviour is in the *decode* path, not the key.
- `App.start()` previously called `loadFromAutosave` and `fromJSON` (v1) in sequence. Both call sites change in this task — be careful not to leave a v1 reference dangling.
- `buildFreshWorld` extraction: the current cold-start path includes `buildEmptyRoom`-style logic (paint floor cells, spawn player). Move that into a method on `App` so Task 8 (Reset) can call it without duplication. The extraction is mechanical but the method needs a clear seam (call only after `world` is constructed and `WallTracer` is attached).
- The `forceFailNext` debug knob in `SaveService` must still work — it fires before the codec runs.

### Steps

- [*] Bump `VERSION` to `V5_4_0` in `scripts/app.js`.
- [*] Import `save-codec` and `WorldSerializer` into `scripts/modules/engine/save-service.js`. Pass `WorldSerializer.toJSON` (or have callers do so) so the service doesn't statically import the world module — same dependency direction as today.
- [*] Refactor `SaveService.writeAutosave` to: `snapshotObj = getSnapshot()` → `encoded = encodeForStorage(snapshotObj)` → `storage.setItem(AUTOSAVE_KEY, encoded)`. `lastAutosaveSize` records the encoded length.
- [*] Refactor `SaveService.save` similarly using `encodeForFile`. The `json` variable name in the existing FSA / download paths becomes `encoded`; everything else (filename, mime) is unchanged.
- [*] Refactor `SaveService.loadFromAutosave` to decode via `save-codec.decodeForStorage`. On any error or missing `v: 2`, call `storage.removeItem(AUTOSAVE_KEY)` and return `null`. Drop the existing inline `JSON.parse` try/catch — the codec handles parse failures.
- [*] Add `SaveService.clearAutosave()`: `storage.removeItem(AUTOSAVE_KEY)`. Document it as the public knob for Reset.
- [*] Extract `App.buildFreshWorld()` from the existing cold-start path in `App.start()`. The new method paints the starter room and spawns the player. `start()` calls it only when `loadFromAutosave` returns no snapshot.
- [*] Rewrite the autosave-restore call site in `App.start()`: when `loadFromAutosave()` returns a snapshot, call `WorldSerializer.fromJSONv2(world, snapshot, assets)` instead of the old v1 path. If `fromJSONv2` returns warnings, toast a summary.
- [*] Update `tests/engine/save-service.test.js` for the new write / read paths. Storage mocks should observe `setItem` with a UTF-16 LZ string (decompress to verify the shape).
- [*] Run `npm test`. All tests pass.
- [*] Verify in browser: build something in the starter room; refresh the tab; verify the lair restores (auto-resume path through v2 codec). Then manually call `localStorage.setItem("cozy-lairs.autosave", JSON.stringify({version:1, entities:[]}))` in the dev console; refresh; verify the key is silently cleared and the fresh world appears.

### Decisions

- Added `options.skipKinds` to `WorldSerializer.toJSON`. The App's `getSnapshot` passes `skipKinds: [PLAYER_KIND]` ("character.mannequin.medium"). The player avatar has no stateful component (no GridPlacement / Transform / Walker) — only Renderable + Animator — so a naive round-trip would resurrect it as a zombie mesh at (0, 0, 0) with no Animator. Excluding it from the snapshot keeps saves clean; the resume path always re-spawns a fresh player via `spawnPlayer()`. Recorded as a deviation in the plan-level Notable Deviations section because it's an API expansion not in the original Task 4 spec.
- `SaveService` doesn't statically import `WorldSerializer` (the plan said "or have callers do so"). The `getSnapshot` thunk passed in by `App.wireSaveService` bridges them. Keeps the engine layer free of world-layer imports.
- Reordered `App.startInner`: `buildWorld()` now creates only structure (scene + lights + grid + WorldEditor + WallTracer). `wireSaveService()` runs next so `SaveService` exists. Then `loadFromAutosave` decides: if a v2 snapshot is returned, `applyAutosaveSnapshot(snapshot)` runs `fromJSONv2` + `spawnPlayer`; otherwise `buildFreshWorld()` paints the starter + `spawnPlayer`. Both paths end with `spawnPlayer` called exactly once, before `buildCameraControllers` (which reads `this.player`).
- `buildFreshWorld()` replaced the old `seedStarterRoom()` method (same body). Deleted the old method to avoid two near-identical paint-starter helpers.
- `applyAutosaveSnapshot` toasts a single warning summary if `fromJSONv2` returns warnings. Silent on success — auto-resume should feel invisible, not chatty.
- `dumpWorldJSON` (dev console debug action) still calls `toJSON` *without* `skipKinds`. The dev dump should show the full world, including the (unanimated, dev-only) player record.
- Tests: 4 net new (15 total, was 11). 413/413 passing. Two new tests for `loadFromAutosave` clearing v1-raw-JSON and unreadable strings, plus one for `clearAutosave` and a v2 round-trip via mock storage.

---

## Task 5: `ConfirmModal` generic infrastructure

### Objective

Build the generic confirmation modal that Load (Task 7) and Reset (Task 8) both consume. View-model + markup + cozy chrome. Browser verify by manually triggering `show()` from the dev console.

### Expected Outcomes

- New `scripts/modules/ui/confirm-modal.js` exporting `ConfirmModalViewModel`. KO observables: `visible`, `title`, `message`, `actionLabel`. Methods: `show({ title, message, actionLabel, onConfirm })`, `hide()`, `confirm()` (calls the pending `onConfirm` then hides), `cancel()` (just hides).
- New `#confirm-modal` markup in `index.html`: full-viewport backdrop + a centred modal box with `<h2>` (title), `<p>` (message), two buttons (Cancel, action). KO bindings: `visible: visible`, `text: title`, etc.
- Cozy chrome rules in `styles/cozy.css` for `#confirm-modal` (the backdrop overlay + the modal box, using the chunky-chrome formula). Modal sits above other HUD chrome with `z-index`.
- `App` (or the app view-model) holds a single `ConfirmModalViewModel` instance and exposes it on the bound view-model so the markup can reference it.
- CLAUDE.md's in-scope-chrome list is updated to include `#confirm-modal`.
- No new tests yet (no consumer wires a real action) — verification is manual: open dev console, call `App.viewModel.confirmModal.show({...})`, observe the modal.

### Risks / Constraints

- Backdrop click behaviour: clicking outside the modal box does NOT confirm; either cancels (safer) or does nothing. Pick "does nothing" so accidental clicks don't dismiss a destructive prompt without the user seeing the buttons.
- Escape key behaviour: pressing Esc while the modal is visible cancels. Wire via the existing `Input` module's key handling, with the same "ignore when an INPUT/TEXTAREA is focused" gate used by the dev console.
- The modal must NOT block the existing canvas event flow when hidden (visibility: hidden, pointer-events: none). When visible it should capture pointer events on its backdrop to prevent click-through to the canvas.
- z-index ordering: above `#dev-console`? No — the dev console is a developer tool; the modal sits above gameplay HUD chrome but below the fatal overlay. Pick a value in the gap.
- Modal copy uses Lilita One for the heading and Atkinson Hyperlegible for the body, matching the cozy typography. Action button colours follow the existing neon-dim / neon active-state pattern.

### Steps

- [*] Bump `VERSION` to `V5_5_0` in `scripts/app.js`.
- [*] Create `scripts/modules/ui/confirm-modal.js` with `ConfirmModalViewModel`. Observables + methods as described in Expected Outcomes.
- [*] Add `#confirm-modal` markup to `index.html`. Backdrop element + modal box element; KO `visible` binding on the backdrop; KO `text` / `click` bindings inside the box.
- [*] Add cozy-chrome rules for `#confirm-modal` in `styles/cozy.css`. Use existing CSS custom properties (`--cozy-purple-soft`, `--cozy-neon-dim`, etc). Add the chunky drop-shadow recipe to the box.
- [*] Wire the view-model into `App` (instantiate, expose on the bound view-model).
- [*] Wire Escape-to-cancel via `Input`'s key handling, gated against INPUT/TEXTAREA focus.
- [*] Update `.claude/CLAUDE.md`: add `#confirm-modal` to the in-scope-chrome list under "Cozy theme — what's where".
- [*] Run `npm test` (no test changes expected; existing tests still pass).
- [*] Verify in browser: open dev console; call `App.viewModel.confirmModal.show({ title: "Test", message: "Press a button", actionLabel: "Go", onConfirm: () => console.log("confirmed") })`. Modal appears with cozy chrome. Click "Go" — modal hides + console logs. Re-show; click "Cancel" — modal hides, no log. Re-show; press Escape — modal hides.

### Decisions

- `ConfirmModalViewModel` instantiated as a property of `AppViewModel` (`viewModel.confirmModal`) rather than as a separate `App` field. Keeps everything KO-bound under one view-model so the markup's `with: confirmModal` block resolves cleanly without an extra exposure on the App singleton.
- `show()` while a modal is already visible *replaces* the pending callback and message (no queue, no error). Reentrancy is intentional: there's no concurrent destructive-action use case in V5, so "open one, decide on the new one" is the simpler mental model.
- z-index 400 on `#confirm-modal` — above all interactive HUD chrome (toast tray at 300, fps chip at 199, dev console at 100) and below the fatal overlay (1000). Toasts can still appear over the modal but don't block interaction with it.
- Backdrop click does **nothing** (not Cancel). Per the plan's risks section: protects against accidental dismissal of a destructive prompt.
- Escape handler lives on `App` (`wireConfirmModal`) and only fires when `confirmModal.visible()` is true; gated on `isTextInputFocused`. `BuilderInputAdapter`'s separate Escape handler (cancels active tool) cohabits without interference — typical case is "modal is up because user clicked Load/Reset, no tool active", so the builder's branch is a no-op.
- No new tests. ConfirmModal is purely KO + DOM glue with no logic worth unit-testing in node; verification is the manual dev-console check described in the verify step.

---

## Task 6: `SaveService.openFile`

### Objective

Add the file-picker side of the load flow — FSA `showOpenFilePicker` with `<input type="file">` fallback. Read file text, run through `save-codec.decodeForFile`, emit `loadRequested` on success / `loadFailed` on error. No UI wiring yet (Task 7 connects this to the modal); tests-only verification.

### Expected Outcomes

- New `SaveService.openFile()` method. On call: prefers `window.showOpenFilePicker` (single-file selection, accept `.json`). Falls back to programmatically clicking a hidden `<input type="file" accept=".json">` element when FSA is unavailable.
- On user cancellation (AbortError from FSA, or empty file-input change): silently returns without emitting events.
- On file read: `await file.text()` → `save-codec.decodeForFile(text)`. On decode error: emits `loadFailed` with a `SaveError`-style `{ message, cause }` describing the failure ("File is not a Cozy Lairs save", "Save format too old", etc).
- On decode success: emits `loadRequested` with `{ snapshot, fileName }`. The snapshot is the v2 object (NOT yet applied to the world — that's Task 7's modal-confirm step).
- `tests/engine/save-service.test.js` (or a sibling) covers: FSA happy path with a mock File; decode failure path emits `loadFailed`; FSA-unavailable falls back to the `<input>` element (mock the `document.createElement`). All under the jsdom environment.

### Risks / Constraints

- FSA `showOpenFilePicker` returns an array of file handles; pick `[0]` and read via `.getFile()` → `.text()`. Browsers that lack FSA need the `<input>` fallback path.
- The `<input type="file">` fallback must be created on demand (don't add a permanent element to the DOM — keeps `index.html` cleaner). Append, click, await the `change` event, read, remove.
- AbortError on the FSA picker (user cancelled) is silent — do NOT emit `loadFailed` for it; mirrors the existing `save()` behaviour.
- The snapshot is not applied here. Emitting `loadRequested` is just a notification; Task 7 listens.
- Errors carry a user-friendly message — copy lines:
    - Bad outer JSON: "This file isn't a Cozy Lairs save."
    - Missing `v` field or `v !== 2`: "Save format too old — please rebuild this lair in V5."
    - Bad LZ payload: "Save file appears to be corrupted."
- Reuse the existing `Errors.SaveError` class.

### Steps

- [*] Bump `VERSION` to `V5_6_0` in `scripts/app.js`.
- [*] Add `SaveService.openFile()` method. Branch on `supportsFsaPicker()` (existing helper) → FSA path or fallback path.
- [*] Add private helper `openViaFsa()` — `await window.showOpenFilePicker({ types: [{ description: FILE_DESCRIPTION, accept: { [FILE_MIME]: [".json"] } }] })` → read text → decode → emit.
- [*] Add private helper `openViaInput()` — creates a transient `<input type="file" accept=".json">`, appends to body, clicks, awaits `change`, reads file via `FileReader` or `file.text()`, removes the input, decodes, emits.
- [*] Add private helper `handleDecodeResult({ snapshot, error, fileName })` — central emit logic.
- [*] Map error categories to user-facing copy as described in Risks.
- [*] Add tests in `tests/engine/save-service.test.js` (new describe block) using jsdom: mock `window.showOpenFilePicker` → fake File handle → assert `loadRequested` fires with the decoded snapshot; mock a bad payload → assert `loadFailed` fires; remove `showOpenFilePicker` → assert the input-element fallback is triggered.
- [*] Run `npm test`. All tests pass.
- [*] Verify: no browser-side change (no UI calls this yet). Optional smoke-test in dev console: `App.saveService.openFile()` pops the picker; pick the project's `package.json` and assert a `loadFailed` toast (once Task 7 wires the toast — for now just observe the emitter event).

### Decisions

- Branch is on a NEW `supportsFsaOpenPicker()` helper rather than the existing `supportsFsaPicker()` — they check different APIs (`showOpenFilePicker` vs `showSaveFilePicker`). A browser that supports save but not open is unlikely in practice, but the gate should match the actual API being called.
- Renamed the plan's `handleDecodeResult` private helper to `handleOpenedFile(file)`. It does both file-reading (`await file.text()`) and decoding, plus the emit. One method, one consumer; lifting the decode-only logic out wasn't earning its keep.
- The `<input>` fallback's `change` listener uses `{ once: true }`; if the user dismisses the picker without selecting, no event fires — the off-screen input element lingers until the next `openViaInput` call replaces it. Acceptable for a hobby app; cross-browser cancel-detection isn't worth the complexity.
- Reused `Errors.SaveError` for `loadFailed` (rather than a new `LoadError` class). The error is shaped identically (message + cause); a separate class would be churn for no caller benefit. Codec error messages are already user-friendly, so the emit just passes them through.
- Header comment in `save-service.js` updated to document the two new events (`loadRequested`, `loadFailed`).
- Tests: 5 new (was 15, now 20). Total 420/420 passing. The input-fallback test verifies the element is created + clicked and resolves the lingering promise via a fake "no file" change event; full file-reading is covered by the FSA tests since `handleOpenedFile` is shared.

### Decisions

<!-- Filled in during execution. -->

---

## Task 7: Load wiring (Ctrl+O + button + modal-confirm → `fromJSONv2`)

### Objective

Connect `SaveService.openFile()` → `ConfirmModal` → `WorldSerializer.fromJSONv2`. Add the Ctrl+O hotkey + the visible "Load" button in the top-right HUD cluster. Browser verify the end-to-end load flow.

### Expected Outcomes

- Ctrl+O hotkey registered in `App`'s key handling. Calls `event.preventDefault()` to suppress the browser's default open-file dialog. Triggers `saveService.openFile()`.
- New `#load-button` in `index.html`, positioned next to `#save-status-chip` in the top-right HUD. KO bound to a `viewModel.loadFile` method which calls `saveService.openFile()`. Styled via `styles/cozy.css` with the chunky chrome formula.
- App subscribes to `saveService.loadRequested`: calls `confirmModal.show({ title: "Replace lair?", message: "Replace current lair with [filename]? Your current work will be lost.", actionLabel: "Replace", onConfirm: () => applyLoadedSnapshot(snapshot, fileName) })`.
- `applyLoadedSnapshot(snapshot, fileName)`: calls `WorldSerializer.fromJSONv2(world, snapshot, assets)`. On result, toasts a summary ("Loaded N entities from [fileName]"; if warnings, "Loaded N; M skipped"). On exception, toasts `is-error`.
- App subscribes to `saveService.loadFailed`: toasts the error message (severity `is-error`).
- Browser-verifiable end-to-end: save a lair to file via Ctrl+S; build something different; Ctrl+O → pick the file → modal → Replace → lair restored. Cancel path leaves the current lair unchanged. Bad file → error toast.

### Risks / Constraints

- Ctrl+O might be intercepted by Builder camera input. Verify in browser that `event.preventDefault()` actually wins; if Builder camera's pointer focus rules fight the hotkey, dispatch the hotkey at the App level before any per-mode handler runs.
- `WorldSerializer.fromJSONv2` already calls `world.removeEntity` for every existing entity before adding new ones. `WallTracer` reconciles via the entity events. No manual world.clear needed in this path — the loader owns the clear.
- The Load button uses the same chunky chrome formula but should be slightly smaller (a button, not a chip). Use `border-radius: 12px`, neon-dim border, same shadow recipe.
- Load while FirstPerson camera is active: per design Open Questions, the camera mode does NOT change. The new lair appears with the camera still in FirstPerson. Document in the task's Decisions if browser verify suggests otherwise.
- After load, autosave should run on its next tick (existing 30s timer); the new lair becomes the saved state. No manual autosave-after-load call needed unless browser verify shows the load can be reverted by a quick refresh — flag if so.

### Steps

- [*] Bump `VERSION` to `V5_7_0` in `scripts/app.js`.
- [*] Register a Ctrl+O hotkey in `App` (alongside Ctrl+S). Call `event.preventDefault()`. Invoke `this.saveService.openFile()`.
- [*] Add `<button id="load-button">Load</button>` markup in `index.html` next to `#save-status-chip`. KO bind `click: loadFile`.
- [*] Add chrome rules for `#load-button` in `styles/cozy.css`. Match the chip-cluster styling.
- [*] Add `viewModel.loadFile = () => saveService.openFile()` to the App view-model.
- [*] Subscribe to `saveService.loadRequested`: call `confirmModal.show({ ... })` with the load copy.
- [*] Implement `applyLoadedSnapshot(snapshot, fileName)` on `App`: calls `WorldSerializer.fromJSONv2(world, snapshot, assets)`, toasts the result, handles exceptions.
- [*] Subscribe to `saveService.loadFailed`: toast the error message at severity `is-error`.
- [*] Run `npm test`. (No new tests; the end-to-end flow is verified manually.)
- [*] Verify in browser:
    - Save a known lair to file via Ctrl+S; capture the filename.
    - Build something different on top.
    - Press Ctrl+O → file picker opens → pick the saved file → confirm modal appears with the filename in the message → click Replace → lair returns to the saved state. Toast confirms the load count.
    - Save current lair to file; press Ctrl+O → pick the same file → modal shows → click Cancel → world unchanged; no toast about a load.
    - Press Ctrl+O → pick a non-save file (e.g. `package.json`) → error toast appears with "isn't a Cozy Lairs save" copy; world unchanged.
    - Click the Load button instead of Ctrl+O → same flow, modal appears.

### Decisions

- `viewModel.loadFile` attached to `AppViewModel` post-construction (immediately after `new AppViewModel()`, BEFORE `ko.applyBindings`). First attempt put it in `wireSaveService` per the plan, but `ko.applyBindings` evaluates `click: loadFile` during binding setup and threw `ReferenceError: loadFile is not defined`. Moved to right after the view-model is constructed; the shim closes over `this.saveService` and dereferences it lazily on click — safe because `wireSaveService` runs before any user click is possible.
- Load button positioned at `bottom: 3.25rem; right: 1rem;` (just above `#save-status-chip` rather than alongside it) — avoids the chip's variable width pushing the button around as the status text changes ("Saved (12,345 bytes)" vs "Autosaved (...)" etc).
- `applyLoadedSnapshot` reuses the same `SAVE_SKIP_KINDS` filter and minion-rehydration loop that `applyAutosaveSnapshot` runs — extracted nothing because the flows are short and the duplication is two for-loops. If a third consumer arrives we'll lift to a shared helper.
- Toast severity on a successful load with warnings is `warning` (not `info`) — calls attention to the partial-load case so the user can decide whether the warnings matter. Pure success is `info`.
- Plan said "next to `#save-status-chip` in the top-right HUD" — the chip is actually bottom-right (was already that way in V4). Button placed bottom-right too. Updated the plan's Expected Outcomes line in the closeout? No — leaving the original wording so the deviation is visible against the plan.
- Load while in FirstPerson camera mode untested manually but the path doesn't switch modes (per design Open Question default). If browser verify shows it's jarring, the fix is a one-liner in `applyLoadedSnapshot`.
- No new tests. End-to-end is verified manually per the steps below.
- **UX fix during browser verify**: after a Load, the cached FSA file handle from the previous save was still pointing at an unrelated file, so the next Ctrl+S silently wrote the freshly-loaded lair back to it — confusing ("where did that just save?"). Added `SaveService.clearFileHandle()` and called it from `applyLoadedSnapshot` after a successful load. The next Ctrl+S now re-prompts the picker. One new test (`clearFileHandle drops the cached FSA handle...`) brings the total to 421.
- **UX fix — Save button alongside Load**: Ctrl+S was a hidden feature (not surfaced in the HUD). Added a sibling `#save-button` next to `#load-button` and wrapped both in a new `#hud-actions` flex container at bottom-right. Reset button (Task 8) will land in the same container. Refactored the per-button CSS into a shared `#hud-actions button` rule so the three buttons stay visually consistent. Also extended the controls-overlay legend with a `Ctrl + O` row (load was missing). CLAUDE.md chrome list updated to include `#hud-actions` + its children.
- **UX fix — save-status chip flashes on save**: previously the chip sat persistently in the corner showing the most recent state ("Saved (...)" / "Autosaved (...)"); only the byte count changed when an autosave fired silently, easy to miss. Restructured to be hidden by default and pop in for ~3.5 s on each save / autosave / failure event. New `flashSaveStatus(message)` method on `AppViewModel` updates the text + toggles a `saveStatusVisible` observable + restarts a fade timer on each call. The three save-event handlers in `App.wireSaveService` now call `flashSaveStatus` instead of writing to `saveStatus` directly. CSS adds an opacity + tiny upward `translateY` transition for a subtle "pop in" rather than a flat fade.

---

## Task 8: Reset (world.clear + resetLair + Reset button + modal-confirm)

### Objective

Add the Reset button next to Load. Clicking it opens the shared `ConfirmModal`; on confirm, the autosave is cleared, every entity is removed, and the starter room is rebuilt via the `buildFreshWorld` extraction. Browser verify the end-to-end reset flow.

### Expected Outcomes

- New `World.clear()` method on `scripts/modules/world/world.js`. Removes every entity (loop `removeEntity` over a snapshot of `this.entities`). Each removal fires `entityRemoved` so `WallTracer` reconciles to an empty floor set.
- New `App.resetLair()` method: `saveService.clearAutosave()` → `world.clear()` → `this.buildFreshWorld()`.
- New `#reset-button` in `index.html`, positioned next to `#load-button`. KO bound to a `viewModel.resetLair` method that shows the confirm modal.
- `viewModel.resetLair` calls `confirmModal.show({ title: "Reset lair?", message: "Reset to a fresh starter room? Your current work will be lost.", actionLabel: "Reset", onConfirm: () => app.resetLair() })`.
- Styled identically to the Load button. CLAUDE.md's chrome list note already covers it.
- New test: `tests/world/world.test.js` (or wherever) gains a `clear()` case — populated world, call clear, assert `entities.size === 0` + `entityRemoved` was fired N times.
- Browser-verifiable: build something on top of the starter; click Reset → modal → confirm → empty starter restored; current world's autosave is gone (refreshing the tab yields the same fresh starter, not the pre-reset state). Cancel leaves the world untouched.

### Risks / Constraints

- `world.clear()` must iterate over a *copy* of `this.entities` (snapshot) before iterating, because `removeEntity` mutates the underlying collection. The current loader code under `fromJSONv2` already does this; refactor to use the new `world.clear()` method so the loader and reset share one implementation.
- After `world.clear()` fires `entityRemoved` for every entity, the `WallTracer` will end up with empty `this.walls`. Verify in tests that the tracer state stays consistent (no orphaned wall entities).
- `buildFreshWorld()` from Task 4 is the single entry point for "paint the starter + spawn the player" — Reset reuses it verbatim.
- The Reset button colour should NOT use the danger palette (`--cozy-danger`) — Reset is a normal action, not an error. Keep the standard neon-dim border. The destructive-action protection comes from the modal, not the button colour.
- Order matters: clear autosave FIRST, then `world.clear()`, then rebuild. If the rebuild fails for some reason, the autosave is already gone — that's acceptable (the next autosave tick will replace it with the fresh starter).

### Steps

- [*] Bump `VERSION` to `V5_8_0` in `scripts/app.js`.
- [*] Add `World.clear()` to `scripts/modules/world/world.js`: snapshot `Array.from(this.entities)`, iterate, call `this.removeEntity(entity)` per entry.
- [*] Refactor `WorldSerializer.fromJSONv2` to call `world.clear()` instead of its inline removal loop.
- [*] Add `App.resetLair()`: `this.saveService.clearAutosave()` → `this.world.clear()` → `this.buildFreshWorld()`.
- [*] Add `viewModel.resetLair = () => this.confirmModal.show({ ... onConfirm: () => app.resetLair() })`.
- [*] Add `<button id="reset-button">Reset</button>` in `index.html` next to `#load-button`. KO bind `click: resetLair`.
- [*] Add chrome rules for `#reset-button` in `styles/cozy.css` (mirror `#load-button`).
- [*] Add `tests/world/world.test.js` `clear()` case (populated → clear → empty + N `entityRemoved` events).
- [*] Run `npm test`. All tests pass.
- [*] Verify in browser:
    - Build something on top of the starter (paint cells, place decor, spawn a minion).
    - Click Reset → modal appears with the reset copy → click Cancel → world unchanged.
    - Click Reset → confirm → world empties + starter rebuilds + player respawns. No toast clutter on success — the visual change IS the feedback.
    - Refresh the tab → fresh starter persists (autosave was cleared).

### Decisions

- `viewModel.resetLair` attached pre-`applyBindings` alongside `loadFile` / `saveLair` (KO-binding-evaluated-eagerly issue from Task 7). The shim opens the confirm modal directly and passes `() => this.resetLair()` as `onConfirm` — no separate intermediate "open the modal" method, since the open-modal logic and the destructive action are both small.
- `App.resetLair` ALSO clears the FSA file handle (`saveService.clearFileHandle()`) — consistent with the load flow's UX fix. After a reset the user is on a fresh starter; silently writing it back to whatever file they last saved would be confusing in the same way the post-load silent save was.
- No new CSS for `#reset-button` — it inherits the `#hud-actions button` rule added in Task 7. Reset uses the same neon-dim border / neon hover state as Save and Load. Per the plan's Risk note, no `--cozy-danger` styling — the destructive-action protection comes from the modal.
- No success toast on reset (per the verify steps' "the visual change IS the feedback" note). The world emptying + starter reappearing is its own confirmation; an extra toast would be noise.
- Tests: 2 new in `world.test.js` (`clear` removes-and-emits + safe-on-empty). 423/423 passing.

---

## Task 9: Catalogue — three skeleton variants

### Objective

Add Skeleton_Mage, Skeleton_Rogue, Skeleton_Warrior as new `character` manifest entries. Verify Rig_Medium clip parity (each skeleton walks + idles + wanders just like the existing Minion). Browser verify each variant.

### Expected Outcomes

- Three new entries in `assets/manifest.json`: `character.skeleton.mage` → `Skeleton_Mage.glb`, `character.skeleton.rogue` → `Skeleton_Rogue.glb`, `character.skeleton.warrior` → `Skeleton_Warrior.glb`. Each has `kind: "character"`, `displayName: "Skeleton Mage"` / `"Skeleton Rogue"` / `"Skeleton Warrior"`, `tier: "core"`.
- AuthoringPanel's Minions tab automatically picks them up via `AssetManager.listByKind("character")`. Thumbnails render at boot via `IconRenderer`.
- `App.spawnMinion` works unmodified — the kind ID passed in determines the variant; the rig-medium animation libraries already cover all four skeletons.
- Each variant spawned via the panel walks the starter, wanders, and obeys the existing pathing / collision rules.
- No test changes required; the catalogue mechanism is already covered by V4 tests.

### Risks / Constraints

- All four KayKit skeletons bind to Rig_Medium. The existing `MINION_CLIPS` map (Idle_A, Walking_A) should resolve against each variant's cloned skeleton. Verify in browser — if any variant lacks a clip name, the Animator's existing graceful-fallback should keep them static; adjust the clip names per-variant if so (likely not needed).
- Each skeleton's mesh may differ in height — the existing `Walker` + `WanderBehaviour` use grid cells, not mesh bounds, so movement is unaffected. Visual clipping with corner pieces (V4 known gap) applies equally to all variants.
- Thumbnail rendering at boot uses `IconRenderer`'s offscreen renderer. Three more thumbnails = three more renders at boot; perf is fine.
- Naming: keep the dot-id convention (`character.skeleton.<variant>`); displayName follows English title case ("Skeleton Mage").

### Steps

- [*] Bump `VERSION` to `V5_9_0` in `scripts/app.js`.
- [*] Add three entries to `assets/manifest.json` with `id` / `path` / `type` / `tier: "core"` / `kind: "character"` / `displayName` as described in Expected Outcomes.
- [*] Run `npm test`. (No new tests; existing catalogue + manifest tests still pass.)
- [*] Verify in browser:
    - Boot the app. The Minions tab in the AuthoringPanel now shows 4 skeleton tiles (Minion + 3 new). Each tile has a rendered thumbnail.
    - Spawn each variant in turn — each walks and wanders. Idle clip plays when wander pauses.
    - Save + reload via Ctrl+S / Ctrl+O — the spawned variants round-trip correctly (snapshot kind ID resolves to the right asset).
    - If any variant looks static (clip mismatch), document the per-variant clip name in Decisions and update `MINION_CLIPS`.

### Decisions

- All three variants resolve `Idle_A` and `Walking_A` from the Rig_Medium libraries as expected — no per-variant clip-map customisation needed. The `MINION_CLIPS` constant in `WorldEditor` stayed unchanged.
- Manifest entries inserted directly under the existing `character.skeleton.minion` to keep the four skeletons grouped visually in the file.
- No code changes outside the manifest. The catalogue panel + `WorldEditor.spawnMinion` + `collectMinionAnimations` + `IconRenderer` all flow off the manifest's `kind: "character"` annotation.

---

## Task 10: Catalogue — six decors

### Objective

Add six new decor manifest entries: bed, table, chair, candle (triple), chest, bottles. Inspect each KayKit GLTF for footprint quirks and apply `meta.scale` / `meta.yOffset` tweaks where needed. Browser verify each tile renders + places + rotates correctly.

### Expected Outcomes

- Six new entries in `assets/manifest.json`:
    - `decor.bed` → `bed_decorated.gltf`, `kind: "decor.floor"`, `displayName: "Bed"`
    - `decor.table` → `table_medium.gltf`, `kind: "decor.floor"`, `displayName: "Table"`
    - `decor.chair` → `chair.gltf`, `kind: "decor.floor"`, `displayName: "Chair"`
    - `decor.candle.triple` → `candle_triple.gltf`, `kind: "decor.floor"`, `displayName: "Triple Candle"`
    - `decor.chest` → `chest.gltf`, `kind: "decor.floor"`, `displayName: "Chest"`
    - `decor.bottles` → `bottle_A_labeled_brown.gltf`, `kind: "decor.floor"`, `displayName: "Bottles"`
- Each entry tier `core`. Meta tweaks (scale / yOffset / zOffset) applied as needed per individual asset inspection.
- AuthoringPanel's Decor tab shows 8 tiles (original 2 + 6 new). Thumbnails render at boot.
- Each decor can be placed, rotated (Q/E), and removed via the existing tools.
- Save + reload round-trips the new decors via the v2 schema.
- No test changes required.

### Risks / Constraints

- KayKit decor origins vary — some are floor-aligned, some are centred at mid-height. Inspect each GLTF in the asset folder by placing it on a test cell and adjusting `meta.yOffset` until the visible base sits on the floor. Common values: 0 (floor-aligned), ~mesh-half-height (centred).
- `bed_decorated.gltf` is ~2 m × 4 m; a 4 m cell is 4 m × 4 m. Placement uses a single cell — the bed occupies one cell with one side flush. Rotation cycles through the 4 cardinal orientations.
- `table_medium.gltf` may be smaller than a 4 m cell. Accept the visual gap or apply a `meta.scale` tweak if it looks too lonely. Decide during browser verify; document in Decisions.
- Some assets are quite small in 4 m cells (chair, candle). They centre on the cell — acceptable as authoring-grade decor; future versions might add sub-cell precision.
- Adding 6 new catalogue tiles brings the Decor tab to 8 items. Flat-list scrolling is acceptable at this count; subcategory organisation is deferred to a future version (V4+ long-term intent: dual catalogue surface).
- If any decor's footprint genuinely doesn't fit a 4 m cell (e.g. is larger than 4×4 m), document the discovery and pick a different KayKit asset of similar character. The design's pick list is indicative, not contractual.

### Steps

- [*] Bump `VERSION` to `V5_10_0` in `scripts/app.js`.
- [*] Add the six entries to `assets/manifest.json` with the IDs / paths / kinds / displayNames described in Expected Outcomes. Start with no `meta` tweaks — defaults first.
- [*] Run `npm test`. (No new tests; manifest tests still pass.)
- [*] Verify in browser, one decor at a time:
    - The Decor tab shows the new tile with a rendered thumbnail.
    - Selecting the tool + hovering shows the ghost in green on a valid cell, red on an invalid one.
    - Clicking places the decor; the mesh sits at the expected position (visible base on the floor).
    - Q/E rotates through 4 orientations.
    - If the visible base hovers or sinks, adjust `meta.yOffset` in the manifest and re-verify.
    - If the mesh is comically small or large, decide whether to apply `meta.scale` or to swap the KayKit asset.
- [*] Save + reload via Ctrl+S / Ctrl+O — the new decors round-trip correctly. Toast confirms entity count.
- [*] Record any per-decor meta tweaks (yOffset, scale, zOffset) in Decisions for the file-format archaeology.

### Decisions

- All six decors loaded with default meta (no `scale` / `yOffset` / `zOffset` tweaks needed). Bed sits flush, table is mid-cell-sized but acceptable, chair / candle / chest / bottles all rest correctly on the floor at default scale.
- Browser verify surfaced a feature gap: a table on a floor decor catalogue is begging for placeable-on-surface stacking with the candle and bottles. Decided to extend V5 with surface-placement support rather than defer to V6 — see `design-v5-surfaces.md` for the addendum and Tasks 11–13 below.

---

## Task 11: `GridPlacement.surfaceY` field + serialiser round-trip

### Objective

Extend `GridPlacement` with an optional `surfaceY` field that drives the entity's vertical offset and round-trips through the v2 snapshot. Foundation for surface placement; tests-only verification.

### Expected Outcomes

- `GridPlacement` constructor accepts `surfaceY` in its options bag (alongside `walkable` / `blocks`); defaults to `0`.
- `GridPlacement.onAddedToWorld` adds `surfaceY` to `object3D.position.y` after the existing cell-to-world calc.
- `GridPlacement.toJSON` emits `surfaceY` only when non-zero (snapshot stays compact for the floor-decor majority).
- `WorldSerializer.COMPONENT_BUILDERS.GridPlacement` passes `surfaceY` through to the constructor on load.
- `tests/world/components.test.js` covers: default-zero, accept-via-options, position-applied, toJSON-omit-when-zero / include-when-non-zero.
- `tests/world/world-serializer.test.js` covers: round-trip preserves `surfaceY`.

### Risks / Constraints

- No save-schema bump (additive optional field). Snapshots from earlier V5 tasks remain readable — `surfaceY` defaults to 0 if missing from the JSON.
- `onAddedToWorld` runs after Renderable mounts the mesh (Renderable is added first by `Entity.fromKind`). The Y offset on `object3D.position` propagates to the mounted child mesh automatically.
- `surfaceY` is data-only at this stage. WorldEditor doesn't yet set it (Task 12); no decor will appear at non-zero Y in the browser yet.

### Steps

- [*] Bump `VERSION` to `V5_11_0` in `scripts/app.js`.
- [*] Extend `GridPlacement` constructor to read `surfaceY` from the options bag (default `0`); store as `this.surfaceY`.
- [*] Update `onAddedToWorld` to add `this.surfaceY` to the calculated Y position.
- [*] Update `toJSON` to include `surfaceY` only when `this.surfaceY !== 0`.
- [*] Update `WorldSerializer.COMPONENT_BUILDERS.GridPlacement` to pass `surfaceY: data.surfaceY` (or omit when undefined) to the constructor.
- [*] Add the four new `GridPlacement` cases in `tests/world/components.test.js`.
- [*] Add a `surfaceY` round-trip case in `tests/world/world-serializer.test.js`.
- [*] Run `npm test`. All tests pass.
- [*] Verify: no browser-side change yet (no decor sets `surfaceY` until Task 13).

### Decisions

- `onAddedToWorld` sets `o.position.set(x, this.surfaceY, z)` directly rather than `set(x, 0, z)` then adding — same end state, one fewer write. The plan's wording ("add `this.surfaceY` to the calculated Y position") is preserved semantically.
- Constructor validates `surfaceY` is a finite number (rejects `NaN`, `Infinity`, strings) — defensive against accidental bad input from a hand-edited save or future caller. Three new test cases cover the rejections.
- Five new `GridPlacement` tests instead of the planned four: split "default" + "accept-via-options" + "reject-non-finite" + "apply-position" + "toJSON-omit/include" rather than combining; reads cleaner with one assertion per concern.
- 429/429 tests pass (6 new total: 5 components + 1 serializer round-trip).

---

## Task 12: `WorldEditor` surface logic + cascade removal

### Objective

Add surface lookup, surface-placement validation, the shared `getPlacementYFor` helper, and cascade-removal of placeables when a surface is erased. Tests-only verification; no UI change yet.

### Expected Outcomes

- New `WorldEditor.getSurfaceAtCell(cx, cz)` returns the first entity at the cell whose kind's `meta.surface` is set, or `null`.
- New `WorldEditor.getPlacementYFor(kind, cx, cz)` returns the Y the decor should sit at: `surface.meta.surface.surfaceY` if the kind is `placeableOnSurface` AND a surface exists at the cell; otherwise `0`. Shared by `placeDecor` and the ghost-positioning path (Task 13).
- `canPlaceDecor(kind, cx, cz)` branches:
    - If kind is `placeableOnSurface` AND a surface exists at the cell: allowed iff no other surface-placeable already sits there (any entity at the cell with `GridPlacement.surfaceY > 0`).
    - Else: existing floor-decor rules (require floor cell, no decor already there).
- `placeDecor(kind, cx, cz, rotationStep)` uses `getPlacementYFor` to compute `surfaceY`, then constructs `GridPlacement(cx, cz, rotationStep, { surfaceY })`.
- `removeDecor(entity)` cascades when the entity has `meta.surface`: scans entities at the same cell with `GridPlacement.surfaceY > 0` and removes them before removing the surface itself.
- New tests in `tests/world/world-editor.test.js`:
    - `getSurfaceAtCell` returns the surface entity / null.
    - `canPlaceDecor` allows a `placeableOnSurface` kind on a surface cell.
    - `canPlaceDecor` refuses if the surface cell already has a surface-placeable.
    - `canPlaceDecor` refuses a non-`placeableOnSurface` kind on a surface cell.
    - `placeDecor` of a placeable-on-surface kind on a surface cell → entity's `GridPlacement.surfaceY` matches the surface's manifest meta.
    - `placeDecor` of the same kind on a bare floor cell → `surfaceY === 0`.
    - `removeDecor` of a surface entity cascade-removes any `surfaceY > 0` entities at the same cell.
    - `removeDecor` of a placeable directly leaves the surface intact.

### Risks / Constraints

- Tests need fixture manifests with `meta.surface` and `meta.placeableOnSurface` set. The existing test setup pattern (`setup({ "kind.id": { kind, displayName } })`) needs extending to carry through `meta`. Verify the existing `makeStubAssets` helper supports this; extend if not.
- The cascade pass iterates `world.entities` filtered by cell — fine for V5's entity counts. No need to introduce a per-cell index.
- `getPlacementYFor` will be called by both `WorldEditor.placeDecor` (commit time) and `DecorPlaceTool.onCellHover` (preview time) — extract on `WorldEditor` so both stay in sync.
- No new tool variant in this task; existing `decor:place:<kind>` IDs continue to work.

### Steps

- [*] Bump `VERSION` to `V5_12_0` in `scripts/app.js`.
- [*] Add `WorldEditor.getSurfaceAtCell(cx, cz)`.
- [*] Add `WorldEditor.getPlacementYFor(kind, cx, cz)`.
- [*] Modify `WorldEditor.canPlaceDecor` to branch on `placeableOnSurface` + surface presence; preserve existing floor-only behaviour for non-surface-aware kinds.
- [*] Modify `WorldEditor.placeDecor` to read `surfaceY` from `getPlacementYFor` and pass to `GridPlacement`.
- [*] Extend `WorldEditor.removeDecor` with the cascade pass when removing an entity whose kind has `meta.surface`.
- [*] Extend the `tests/world/world-editor.test.js` setup helper to carry `meta` into the stub asset manager (if not already supported).
- [*] Add the eight new test cases listed in Expected Outcomes.
- [*] Run `npm test`. All tests pass.
- [*] Verify: no browser-side change yet (manifest still doesn't mark any entries as surfaces — Task 13).

### Decisions

- Named the helpers `findSurfaceAtCell` / `findSurfacePlaceablesAtCell` (not `getSurfaceAtCell`) to match the existing `findDecorAtCell` / `findBlockAtCell` / `findFloorAtCell` convention in this module. `getPlacementYFor` keeps its `get` prefix because it returns a scalar, not an entity.
- **Surface-placed entities have `blocks: false`** — the surface beneath them owns the cell-blocking. Otherwise removing a surface-placeable directly would call `grid.clearBlocked` and leave the cell unblocked even with the surface still in place. The cascade order (placeables removed before the surface) means blocking is cleared exactly once when the surface is finally removed.
- Updated `findDecorAtCell` to return entities where `placement.blocks || placement.surfaceY > 0` (was just `placement.blocks`). This lets `eraseFloor`'s existing iteration also pick up surface-placed entities; without the change they'd survive the floor erase as orphans. Updated `isPlacedDecor` similarly.
- Added `findSurfacePlaceablesAtCell(cx, cz)` separately rather than overloading `findDecorAtCell` with a filter — it's two clearly-named queries with different intents.
- Cascade in `removeDecor` runs *before* removing the surface itself (matches the wall-decor-cascade pattern in WallTracer). Cascade calls `world.removeEntity` on each placeable directly (not `removeDecor` recursively) — placeables don't have their own cascade behaviour, so the simpler call is sufficient.
- 11 new tests instead of the planned 8: split `placeDecor of a placeable on bare floor → surfaceY === 0` into a separate test (asserting both `surfaceY === 0` AND `blocks === true`); added a `getPlacementYFor` truth-table trio (placeable on surface / placeable on bare floor / non-placeable on surface). 440/440 passing.

---

## Task 13: Manifest annotations + ghost positioning + browser verify

### Objective

Mark `decor.table` as a surface and `decor.candle.triple` + `decor.bottles` as surface-placeable in the manifest. Update `DecorPlaceTool`'s ghost mesh to use `WorldEditor.getPlacementYFor` so previews appear at the correct Y when hovering a surface cell. Browser verify the end-to-end surface-placement flow.

### Expected Outcomes

- `decor.table` gains `meta.surface = { surfaceY: <tuned-value> }` in `assets/manifest.json`. Initial guess `0.85`; tuned via browser inspection of `table_medium.gltf`.
- `decor.candle.triple` and `decor.bottles` gain `meta.placeableOnSurface: true`.
- `DecorPlaceTool.onCellHover` (or wherever the ghost mesh's position is computed) calls `editor.getPlacementYFor(this.kind, cx, cz)` and uses the returned Y when positioning the ghost. The ghost mesh sits on top of a hovered table cell; rests on the floor of bare cells.
- Save + reload via Ctrl+S / Ctrl+O round-trips a candle-on-table correctly (placeable's Y restores from `surfaceY`).
- Browser-verifiable end-to-end:
    - Place a table; place a candle on it. Candle visibly sits on top of the table.
    - Q/E rotates the candle on the surface.
    - Place a candle on bare floor — sits on the floor.
    - Try placing a chair in a table cell → red ghost + refusal toast.
    - Try placing a second candle on a table that already has one → red ghost.
    - Erase the table → both vanish.
    - Save + reload → candle-on-table position restored.

### Risks / Constraints

- `surfaceY` value for `table_medium.gltf` is a guess; tune by trial in the browser. Document the final value in Decisions.
- The candle / bottles assets may have native Y origins that don't sit cleanly on the table top. If so, a per-decor `meta.yOffset` (existing manifest field, read by `Renderable.reattach`) can fine-tune the placement on top of the surface offset. Capture per-decor adjustments in Decisions.
- `DecorPlaceTool` lives at `scripts/modules/builder/tools/decor-tools.js`. Confirm the ghost-positioning code path before editing; the dispatch flow is in CLAUDE.md → "V4 authoring grammar".
- No new tests in this task — the changes are manifest data + a single ghost-positioning line, both verified manually. The underlying logic (Tasks 11 + 12) is already covered.

### Steps

- [*] Bump `VERSION` to `V5_13_0` in `scripts/app.js`.
- [*] Add `meta.surface = { surfaceY: 0.85 }` to `decor.table` in `assets/manifest.json` (initial guess; tune in browser).
- [*] Add `meta.placeableOnSurface: true` to `decor.candle.triple` and `decor.bottles`.
- [*] In `DecorPlaceTool` (or wherever the ghost mesh's Y is set), call `editor.getPlacementYFor(this.kind, cx, cz)` and apply the returned Y to the ghost mesh's position.
- [*] Run `npm test`. All tests pass (no test changes; the underlying logic is covered by Tasks 11 + 12).
- [*] Verify in browser, walking the end-to-end checklist above.
- [*] Tune `surfaceY` (and any per-decor `yOffset` for candle / bottles) until placement looks correct. Record final values in Decisions.

### Decisions

- `decor.table` `surfaceY` tuned from the initial guess of `0.85` to **`1.0`** in the browser. Final manifest line: `"meta": { "surface": { "surfaceY": 1.0 } }`.
- No per-decor `yOffset` adjustments needed for candle or bottles — both sit cleanly on the surface at the tuned table height.
- Extended `Tool.positionGhostAtCell(cx, cz, yOffset = 0)` rather than overriding ghost positioning in `DecorPlaceTool` — keeps the abstraction clean for any future surface-aware tools, default `0` preserves existing tool behaviour.
- **Observation (not blocking V5)**: the ghost mesh hovers `GHOST_Y` (0.18m) above where the placed entity actually ends up. This is the existing offset on `Tool.positionGhostAtCell` to avoid Z-fighting with the 0.15m-tall floor tile (per the `// KayKit floor_tile_large is 0.15m tall — ghost sits above it.` comment in `tool.js`). For surface placement the Z-fighting concern doesn't apply, so the offset is purely cosmetic. User flagged but accepted the visual gap — recorded here as a potential future polish (suppress `GHOST_Y` when `yOffset > 0`, or remove the float entirely once the original Z-fighting case is re-evaluated).

---

### Notable Deviations from Design

- **Mid-execution scope expansion: surface placement (Tasks 11–13).** Not in the original design or plan. After Task 10 (six decors) shipped a table alongside candle + bottles, the missing "candle on table" feature was an obvious gap. Added a design addendum (`design-v5-surfaces.md`) and three implementation tasks rather than deferring to V6. V5 catalogue scope grew from "9-10 lean entries" to "9-10 entries + new placement mechanic"; manifest schema grew with two optional `meta` fields (`surface`, `placeableOnSurface`); `GridPlacement` gained a `surfaceY` field. No save schema bump (additive optional field).
- **Task 4 — `WorldSerializer.toJSON` gained an `options.skipKinds` parameter.** Not anticipated in the design or plan. Discovered during Task 4 that the player avatar (Mannequin) has no stateful component, so a naive save → autosave-restore would resurrect it as a zombie static mesh at origin. Cleanest fix is to exclude the player kind from the snapshot and re-spawn it fresh on every load. `skipKinds` is a generic option (any kind list); App passes `[PLAYER_KIND]`. The design's "load lair → re-spawn player" behaviour is preserved; just the mechanism is via skip-list instead of post-load filtering.
- **Task 3 — `tests/data/world/empty-room-6x8.json` deleted rather than regenerated.** Plan suggested regenerating to v2 shape; chose to drop entirely because a regenerated fixture would be tautological with the programmatic round-trip test. Round-trip coverage moved to inline-fixture tests in `world-serializer.test.js`.

---

### Issues and Adjustments

**Task 4 — Save size mismatch (file ≈ 2.7× autosave size in the status chip).** Both `saved` and `autosaved` events were reporting `encoded.length` labelled as "bytes", but the encodings have different bytes-per-char in their storage media: UTF-16 LZ packs ~15 bits per 16-bit char (so each char = 2 bytes in `localStorage`), while base64-in-JSON is ASCII (1 byte per char). With both reported as `encoded.length`, the file form looked ~2.7× larger when in actual bytes it's only ~33% larger. Fixed in `SaveService.writeAutosave` to report `encoded.length * 2` for the autosave and the quota-error message; the file path's `encoded.length` is already the byte count.

**Task 4 — Minions broken on auto-resume (walked in a straight line until hitting a wall).** Minion entities round-tripped Renderable + Walker only. They lacked:
- A position component → entity respawned at world origin (0, 0, 0), not at its saved cell.
- Animator (no `toJSON`) → no idle / walking clip on reload (visible T-pose).
- WanderBehaviour (no `toJSON`) → no random walking + no self-rescue when blocked.

Walker's `pendingFollow` (the path stored at save time) was still in the snapshot, so on reload the minion would start at the corner of the grid and march along the stale path through whatever lay between origin and its first stored cell — straight through walls — until it ran out of path. Without WanderBehaviour, it never got a fresh target.

Fix (three parts):
1. `WorldEditor.buildMinionEntity` now adds a `Transform` component *before* the Walker. Transform's `toJSON` captures `object3D.position`; its `applyJSON` restores it during `fromJSONv2` *before* the world's `entityAdded` event fires, so `Walker.onAddedToWorld` reads the correct position when it registers cell occupancy.
2. New `WorldEditor.rehydrateMinion(entity)` re-attaches `Animator` (with the correct clip-map + animation array from `collectMinionAnimations`) and `WanderBehaviour`, then runs each component's `onAddedToWorld` manually (since `Entity.addComponent` only calls `attach`). Idle crossfade fires post-attach so the minion animates immediately on resume.
3. `App.applyAutosaveSnapshot` walks the loaded entity set after `fromJSONv2` and calls `worldEditor.rehydrateMinion` on each minion entity (`isMinionEntity` predicate already existed).

Net result: minions reload at their saved position, animate idle / walk correctly, and resume wandering after their last stored path completes.

No new tests for either fix — both are integration-shaped (one binds an Animator instance to a fresh skinned-mesh clone; the other depends on actual byte-level counting against a live `localStorage`). Browser verify per Task 4's verify step covers the end-to-end behaviour.

**Task 4 — loaded walls couldn't be knocked down.** Painting a floor next to a wall *should* trigger a retrace that removes the wall (the edge no longer has "exactly one side is floor"). It wasn't happening for any wall in a freshly-loaded snapshot: subsequent painting in V5 left the wall in place. Reload reproduced the symptom — walls added since the last reload became un-knock-downable.

First-pass cause analysis was wrong. The first fix added a `WallTracer.hydrate()` that scanned the world after `fromJSONv2` and rebuilt the index maps. This made *walls* work (each map entry is an array, so duplicates collapse correctly) but the underlying problem was deeper and surfaced for *corners*: half-walls and corner pieces still misbehaved after the supposed fix.

Real cause: `WallTracer` subscribes to `world.entityAdded`. During `fromJSONv2`, each floor entity from the snapshot triggers the tracer's reaction, which builds the floor's walls + corners from current topology. **Then** the snapshot's own wall + corner entities are added on top. The world ends up with two complete sets of walls + corners. `hydrate` rebuilds the maps by scanning all entities — wall entries push to a shared bucket so the duplication is invisible at the index level, but corner entries use `.set(key, entity)` which overwrites, leaving one corner of each duplicate pair indexed and the other orphaned in the world. Subsequent retraces remove the indexed corner but the orphan persists, leading to corner-shaped half-wall mismatches and "the corner-touching edges don't update properly."

Root-cause fix: don't persist derived data. Walls (`wall.stone.straight`, `wall.stone.half`) and corner pieces (`wall.stone.corner`) are entirely produced by `WallTracer` from floor topology — same way the player avatar (Task 4 deviation) is regenerated rather than serialised. New `SAVE_SKIP_KINDS` constant in `app.js` lists `PLAYER_KIND` + the three wall / corner kinds. `getSnapshot` passes it to `WorldSerializer.toJSON`. `fromJSONv2` now also accepts an `options.skipKinds` parameter so legacy snapshots (which still carry wall + corner entries) are filtered on load — without that, the original duplication bug recurs every time a stale autosave is opened. `App.applyAutosaveSnapshot` passes the same list to `fromJSONv2`.

`WallTracer.hydrate()` is removed (it was treating the symptom, not the cause; the index maps now populate correctly via the tracer's normal reactions to floor `entityAdded` events during load). Its two tests are removed in favour of two new tests on `WorldSerializer`'s `skipKinds` option (`toJSON` and `fromJSONv2` paths). 415/415 passing.
