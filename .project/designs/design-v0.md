# Design — Cozy Lairs Foundation
Date: 2026-05-08

## Summary

A 3D lair-builder game built on Three.js (vendored, no bundler) using native ES modules with an import map. The foundation establishes a scene-graph + component architecture, a tile grid with nudge-tolerant decor placement, switchable builder/first-person cameras, a Knockout-bound DOM HUD, a manifest-driven asset manager for the KayKit Dungeon Remastered pack, a save/load service backed by the File System Access API, Vitest for logic tests, and a built-in dev console for live event/stat inspection. The "foundation done" bar is a walkable empty room: a small KayKit-tiled floor with walls, a builder camera that orbits/pans/zooms, a switchable first-person camera, a placeholder character that walks around, plus graceful resize and asset-failure handling.

## Architecture

### Top-level shape

`index.html` loads `scripts/app.js` as an ES module entry point. An import map maps the bare specifier `three` → `./libs/three.module.js` and `knockout` → `./libs/knockout-3.5.1.js`, so application code reads `import * as THREE from "three"` rather than relative paths. An `App` singleton owns lifecycle and exposes `window.App` for devtools, mirroring the cobol.js convention. Bootstrap uses an explicit DOM-ready guard.

### Layered modules

Code lives under `scripts/modules/` in three layers:

- `engine/` — generic, project-agnostic plumbing: `Renderer`, `GameLoop`, `Input`, `AssetManager`, `Camera*` controllers, `SaveService`, `Emitter` base class, error classes, `dev/DevConsole`.
- `world/` — domain-aware but content-agnostic: `Grid`, `World`, `Entity` base, component classes (`Transform`, `Renderable`, `GridPlacement`, `Nudgeable`, `WallMounted`, `Walker`, `Animator`), `WorldSerializer`.
- `ui/` — Knockout view-models, `bindings.js` for custom binding handlers, HUD/menu DOM templates.

Feature folders (`building/`, `simulation/`, etc.) are sanctioned once a real feature area earns its own folder. The starting `engine/world/ui` split is a starting layout, not a constitutional one.

### Eventing — direct subscription with topic-scoped escalation

No global event bus. All cross-module notification goes through a small `Emitter` base class (`on/off/emit`); consumers subscribe directly to the producer. Each emitter documents its event vocabulary right next to its definition. Knockout observables handle UI-facing reactive state (camera mode, save status, dirty flag) — already direct emitter→subscriber via the binding.

**Discipline:** events are past-tense facts (`entityAdded`, `saved`, `gridChanged`), never commands. Commands ("place this wall") are method calls on the responsible object. This rule lands in CLAUDE.md alongside the foundation.

If a real cross-cutting fan-out problem appears, the answer is a topic-scoped mini-emitter (`WorldEvents`, `BuildEvents`) — never a generic global bus.

## Components

### Engine layer

- **`Renderer`** wraps `THREE.WebGLRenderer`, owns the `<canvas>`, scene, and active camera. Handles resize via `ResizeObserver` on the canvas wrapper, updates `renderer.setSize` and `camera.aspect`, clamps `devicePixelRatio` at 2× to avoid 4K perf cliffs. Exposes `setActiveCamera(cameraController)` for switching.
- **`GameLoop`** runs a fixed-timestep simulation (60 Hz logical tick) with a variable-rate render via `requestAnimationFrame`. Accumulator pattern keeps simulation deterministic regardless of frame rate.
- **`Input`** is the single source of truth for keyboard/mouse/wheel state. Extends `Emitter` (`keydown`, `pointermove`, `wheel`, etc.); also exposes a polled `isDown(key)` for camera controllers. Captures pointer-lock for FP camera.
- **`AssetManager`** loads `assets/manifest.json` on boot, kicks off `core` tier preload, returns cached `THREE.Group` clones for `get(id)`. Lazy `load(id)` returns a Promise. Uses `THREE.GLTFLoader` and `SkeletonUtils` from the Three.js examples (vendored). Reports progress as `(loaded, total, currentId)` for the loading overlay.
- **`CameraController`** abstract → **`BuilderCamera`** (orbit/pan/zoom around a focus point) and **`FirstPersonCamera`** (pointer-lock, WASD, gravity to floor). `activate()`/`deactivate()` subscribe/unsubscribe to `Input` and grab/release pointer-lock. Active controller is swappable on `Renderer`.
- **`SaveService`** wraps File System Access API. Holds the `FileSystemFileHandle` once `showSaveFilePicker` succeeds; subsequent saves call `handle.createWritable()` silently. Falls back to a download-anchor blob in unsupported browsers (Firefox, Safari). Autosaves a snapshot to `localStorage` every 30 s as a safety net regardless. Emits `saved` / `saveFailed` to direct subscribers.
- **`Emitter`** base class. `on(event, handler)`, `off(event, handler)`, `emit(event, payload)`. Static `_devSink` field, null in normal mode; the dev console installs itself as the sink when active. Gameplay code cannot subscribe to the sink — it is a one-way mirror for instrumentation, not a back-door bus.
- **`errors.js`** — `AssetLoadError`, `SaveError`, `ManifestError`, `WebGLUnavailableError`, `GridBoundsError`, `PlacementError`. Re-exported from `engine/index.js` so consumers don't import submodule paths directly.

### World layer

- **`Grid`** — pure data: dimensions, cell size (default 2 m), occupancy lookup. All math (`worldToCell`, `cellToWorld`, `snapToEdge`, `isInBounds`) is static-flavoured and trivially testable.
- **`World`** — root scene-graph node; owns the `THREE.Scene`, the `Grid`, and the entity registry. Extends `Emitter` (`entityAdded`, `entityRemoved`, `gridChanged`). `update(dt)` fans out to entities. Serialises via `WorldSerializer.toJSON(world)`.
- **`Entity`** — owns one `THREE.Object3D`, a string `kind` (e.g. `"wall.stone.straight"`), a `Map<string, Component>`, and `toJSON()`/`fromJSON()` hooks. Components include:
    - `Transform` — read-through to the Object3D.
    - `GridPlacement` — cell + rotation, snap-locked.
    - `Nudgeable` — sub-cell offset capped at ±0.4 m for decor.
    - `WallMounted` — anchored to a wall face, slides along its plane.
    - `Walker` — simple movement controller for the placeholder character.
    - `Renderable` — asset id + reference to AssetManager.
    - `Animator` (planned) — wraps `THREE.AnimationMixer` for KayKit rigged animations.

### UI layer

- **`AppViewModel`** — root KO view-model: `version`, `cameraMode` (`"builder"` | `"firstPerson"`), `saveStatus`, `loadProgress`, `loadStatus`, `isDirty` (pureComputed against last-saved snapshot, not a flag).
- **`bindings.js`** — all `ko.bindingHandlers.*` registrations (e.g. `viewportSize`, `tooltip`). Other modules stay import-pure.
- **HUD CSS** uses `clamp()` for typography, `vmin`-relative units for HUD anchoring, and a hard minimum viewport of `1024×640` with a friendly "make your window bigger" overlay below that.
- **Loading overlay** binds to `viewModel.loadStatus` and `viewModel.loadProgress`; fades out after `core` tier completes and the first frame renders. Mid-game lazy loads use a smaller corner spinner.

### Dev console

`engine/dev/DevConsole.js` — slide-in panel on the right edge of the viewport, KO-bound, toggled with backtick or auto-opened via `?debug=1`. Always present (no build flag because there's no build); closed-state cost is ~zero.

- **Events tab.** Ring buffer (last 500 events) with timestamp, emitter class + optional `name`, event name, JSON payload preview. Filter by emitter, event name, regex. Pause/resume. Click an entry to expand the full payload. Powered by the `Emitter._devSink` integration described above.
- **Stats tab.** FPS, ms/frame, simulation tick rate, draw calls, triangle count, entity count, asset cache size. Reads `THREE.WebGLRenderer.info` plus internal counters.
- **Quick actions strip.** Toggle camera mode, dump world JSON to console, force a save failure (exercises error path), reload manifest.

Planned but not in first cut (designed-for, not implemented): Entities tab (click in-world to inspect components), Assets tab (manifest browser with loaded/pending/failed state).

## Data Flow

### Boot sequence

1. `index.html` declares the import map and loads `scripts/app.js`.
2. DOM-ready guard fires `bootstrap()`.
3. `App.start()` runs in order: load `assets/manifest.json` → `AssetManager.preloadCore()` → construct `Renderer`, `World`, `Input`, `BuilderCamera`, `FirstPersonCamera`, `SaveService`, `DevConsole` → construct `AppViewModel` and `ko.applyBindings` → start `GameLoop`.
4. Loading overlay covers the whole sequence; fades out after first rendered frame.
5. Any failure surfaces a fatal-error overlay rather than a silent dead canvas.

### Per-frame loop

Each animation frame:

1. Drain accumulated time into N fixed simulation ticks (60 Hz). Each tick: `world.fixedUpdate(dt)` walks entities and runs components (`Walker.tick`, `Animator.tick`); active `cameraController.fixedUpdate(dt)` runs camera-side physics-style math.
2. Once per frame: `cameraController.frameUpdate(alpha)` for interpolated visual smoothing, then `renderer.render(world.scene, cameraController.camera)`.

UI (Knockout) updates are not driven by the loop — they react to observable changes pushed by world/save/camera subsystems. Keeps the render loop free of DOM work.

### Input flow

`Input` listens once on `window` for keyboard/mouse/wheel/pointer events, normalises them, and emits to its direct subscribers. The currently active camera controller is the primary subscriber; build-tool view-models subscribe to pointer-down on the canvas to translate screen → ray → grid cell via `Grid.worldToCell`. Input is read-only — no module mutates input state.

### Asset flow

`AssetManager` returns `Promise<THREE.Group>`. `Entity.fromKind(kind, ...)` calls `assets.get(kind)`, clones the result (skinned meshes use `SkeletonUtils.clone`), and parents it under its own `Object3D`. Asset ids are flat strings (`"prop.barrel.small"`) resolved through the manifest; gameplay code never touches file paths.

### Save flow

`SaveService.save()` calls `WorldSerializer.toJSON(world)` to produce a plain-object snapshot (entity list with `kind`, `cell`, rotation, nudge offset, custom component state), JSON-stringifies it, and writes to the retained `FileSystemFileHandle`. First-ever save calls `showSaveFilePicker` to acquire the handle. `SaveService` emits `saved` / `saveFailed` to direct subscribers (the view-model). Autosave timer writes the same snapshot to `localStorage` every 30 s as a recovery net regardless of File System Access support.

### Load flow

Inverse of save. `WorldSerializer.fromJSON(world, snapshot)` clears existing entities, then reconstructs each via `Entity.fromKind(...)`. `kind` strings unknown to the current manifest are collected into an error report rather than crashing — the lair loads minus the orphans, and the user gets a list.

### Camera switch

`App.setCameraMode("firstPerson")` swaps the active controller on the renderer, calls `oldController.deactivate()` and `newController.activate()` (subscribe/unsubscribe to `Input`, request/release pointer-lock), and updates `viewModel.cameraMode` (Knockout re-renders the HUD: builder shows the build palette, FP shows a crosshair).

## Error Handling

### Failure categories and where they're caught

- **Fatal boot failures** (manifest missing/malformed, WebGL unavailable, core asset 404). Caught at the top of `App.start()`'s try/catch. UI shows a full-screen overlay with the error class name, a short human message, and the underlying message in a collapsible `<details>`. No partially-initialised app is left running. Errors are typed: `ManifestError`, `AssetLoadError`, `WebGLUnavailableError`.
- **Mid-game asset failures** (a lazy `assets.load(id)` rejects). The placement is rejected with a non-fatal toast; the action is rolled back; the lair stays consistent.
- **Grid validation failures** (placement out of bounds, cell occupied, wall-mount on an empty face). `Grid` and the placement components throw `GridBoundsError` / `PlacementError`. The UI layer catches at the command boundary and shows a quiet hint, never bubbles to a fatal overlay. These are *expected* user-input failures, not bugs.
- **Save/load failures.** `SaveError` for write failures (handle revoked, quota exceeded, user cancelled the picker). `SaveService` emits `saveFailed` with the error; UI shows toast and keeps the dirty flag set so nothing's lost. Load failures with unknown asset ids degrade gracefully — orphaned entities are dropped and the user gets a summary, never a hard crash.
- **Unknown errors.** A top-level `window.addEventListener("error", ...)` and `unhandledrejection` listener capture stragglers, log to console, and surface a non-blocking toast. The game keeps running where possible.

All error classes live in `engine/errors.js`, re-exported from `engine/index.js` so consumers don't import submodule paths directly.

## Testing Strategy

### Tooling

Vitest, configured minimally: `vitest.config.js` with `environment: 'node'` for logic tests and `environment: 'jsdom'` opt-in per file (`// @vitest-environment jsdom`) when DOM is needed. No coverage thresholds at the foundation stage — they get gamed; we add them when surface area justifies it. Tests live in `tests/`, mirroring the module layout (`tests/engine/grid.test.js`, etc.).

### What we test

- **`Grid` math** — `worldToCell`, `cellToWorld`, `snapToEdge`, bounds, occupancy. Pure functions, fast, high-value.
- **`WorldSerializer`** — round-trip a fixture lair through `toJSON`/`fromJSON` and assert structural equality.
- **`AssetManager` manifest parsing** — valid manifests, missing fields, duplicate ids, unknown tier names. Doesn't fetch GLBs; uses an in-memory manifest fixture.
- **`Emitter`** — subscribe/unsubscribe, multiple subscribers, error in one handler doesn't break the others, dev sink fires for every emit.
- **`SaveService` (logic only)** — File System Access API mocked at the module boundary; verify handle is retained, fallback path triggers when `showSaveFilePicker` is undefined, autosave debounce works.
- **`Input` event normalisation** — modifier keys, pointer button mapping; jsdom fires synthetic events.

### What we don't test

- Three.js rendering output — pixel diffs are flaky and the cost-to-value ratio is awful. Visual regressions are caught by the verify-in-browser step.
- Camera controllers' "feel" — orbit damping, FP gravity. Tuneable by hand.

### Test data convention

Multi-entity world fixtures live in `tests/data/` as JSON files (mirrors the cobol.js `tests/data/*.cbl` rule), loaded via a `loadFixture(path)` helper in `tests/runner.js`. One-off snapshot literals stay inline.

## Open Questions

- **File System Access API browser support.** Chrome/Edge solid; Firefox and Safari don't ship `showSaveFilePicker`. Plan is blob-download fallback + always-on `localStorage` autosave net, but first-time-Firefox UX will feel different. Acceptable for desktop-first hobby project; confirm once used for real.
- **Three.js version to vendor.** Pin a specific release at first-task implementation. Latest stable preferred unless a regression argues against it.
- **`SkeletonUtils` dependency surface.** Lives under `examples/jsm/utils/SkeletonUtils.js` in Three.js distribution. Vendor alongside `GLTFLoader.js`. Just flagging the surface is slightly larger than "Three.js core."
- **Animation pipeline.** KayKit characters ship with rigged animations. The `Animator` component wrapping `THREE.AnimationMixer` is named in the design but full mini-design happens when the placeholder character needs more than `Walker.move`.
- **Pathfinding.** Out of scope for foundation. Grid-based A* is the obvious answer when minions arrive; the `Grid` API is being designed to support occupancy queries it'll need.
- **Build-mode UX details.** Nudge interaction (modifier+arrows vs. gizmo), wall-hanging slide constraint UX, undo/redo stack — deferred to a build-mode-specific design. Foundation just provides the underlying components (`Nudgeable`, `WallMounted`).
- **Minimum viewport threshold.** Drafted at 1024×640; confirm against real use.
