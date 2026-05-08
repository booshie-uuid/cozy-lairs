# Plan: Cozy Lairs Foundation (V0)

## Context

This plan implements the foundation design at [.project/designs/design-v0.md](../designs/design-v0.md). The goal is a working "walkable empty room" demo on top of a clean engine/world/ui layered architecture: Three.js renderer, scene-graph + component entities, tile grid, switchable builder/first-person cameras, manifest-driven KayKit asset loading, Knockout-bound HUD, save/load via the File System Access API, Vitest for logic tests, and a built-in dev console with live event/stat inspection.

Tasks are ordered so the walkable empty room is achievable as early as possible (Task 14 — DEMO MILESTONE). Save/load, dev console, and final polish land afterwards to complete the foundation deliverables.

**Versioning convention.** This is plan 1 (V1). Each task completion bumps the `VERSION` constant in `scripts/app.js` per the format `V{plan}_{task}_{release}`. Starting value is `V1_0_0`; after Task 1 it becomes `V1_1_0`, after Task 2 `V1_2_0`, etc. Release resets to 0 whenever task changes.

**Asset precondition.** Several tasks assume the user has placed KayKit Dungeon Remastered files at `assets/kaykit/dungeon-remastered/gltf/` and `assets/kaykit/dungeon-remastered/textures/`. Tasks that touch real assets are flagged in Risks/Constraints and gracefully degrade (cube placeholder) until the assets are in.

---

## Task 1: Project scaffold and import map

### Objective

Establish the bare project shell — `index.html` with import map, vendored Three.js + Knockout, a working `App` singleton with DOM-ready guard, Vitest installed, and a placeholder DOM render that proves the entry point loads.

### Expected Outcomes

- Opening `index.html` in a browser shows a "Cozy Lairs — booting" placeholder with no console errors.
- `npm test` runs a dummy passing test.
- `scripts/app.js` exports `VERSION = "V1_1_0"` (after this task), wires the App singleton onto `window.App`, and uses an explicit DOM-ready guard.

### Risks / Constraints

- Three.js examples (`GLTFLoader.js`, `SkeletonUtils.js`) live under `examples/jsm/` in the npm distribution; we vendor the specific files we need rather than the full examples folder.
- Native ES modules + `file://` does not work in some browsers — implementer should serve via a local static server (e.g. `npx serve`, `python -m http.server`). Document in README/CLAUDE.md.

### Steps

- [ ] Download Three.js stable release (latest stable; record exact version in CLAUDE.md). Vendor `build/three.module.js`, `examples/jsm/loaders/GLTFLoader.js`, and `examples/jsm/utils/SkeletonUtils.js` into `libs/three/` (preserving the relative import paths inside the example files).
- [ ] Create `libs/three/index.js` that re-exports `* from "./three.module.js"` so the import map can resolve `three` to a single entry point.
- [ ] Create `index.html` with: `<meta charset>`, viewport meta, an `<script type="importmap">` mapping `three` → `./libs/three/index.js`, `three/addons/loaders/GLTFLoader.js` → `./libs/three/GLTFLoader.js`, `three/addons/utils/SkeletonUtils.js` → `./libs/three/SkeletonUtils.js`, `knockout` → `./libs/knockout-3.5.1.js`. Include `<div id="app"></div>` and `<script type="module" src="./scripts/app.js"></script>`.
- [ ] Create `scripts/app.js` with `const VERSION = "V1_1_0"` at the top, an `App` class (`constructor` + `start()`), instantiation, `window.App = app`, and a DOM-ready guard wrapping `app.start()`.
- [ ] Implement `App.start()` to write a "Cozy Lairs — booting" message into `#app` (placeholder; will be replaced).
- [ ] Create `package.json` with `"type": "module"`, scripts (`test`, `test:watch`), and devDependency on `vitest` (latest stable).
- [ ] Run `npm install`.
- [ ] Create `vitest.config.js` with `environment: 'node'` default and `test.include: ['tests/**/*.test.js']`.
- [ ] Create `tests/sanity.test.js` containing one trivial passing test (`expect(1).toBe(1)`).
- [ ] Run `npm test` — verify the sanity test passes.
- [ ] Verify in browser: open `index.html` via a local static server, confirm the "booting" placeholder renders with no console errors, confirm `window.App` is reachable from devtools.

### Decisions

<!-- Filled in during execution. -->

---

## Task 2: Emitter base class and dev sink

### Objective

Implement the `Emitter` base class with `on/off/emit` and the static `_devSink` instrumentation hook. Cover with Vitest tests.

### Expected Outcomes

- `Emitter` class is importable from `scripts/modules/engine/emitter.js`.
- Subscribers fire on `emit`, `off` removes them, errors in one handler don't break others.
- When `Emitter._devSink` is set, every `emit` call invokes it with `(emitter, eventName, payload)`. When unset, no overhead beyond a null check.
- All Emitter tests pass under `npm test`.

### Risks / Constraints

- The dev sink is a **global static**, deliberately. Tests must clean up `Emitter._devSink = null` in `afterEach` to prevent cross-test contamination.

### Steps

- [ ] Create `scripts/modules/engine/emitter.js` exporting an `Emitter` class with `_handlers` (a `Map<string, Set<Function>>`), `on(event, handler)`, `off(event, handler)`, `emit(event, payload)`, plus the static `_devSink` field.
- [ ] In `emit`, swallow handler exceptions and `console.error` them so one bad subscriber doesn't break others.
- [ ] In `emit`, call `Emitter._devSink(this, event, payload)` at the end if `_devSink !== null`.
- [ ] Create `tests/engine/emitter.test.js` with cases: subscribe/emit, unsubscribe, multiple subscribers, exception in one handler doesn't block others, dev sink fires for every emit, dev sink null state has no side effect.
- [ ] Add `afterEach(() => { Emitter._devSink = null; })` in the test file.
- [ ] Run `npm test` — all Emitter tests pass.
- [ ] Bump `VERSION` to `V1_2_0` in `scripts/app.js`.
- [ ] Verify: tests pass; no browser-side change yet.

### Decisions

<!-- Filled in during execution. -->

---

## Task 3: Engine errors module and façade

### Objective

Define typed error classes used across the engine and expose them through a single façade so consumers don't import submodule paths.

### Expected Outcomes

- `scripts/modules/engine/errors.js` exports `AssetLoadError`, `SaveError`, `ManifestError`, `WebGLUnavailableError`, `GridBoundsError`, `PlacementError`, all inheriting from a base `CozyLairsError extends Error` so they're identifiable as project errors.
- `scripts/modules/engine/index.js` re-exports them.
- A small test confirms `instanceof` checks work and error names round-trip.

### Risks / Constraints

- Error subclasses must explicitly set `this.name = "AssetLoadError"` etc. in their constructor — otherwise minified/transpiled output reports them as `Error`. (We don't transpile, but the convention is robust.)

### Steps

- [ ] Create `scripts/modules/engine/errors.js` with a base `CozyLairsError extends Error` (sets `this.name = this.constructor.name`).
- [ ] Add subclasses: `AssetLoadError`, `SaveError`, `ManifestError`, `WebGLUnavailableError`, `GridBoundsError`, `PlacementError`.
- [ ] Create `scripts/modules/engine/index.js` re-exporting all error classes plus the `Emitter` from Task 2.
- [ ] Create `tests/engine/errors.test.js` with cases: `new AssetLoadError("x") instanceof Error`, `instanceof CozyLairsError`, `instanceof AssetLoadError`; `.name === "AssetLoadError"`; thrown error's stack is preserved.
- [ ] Run `npm test` — all error tests pass.
- [ ] Bump `VERSION` to `V1_3_0`.
- [ ] Verify: tests pass.

### Decisions

<!-- Filled in during execution. -->

---

## Task 4: Renderer with canvas, resize, and DPR clamping

### Objective

Wrap `THREE.WebGLRenderer` in a `Renderer` class that owns the canvas, handles viewport resize via `ResizeObserver`, clamps `devicePixelRatio` at 2×, and exposes `setActiveCamera(controller)`. Make it visible on screen.

### Expected Outcomes

- Loading the page shows a coloured Three.js canvas filling the viewport.
- Resizing the browser window updates the canvas size and camera aspect ratio without distortion.
- A simple temporary `THREE.PerspectiveCamera` is set as the active camera (will be replaced by Task 10).
- `WebGLUnavailableError` is thrown when `getContext("webgl2")` returns null.

### Risks / Constraints

- `ResizeObserver` is widely supported but may behave oddly when the canvas wrapper has `display: none`. The wrapper should always be visible.
- `devicePixelRatio` capping above 2 is a perf decision — document the choice in CLAUDE.md.

### Steps

- [ ] Create `scripts/modules/engine/renderer.js` exporting a `Renderer` class.
- [ ] Constructor takes a `canvasWrapper` DOM element. Creates `<canvas>` inside it, instantiates `THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })`, sets clear color to a placeholder dark blue.
- [ ] If WebGL context creation fails, throw `WebGLUnavailableError`.
- [ ] Construct an empty `THREE.Scene` and a temporary `THREE.PerspectiveCamera(60, 1, 0.1, 1000)` positioned at `(0, 5, 8)` looking at origin. Store both as `this.scene`, `this.activeCamera`.
- [ ] Add `setActiveCamera(camera)` and `setSize(width, height)` methods. The latter updates renderer size, `pixelRatio = Math.min(devicePixelRatio, 2)`, and `activeCamera.aspect`.
- [ ] Wire `ResizeObserver` on the canvas wrapper to call `setSize` with current dimensions.
- [ ] Add a `render()` method calling `this.renderer.render(this.scene, this.activeCamera)`.
- [ ] In `index.html`, replace `#app` with a `<div id="canvas-wrapper">` styled to fill the viewport (`position: fixed; inset: 0;`).
- [ ] Update `App.start()` to construct `Renderer(document.getElementById("canvas-wrapper"))` and call `renderer.render()` once after construction.
- [ ] Bump `VERSION` to `V1_4_0`.
- [ ] Verify in browser: the page shows a uniform dark blue canvas filling the viewport. Resizing the window keeps the canvas full-bleed and proportionally correct.

### Decisions

<!-- Filled in during execution. -->

---

## Task 5: GameLoop with fixed-timestep accumulator

### Objective

Implement the `GameLoop` class — fixed-timestep simulation (60 Hz) with variable-rate render via `requestAnimationFrame`. Prove it works by spinning a temporary cube.

### Expected Outcomes

- `GameLoop` calls registered fixed-update callbacks at a deterministic 60 Hz regardless of render frame rate.
- A temporary cube spins at constant angular velocity (independent of frame rate).
- Calling `loop.stop()` cleanly cancels the next frame.

### Risks / Constraints

- The accumulator can spiral if the tab is backgrounded for long periods. Cap maximum accumulated time at e.g. 250 ms to prevent the dreaded "tab returns from background, sim runs 5000 ticks at once" hang.

### Steps

- [ ] Create `scripts/modules/engine/game-loop.js` exporting a `GameLoop` class.
- [ ] Constructor accepts `{ fixedDt = 1 / 60, onFixedUpdate, onFrameUpdate }` options.
- [ ] Implement the accumulator: each RAF, compute `realDt = now - lastTime`, clamp to 250 ms, add to accumulator, drain in fixed-`fixedDt` chunks calling `onFixedUpdate(fixedDt)` per chunk, then call `onFrameUpdate(alpha)` where `alpha = accumulator / fixedDt`.
- [ ] Add `start()` and `stop()` methods (idempotent — guard against double-start).
- [ ] In `App.start()`, after `Renderer` construction: add a temporary `THREE.Mesh(BoxGeometry, MeshNormalMaterial)` to `renderer.scene`, instantiate `GameLoop` with `onFixedUpdate(dt) => cube.rotation.y += dt` and `onFrameUpdate() => renderer.render()`. Call `loop.start()`.
- [ ] Bump `VERSION` to `V1_5_0`.
- [ ] Verify in browser: cube spins smoothly at constant rate; opening devtools and pausing/resuming JS doesn't cause runaway sim.

### Decisions

<!-- Filled in during execution. -->

---

## Task 6: Input system

### Objective

Implement the `Input` class extending `Emitter` — single source of truth for keyboard/mouse/wheel/pointer state, with both event emission and polled `isDown(key)` API.

### Expected Outcomes

- `Input` emits `keydown`, `keyup`, `pointermove`, `pointerdown`, `pointerup`, `wheel` events with normalised payloads.
- `input.isDown("KeyW")` returns `true` while W is held.
- `input.requestPointerLock()` and `input.exitPointerLock()` work and emit `pointerlockchange`.
- Vitest tests with jsdom verify event normalisation.

### Risks / Constraints

- Pointer-lock requires a user gesture in most browsers. Don't auto-lock; expose the method for camera controllers to call from a click handler.
- Synthetic events in jsdom don't dispatch identically to real browsers — keep tests focused on payload shape, not browser API contracts.

### Steps

- [ ] Create `scripts/modules/engine/input.js` extending `Emitter`.
- [ ] In constructor, accept a `target` element (default `window`); attach listeners for `keydown`, `keyup`, `pointermove`, `pointerdown`, `pointerup`, `wheel`, `pointerlockchange`.
- [ ] Maintain `_keys: Set<string>` populated from `keydown`/`keyup` `event.code` values; expose `isDown(code)`.
- [ ] Normalise emitted payloads: `{ code, key, ctrl, shift, alt, meta }` for keyboard; `{ x, y, dx, dy, button, buttons }` for pointer; `{ deltaX, deltaY, deltaZ }` for wheel.
- [ ] Add `requestPointerLock(element)` and `exitPointerLock()` methods; emit `pointerlockchange` with `{ locked: bool }`.
- [ ] Add `dispose()` to remove all listeners.
- [ ] Create `tests/engine/input.test.js` with `// @vitest-environment jsdom`. Test: `keydown` event populates `_keys` and emits with normalised payload; `keyup` removes from `_keys`; multiple modifiers passed through; `dispose` removes listeners.
- [ ] In `App.start()`, instantiate `Input` and store on `app.input`. Subscribe a temporary log handler to `keydown` that `console.log`s the code (for verification only — remove after verifying).
- [ ] Run `npm test` — all Input tests pass.
- [ ] Bump `VERSION` to `V1_6_0`.
- [ ] Verify in browser: tests pass; pressing keys logs `{ code: "KeyW", ... }` etc. to the console; remove the temporary log handler.

### Decisions

<!-- Filled in during execution. -->

---

## Task 7: World, Grid, Entity, and core components

### Objective

Implement the world layer foundation — `Grid` (pure math), `World` (scene root + entity registry, extends `Emitter`), `Entity` (Object3D + components map + serialisation hooks), and the first three components (`Transform`, `Renderable`, `GridPlacement`).

### Expected Outcomes

- `Grid` math (`worldToCell`, `cellToWorld`, `snapToEdge`, `isInBounds`, occupancy) is pure-functional and tested.
- `World.addEntity(entity)` adds to scene + registry and emits `entityAdded`; `removeEntity` emits `entityRemoved`.
- `Entity` exposes `.kind`, `.object3D`, `.components` (Map), `addComponent`, `getComponent`, `toJSON`, `fromJSON` (the last two delegate to component-level hooks).
- Tests cover Grid math, entity lifecycle events, and component round-trip serialisation.

### Risks / Constraints

- `GridPlacement` needs to know the cell size to position the Object3D. Pass the Grid as a constructor dependency, or have `World.addEntity` apply the placement transform after attaching to scene. Pick one and document.
- Skinned mesh Renderables come later (Task 13) — for now, `Renderable` just clones a `THREE.Group` and parents it.

### Steps

- [ ] Create `scripts/modules/world/grid.js` exporting a `Grid` class with `cellSize` (default 2), `width`, `depth`, occupancy `Map<string, Entity>` keyed by `"x,z"`. Methods: `worldToCell(x, z)`, `cellToWorld(cx, cz)` (returns center of cell), `snapToEdge(x, z)`, `isInBounds(cx, cz)`, `setOccupant(cx, cz, entity)`, `getOccupant(cx, cz)`, `clearOccupant(cx, cz)`. Throw `GridBoundsError` for out-of-bounds writes.
- [ ] Create `scripts/modules/world/world.js` extending `Emitter`. Constructor takes a `Grid`. Owns `THREE.Scene`, `entities: Set<Entity>`. Methods: `addEntity(entity)`, `removeEntity(entity)`, `update(dt)` (calls each entity's `update(dt)` if defined). Emits `entityAdded`, `entityRemoved`.
- [ ] Create `scripts/modules/world/entity.js`. Constructor: `(kind: string, object3D: THREE.Object3D)`. Fields: `kind`, `object3D`, `components: Map`. Methods: `addComponent(component)`, `getComponent(name)`, `update(dt)` (delegates to components with `update`), `toJSON()` (serialises kind + each component's `toJSON`), static `fromJSON(json, world, assets)`.
- [ ] Create `scripts/modules/world/components/transform.js` — wraps Object3D position/rotation/scale; `toJSON`/`fromJSON` round-trips them.
- [ ] Create `scripts/modules/world/components/renderable.js` — holds the asset id (`kind`); attaches a cloned `THREE.Group` from AssetManager (Task 8 wires this up; until then, the component just stores the kind).
- [ ] Create `scripts/modules/world/components/grid-placement.js` — holds `cell: {cx, cz}`, `rotationStep: 0..3` (90° increments). Applies position/rotation to the entity's Object3D when added.
- [ ] Create `tests/world/grid.test.js` covering `worldToCell` round-trip with `cellToWorld`, snap behaviour, bounds errors, occupancy lifecycle.
- [ ] Create `tests/world/entity.test.js` covering component map operations and `addEntity`/`removeEntity` event emission.
- [ ] Create `tests/world/components.test.js` covering Transform serialisation round-trip and GridPlacement applied transform.
- [ ] Run `npm test` — all world tests pass.
- [ ] Bump `VERSION` to `V1_7_0`.
- [ ] Verify: tests pass; no browser-side change yet (next task wires this in).

### Decisions

<!-- Filled in during execution. -->

---

## Task 8: AssetManager and manifest schema

### Objective

Implement the manifest-driven `AssetManager` with `core` tier preload, lazy `load(id)`, and progress reporting. Author an initial `assets/manifest.json` with one or two test entries.

### Expected Outcomes

- `assets/manifest.json` exists with a documented schema: `{ version, assets: [{ id, path, type: "gltf", tier: "core" | "world" }] }`.
- `AssetManager.preloadCore()` returns a Promise that resolves when all `core`-tier assets have loaded; reports `(loaded, total, currentId)` to a progress callback.
- `AssetManager.get(id)` returns a clone of the loaded `THREE.Group` (uses `SkeletonUtils.clone` if any descendant is a `SkinnedMesh`, otherwise plain clone).
- `AssetManager.load(id)` lazy-loads a non-core asset and caches it.
- Throws `ManifestError` on duplicate ids or unknown tier names; throws `AssetLoadError` on fetch/parse failures.

### Risks / Constraints

- This task uses a placeholder asset (a small generated GLB committed to the repo, or a single KayKit file the user has already dropped in). If the KayKit assets are not in place yet, use a generated cube via `BoxGeometry` wrapped in a `Group` — verify the AssetManager pipeline plumbs end-to-end without depending on real assets.
- `SkeletonUtils.clone` is the correct clone for skinned meshes; the standard `.clone()` doesn't deep-clone the skeleton and animations break.

### Steps

- [ ] Create `assets/manifest.json` with one entry: `{ "id": "test.cube", "path": "assets/test/cube.glb", "type": "gltf", "tier": "core" }`. (We'll add real KayKit entries in Task 11.)
- [ ] Create a tiny placeholder GLB at `assets/test/cube.glb` — generate via Three.js `GLTFExporter` in a one-off script, or hand-author the smallest valid glTF JSON + bin. Commit alongside the manifest.
- [ ] Create `scripts/modules/engine/asset-manager.js` exporting `AssetManager`. Constructor takes a `manifestPath` and an optional `progressCallback`.
- [ ] `loadManifest()` fetches the JSON, validates schema (throw `ManifestError` for missing fields, duplicate ids, unknown tier names), stores the index `Map<id, entry>`.
- [ ] `preloadCore()` filters entries by `tier === "core"`, loads them in parallel via `GLTFLoader`, calls progressCallback after each, resolves when all complete. Cache parsed `THREE.Group` results in `_cache: Map<id, Group>`.
- [ ] `load(id)` lazy-loads a single entry (de-duped via an in-flight map so concurrent calls share one fetch).
- [ ] `get(id)` returns a clone — uses `SkeletonUtils.clone` if any descendant is a `SkinnedMesh`, else `.clone(true)`.
- [ ] Create `tests/engine/asset-manager.test.js` mocking `fetch` and `GLTFLoader`. Cover: manifest validation errors, preloadCore progress reporting, get/load caching, duplicate-id rejection.
- [ ] In `App.start()`, instantiate `AssetManager`, call `preloadCore()` with a console-log progress callback. Replace the spinning cube with `assets.get("test.cube")` after preload resolves.
- [ ] Run `npm test`.
- [ ] Bump `VERSION` to `V1_8_0`.
- [ ] Verify in browser: console shows progress lines; the spinning shape is now the loaded cube asset; tests pass.

### Decisions

<!-- Filled in during execution. -->

---

## Task 9: Loading overlay with Knockout

### Objective

Wire up Knockout — `AppViewModel`, `bindings.js`, and a loading overlay that binds to asset preload progress and fades out after the first rendered frame.

### Expected Outcomes

- `AppViewModel` exposes `version`, `loadStatus` (string), `loadProgress` ({ loaded, total }), `isLoading` (boolean).
- A full-screen loading overlay is visible during boot, shows current asset id and progress, and fades out smoothly after `core` preload + first render.
- The HUD CSS uses `clamp()` typography and `vmin`-relative units.
- All `ko.bindingHandlers.*` registration lives in `scripts/modules/ui/bindings.js`.

### Risks / Constraints

- KO's default `visible` binding is instant. For fade-out, use a small custom binding (`fadeVisible`) or CSS transitions on opacity gated by a class.
- `ko.applyBindings` should run AFTER `AppViewModel` is constructed but BEFORE any subsystem starts emitting progress, otherwise initial state can be missed.

### Steps

- [ ] Create `scripts/modules/ui/app-view-model.js` exporting `AppViewModel`. Constructor takes `({ version })`. Observables: `loadStatus`, `loadProgress`, `cameraMode` (pre-declared for later), `saveStatus`. PureComputeds: `isLoading = loadProgress().loaded < loadProgress().total`, `loadPercent = Math.round(loaded / total * 100)`.
- [ ] Create `scripts/modules/ui/bindings.js` registering a `fadeOut` custom binding that toggles a CSS class with an opacity transition.
- [ ] Add to `index.html`: an overlay `<div id="loading-overlay" data-bind="fadeOut: !isLoading()">` containing a centered title, current asset name, and percentage. Add CSS in `styles/main.css` using `clamp()` for typography, `vmin` for sizing, opacity transition for fade-out.
- [ ] In `App.start()`, before `preloadCore`: construct `AppViewModel({ version: VERSION })`, store as `app.viewModel`, call `ko.applyBindings(app.viewModel)`. Wire the AssetManager progress callback to update `viewModel.loadProgress` and `viewModel.loadStatus`.
- [ ] Trigger overlay fade-out one frame *after* the first `renderer.render()` post-preload (use `requestAnimationFrame` to defer).
- [ ] Bump `VERSION` to `V1_9_0`.
- [ ] Verify in browser: overlay shows during boot with progress text and percentage; smoothly fades out once the cube is rendered; resizing the window keeps the overlay legible at common desktop sizes.

### Decisions

<!-- Filled in during execution. -->

---

## Task 10: BuilderCamera and CameraController abstract

### Objective

Define the abstract `CameraController` interface and implement `BuilderCamera` — orbit/pan/zoom around a focus point. Make it the active camera; replace the placeholder cube with a single tile to look at.

### Expected Outcomes

- `CameraController` defines `activate()`, `deactivate()`, `fixedUpdate(dt)`, `frameUpdate(alpha)`, and a `.camera` property (the Three.js camera).
- `BuilderCamera` orbits with right-mouse-drag, pans with WASD or middle-mouse-drag, zooms with the wheel, all damped.
- `App.setCameraMode("builder")` activates it on the renderer.
- A flat ground plane (`PlaneGeometry`) is visible and the camera can orbit around it.

### Risks / Constraints

- `THREE.OrbitControls` would do most of this for free, but it's an examples module with its own opinions and event wiring. Implementing manually is more code but matches our `Input`-driven architecture cleanly. Decision: roll our own using `Input` events.
- Damping on orbit/pan/zoom needs to update inside `frameUpdate`, not `fixedUpdate` — visual smoothness, not simulation.

### Steps

- [ ] Create `scripts/modules/engine/cameras/camera-controller.js` — abstract base class with no-op `activate`, `deactivate`, `fixedUpdate(dt)`, `frameUpdate(alpha)`; abstract `camera` getter.
- [ ] Create `scripts/modules/engine/cameras/builder-camera.js` extending `CameraController`. Constructor takes `(input, { initialFocus, initialDistance, minDistance, maxDistance })`. Holds: focus point (`THREE.Vector3`), spherical coords `{ theta, phi, distance }`, target spherical coords (for damping), `THREE.PerspectiveCamera`.
- [ ] In `activate()`, subscribe to `input.on("pointerdown")`, `pointermove`, `pointerup`, `wheel`. Right-button drag updates target theta/phi; middle-button drag pans focus; wheel adjusts target distance. In `deactivate()`, unsubscribe.
- [ ] In `fixedUpdate(dt)`, also poll `input.isDown` for `KeyW/A/S/D` to pan focus along camera-relative axes.
- [ ] In `frameUpdate(alpha)`, lerp current spherical/focus toward targets (damping factor e.g. 0.15), recompute camera position from spherical, call `camera.lookAt(focus)`.
- [ ] In `App.start()`, after Renderer + Input + AssetManager: construct `BuilderCamera`, call `setCameraMode("builder")` (which activates the controller and calls `renderer.setActiveCamera(builderCamera.camera)`).
- [ ] Replace the test cube with a `THREE.Mesh(PlaneGeometry(20, 20), MeshStandardMaterial)` rotated to lie flat, plus a `HemisphereLight` so it's visible. (KayKit floor tiles arrive in Task 12.)
- [ ] In the `GameLoop`, fan out `fixedUpdate(dt)` to `world.update(dt)` and `cameraController.fixedUpdate(dt)`; `frameUpdate(alpha)` to `cameraController.frameUpdate(alpha)` then `renderer.render()`.
- [ ] Bump `VERSION` to `V1_10_0`.
- [ ] Verify in browser: a flat plane is visible; right-drag orbits, WASD pans, mouse wheel zooms; movement is smooth (damped) and stable.

### Decisions

<!-- Filled in during execution. -->

---

## Task 11: Real KayKit assets — manifest entries and Renderable integration

### Objective

Add real KayKit entries to the manifest, finalise the `Renderable` component to use `AssetManager.get`, and place a single floor tile and wall tile in the world to confirm the pipeline.

### Expected Outcomes

- `assets/manifest.json` contains entries for at least `floor.stone.basic`, `wall.stone.straight`, `wall.stone.corner` pointing to real KayKit `.gltf` files.
- One floor tile and one wall segment are visible in the scene, lit by a hemisphere light, with KayKit textures applied.
- `Renderable.attach(world, assetManager)` mounts a cloned `THREE.Group` under the entity's `Object3D`.

### Risks / Constraints

- **Asset precondition.** KayKit Dungeon Remastered must be at `assets/kaykit/dungeon-remastered/{gltf,textures}/` for this task. If not, this task is blocked.
- KayKit `.gltf` files are non-binary glTF (separate `.bin` and texture files referenced by relative path). The `GLTFLoader` handles this automatically as long as the relative paths are preserved on disk.
- Material setup: KayKit ships with `MeshStandardMaterial` baked in. No special handling required, but lighting matters — without a light, everything is black.

### Steps

- [ ] Inspect the KayKit `gltf/` folder to identify exact filenames for a basic floor tile and a straight wall (record specific filenames in the task's Decisions section as reference).
- [ ] Add entries to `assets/manifest.json` for the chosen tiles. Use the documented id convention (`floor.stone.basic`, `wall.stone.straight`).
- [ ] Update `Renderable` to call `assetManager.get(this.kind)` in an `attach(entity)` method that parents the cloned group under `entity.object3D`.
- [ ] Update `Entity.fromKind(kind, world, assetManager)` (a new static factory) to construct `new Entity(kind, new THREE.Group())`, add a `Renderable(kind)` component, call `attach`, return the entity.
- [ ] In `App.start()`, after preloadCore, instantiate `World(new Grid(20, 20))`. Place ONE floor tile via `world.addEntity(Entity.fromKind("floor.stone.basic", world, assets))` plus a `GridPlacement(0, 0)` component. Place one wall the same way. Add a `HemisphereLight` and a `DirectionalLight` to `world.scene`.
- [ ] Replace the placeholder plane with the floor tile.
- [ ] Bump `VERSION` to `V1_11_0`.
- [ ] Verify in browser: a textured KayKit floor tile and wall are visible, correctly positioned and lit; can orbit around them; no missing-texture errors in console.

### Decisions

<!-- Filled in during execution. -->

---

## Task 12: Compose the walkable empty room

### Objective

Procedurally lay out a small room — a grid of floor tiles and a perimeter of walls — using the entity/component pattern. The result is the visible "room" the foundation demo will walk inside.

### Expected Outcomes

- A rectangular room (e.g. 6×8 floor tiles) with walls along the perimeter is visible.
- All tiles are entities in the world, not raw meshes, so they participate in serialisation later.
- Corner walls use the corner tile asset; straight sections use the straight tile.

### Risks / Constraints

- Wall rotation: KayKit straight walls and corner walls have a specific "default" orientation that varies per asset. Validate the rotation step in `GridPlacement` corresponds to 0/90/180/270° applied to the Object3D's Y axis.
- Doorways/openings out of scope for foundation — the room is sealed.

### Steps

- [ ] Create `scripts/modules/world/builders/empty-room.js` exporting `buildEmptyRoom(world, assets, { width, depth })`. Iterates floor cells and emits floor entities; iterates perimeter and emits wall entities (corners at the four corners, straights on the edges with appropriate rotation).
- [ ] In `App.start()`, replace the single-tile placement with a call to `buildEmptyRoom(world, assets, { width: 6, depth: 8 })`.
- [ ] Adjust the `BuilderCamera` initial focus and distance to frame the whole room sensibly.
- [ ] Bump `VERSION` to `V1_12_0`.
- [ ] Verify in browser: a complete rectangular KayKit room is visible — floor + perimeter walls + corners — with consistent textures and correct rotations; the builder camera frames it on boot; orbiting/panning/zooming works smoothly around it.

### Decisions

<!-- Filled in during execution. -->

---

## Task 13: FirstPersonCamera and camera switching

### Objective

Implement `FirstPersonCamera` (pointer-lock, WASD, gravity to floor) and the `App.setCameraMode("firstPerson")` switch. Update the HUD to reflect the active mode.

### Expected Outcomes

- Pressing `Tab` (or another agreed key) switches between builder and first-person modes.
- In first-person mode, clicking the canvas requests pointer-lock; mouse movement looks around; WASD walks; gravity keeps the camera at floor height.
- The HUD shows different content per mode (a small indicator chip, the build palette is hidden in FP mode).

### Risks / Constraints

- Pointer-lock requires a user gesture. The mode switch itself doesn't lock — the user clicks the canvas in FP mode to lock.
- "Gravity to floor" is simple here — clamp camera y to a fixed eye height (e.g. 1.7 m). No actual physics, no collision with walls (foundation scope; collisions come later).

### Steps

- [ ] Create `scripts/modules/engine/cameras/first-person-camera.js` extending `CameraController`. Constructor takes `(input, { eyeHeight = 1.7, walkSpeed = 4 })`. Holds yaw, pitch, position, target velocity.
- [ ] In `activate()`: subscribe to `input.on("pointermove")` for look (ignored unless pointer-locked); register a one-time canvas click handler that calls `input.requestPointerLock(canvas)`; subscribe to `input.on("pointerlockchange")`. In `deactivate()`: unsubscribe and `input.exitPointerLock()`.
- [ ] In `fixedUpdate(dt)`: read `input.isDown` for `KeyW/A/S/D`, build a velocity vector in camera-relative space, integrate position, clamp y to `eyeHeight`.
- [ ] In `frameUpdate`: update camera quaternion from yaw/pitch.
- [ ] Add `App.setCameraMode(mode)` that swaps active controller, calls `oldController.deactivate()`, `newController.activate()`, updates `renderer.setActiveCamera`, and sets `viewModel.cameraMode(mode)`.
- [ ] Bind `Tab` (preventDefault) on `input.on("keydown")` to toggle modes.
- [ ] Add a small HUD chip in `index.html` bound to `viewModel.cameraMode` showing "BUILDER" / "FIRST PERSON".
- [ ] Bump `VERSION` to `V1_13_0`.
- [ ] Verify in browser: Tab toggles modes; chip updates; in FP mode, click canvas → pointer locks → mouse looks around, WASD walks across the room floor at constant eye height; Tab again returns to builder camera with state preserved.

### Decisions

<!-- Filled in during execution. -->

---

## Task 14: Walker placeholder character — DEMO MILESTONE

### Objective

Place a simple character entity in the room with a `Walker` component that patrols a small path. This completes the "walkable empty room" MVP bar.

### Expected Outcomes

- A KayKit character (or a primitive capsule if no character asset is wired yet) is visible in the room and walks back and forth between two waypoints.
- In FP mode, the character is visible from the player's POV.
- The foundation demo bar is met: KayKit-tiled floor + walls, builder camera, switchable FP camera, character walking around.

### Risks / Constraints

- KayKit character animations are out of scope here — the `Animator` component (using `THREE.AnimationMixer`) is design-noted but not implemented in the foundation. The character slides without animating its rig. Document this explicitly so it's not surprising.
- If no character asset is wired, fall back to a `CapsuleGeometry` mesh so the walker behaviour can still be demonstrated. Note the fallback in Decisions.

### Steps

- [ ] Add a character asset entry to the manifest (e.g. `character.placeholder` pointing at any KayKit character `.gltf`, or skip if no character asset is in the pack — use a capsule fallback).
- [ ] Create `scripts/modules/world/components/walker.js` — holds waypoints array, current index, speed, `update(dt)` moves the entity along the path and ping-pongs at the endpoints.
- [ ] In `App.start()`, after `buildEmptyRoom`: place a character entity at one corner of the room with a Walker component patrolling between two opposite cells.
- [ ] Bump `VERSION` to `V1_14_0`.
- [ ] Verify in browser: **THIS IS THE FOUNDATION DEMO** — the room is visible, builder camera frames it on boot, the placeholder character walks back and forth, Tab switches to FP mode where you can walk around with WASD and watch the character patrol from a first-person perspective.

### Decisions

<!-- Filled in during execution. -->

---

## Task 15: WorldSerializer — toJSON / fromJSON round-trip

### Objective

Implement the world-level serialiser that produces and consumes a plain-object snapshot of the world's entities. Cover with a round-trip test fixture.

### Expected Outcomes

- `WorldSerializer.toJSON(world)` returns `{ version, entities: [{ kind, components: {...} }] }` with stable ordering.
- `WorldSerializer.fromJSON(world, snapshot, assetManager)` clears existing entities and reconstructs them.
- A round-trip test loads a JSON fixture, applies it, re-serialises, and asserts deep equality.
- Unknown `kind` strings during load are collected into an error report (returned from `fromJSON`), not thrown — the world loads minus the orphans.

### Risks / Constraints

- Component round-trip depends on each component implementing `toJSON`/`fromJSON` correctly. Components added in Task 7 need a quick audit.
- Versioning the snapshot now (even at v1) lets future schema migrations slot in without ambiguity.

### Steps

- [ ] Create `scripts/modules/world/world-serializer.js` exporting `WorldSerializer` (or a pair of free functions `toJSON`, `fromJSON`).
- [ ] `toJSON(world)` iterates entities, for each calls `entity.toJSON()` (which iterates components and calls each component's `toJSON()`), produces `{ version: 1, entities: [...] }`.
- [ ] `fromJSON(world, snapshot, assets)` clears the world (remove all entities), iterates `snapshot.entities`, calls `Entity.fromKind(...)`, applies component data, collects unknown-kind warnings; returns `{ loaded: n, skipped: m, warnings: [...] }`.
- [ ] Create `tests/data/world/empty-room-6x8.json` — a hand-authored snapshot of the room from Task 12 (ok to generate this once via a temporary `console.log(JSON.stringify(WorldSerializer.toJSON(world)))` and commit the result).
- [ ] Create `tests/world/world-serializer.test.js` covering: round-trip equality, unknown-kind warnings, version field present.
- [ ] Run `npm test`.
- [ ] Bump `VERSION` to `V1_15_0`.
- [ ] Verify: tests pass; no browser-side change.

### Decisions

<!-- Filled in during execution. -->

---

## Task 16: SaveService — File System Access API + localStorage autosave

### Objective

Implement `SaveService` wrapping the File System Access API with retained `FileSystemFileHandle`, blob-download fallback for unsupported browsers, and an always-on `localStorage` autosave.

### Expected Outcomes

- `SaveService.save(snapshot)` opens `showSaveFilePicker` on first call, retains the handle, writes silently on subsequent calls; emits `saved` / `saveFailed`.
- On Firefox/Safari (no `showSaveFilePicker`), falls back to a `<a download>` blob trigger; emits the same events.
- An autosave timer writes to `localStorage` every 30 s as a recovery net; `loadFromAutosave()` reads it back on demand.
- Vitest tests cover the logic with the FSA API mocked.

### Risks / Constraints

- The `FileSystemFileHandle` is not serialisable. We hold it in memory only; on page reload, the user gets prompted again on the first save. Not a regression; document.
- `localStorage` quota is ~5 MB. A large lair could exceed it. Detect and emit `saveFailed` with a clear message; don't crash.

### Steps

- [ ] Create `scripts/modules/engine/save-service.js` extending `Emitter`.
- [ ] `constructor({ getSnapshot, autosaveIntervalMs = 30000 })` — stores the snapshot-producer callback.
- [ ] `save()`: if `_handle` is null and `window.showSaveFilePicker` exists, prompt and store the handle. If no FSA support, trigger a download. Write the snapshot. Emit `saved` or `saveFailed`.
- [ ] `_startAutosave()`: every interval, write `getSnapshot()` to `localStorage["cozy-lairs.autosave"]`. Catch quota errors and emit `saveFailed`.
- [ ] `loadFromAutosave()`: read and parse from localStorage; null if absent or invalid.
- [ ] `dispose()`: clear interval.
- [ ] Create `tests/engine/save-service.test.js` with `// @vitest-environment jsdom`. Mock `window.showSaveFilePicker`, `FileSystemFileHandle`, `createWritable`. Cover: first save prompts and retains handle, second save silent, fallback when picker undefined, autosave writes to localStorage, autosave catches quota error.
- [ ] In `App.start()`, instantiate SaveService, subscribe `viewModel.saveStatus` to its events. Bind `Ctrl+S` on `input.keydown` to call `saveService.save(WorldSerializer.toJSON(world))` (preventDefault).
- [ ] Run `npm test`.
- [ ] Bump `VERSION` to `V1_16_0`.
- [ ] Verify in browser: Ctrl+S opens the file picker the first time; subsequent Ctrl+S writes silently; reload the page, check `localStorage` has the autosave entry; tests pass.

### Decisions

<!-- Filled in during execution. -->

---

## Task 17: Dev console — events tab

### Objective

Build the dev console panel and the events tab. Install the `Emitter._devSink` to populate the ring buffer; implement filtering and pause/resume.

### Expected Outcomes

- Backtick toggles a slide-in panel on the right edge of the viewport. `?debug=1` URL param auto-opens it.
- Events tab shows the last 500 events with timestamp, emitter class name (+ optional `name`), event name, and a JSON payload preview.
- Filter inputs: emitter class regex, event name regex. Pause/resume button stops appending without disconnecting.
- All emitters in the codebase (Input, World, SaveService) flow through.

### Risks / Constraints

- The dev sink runs synchronously inside `emit`. The console must not push events back into emitters — risk of infinite recursion. Use a flag to short-circuit re-entry.
- Ring buffer should use a fixed-size circular array, not a growing array shifted on every push (perf).

### Steps

- [ ] Create `scripts/modules/engine/dev/dev-console-view-model.js` exposing observables for `isOpen`, `activeTab`, `eventsBuffer` (an `ko.observableArray` of the last 500 events), `isPaused`, `emitterFilter`, `eventFilter`.
- [ ] Create `scripts/modules/engine/dev/dev-console.js` with `install()` that sets `Emitter._devSink = (emitter, event, payload) => this._record(emitter, event, payload)`.
- [ ] `_record` short-circuits if `isPaused`; constructs `{ time: performance.now(), emitterClass, emitterName, event, payload }` and pushes to the ring buffer (replacing oldest if at cap).
- [ ] Add HTML in `index.html`: a `<aside id="dev-console" data-bind="visible: isOpen">` containing tab buttons and an `<ul>` for events. CSS for slide-in animation, monospace font, dark theme.
- [ ] Add a KO `foreach` over the filtered events buffer (computed observable applying regex filters).
- [ ] In `App.start()`: instantiate `DevConsole`, call `install()`. Bind backtick on `input.keydown` to toggle. On boot, check `URLSearchParams` for `debug=1` and auto-open.
- [ ] Bump `VERSION` to `V1_17_0`.
- [ ] Verify in browser: press backtick — panel slides in; observe live events from Input (keydown, pointermove), World (entityAdded), SaveService (saved). Filter by class name; pause/resume works; `?debug=1` auto-opens.

### Decisions

<!-- Filled in during execution. -->

---

## Task 18: Dev console — stats tab

### Objective

Add the stats tab — FPS, ms/frame, sim tick rate, draw calls, triangle count, entity count, asset cache size — reading from `THREE.WebGLRenderer.info` and internal counters.

### Expected Outcomes

- Stats tab updates ~10× per second (not every frame — throttled to keep the DOM update cost low).
- Numbers reflect reality: spawning more entities increases the entity count and triangle count.
- A small inline FPS gauge sits in the corner of the viewport whenever the dev console is open (always visible, not just when stats tab is active).

### Risks / Constraints

- Updating every observable each frame causes KO bindings to re-evaluate too often. Throttle stats updates to 10 Hz via a separate timer in the dev console.

### Steps

- [ ] Add observables to `DevConsoleViewModel`: `fps`, `frameMs`, `simTickRate`, `drawCalls`, `triangles`, `entityCount`, `assetCacheSize`.
- [ ] Create a `_pollStats()` method scheduled via `setInterval(100ms)` that reads `renderer.info.render.calls`, `.triangles`, `world.entities.size`, `assetManager.cacheSize`, and a frame timer kept in the GameLoop.
- [ ] Extend `GameLoop` with public `fps` and `frameMs` properties (rolling average over last ~30 frames).
- [ ] Add a stats tab section to `index.html` with KO bindings for each value.
- [ ] Add a small fixed-corner FPS chip visible whenever `isOpen` is true.
- [ ] Bump `VERSION` to `V1_18_0`.
- [ ] Verify in browser: stats update; numbers respond when entities are added/removed; FPS chip is visible during dev console use; closing the console hides the chip.

### Decisions

<!-- Filled in during execution. -->

---

## Task 19: Dev console — quick actions strip

### Objective

Add the quick actions strip — buttons to toggle camera mode, dump world JSON to console, force a save failure, and reload the manifest.

### Expected Outcomes

- Each button performs the documented action and is reachable while the dev console is open.
- "Force save failure" exercises the error path end-to-end (toast appears, dirty flag stays set).
- "Dump world JSON" pretty-prints the current snapshot in the browser console.
- "Reload manifest" re-fetches `assets/manifest.json` and re-runs `preloadCore` (entities reload their visuals).

### Risks / Constraints

- Reload manifest mid-session is a non-trivial operation — entities hold references to cloned groups. Easiest implementation: clear the asset cache, then iterate entities and re-attach their `Renderable` components. Document this in the task's Decisions.

### Steps

- [ ] Add a `<div id="dev-quick-actions">` to the dev console template with four buttons.
- [ ] Wire each button to a `DevConsoleViewModel` method:
  - `toggleCameraMode()` → calls `App.setCameraMode(...)`.
  - `dumpWorldJSON()` → `console.log(JSON.stringify(WorldSerializer.toJSON(world), null, 2))`.
  - `forceSaveFailure()` → calls a debug-only `SaveService._forceFailNextSave()` flag-setter, then `saveService.save(...)`.
  - `reloadManifest()` → calls `assetManager.reload()` (new method that clears cache and re-runs preloadCore), then walks `world.entities` and calls each `Renderable.reattach()`.
- [ ] Implement `SaveService._forceFailNextSave()` (sets a debug flag; next save emits `saveFailed` with a synthetic error and clears the flag).
- [ ] Implement `AssetManager.reload()` and `Renderable.reattach()`.
- [ ] Bump `VERSION` to `V1_19_0`.
- [ ] Verify in browser: each button performs as documented; force-save-failure correctly fires the toast and leaves the world consistent; reload-manifest visibly refreshes the room.

### Decisions

<!-- Filled in during execution. -->

---

## Task 20: Fatal error overlay, global handlers, and min-viewport guard

### Objective

Add the fatal error overlay surfaced by `App.start()` failures, register global `error`/`unhandledrejection` handlers for non-fatal toasts, and add the "make your window bigger" overlay shown below 1024×640.

### Expected Outcomes

- Throwing inside `App.start()` shows a full-screen overlay with the error name, message, and stack in a `<details>`. No partial app left running.
- Uncaught errors and unhandled rejections at runtime show a non-blocking toast; the game keeps running.
- Resizing the browser below 1024×640 covers the canvas with a friendly overlay; resizing above hides it.

### Risks / Constraints

- The fatal overlay's HTML must already be in the DOM at boot (we can't depend on running code to inject it after a fatal failure). Inline static HTML in `index.html`, hidden by default, surfaced by setting a class.
- The min-viewport overlay must not block the dev console — the user might want to debug with a small viewport. Stack ordering in CSS: dev console > min-viewport-overlay > everything else.

### Steps

- [ ] Add to `index.html`: `<div id="fatal-overlay" hidden>` with `<h1>Cozy Lairs failed to start</h1>`, an `<h2>` for error class name, a `<p>` for message, a `<details>` for stack. Style as a full-screen modal.
- [ ] Wrap `App.start()`'s body in a try/catch that calls a `_showFatalError(err)` method which un-hides the overlay and populates fields. Do NOT continue with rendering loops or asset loading after a fatal.
- [ ] Add global `window.addEventListener("error", ...)` and `unhandledrejection` listeners in `App.start()`. These call a `viewModel.toast(msg, level: "error")` method that pushes to a small toast queue (display top-right, 4 s auto-dismiss).
- [ ] Add a `<div id="toast-tray">` bound to `viewModel.toasts` (`foreach`).
- [ ] Add a `<div id="min-viewport-overlay" data-bind="visible: viewportTooSmall">` to `index.html`. `viewportTooSmall` is a KO computed driven by a `window.resize` listener that updates `viewModel.viewport({ width, height })`.
- [ ] Style the min-viewport overlay (centered, friendly message: "Cozy Lairs needs a bit more room — try 1024×640 or larger.").
- [ ] Bump `VERSION` to `V1_20_0`.
- [ ] Verify in browser: deliberately throw inside `App.start()` (e.g. `throw new Error("test")` then revert) — fatal overlay appears with name/message/stack, nothing else runs; from the dev console, run `Promise.reject("test")` — toast appears; resize the window narrow — min-viewport overlay covers the canvas; resize back — overlay hides.

### Decisions

<!-- Filled in during execution. -->

---

## Task 21: Conventions doc pass and README

### Objective

Capture project-specific conventions established during the foundation build into `.claude/CLAUDE.md`, and write a brief `README.md` covering how to run, test, and build on the foundation.

### Expected Outcomes

- `.claude/CLAUDE.md` has new sections for: events-as-facts-not-commands rule (with example), per-pack asset folder layout, where new components go, how to add a new emitter, the testing convention, the dev console keybinds.
- `README.md` covers: prerequisites (a static server, Node + npm for tests), how to run the dev page, how to run tests, asset placement instructions (with attribution to KayKit), the demo controls (WASD/Tab/`/` `/`Ctrl+S/backtick).
- The version number visible at boot matches `V1_21_0` (the last task in this plan).

### Risks / Constraints

- No risk; pure documentation.

### Steps

- [ ] Update `.claude/CLAUDE.md` with new convention sections: **Eventing — direct subscription, no global bus**; **Events are facts, never commands**; **Per-pack asset folder layout under `assets/kaykit/<pack-slug>/`**; **Testing — Vitest with logic-only by default, jsdom opt-in**; **Dev console — backtick toggle, `?debug=1` auto-open, dev sink is one-way**.
- [ ] Create `README.md` at the project root with sections: Overview, Running the dev page (mentions a local static server with `npx serve`), Running tests (`npm test`), Asset setup (KayKit Dungeon Remastered placement, link to itch.io, encouragement to support Kay Lousberg), Demo controls, Project layout (link to design + plan).
- [ ] Bump `VERSION` to `V1_21_0`.
- [ ] Bump `.project/project.md`'s `Current Version` to `V1.21.0` and double-check that the design and plan links resolve.
- [ ] Verify in browser: open the page, the boot banner / version display reads `V1_21_0`; `README.md` renders correctly when viewed on disk.

### Decisions

<!-- Filled in during execution. -->

---

### Notable Deviations from Design

<!-- Filled in during execution. -->

---

### Issues and Adjustments

<!-- Filled in during execution based on testing and user feedback. -->
