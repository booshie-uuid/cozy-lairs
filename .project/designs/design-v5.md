# Design V5 — Catalogue Lean Expansion, Compact Saves, Load-from-File
Date: 2026-05-13

> **Addendum:** [design-v5-surfaces.md](./design-v5-surfaces.md) extends V5 with surface-placement support (mark some decor as surfaces, others as surface-placeable). Added mid-execution after Task 10 (six decors) revealed that the table + candle + bottles trio cried out for stacking. Read alongside this document.

## Summary

V5 layers a set of small-to-medium improvements on the V4 Build Mode MVP:

1. A lean catalogue expansion (~9-10 new entries) — three furniture pieces, three atmosphere/clutter pieces, and the three missing KayKit skeleton variants.
2. A schema-v2 save format that combines dictionary tables for repeated strings (kind IDs, component class names, side / corner enums) with an LZ-string wrap for further compression. Designed to keep autosaves comfortably under the localStorage quota and shrink file-saves alike.
3. A user-initiated **Load from File** path (Ctrl+O hotkey + visible button) with a confirmation modal before replacing the on-screen lair.
4. **Auto-resume from localStorage** on boot when a v2 autosave is present (effectively the start of a future "Resume" feature), paired with a **Reset** button that clears the autosave and rebuilds the starter room.
5. A larger authoring envelope — grid grows from 10×12 to **20×20** cells. Starter room stays 6×6 but recentres to offset (7, 7). Gives room to experiment with the new decor and a meatier baseline for save-size measurements.

Hard cut on schema: V1 autosaves are auto-cleared on boot; V1 files surface a toast and refuse to load.

---

## Architecture

### Catalogue expansion (lean / balanced mix)

Nine new manifest entries, all `tier: "core"` (preloaded) since the catalogue is small:

**Floor decor (`kind: "decor.floor"`)**:

| id | KayKit asset | Notes |
|---|---|---|
| `decor.bed` | `bed_decorated.gltf` | Inspect native footprint; may need `meta.scale` to fit a single cell. |
| `decor.table` | `table_medium.gltf` | Mid-size — fits the 4 m cell. |
| `decor.chair` | `chair.gltf` | Small, floor-aligned, likely no meta tweaks. |
| `decor.candle.triple` | `candle_triple.gltf` | Atmosphere/clutter piece. |
| `decor.chest` | `chest.gltf` | "Treasury" vocabulary. |
| `decor.bottles` | `bottle_A_labeled_brown.gltf` | Tabletop clutter. |

**Characters (`kind: "character"`)**:

| id | KayKit asset |
|---|---|
| `character.skeleton.mage` | `Skeleton_Mage.glb` |
| `character.skeleton.rogue` | `Skeleton_Rogue.glb` |
| `character.skeleton.warrior` | `Skeleton_Warrior.glb` |

All three skeletons bind to **Rig_Medium**, so the existing `MINION_CLIPS` map and the rig-medium animation libraries cover them with no new clip-loading work — `App.spawnMinion` already merges the per-character clips with the rig libraries.

No new component shapes; existing `GridPlacement` + `Walker` + `WanderBehaviour` + `Animator` cover everything.

### Save compaction (schema v2)

Three transforms applied in order:

**1. Dictionary tables.** A snapshot becomes:

```json
{
  "v": 2,
  "kinds":      ["decor.barrel", "decor.crate", "wall.stone.straight", "..."],
  "components": ["Transform", "GridPlacement", "EdgePlacement", "..."],
  "entities":   [ [<kindIdx>, [[<compIdx>, {data}], ...]], ... ]
}
```

`kinds` and `components` are de-duped, ordered by first-use. Entities reference by index. Field names inside component data records stay readable (`cx`, `cz`, `rotationStep`, `walkable`) — the LZ pass handles their redundancy.

**2. Enum encoding.** Two enums repeat heavily across walls / wall-decor / corner pieces:

- `side` — `"south"` → 0, `"north"` → 1, `"west"` → 2, `"east"` → 3.
- `corner` — `"nw"` → 0, `"ne"` → 1, `"sw"` → 2, `"se"` → 3.

Encoded by the codec; decoded back to strings before being passed to component constructors.

**3. LZ-string wrap.** The inner JSON is compressed with LZ-string@1.5.0 (vendored under `libs/lz-string/lz-string.min.js`, loaded as a classic `<script>` UMD and aliased as `const LZString = window.LZString;` in modules — same pattern as KO).

- **Autosave (localStorage)**: `LZString.compressToUTF16(json)`. UTF-16 packs ~15 bits per char, the densest mode for `localStorage`'s native string storage.
- **File save**: outer wrapper `{ "v": 2, "lz": "<compressed-base64>" }`, then `JSON.stringify`. The file stays valid JSON, advertises its version up front, and is parseable by any JSON tool — only the inner payload is opaque.

### Load function

A new `SaveService.openFile()` method:

1. If `window.showOpenFilePicker` is available, open the FSA picker. Otherwise fall back to a hidden `<input type="file" accept=".json">` triggered programmatically.
2. Read the chosen file → pass bytes to `save-codec.decode(text)`.
3. On any decode error (bad JSON, missing `v`, v1 payload, bad LZ blob): emit `loadFailed` → toast.
4. On success: emit `loadRequested` with `{ snapshot, fileName }`. The App opens the confirmation modal.
5. On modal confirm: `WorldSerializer.fromJSONv2(world, snapshot, assets)`. Existing entities are removed; new entities reconstructed via `Entity.fromKind`. Emits the existing `entityAdded` chatter so `WallTracer` auto-rebuilds walls correctly.
6. On modal cancel: no-op.

Triggers:

- **Hotkey**: Ctrl+O. Registered in `App` alongside Ctrl+S; calls `event.preventDefault()` to suppress the browser's default "open file" handler.
- **Visible button**: small "Load" button next to `#save-status-chip` in the top-right HUD. Uses the cozy chunky-chrome formula (neon-dim border, chunky shadow). KO-bound to a `App.viewModel.loadFile` method.

### Auto-resume + Reset

**Auto-resume.** Already implicit in V4: `App.start()` calls `SaveService.loadFromAutosave()` and restores the snapshot if one exists. V5 keeps that behaviour, gated on `v: 2`. The codec's `decode` is shared by the autosave-restore path and the file-load path so version detection is identical. This is the seed of a future "Resume" feature (which will probably grow into a roster of named slots), but V5 ships it as the single, automatic boot path.

**Reset.** New `App.resetLair()` method. Behaviour:

1. Open the same confirmation modal: title "Reset lair?", message "Reset to a fresh starter room? Your current work will be lost.", action button "Reset".
2. On confirm: `saveService.clearAutosave()` (new) → `world.clear()` (remove every entity) → `App.buildFreshWorld()` (extracted from the existing `App.start()` cold-start path; paints the starter room, drops in the player avatar).

Triggers:

- **Visible button**: small "Reset" button next to the Load button in the top-right HUD cluster. Same chunky chrome.

The confirmation modal is shared with the Load flow — a single generic `ConfirmModal` view-model handles both. See Components.

---

## Components

### New / changed files

- **`assets/manifest.json`** — nine new entries (six decors + three skeleton characters). Each gets `kind` + `displayName` + optional `meta` tweaks.
- **`scripts/modules/world/save-codec.js`** (NEW) — pure-function module. Exports `encode(snapshot)` and `decode(text)`. Owns dictionary table building, enum encoding, LZ wrap. Single responsibility: snapshot ↔ string.
- **`scripts/modules/world/world-serializer.js`** — `toJSON` returns the dictionary-encoded v2 snapshot; `fromJSONv2(world, snapshot, assets)` reconstructs entities from it. The v1 path is **gone** entirely (hard cut, no migration code).
- **`scripts/modules/engine/save-service.js`** — `writeAutosave` and `save` now route through `save-codec.encode`. `loadFromAutosave` detects v1 strings (anything that doesn't decompress + parse to `v: 2`) and silently clears them via `storage.removeItem(AUTOSAVE_KEY)`. New `openFile()` method handles FSA / fallback, emits `loadRequested` / `loadFailed`. New `clearAutosave()` method removes the autosave key.
- **`scripts/modules/ui/confirm-modal.js`** (NEW) — generic confirmation modal. KO view-model with `show({ title, message, actionLabel, onConfirm })` and `hide()`. Used by both Load (Replace) and Reset. Two bound buttons (Cancel / action).
- **`index.html`** — markup for `#confirm-modal` (KO-bound, shared) plus the `#load-button` and `#reset-button` next to `#save-status-chip`.
- **`styles/cozy.css`** — chrome rules for the modal + the two new buttons. Add `#confirm-modal` to the in-scope list comment in CLAUDE.md.
- **`scripts/app.js`** — grid constants change (`GRID_WIDTH = 20`, `GRID_DEPTH = 20`, `STARTER_ROOM = { x0: 7, z0: 7, width: 6, depth: 6 }`). Extract a `buildFreshWorld()` method from the existing cold-start path; call it from `start()` (when no autosave) and from `resetLair()`. Register Ctrl+O hotkey; wire `SaveService.openFile()` ↔ modal ↔ `fromJSONv2`. Add `resetLair()` and the view-model methods that the new buttons bind to. `VERSION` constant bumps per task.
- **`scripts/modules/world/world.js`** — add a `clear()` method that removes every entity (loops `removeEntity` over a snapshot of `entities`). Currently the loader does this inline; a method centralises it so reset can reuse.
- **`libs/lz-string/lz-string.min.js`** (NEW vendored) — copied from `node_modules/lz-string/libs/lz-string.min.js`. Version pinned to 1.5.0 in `package.json` devDependencies. Re-vendoring instructions added to CLAUDE.md alongside the Three.js note.

### Unchanged (intentional)

- `Grid`, `World`, `Entity`, every component class, `WallTracer`, `WorldEditor`, `BuilderInputAdapter`, every Tool subclass.
- `IconRenderer` runs at boot over annotated manifest entries — the new decors and skeletons get thumbnails for free.
- The Animator + Walker + WanderBehaviour combo handles every skeleton variant identically.

---

## Data Flow

### Save (autosave timer or Ctrl+S)

```
App.viewModel.snapshot()
   → WorldSerializer.toJSON(world)              // dictionary-encoded v2 object
   → save-codec.encode(snapshotObj)             // adds LZ wrap; returns string
       ├─ writeAutosave  → LZString.compressToUTF16 → storage.setItem
       └─ save           → wrap in {v:2, lz: compressToBase64} → file write
```

### Load (Ctrl+O or button)

```
SaveService.openFile()
   → file bytes → save-codec.decode(text)
       ├─ parse outer { v, lz } → fail if v !== 2
       ├─ LZString.decompressFromBase64(lz)
       └─ JSON.parse → snapshotObj
   → emit loadRequested { snapshot, fileName }
   → App opens load-confirm-modal
   → user clicks Replace
   → WorldSerializer.fromJSONv2(world, snapshot, assets)
       ├─ world.removeEntity(...) for every existing entity
       ├─ for each snapshot entity:
       │      Entity.fromKind(kinds[kindIdx], assets)
       │      → for each [compIdx, data] → run COMPONENT_BUILDERS[components[compIdx]](entity, data)
       │      → world.addEntity(entity)   // emits entityAdded; WallTracer reconciles
   → emit loaded { fileName, counts: { loaded, skipped, warnings } }
   → App toasts the result
```

### Boot auto-resume

```
App.start()
   → SaveService.loadFromAutosave()
       ├─ storage.getItem(AUTOSAVE_KEY) → string
       ├─ try LZString.decompressFromUTF16 → JSON.parse → check v === 2
       │      ├─ ok: return snapshot
       │      └─ not v2 (or parse fails): storage.removeItem; return null
   → if snapshot returned: WorldSerializer.fromJSONv2(world, snapshot, assets)
   → else: App.buildFreshWorld()      // paints starter room + spawns player
```

### Reset

```
Reset button clicked
   → ConfirmModal.show({ title: "Reset lair?", actionLabel: "Reset",
                         onConfirm: () => App.resetLair() })
   → on confirm:
       ├─ saveService.clearAutosave()  // storage.removeItem
       ├─ world.clear()                // every entity removed; WallTracer reconciles to empty
       └─ App.buildFreshWorld()        // same cold-start path used on boot
```

---

## Error Handling

- **Decode failures** (bad outer JSON, missing `v`, v !== 2, bad base64, bad LZ blob, bad inner JSON): each surface as `loadFailed` with a specific reason string. Toast with severity `is-error`. Current world is untouched (loader is read-then-apply, never mid-state).
- **Unknown kind / component on load**: per-entity warnings collected into the result (same shape as V4's `fromJSON` result). Aggregated into a single info toast: `"Loaded 47 entities; 3 skipped (unknown asset kinds)"`.
- **FSA picker user-cancel** (AbortError): silent. No toast.
- **localStorage quota on autosave**: existing behaviour preserved — caught as `QuotaExceededError`, emitted as `saveFailed`. The LZ wrap makes quota hits much rarer but possible on big lairs.
- **Modal cancel**: no-op. The decoded snapshot is dropped.
- **V1 file load**: detected at outer-JSON parse (no `v: 2`). Error toast: `"Save format too old — please rebuild this lair in V5."`
- **V1 autosave on boot**: silently cleared (no toast). User experience is "fresh start", matching the hard-cut decision.

---

## Testing Strategy

Existing 385 tests across 27 files remain green. New / changed coverage:

- **`tests/world/save-codec.test.js`** (NEW) — round-trip a representative snapshot (floor, wall, corner, decor, wall-decor, character, block) through `encode` → `decode`; assert structural equality. Test enum encoding on every side / corner value. Test failure modes: garbled LZ string, missing `v`, wrong `v`, corrupted JSON.
- **`tests/world/world-serializer.test.js`** — update to v2 schema. Drop the v1 round-trip test; add tests for `fromJSONv2` rebuilding walls correctly via the `entityAdded` event (mock `WallTracer` subscription).
- **`tests/engine/save-service.test.js`** — autosave write produces a UTF-16 LZ string; `loadFromAutosave` detects and clears a v1 string from mock storage; quota-exceeded path still emits `saveFailed`.
- **`tests/engine/save-service-load.test.js`** (NEW) — `openFile` happy path via a mock File; decode failure emits `loadFailed`; FSA-unavailable path falls back to `<input type="file">`; `clearAutosave` removes the storage key. Uses the jsdom environment.
- **`tests/world/world.test.js`** — add a `clear()` test (every entity removed; `entityRemoved` fires for each).
- **Manual browser verification** per task:
    - Catalogue: each new tile renders a thumbnail; placing each decor / minion looks correct; skeletons walk and wander.
    - Larger map: grid renders 20×20 with starter room centred; camera + player position look right at boot.
    - Compaction: a representative lair's autosave size before/after should drop noticeably (specific target documented in plan).
    - Load: Ctrl+O and the button both open the picker; bad file surfaces a toast; good file shows the modal; Replace rebuilds the lair; Cancel leaves the current lair intact.
    - Reset: button opens the modal; Reset clears the autosave + rebuilds the starter room; Cancel leaves the world untouched.
    - Auto-resume: closing the tab mid-build and reopening restores the lair (smoke test of the existing path with v2 encoding in place).

---

## Open Questions

- **Bed / table mesh footprint** — KayKit's `bed_decorated.gltf` is ~2 m × ~4 m; a 4 m grid cell is 4 m × 4 m. Either accept the bed occupying its single cell with one side flush, or rotate via the existing rotation step + accept the visual quirk. Confirm during planning whether `meta.scale` adjustments are needed.
- **Skeleton variants and `MINION_CLIPS`** — confirm all three variants use the same Rig_Medium clip names (`Idle_A`, `Walking_A`, etc.). Highly likely (same rig pack), but if a variant lacks a clip the Animator should fall back gracefully.
- **Compression sanity check on small lairs** — for very small worlds (e.g. starter 6×6 room only) the dictionary tables add fixed overhead that may make the encoded form *larger* than the raw form. Acceptable trade-off (V5 optimises for the worst case, not the empty case). Worth a note in the plan; not a blocker.
- **Load-during-FirstPerson mode** — if the user is in FirstPerson camera mode when they trigger Ctrl+O, do we silently switch to Builder mode after loading, or stay in FirstPerson with the new lair? Default: stay in current mode. Easy to revisit if it feels wrong in browser testing.
- **Builder camera default framing after grid expansion** — the V4 camera defaults were tuned for a 10×12 grid. With 20×20 the default orbit distance / target may look off (player + starter room sit near grid centre but the empty envelope is much bigger). Likely fine since the camera initially follows the player into the starter room, but flag for browser-verify; adjust the constants in `BuilderCamera` if it feels distant.
