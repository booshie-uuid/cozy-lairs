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

- [ ] Bump `VERSION` to `V5_1_0` in `scripts/app.js`.
- [ ] Change `GRID_WIDTH` to `20` and `GRID_DEPTH` to `20` in `scripts/app.js`.
- [ ] Change `STARTER_ROOM` to `{ x0: 7, z0: 7, width: 6, depth: 6 }`.
- [ ] Run `npm test`. If any tests fail due to hardcoded grid coordinates, update them to use the new constants or move to relative coordinates.
- [ ] Verify in browser: app boots into a 20×20 grid with the starter room centred; player spawns inside; Builder camera shows the starter room at a sensible distance. If the camera looks too far / too close, tune `BuilderCamera` defaults and re-verify.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V5_2_0` in `scripts/app.js`.
- [ ] Run `npm install lz-string@1.5.0 --save-dev` (or pin the version manually in `package.json` if it's already present at a different version).
- [ ] Copy `node_modules/lz-string/libs/lz-string.min.js` to `libs/lz-string/lz-string.min.js`.
- [ ] Add a "LZ-string vendoring" subsection to `.claude/CLAUDE.md` matching the Three.js note's style — pinned version, source path, copy instructions.
- [ ] Add `<script src="libs/lz-string/lz-string.min.js"></script>` to `index.html` before the bootstrap `<script type="module">`.
- [ ] Create `scripts/modules/world/save-codec.js`. Alias `const LZString = window.LZString;` at the top. Export the four functions described in Expected Outcomes. Internal helpers (private to the module): `buildDict(entities, keySelector)`, `encodeSide(s)` / `decodeSide(n)`, `encodeCorner(c)` / `decodeCorner(n)`, `compactEntities(rawEntities, kindDict, componentDict)`, `expandEntities(compactEntities, kindList, componentList)`.
- [ ] Create `tests/world/save-codec.test.js` covering all the cases listed in Expected Outcomes. Use small inline fixtures (a single decor entity, a wall with all 4 sides, a corner with all 4 orientations).
- [ ] Run `npm test`. All tests pass; new tests added.
- [ ] Verify: no browser-side change. (Smoke-test the LZ-string global in the dev console with the page open: `LZString.decompressFromUTF16(LZString.compressToUTF16("hello"))` should return `"hello"`.)

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V5_3_0` in `scripts/app.js`.
- [ ] Update `SCHEMA_VERSION` in `scripts/modules/world/world-serializer.js` to `2`.
- [ ] Rewrite `toJSON(world)` to emit the v2 dict-encoded shape. Use `Map<string, number>` for the kinds dict and components dict during the build; convert to arrays at the end.
- [ ] Add per-component data shaping inside `toJSON` (or in a helper): replace `side: "south"` with `side: 0` and `corner: "nw"` with `corner: 0` etc., using the codec's encode helpers.
- [ ] Rename `fromJSON` to `fromJSONv2`. Add the dict-decode step that translates `[kindIdx, [[compIdx, data], ...]]` records back to `(kindString, componentName, data)` tuples. Decode enum fields back to strings before passing `data` to `COMPONENT_BUILDERS`.
- [ ] Remove all v1-specific code paths and the `{ version: 1 }` snapshot shape support.
- [ ] Update `tests/world/world-serializer.test.js`: drop v1 fixtures; add v2 round-trip cases; add the WallTracer reconciliation test.
- [ ] Update any snapshot fixtures under `tests/data/` to the v2 shape (regenerate via the new `toJSON` if easier).
- [ ] Run `npm test`. All tests pass.
- [ ] Verify: no browser-side change yet (boot path still uses `loadFromAutosave` which is updated in Task 4).

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V5_4_0` in `scripts/app.js`.
- [ ] Import `save-codec` and `WorldSerializer` into `scripts/modules/engine/save-service.js`. Pass `WorldSerializer.toJSON` (or have callers do so) so the service doesn't statically import the world module — same dependency direction as today.
- [ ] Refactor `SaveService.writeAutosave` to: `snapshotObj = getSnapshot()` → `encoded = encodeForStorage(snapshotObj)` → `storage.setItem(AUTOSAVE_KEY, encoded)`. `lastAutosaveSize` records the encoded length.
- [ ] Refactor `SaveService.save` similarly using `encodeForFile`. The `json` variable name in the existing FSA / download paths becomes `encoded`; everything else (filename, mime) is unchanged.
- [ ] Refactor `SaveService.loadFromAutosave` to decode via `save-codec.decodeForStorage`. On any error or missing `v: 2`, call `storage.removeItem(AUTOSAVE_KEY)` and return `null`. Drop the existing inline `JSON.parse` try/catch — the codec handles parse failures.
- [ ] Add `SaveService.clearAutosave()`: `storage.removeItem(AUTOSAVE_KEY)`. Document it as the public knob for Reset.
- [ ] Extract `App.buildFreshWorld()` from the existing cold-start path in `App.start()`. The new method paints the starter room and spawns the player. `start()` calls it only when `loadFromAutosave` returns no snapshot.
- [ ] Rewrite the autosave-restore call site in `App.start()`: when `loadFromAutosave()` returns a snapshot, call `WorldSerializer.fromJSONv2(world, snapshot, assets)` instead of the old v1 path. If `fromJSONv2` returns warnings, toast a summary.
- [ ] Update `tests/engine/save-service.test.js` for the new write / read paths. Storage mocks should observe `setItem` with a UTF-16 LZ string (decompress to verify the shape).
- [ ] Run `npm test`. All tests pass.
- [ ] Verify in browser: build something in the starter room; refresh the tab; verify the lair restores (auto-resume path through v2 codec). Then manually call `localStorage.setItem("cozy-lairs.autosave", JSON.stringify({version:1, entities:[]}))` in the dev console; refresh; verify the key is silently cleared and the fresh world appears.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V5_5_0` in `scripts/app.js`.
- [ ] Create `scripts/modules/ui/confirm-modal.js` with `ConfirmModalViewModel`. Observables + methods as described in Expected Outcomes.
- [ ] Add `#confirm-modal` markup to `index.html`. Backdrop element + modal box element; KO `visible` binding on the backdrop; KO `text` / `click` bindings inside the box.
- [ ] Add cozy-chrome rules for `#confirm-modal` in `styles/cozy.css`. Use existing CSS custom properties (`--cozy-purple-soft`, `--cozy-neon-dim`, etc). Add the chunky drop-shadow recipe to the box.
- [ ] Wire the view-model into `App` (instantiate, expose on the bound view-model).
- [ ] Wire Escape-to-cancel via `Input`'s key handling, gated against INPUT/TEXTAREA focus.
- [ ] Update `.claude/CLAUDE.md`: add `#confirm-modal` to the in-scope-chrome list under "Cozy theme — what's where".
- [ ] Run `npm test` (no test changes expected; existing tests still pass).
- [ ] Verify in browser: open dev console; call `App.viewModel.confirmModal.show({ title: "Test", message: "Press a button", actionLabel: "Go", onConfirm: () => console.log("confirmed") })`. Modal appears with cozy chrome. Click "Go" — modal hides + console logs. Re-show; click "Cancel" — modal hides, no log. Re-show; press Escape — modal hides.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V5_6_0` in `scripts/app.js`.
- [ ] Add `SaveService.openFile()` method. Branch on `supportsFsaPicker()` (existing helper) → FSA path or fallback path.
- [ ] Add private helper `openViaFsa()` — `await window.showOpenFilePicker({ types: [{ description: FILE_DESCRIPTION, accept: { [FILE_MIME]: [".json"] } }] })` → read text → decode → emit.
- [ ] Add private helper `openViaInput()` — creates a transient `<input type="file" accept=".json">`, appends to body, clicks, awaits `change`, reads file via `FileReader` or `file.text()`, removes the input, decodes, emits.
- [ ] Add private helper `handleDecodeResult({ snapshot, error, fileName })` — central emit logic.
- [ ] Map error categories to user-facing copy as described in Risks.
- [ ] Add tests in `tests/engine/save-service.test.js` (new describe block) using jsdom: mock `window.showOpenFilePicker` → fake File handle → assert `loadRequested` fires with the decoded snapshot; mock a bad payload → assert `loadFailed` fires; remove `showOpenFilePicker` → assert the input-element fallback is triggered.
- [ ] Run `npm test`. All tests pass.
- [ ] Verify: no browser-side change (no UI calls this yet). Optional smoke-test in dev console: `App.saveService.openFile()` pops the picker; pick the project's `package.json` and assert a `loadFailed` toast (once Task 7 wires the toast — for now just observe the emitter event).

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

- [ ] Bump `VERSION` to `V5_7_0` in `scripts/app.js`.
- [ ] Register a Ctrl+O hotkey in `App` (alongside Ctrl+S). Call `event.preventDefault()`. Invoke `this.saveService.openFile()`.
- [ ] Add `<button id="load-button">Load</button>` markup in `index.html` next to `#save-status-chip`. KO bind `click: loadFile`.
- [ ] Add chrome rules for `#load-button` in `styles/cozy.css`. Match the chip-cluster styling.
- [ ] Add `viewModel.loadFile = () => saveService.openFile()` to the App view-model.
- [ ] Subscribe to `saveService.loadRequested`: call `confirmModal.show({ ... })` with the load copy.
- [ ] Implement `applyLoadedSnapshot(snapshot, fileName)` on `App`: calls `WorldSerializer.fromJSONv2(world, snapshot, assets)`, toasts the result, handles exceptions.
- [ ] Subscribe to `saveService.loadFailed`: toast the error message at severity `is-error`.
- [ ] Run `npm test`. (No new tests; the end-to-end flow is verified manually.)
- [ ] Verify in browser:
    - Save a known lair to file via Ctrl+S; capture the filename.
    - Build something different on top.
    - Press Ctrl+O → file picker opens → pick the saved file → confirm modal appears with the filename in the message → click Replace → lair returns to the saved state. Toast confirms the load count.
    - Save current lair to file; press Ctrl+O → pick the same file → modal shows → click Cancel → world unchanged; no toast about a load.
    - Press Ctrl+O → pick a non-save file (e.g. `package.json`) → error toast appears with "isn't a Cozy Lairs save" copy; world unchanged.
    - Click the Load button instead of Ctrl+O → same flow, modal appears.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V5_8_0` in `scripts/app.js`.
- [ ] Add `World.clear()` to `scripts/modules/world/world.js`: snapshot `Array.from(this.entities)`, iterate, call `this.removeEntity(entity)` per entry.
- [ ] Refactor `WorldSerializer.fromJSONv2` to call `world.clear()` instead of its inline removal loop.
- [ ] Add `App.resetLair()`: `this.saveService.clearAutosave()` → `this.world.clear()` → `this.buildFreshWorld()`.
- [ ] Add `viewModel.resetLair = () => this.confirmModal.show({ ... onConfirm: () => app.resetLair() })`.
- [ ] Add `<button id="reset-button">Reset</button>` in `index.html` next to `#load-button`. KO bind `click: resetLair`.
- [ ] Add chrome rules for `#reset-button` in `styles/cozy.css` (mirror `#load-button`).
- [ ] Add `tests/world/world.test.js` `clear()` case (populated → clear → empty + N `entityRemoved` events).
- [ ] Run `npm test`. All tests pass.
- [ ] Verify in browser:
    - Build something on top of the starter (paint cells, place decor, spawn a minion).
    - Click Reset → modal appears with the reset copy → click Cancel → world unchanged.
    - Click Reset → confirm → world empties + starter rebuilds + player respawns. No toast clutter on success — the visual change IS the feedback.
    - Refresh the tab → fresh starter persists (autosave was cleared).

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V5_9_0` in `scripts/app.js`.
- [ ] Add three entries to `assets/manifest.json` with `id` / `path` / `type` / `tier: "core"` / `kind: "character"` / `displayName` as described in Expected Outcomes.
- [ ] Run `npm test`. (No new tests; existing catalogue + manifest tests still pass.)
- [ ] Verify in browser:
    - Boot the app. The Minions tab in the AuthoringPanel now shows 4 skeleton tiles (Minion + 3 new). Each tile has a rendered thumbnail.
    - Spawn each variant in turn — each walks and wanders. Idle clip plays when wander pauses.
    - Save + reload via Ctrl+S / Ctrl+O — the spawned variants round-trip correctly (snapshot kind ID resolves to the right asset).
    - If any variant looks static (clip mismatch), document the per-variant clip name in Decisions and update `MINION_CLIPS`.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V5_10_0` in `scripts/app.js`.
- [ ] Add the six entries to `assets/manifest.json` with the IDs / paths / kinds / displayNames described in Expected Outcomes. Start with no `meta` tweaks — defaults first.
- [ ] Run `npm test`. (No new tests; manifest tests still pass.)
- [ ] Verify in browser, one decor at a time:
    - The Decor tab shows the new tile with a rendered thumbnail.
    - Selecting the tool + hovering shows the ghost in green on a valid cell, red on an invalid one.
    - Clicking places the decor; the mesh sits at the expected position (visible base on the floor).
    - Q/E rotates through 4 orientations.
    - If the visible base hovers or sinks, adjust `meta.yOffset` in the manifest and re-verify.
    - If the mesh is comically small or large, decide whether to apply `meta.scale` or to swap the KayKit asset.
- [ ] Save + reload via Ctrl+S / Ctrl+O — the new decors round-trip correctly. Toast confirms entity count.
- [ ] Record any per-decor meta tweaks (yOffset, scale, zOffset) in Decisions for the file-format archaeology.

### Decisions

<!-- Filled in during execution. -->

---

### Notable Deviations from Design

<!-- Filled in during execution. -->

---

### Issues and Adjustments

<!-- Filled in during execution based on testing and user feedback. -->
