# Plan: Cozy Lairs Foundation (V0)

## Context

This plan implements the foundation design at [.project/designs/design-v0.md](../designs/design-v0.md). The goal is a working "walkable empty room" demo on top of a clean engine/world/ui layered architecture: Three.js renderer, scene-graph + component entities, tile grid, switchable builder/first-person cameras, manifest-driven KayKit asset loading, Knockout-bound HUD, save/load via the File System Access API, Vitest for logic tests, and a built-in dev console with live event/stat inspection.

Tasks are ordered so the walkable empty room is achievable as early as possible (Task 14 — DEMO MILESTONE). Save/load, dev console, and final polish land afterwards to complete the foundation deliverables.

**Versioning convention.** This plan is `plan-v0.md` → **plan number 0**. The `VERSION` constant in `scripts/app.js` uses the format `V{plan}_{task}_{release}`. The plan component only changes when a *new* plan file is created (e.g. `plan-v1.md` would bump VERSION to `V1_0_0`). The release component is *never* bumped by hand — it's reserved for an automated build script. Children reset to 0 when their parent is incremented (so `V0_0_0` → `V0_1_0` → `V0_2_0` … as tasks complete; if a Plan 1 ever lands, `V0_N_0` → `V1_0_0`).

**Note:** The original prose for this convention misstated the plan number as 1; the per-task version stamps in the steps below were executed against that incorrect convention (V1_1_0, V1_2_0, …, V1_14_0). The live VERSION constant has been corrected to `V0_14_0` to match the rule. The historical step text is left as a record of what was actually done.

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

- [*] Download Three.js stable release (latest stable; record exact version in CLAUDE.md). Vendor `build/three.module.js`, `examples/jsm/loaders/GLTFLoader.js`, and `examples/jsm/utils/SkeletonUtils.js` into `libs/three/` (preserving the relative import paths inside the example files).
- [*] Create `libs/three/index.js` that re-exports `* from "./three.module.js"` so the import map can resolve `three` to a single entry point.
- [*] Create `index.html` with: `<meta charset>`, viewport meta, an `<script type="importmap">` mapping `three` → `./libs/three/index.js`, `three/addons/loaders/GLTFLoader.js` → `./libs/three/GLTFLoader.js`, `three/addons/utils/SkeletonUtils.js` → `./libs/three/SkeletonUtils.js`, `knockout` → `./libs/knockout-3.5.1.js`. Include `<div id="app"></div>` and `<script type="module" src="./scripts/app.js"></script>`.
- [*] Create `scripts/app.js` with `const VERSION = "V1_1_0"` at the top, an `App` class (`constructor` + `start()`), instantiation, `window.App = app`, and a DOM-ready guard wrapping `app.start()`.
- [*] Implement `App.start()` to write a "Cozy Lairs — booting" message into `#app` (placeholder; will be replaced).
- [*] Create `package.json` with `"type": "module"`, scripts (`test`, `test:watch`), and devDependency on `vitest` (latest stable).
- [*] Run `npm install`.
- [*] Create `vitest.config.js` with `environment: 'node'` default and `test.include: ['tests/**/*.test.js']`.
- [*] Create `tests/sanity.test.js` containing one trivial passing test (`expect(1).toBe(1)`).
- [*] Run `npm test` — verify the sanity test passes.
- [*] Verify in browser: open `index.html` via a local static server, confirm the "booting" placeholder renders with no console errors, confirm `window.App` is reachable from devtools.

### Decisions

- Three.js version pinned: **r171** (npm package `three@^0.171.0`). Recorded here rather than in CLAUDE.md because the version is already discoverable in `package.json` — duplicating it would just rot.
- Three.js r171's `three.module.js` is split — it re-exports from a sibling `three.core.js`. Both files must be vendored to `libs/three/`. Initial vendoring missed `three.core.js` (caught by 404 during Task 4 verify); fixed retroactively. Any future re-vendoring must copy: `three.module.js`, `three.core.js`, `examples/jsm/loaders/GLTFLoader.js`, `examples/jsm/utils/SkeletonUtils.js`, `examples/jsm/utils/BufferGeometryUtils.js`.
- `GLTFLoader.js` internally imports `'../utils/BufferGeometryUtils.js'` — a relative path that assumes the npm `examples/jsm/{loaders,utils}/` sibling layout. We flatten everything under `libs/three/`, so any re-vendor must edit `libs/three/GLTFLoader.js` line 68 to read `'./BufferGeometryUtils.js'` after copying. Caught by 404 during Task 8 verify.
- Knockout stays a UMD-loaded `<script>` (sets `window.ko`) rather than being routed through the import map. Reason: knockout-3.5.1 is UMD and uses `this`-as-global at top level, which breaks under module evaluation. Matches the cobol.js convention. The import map only carries `three` and `three/addons/...`.
- Removed the placeholder `vendor:three` script from `package.json` since vendoring was done manually for this initial pass. Add a real script if/when re-vendoring becomes routine.
- Added `jsdom` to devDependencies up-front (used in later tasks for Input/SaveService tests). Cheaper to install once than to add later.
- Asset folder structure: KayKit packs are arranged as `assets/kaykit/<pack>/models/{gltf,textures}/` rather than the design's `assets/kaykit/<pack>/{gltf,textures}/`. Extra `models/` segment will be reflected in manifest paths starting at Task 11. Recording here so it's not forgotten.

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

- [*] Create `scripts/modules/engine/emitter.js` exporting an `Emitter` class with `_handlers` (a `Map<string, Set<Function>>`), `on(event, handler)`, `off(event, handler)`, `emit(event, payload)`, plus the static `_devSink` field.
- [*] In `emit`, swallow handler exceptions and `console.error` them so one bad subscriber doesn't break others.
- [*] In `emit`, call `Emitter._devSink(this, event, payload)` at the end if `_devSink !== null`.
- [*] Create `tests/engine/emitter.test.js` with cases: subscribe/emit, unsubscribe, multiple subscribers, exception in one handler doesn't block others, dev sink fires for every emit, dev sink null state has no side effect.
- [*] Add `afterEach(() => { Emitter._devSink = null; })` in the test file.
- [*] Run `npm test` — all Emitter tests pass.
- [*] Bump `VERSION` to `V1_2_0` in `scripts/app.js`.
- [*] Verify: tests pass; no browser-side change yet.

### Decisions

- Added an extra defensive try/catch around the dev sink call inside `emit`. The plan only required wrapping handler exceptions, but since the dev sink runs for *every* emit across the whole app, a bad sink (e.g. a future console-renderer bug) would otherwise become an app-wide crash bus. Symmetry with the handler try/catch costs almost nothing.
- Tests use vitest's `vi.spyOn(console, "error")` to silence and assert the expected error logging. Adds a soft dependency on vitest's spy API but keeps tests clean — the alternative (manually replacing `console.error`) is more code without being safer.
- 9 Emitter tests; 10 tests total in suite; all pass.

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

- [*] Create `scripts/modules/engine/errors.js` with a base `CozyLairsError extends Error` (sets `this.name = this.constructor.name`).
- [*] Add subclasses: `AssetLoadError`, `SaveError`, `ManifestError`, `WebGLUnavailableError`, `GridBoundsError`, `PlacementError`.
- [*] Create `scripts/modules/engine/index.js` re-exporting all error classes plus the `Emitter` from Task 2.
- [*] Create `tests/engine/errors.test.js` with cases: `new AssetLoadError("x") instanceof Error`, `instanceof CozyLairsError`, `instanceof AssetLoadError`; `.name === "AssetLoadError"`; thrown error's stack is preserved.
- [*] Run `npm test` — all error tests pass.
- [*] Bump `VERSION` to `V1_3_0`.
- [*] Verify: tests pass.

### Decisions

- Subclasses are empty `class X extends CozyLairsError {}` declarations — no per-class constructor overrides. The base sets `name = this.constructor.name`, so subclasses pick up their own name without ceremony. Adding a new error type is a one-line declaration.
- Errors module organised into `/* SECTION */` banners by domain (Assets, Persistence, Rendering, World) per the project coding-style. Easier to find related errors when adding new ones.
- Façade re-exports `Emitter` alongside the error classes — first concrete consumer of the `engine/index.js` façade pattern. Establishes that submodules import each other directly (e.g. errors.js doesn't import from index.js) while external callers use the façade.
- 15 error tests (loop-generated for the 6 subclasses) + façade re-export check; 25 tests total in suite; all pass.

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

- [*] Create `scripts/modules/engine/renderer.js` exporting a `Renderer` class.
- [*] Constructor takes a `canvasWrapper` DOM element. Creates `<canvas>` inside it, instantiates `THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })`, sets clear color to a placeholder dark blue.
- [*] If WebGL context creation fails, throw `WebGLUnavailableError`.
- [*] Construct an empty `THREE.Scene` and a temporary `THREE.PerspectiveCamera(60, 1, 0.1, 1000)` positioned at `(0, 5, 8)` looking at origin. Store both as `this.scene`, `this.activeCamera`.
- [*] Add `setActiveCamera(camera)` and `setSize(width, height)` methods. The latter updates renderer size, `pixelRatio = Math.min(devicePixelRatio, 2)`, and `activeCamera.aspect`.
- [*] Wire `ResizeObserver` on the canvas wrapper to call `setSize` with current dimensions.
- [*] Add a `render()` method calling `this.renderer.render(this.scene, this.activeCamera)`.
- [*] In `index.html`, replace `#app` with a `<div id="canvas-wrapper">` styled to fill the viewport (`position: fixed; inset: 0;`).
- [*] Update `App.start()` to construct `Renderer(document.getElementById("canvas-wrapper"))` and call `renderer.render()` once after construction.
- [*] Bump `VERSION` to `V1_4_0`.
- [*] Verify in browser: the page shows a uniform dark blue canvas filling the viewport. Resizing the window keeps the canvas full-bleed and proportionally correct.

### Decisions

- WebGL detection: probe `canvas.getContext("webgl2") || canvas.getContext("webgl")` *before* constructing `THREE.WebGLRenderer` and throw `WebGLUnavailableError` if both fail. Three.js's WebGLRenderer doesn't throw on context failure — it logs and produces a half-broken renderer — so a pre-flight check is cleaner than inspecting `renderer.getContext()` post-construction.
- WebGL1 fallback included alongside WebGL2 in the probe. Three.js r171 prefers WebGL2 internally but supports WebGL1 fallback transparently. Cheap insurance against older Firefox-on-Linux configurations.
- `setSize` passes `false` for the third arg to `renderer.setSize(w, h, updateStyle)` — we manage canvas CSS sizing via the wrapper's stylesheet, so Three.js doesn't need to inject inline width/height styles. Keeps the canvas filling the wrapper cleanly under flexbox/grid changes.
- `MAX_PIXEL_RATIO = 2` and `CLEAR_COLOR = 0x0a0e14` are file-local constants (matches the body background `#0a0e14` for a seamless boot look).
- `setActiveCamera` immediately syncs the new camera's aspect to the current wrapper size — without that, switching from builder to FP camera would render the new camera with stale aspect until the next resize event.
- Added `dispose()` for cleanup symmetry. Not used yet but cheap to add now and lets future code (e.g. mode switching, hot reload) tear down the renderer cleanly.

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

- [*] Create `scripts/modules/engine/game-loop.js` exporting a `GameLoop` class.
- [*] Constructor accepts `{ fixedDt = 1 / 60, onFixedUpdate, onFrameUpdate }` options.
- [*] Implement the accumulator: each RAF, compute `realDt = now - lastTime`, clamp to 250 ms, add to accumulator, drain in fixed-`fixedDt` chunks calling `onFixedUpdate(fixedDt)` per chunk, then call `onFrameUpdate(alpha)` where `alpha = accumulator / fixedDt`.
- [*] Add `start()` and `stop()` methods (idempotent — guard against double-start).
- [*] In `App.start()`, after `Renderer` construction: add a temporary `THREE.Mesh(BoxGeometry, MeshNormalMaterial)` to `renderer.scene`, instantiate `GameLoop` with `onFixedUpdate(dt) => cube.rotation.y += dt` and `onFrameUpdate() => renderer.render()`. Call `loop.start()`.
- [*] Bump `VERSION` to `V1_5_0`.
- [*] Verify in browser: cube spins smoothly at constant rate; opening devtools and pausing/resuming JS doesn't cause runaway sim.

### Decisions

- Cube spins on **both** X and Y axes (slightly different rates, 0.6 and 0.9 rad/s) instead of just Y as the plan suggested. Y-only looks like a 2D billboard rotating; combined-axis spin makes it visibly volumetric and is a clearer signal that the loop is actually running every frame.
- Placeholder cube construction extracted to `App._buildPlaceholderCube()` rather than inlined. It will get deleted in Task 11 when KayKit assets land, so naming it explicitly makes the future "delete this" line easy to find.
- `MAX_ACCUMULATED_SECONDS = 0.25` matches the plan. Any longer would let a backgrounded tab rack up enough catch-up ticks to freeze on resume; any shorter and a brief stall on a slow machine would visibly slow the simulation. 250 ms is the conventional sweet spot.
- No tests for `GameLoop` — it's tightly coupled to `requestAnimationFrame` and `performance.now`, both fiddly to mock cleanly under jsdom. Behaviour is verified visually (cube rotation rate is constant). If the loop later gains testable pure logic (e.g. FPS averaging in Task 18), tests follow there.

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

- [*] Create `scripts/modules/engine/input.js` extending `Emitter`.
- [*] In constructor, accept a `target` element (default `window`); attach listeners for `keydown`, `keyup`, `pointermove`, `pointerdown`, `pointerup`, `wheel`, `pointerlockchange`.
- [*] Maintain `_keys: Set<string>` populated from `keydown`/`keyup` `event.code` values; expose `isDown(code)`.
- [*] Normalise emitted payloads: `{ code, key, ctrl, shift, alt, meta }` for keyboard; `{ x, y, dx, dy, button, buttons }` for pointer; `{ deltaX, deltaY, deltaZ }` for wheel.
- [*] Add `requestPointerLock(element)` and `exitPointerLock()` methods; emit `pointerlockchange` with `{ locked: bool }`.
- [*] Add `dispose()` to remove all listeners.
- [*] Create `tests/engine/input.test.js` with `// @vitest-environment jsdom`. Test: `keydown` event populates `_keys` and emits with normalised payload; `keyup` removes from `_keys`; multiple modifiers passed through; `dispose` removes listeners.
- [*] In `App.start()`, instantiate `Input` and store on `app.input`. Subscribe a temporary log handler to `keydown` that `console.log`s the code (for verification only — remove after verifying).
- [*] Run `npm test` — all Input tests pass.
- [*] Bump `VERSION` to `V1_6_0`.
- [*] Verify in browser: tests pass; pressing keys logs `{ code: "KeyW", ... }` etc. to the console; remove the temporary log handler.

### Decisions

- Pointer-lock listener attaches to `document` (not `target`/`window`) because `pointerlockchange` is dispatched on `document` regardless of which element holds the lock. Detail of the spec; doing it any other way would silently miss events.
- Keyboard `keydown` payload includes `repeat: bool` — not in the original plan but useful enough to be worth two extra characters on the wire. Camera controllers will ignore repeats; future text-input HUDs may want them.
- Pointer dx/dy come from `event.movementX/Y` (with `|| 0` fallback). Under pointer-lock, absolute clientX/Y stop changing, so consumers tracking mouse-look need movement deltas; keeping these in the standard payload means FP camera can ignore the lock state entirely and just integrate dx/dy.
- `wheel` listener registered with `{ passive: false }` so future zoom code can `preventDefault()` to suppress browser scroll. Cost is a minor perf flag; benefit is not having to re-add the listener later.
- `dispose()` clears `_handlers` (the parent Emitter map) in addition to detaching DOM listeners — otherwise a disposed Input could still hold references to subscriber closures via `this._handlers`, defeating GC for any objects they captured.
- Skipped a pointermove test because jsdom's PointerEvent support is partial and synthesizing one with `movementX`/`movementY` is fiddly without producing brittle tests. Browser verification covers it.
- Keydown logger is left in `App.start()` for verification; it'll be removed after sign-off.

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

- [*] Create `scripts/modules/world/grid.js` exporting a `Grid` class with `cellSize` (default 2), `width`, `depth`, occupancy `Map<string, Entity>` keyed by `"x,z"`. Methods: `worldToCell(x, z)`, `cellToWorld(cx, cz)` (returns center of cell), `snapToEdge(x, z)`, `isInBounds(cx, cz)`, `setOccupant(cx, cz, entity)`, `getOccupant(cx, cz)`, `clearOccupant(cx, cz)`. Throw `GridBoundsError` for out-of-bounds writes.
- [*] Create `scripts/modules/world/world.js` extending `Emitter`. Constructor takes a `Grid`. Owns `THREE.Scene`, `entities: Set<Entity>`. Methods: `addEntity(entity)`, `removeEntity(entity)`, `update(dt)` (calls each entity's `update(dt)` if defined). Emits `entityAdded`, `entityRemoved`.
- [*] Create `scripts/modules/world/entity.js`. Constructor: `(kind: string, object3D: THREE.Object3D)`. Fields: `kind`, `object3D`, `components: Map`. Methods: `addComponent(component)`, `getComponent(name)`, `update(dt)` (delegates to components with `update`), `toJSON()` (serialises kind + each component's `toJSON`), static `fromJSON(json, world, assets)`.
- [*] Create `scripts/modules/world/components/transform.js` — wraps Object3D position/rotation/scale; `toJSON`/`fromJSON` round-trips them.
- [*] Create `scripts/modules/world/components/renderable.js` — holds the asset id (`kind`); attaches a cloned `THREE.Group` from AssetManager (Task 8 wires this up; until then, the component just stores the kind).
- [*] Create `scripts/modules/world/components/grid-placement.js` — holds `cell: {cx, cz}`, `rotationStep: 0..3` (90° increments). Applies position/rotation to the entity's Object3D when added.
- [*] Create `tests/world/grid.test.js` covering `worldToCell` round-trip with `cellToWorld`, snap behaviour, bounds errors, occupancy lifecycle.
- [*] Create `tests/world/entity.test.js` covering component map operations and `addEntity`/`removeEntity` event emission.
- [*] Create `tests/world/components.test.js` covering Transform serialisation round-trip and GridPlacement applied transform.
- [*] Run `npm test` — all world tests pass.
- [*] Bump `VERSION` to `V1_7_0`.
- [*] Verify: tests pass; no browser-side change yet (next task wires this in).

### Decisions

- **Components are keyed by their constructor**, not by a string `name`. Resolves `entity.getComponent(GridPlacement)` rather than `entity.getComponent("gridPlacement")`. Catches typos at the call site (a missing import errors loudly) and avoids the duplicate-string-literal problem.
- **Grid coordinate convention**: cell (cx, cz) covers world rectangle `[cx*S, (cx+1)*S] × [cz*S, (cz+1)*S]`. Cell (0,0) sits in the +X/+Z quadrant with its low corner at the origin. Edges between cells fall on integer multiples of S (clean wall snapping). Documented in the file header so future contributors don't have to reverse-engineer it from the math.
- **GridPlacement applies its transform via `onAddedToWorld`, not `attach`**. The position depends on `world.grid.cellSize`, which isn't known when the component is constructed. Plan called for either approach; chose the world-side hook because it keeps the component self-contained (no Grid reference held permanently).
- **Components have *two* attach hooks**: `attach(entity)` runs in `addComponent` (entity ref now available), `onAddedToWorld(world)` runs in `World.addEntity` (world ref now available). Symmetric `onRemovedFromWorld` exists too. This separation lets components express dependencies clearly: Renderable will use `onAddedToWorld` in Task 11 to fetch from the AssetManager, which will live on the world or app — placing those calls in `attach` would force entities to be in a half-constructed state too long.
- **Transform is a wrapper, not a replacement** for Object3D's transform fields. Its only real job is `toJSON()` / `applyJSON()`. Considered making `Transform` mandatory on every entity (auto-added by Entity constructor), but decided not to — entities that don't need their transform serialised (transient effects, rays, selection markers) shouldn't pay the cost. Add it explicitly when serialisation matters.
- **Transform deserialisation is `applyJSON(json)`**, not `static fromJSON(...)`. The component instance already exists (added when constructing the entity); we just need to push deserialised data into it. Static factories make sense for components that need their constructor to do real work; Transform doesn't.
- **`Entity.fromJSON` is intentionally not implemented yet**. The plan listed it; deferred to Task 15 (WorldSerializer) because doing it correctly requires a component-class registry, which is properly the serializer's concern. `Entity.toJSON` is fully working and tested — that's the half that matters now.
- **`gridChanged` event named in `World` doc but not emitted yet**. Reserved for Task 12 when the room-builder mutates the grid. Documenting now so callers know to expect it.
- 67 tests total across 8 files; all pass.

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

- [*] Create `assets/manifest.json` with one entry: `{ "id": "test.cube", "path": "assets/test/cube.glb", "type": "gltf", "tier": "core" }`. (We'll add real KayKit entries in Task 11.)
- [*] Create a tiny placeholder GLB at `assets/test/cube.glb` — generate via Three.js `GLTFExporter` in a one-off script, or hand-author the smallest valid glTF JSON + bin. Commit alongside the manifest.
- [*] Create `scripts/modules/engine/asset-manager.js` exporting `AssetManager`. Constructor takes a `manifestPath` and an optional `progressCallback`.
- [*] `loadManifest()` fetches the JSON, validates schema (throw `ManifestError` for missing fields, duplicate ids, unknown tier names), stores the index `Map<id, entry>`.
- [*] `preloadCore()` filters entries by `tier === "core"`, loads them in parallel via `GLTFLoader`, calls progressCallback after each, resolves when all complete. Cache parsed `THREE.Group` results in `_cache: Map<id, Group>`.
- [*] `load(id)` lazy-loads a single entry (de-duped via an in-flight map so concurrent calls share one fetch).
- [*] `get(id)` returns a clone — uses `SkeletonUtils.clone` if any descendant is a `SkinnedMesh`, else `.clone(true)`.
- [*] Create `tests/engine/asset-manager.test.js` mocking `fetch` and `GLTFLoader`. Cover: manifest validation errors, preloadCore progress reporting, get/load caching, duplicate-id rejection.
- [*] In `App.start()`, instantiate `AssetManager`, call `preloadCore()` with a console-log progress callback. Replace the spinning cube with `assets.get("test.cube")` after preload resolves.
- [*] Run `npm test`.
- [*] Bump `VERSION` to `V1_8_0`.
- [*] Verify in browser: console shows progress lines; the spinning shape is now the loaded cube asset; tests pass.

### Decisions

- **Deviation from plan: skipped the placeholder GLB.** The plan called for a hand-authored `assets/test/cube.glb` to smoke-test the loader. Since the user already had KayKit assets in place, used `floor_dirt_small_A.gltf` (id `test.floor`) instead. Same end-to-end test of the pipeline; saves authoring a placeholder we'd never use again. The "test." prefix on the manifest id flags it as scaffolding to be replaced when Task 11's real id schema lands (`floor.dirt.small.A` etc.).
- Cache stores a *bundle* `{ root, animations, hasSkinnedMesh }`, not just the root. Three reasons: animations need to live with the rig they came from (otherwise reattaching them to a clone is fiddly), `hasSkinnedMesh` is computed once at load instead of per-clone, and adding fields later (e.g. bounding box, prepared materials) doesn't change the cache shape.
- **`get(id)` throws if not loaded** rather than auto-loading. Keeping `get` synchronous makes Renderable.attach (Task 11) a one-liner — async-on-demand loads belong in `load(id)`. Components that need a fallback can branch explicitly.
- **In-flight de-duplication via a separate `_inFlight` map**, not by reusing `_cache` with a Promise sentinel. Cleaner mental model: `_cache` is "ready to use", `_inFlight` is "wait for this". Concurrent `load` calls share a Promise; once it resolves, `_inFlight` is cleared and `_cache` populated.
- **Spinning cube removed in favour of a static lit floor tile**. The cube served Task 5's loop verification; this task replaces it. Added `HemisphereLight` + `DirectionalLight` so the floor's PBR materials are visible (KayKit ships `MeshStandardMaterial` baked in — without lights, everything is black).
- **`App.start()` is now async**. Boot waits for manifest + core preload before building the scene. The bootstrap function catches and logs any rejection until Task 20 wires up the fatal-error overlay.
- 15 AssetManager tests; 82 tests total; all pass.

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

- [*] Create `scripts/modules/ui/app-view-model.js` exporting `AppViewModel`. Constructor takes `({ version })`. Observables: `loadStatus`, `loadProgress`, `cameraMode` (pre-declared for later), `saveStatus`. PureComputeds: `isLoading = loadProgress().loaded < loadProgress().total`, `loadPercent = Math.round(loaded / total * 100)`.
- [*] Create `scripts/modules/ui/bindings.js` registering a `fadeOut` custom binding that toggles a CSS class with an opacity transition.
- [*] Add to `index.html`: an overlay `<div id="loading-overlay" data-bind="fadeOut: !isLoading()">` containing a centered title, current asset name, and percentage. Add CSS in `styles/main.css` using `clamp()` for typography, `vmin` for sizing, opacity transition for fade-out.
- [*] In `App.start()`, before `preloadCore`: construct `AppViewModel({ version: VERSION })`, store as `app.viewModel`, call `ko.applyBindings(app.viewModel)`. Wire the AssetManager progress callback to update `viewModel.loadProgress` and `viewModel.loadStatus`.
- [*] Trigger overlay fade-out one frame *after* the first `renderer.render()` post-preload (use `requestAnimationFrame` to defer).
- [*] Bump `VERSION` to `V1_9_0`.
- [*] Verify in browser: overlay shows during boot with progress text and percentage; smoothly fades out once the cube is rendered; resizing the window keeps the overlay legible at common desktop sizes.

### Decisions

- **`isReady` boolean instead of `!isLoading`** drives the fade-out. The plan suggested binding to `!isLoading()` (true once loaded === total), but that would fade out the overlay before the first frame renders, briefly exposing an unrendered canvas. Using a discrete `isReady` flag set after a double-RAF defer means the boot transition is "preload finishes → first frame draws → overlay fades", with no flash of unrendered scene.
- **Double-RAF defer** (one frame to schedule the render, a second frame to confirm it has happened) is conservative belt-and-braces. A single RAF would usually suffice but can race with browser repaint cycles in some configurations; doubling adds ~16 ms which is invisible.
- **Progress bar added** in addition to the percentage text the plan called for. Single-asset boot completes too fast to notice text-only feedback; a 3px bar gives a visible, smooth motion that confirms the pipeline is alive and working. Cheap to add, easier to retain than to retrofit.
- **`window.ko` aliased at the top of every UI module** (`const ko = window.ko;`) rather than relying on the bare `ko` identifier resolving to globalThis in module scope. Aliasing makes the dependency on the UMD-loaded global explicit and avoids any "is `ko` in scope?" ambiguity. Documented as a convention to apply to all KO-using modules.
- **`bindings.js` uses a side-effect import** (`import "./modules/ui/bindings.js"` with no name) — registering custom bindings is by definition a side effect. Exported a sentinel `__sideEffectImport` constant so tooling can't tree-shake the import away if a bundler enters the picture later.
- **Overlay sits in DOM at boot** with `class="fade-target"` already applied. Initial state is "visible". This avoids the FOUC where the overlay would briefly not exist on slow loads.
- **No tests for this task.** Pure UI wiring; visual regression is the verifier. KO bindings against jsdom are testable but high effort for low value at this stage.

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

- [*] Create `scripts/modules/engine/cameras/camera-controller.js` — abstract base class with no-op `activate`, `deactivate`, `fixedUpdate(dt)`, `frameUpdate(alpha)`; abstract `camera` getter.
- [*] Create `scripts/modules/engine/cameras/builder-camera.js` extending `CameraController`. Constructor takes `(input, { initialFocus, initialDistance, minDistance, maxDistance })`. Holds: focus point (`THREE.Vector3`), spherical coords `{ theta, phi, distance }`, target spherical coords (for damping), `THREE.PerspectiveCamera`.
- [*] In `activate()`, subscribe to `input.on("pointerdown")`, `pointermove`, `pointerup`, `wheel`. Right-button drag updates target theta/phi; middle-button drag pans focus; wheel adjusts target distance. In `deactivate()`, unsubscribe.
- [*] In `fixedUpdate(dt)`, also poll `input.isDown` for `KeyW/A/S/D` to pan focus along camera-relative axes.
- [*] In `frameUpdate(alpha)`, lerp current spherical/focus toward targets (damping factor e.g. 0.15), recompute camera position from spherical, call `camera.lookAt(focus)`.
- [*] In `App.start()`, after Renderer + Input + AssetManager: construct `BuilderCamera`, call `setCameraMode("builder")` (which activates the controller and calls `renderer.setActiveCamera(builderCamera.camera)`).
- [*] Replace the test cube with a `THREE.Mesh(PlaneGeometry(20, 20), MeshStandardMaterial)` rotated to lie flat, plus a `HemisphereLight` so it's visible. (KayKit floor tiles arrive in Task 12.)
- [*] In the `GameLoop`, fan out `fixedUpdate(dt)` to `world.update(dt)` and `cameraController.fixedUpdate(dt)`; `frameUpdate(alpha)` to `cameraController.frameUpdate(alpha)` then `renderer.render()`.
- [*] Bump `VERSION` to `V1_10_0`.
- [*] Verify in browser: a flat plane is visible; right-drag orbits, WASD pans, mouse wheel zooms; movement is smooth (damped) and stable.

### Decisions

- **Did not add a placeholder PlaneGeometry**. Plan called for it as a "look at something" surface, but Task 8 already put the real KayKit floor tile in the scene; replacing it with a placeholder plane would be regressive. Floor tile stays put; lights stay put; camera now orbits around it.
- **World introduced in this task, not deferred to Task 11**. The plan's Task 11 said "instantiate `World(new Grid(20, 20))`", but Task 10's GameLoop fan-out already references `world.update(dt)`. Brought the World construction forward. Renderer gained a `setScene(scene)` method so the World owns the scene tree (cleaner: render config = camera + scene; the renderer is just the GPU adapter). The lone floor tile is added directly to `world.scene` as a raw mesh for now — it becomes a real `Entity` in Task 11 when manifest gets fleshed out.
- **`setCameraMode` lives on `App`, not on the renderer or the controllers**. App is the only thing that knows about all of them; the controllers don't know each other exists. `App._cameraControllers` is a `{ mode: controller }` lookup map populated as new modes land (Task 13 adds `firstPerson`).
- **Camera controllers register input handlers in `activate()`**, never in the constructor. This is what makes mode-switching clean — a deactivated controller doesn't react to input. Bound handler refs are stored on the instance so `off()` matches what `on()` registered.
- **Right-mouse for orbit, middle-mouse for drag-pan, WASD for keyboard pan**. Keyboard pan is sim-locked (`fixedUpdate`); pointer events update targets immediately. All movement damped via lerp toward target each `frameUpdate` (`DAMPING = 0.18`). `phi` clamped to a near-top-down range (`PHI_MIN = 0.18` ≈ 10° from vertical, `PHI_MAX ≈ 85°` from vertical) so the user can't flip below the floor or all the way to overhead-vertigo.
- **Pan speed scales with zoom distance** (`distScale = clamp(distance / 18, 0.5, 3.0)`). Without it, panning feels too fast when zoomed in and too slow when zoomed out. Standard builder-camera UX.
- **Context menu suppressed on the canvas wrapper** so right-drag for orbit doesn't trigger the browser context menu mid-drag.
- **`gridChanged` event still not emitted** — reserved for Task 12 when the room builder mutates the grid.
- 82 tests still pass; no new tests for camera controllers (visual feel is the verifier; per-task design choice carried forward from GameLoop).
- **Post-verify fix #1:** initial camera focus moved from the abstract grid centre `(20, 0, 20)` to the floor tile's actual location `(grid.cellToWorld(centerCell))`. Originally the lone tile sat in cell (0,0) (world ~1,0,1) while the camera orbited around the empty geometric centre — which made the tile appear to whip around the periphery on right-drag. User flagged this as feeling "really weird and clunky." Tile is now placed in the centre cell; focus tracks it. Also lowered initial distance from 18 to 12 so the tile fills more of the viewport.
- **Post-verify fix #2:** `_panFocusInScreenSpace` was hand-derived 2D math with a sign error — pan ended up perpendicular to the look direction. Replaced with `camera.getWorldDirection()` + cross-product against `WORLD_UP` to derive the proper forward/right vectors. Caches two `THREE.Vector3` temps on the instance to avoid per-frame allocations.
- **Post-verify fix #3:** added a `THREE.GridHelper` overlay (40m, 20 divisions = 2m cells, slightly off the floor at y=0.001 to avoid z-fighting). Gives the user visible spatial reference so the orbit pivot and pan direction are obvious. Will likely stay through later tasks as a building-mode aid; can be hidden behind a debug toggle later.
- **Post-verify fix #4:** middle-drag pan uses `(event.dy, -event.dx)` to give a "drag the world with the cursor" feel — when you drag right, the world appears to follow your cursor right (focus moves left). Standard for builder-style games.
- **Post-verify fix #5:** flipped `crossVectors(WORLD_UP, forward)` → `crossVectors(forward, WORLD_UP)`. The first form gives the *left* vector in Three.js's right-handed coordinate convention; the right vector is `forward × up`. Bug surfaced as A and D being swapped in the default camera orientation.
- **Post-verify fix #6:** orbit speed dialled down (`ORBIT_SPEED 0.005 → 0.003`, ~40% slower) and pan button moved from middle (button 1) to left (button 0). Left-drag-pan is the universal convention for builder/sim games. UI interception note: HUD overlays use the standard `pointer-events: none` on the container with `pointer-events: auto` on individual widgets — empty viewport space falls through to the canvas, so left-drag pan is safe alongside the HUD. When build mode lands later, it'll need to claim the left button when a tile is being placed; trivial to add via a flag the camera checks before starting a drag.
- **Post-verify fix #7:** drag-pan upgraded from "scaled-by-distance heuristic" to true raycast-anchored pan. On `pointerdown` the cursor is raycast onto the floor plane (y=0); the world hit becomes `_dragAnchor`. On every `pointermove` while dragging, the cursor is raycast again and the focus translates by `(_dragAnchor - currentHit)` so the original anchor point stays under the cursor for the duration of the drag. Bypasses damping (sets both `_focus` and `_targetFocus`) and calls `_applyTransform()` immediately so the pan feels rigid — "the world is fixed to my mouse." Cached `Raycaster`, floor `Plane`, and three `Vector*` temps on the instance to avoid per-frame allocation. NDC conversion uses `window.innerWidth/Height` since the canvas is full-viewport. Damping retained for orbit, zoom, and WASD pan where smoothing actually helps.

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

- [*] Inspect the KayKit `gltf/` folder to identify exact filenames for a basic floor tile and a straight wall (record specific filenames in the task's Decisions section as reference).
- [*] Add entries to `assets/manifest.json` for the chosen tiles. Use the documented id convention (`floor.stone.basic`, `wall.stone.straight`).
- [*] Update `Renderable` to call `assetManager.get(this.kind)` in an `attach(entity)` method that parents the cloned group under `entity.object3D`.
- [*] Update `Entity.fromKind(kind, world, assetManager)` (a new static factory) to construct `new Entity(kind, new THREE.Group())`, add a `Renderable(kind)` component, call `attach`, return the entity.
- [*] In `App.start()`, after preloadCore, instantiate `World(new Grid(20, 20))`. Place ONE floor tile via `world.addEntity(Entity.fromKind("floor.stone.basic", world, assets))` plus a `GridPlacement(0, 0)` component. Place one wall the same way. Add a `HemisphereLight` and a `DirectionalLight` to `world.scene`.
- [*] Replace the placeholder plane with the floor tile.
- [*] Bump `VERSION` to `V1_11_0`.
- [*] Verify in browser: a textured KayKit floor tile and wall are visible, correctly positioned and lit; can orbit around them; no missing-texture errors in console.

### Decisions

- **Asset selection** (recorded for future tasks):
  - `floor.stone.basic` → `floor_tile_small.gltf` (clean dungeon stone tile, 2m square).
  - `wall.stone.straight` → `wall.gltf` (basic dungeon wall).
  - `wall.stone.corner` → `wall_corner.gltf` (corner piece for room perimeter).
- **`Renderable` owns its mesh lifecycle**, not `Entity.fromKind`. Constructor takes `(kind, assets)`; `onAddedToWorld` clones the asset and parents it under `entity.object3D`; `onRemovedFromWorld` removes it. Keeps the asset/lifecycle relationship inside one place rather than smearing it across `Entity.fromKind` and Renderable's data fields.
- **`Entity.fromKind(kind, assets)`** is a thin factory: builds an Entity with an empty `THREE.Group`, attaches a Renderable, returns. Callers add other components (GridPlacement, etc.) themselves, so the factory stays one-purpose.
- **Plan parameter signature simplified** from `Entity.fromKind(kind, world, assetManager)` to `Entity.fromKind(kind, assets)`. The `world` parameter wasn't actually needed at construction time — components hook the world via `onAddedToWorld` when `world.addEntity` is called. Dropping it makes the factory call-site shorter.
- **Wall placed in cell `(centerCell.cx + 1, centerCell.cz)`** at default rotation step (0). Visual orientation may not be "correct" relative to the floor — KayKit walls are modelled to sit on a cell edge with a specific facing, and Task 12 is the task that figures out per-position rotation rules. Task 11 just proves the asset/manifest/Renderable/GridPlacement pipeline plumbs end-to-end.
- **Test for Renderable still passes** with one-arg constructor (`new Renderable("wall.stone.straight")`); `assets` is undefined but only `toJSON` is exercised, which doesn't touch it. Will revisit in Task 15 when WorldSerializer hits Renderable round-trips.
- 82 tests still pass.
- **Post-verify scale fix:** confirmed via gltf accessor inspection that KayKit's native cell size is **4m**, not 2m. `floor_tile_large.gltf` and `wall.gltf` are both designed for 4m cells (`floor_tile_large` = 4×4×0.15m, `wall` = 4×4×1m). `floor_tile_small.gltf` is a 2m half-cell exception with no matching wall variant — mixing it with the standard wall caused the wall to dwarf the floor in the screenshot. Switched to `floor_tile_large` and changed grid to `new Grid(10, 10, 4)` (still ~40m world, but with 4m cells matching the asset pack). Camera initial distance bumped to 18 to frame the larger tiles. Recorded as a permanent note in CLAUDE.md so the convention isn't re-discovered painfully again.

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

- [*] Create `scripts/modules/world/builders/empty-room.js` exporting `buildEmptyRoom(world, assets, { width, depth })`. Iterates floor cells and emits floor entities; iterates perimeter and emits wall entities (corners at the four corners, straights on the edges with appropriate rotation).
- [*] In `App.start()`, replace the single-tile placement with a call to `buildEmptyRoom(world, assets, { width: 6, depth: 8 })`.
- [*] Adjust the `BuilderCamera` initial focus and distance to frame the whole room sensibly.
- [*] Bump `VERSION` to `V1_12_0`.
- [*] Verify in browser: a complete rectangular KayKit room is visible — floor + perimeter walls + corners — with consistent textures and correct rotations; the builder camera frames it on boot; orbiting/panning/zooming works smoothly around it.

### Decisions

- **New component: `EdgePlacement`** for entities that live on cell edges rather than inside cells. Walls fundamentally sit on edges (the boundary between two cells), not in cells, so reusing GridPlacement for them would be a category error. EdgePlacement takes `(cx, cz, side)` where `side ∈ {north, south, east, west}` and computes both the world-space position (edge midpoint) and Y rotation (so the decorated face turns into the room) on `onAddedToWorld`. Serialisable round-trip via `toJSON`. Throws on invalid side at construction so typos error loudly.
- **Corner pieces added** via a new `CornerPlacement` component. Component takes `(vx, vz, corner)` where `(vx, vz)` is the grid VERTEX (the meeting point of four cells, with vertex coordinates extending one past cell coordinates in each direction) and `corner ∈ {SW, SE, NW, NE}` selects the rotation. KayKit's wall_corner default rotation has its L-arms extending in -X and +Z (matches a SE room corner where arms reach back into south wall and east wall), so SE=0, SW=π/2, NW=π, NE=3π/2.
- **Post-verify z-fighting fix:** initial corner-on-wall placement caused interior z-fighting because the corner's L-arm inner faces (room-facing) sat at exactly the same world plane as the adjacent wall's inner face — same X/Z range, same direction, GPU couldn't pick a winner. Fix replaced the full straight wall in each of the four corner CELLS with a `wall.stone.half` (added to manifest) offset 1m along the edge axis *away from the corner*. The half-wall mesh and corner mesh now meet end-to-end at a single coincident plane that faces opposite directions (one's +X face, one's -X face) — backface culling resolves the coincidence cleanly with no flicker. Required extending `EdgePlacement` with a `lengthOffset` parameter (signed metres along the edge axis); zero by default for non-corner cells.
- **`addPerimeterWall(world, assets, cx, cz, side, atCorner, offset)`** helper extracted in the room builder to avoid duplicating the if-corner-then-half-else-full branch four times (south, north, east, west).
- **Post-verify asset-origin fix:** half-walls had visible *gaps* and STILL flickered. Root cause: KayKit's `wall_half.gltf` has bounds `[0..2, 0..4, -0.5..0.5]` — origin at one *end*, not the centre. Full walls have bounds `[-2..2, ...]` (centred). EdgePlacement was treating every asset as centred, so the half-wall ended up offset 1m in its local +X direction — half the wall sat where the corner already lived (z-fighting recurred there) and the other half left a 1m gap on the inner side. Fix: added an `originOffset` parameter to EdgePlacement, applied as a world-space delta along the asset's local +X direction `(cos(rot), 0, -sin(rot))`. Half-walls pass `-1` to compensate; centred assets default to 0. Also flagged in the EdgePlacement file header so future asymmetric KayKit assets get the same treatment.
- **Room dimensions hard-coded as a `ROOM` constant** at the top of `App` (`{ x0: 2, z0: 1, width: 6, depth: 8 }`). Used both by `_buildWorld` (passed to `buildEmptyRoom`) and `_buildCameraControllers` (to compute the framing focus). Keeps the two callsites in sync without threading a parameter.
- **Camera initial distance bumped to 30** (from 18 in Task 11) to frame the full 24m × 32m room.
- **Wall rotation conventions** documented in the EdgePlacement file header: south=0, north=π, west=π/2, east=-π/2. If KayKit's decorated face is on the *back* of what I assumed (and faces end up outward), flipping every rotation by π is a one-line change in the lookup table.
- 82 tests still pass; no new tests for `buildEmptyRoom` or `EdgePlacement` — visual is the verifier.

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

- [*] Create `scripts/modules/engine/cameras/first-person-camera.js` extending `CameraController`. Constructor takes `(input, { eyeHeight = 1.7, walkSpeed = 4 })`. Holds yaw, pitch, position, target velocity.
- [*] In `activate()`: subscribe to `input.on("pointermove")` for look (ignored unless pointer-locked); register a one-time canvas click handler that calls `input.requestPointerLock(canvas)`; subscribe to `input.on("pointerlockchange")`. In `deactivate()`: unsubscribe and `input.exitPointerLock()`.
- [*] In `fixedUpdate(dt)`: read `input.isDown` for `KeyW/A/S/D`, build a velocity vector in camera-relative space, integrate position, clamp y to `eyeHeight`.
- [*] In `frameUpdate`: update camera quaternion from yaw/pitch.
- [*] Add `App.setCameraMode(mode)` that swaps active controller, calls `oldController.deactivate()`, `newController.activate()`, updates `renderer.setActiveCamera`, and sets `viewModel.cameraMode(mode)`.
- [*] Bind `Tab` (preventDefault) on `input.on("keydown")` to toggle modes.
- [*] Add a small HUD chip in `index.html` bound to `viewModel.cameraMode` showing "BUILDER" / "FIRST PERSON".
- [*] Bump `VERSION` to `V1_13_0`.
- [*] Verify in browser: Tab toggles modes; chip updates; in FP mode, click canvas → pointer locks → mouse looks around, WASD walks across the room floor at constant eye height; Tab again returns to builder camera with state preserved.

### Decisions

- **`Input` gained `preventDefaultFor(code)` / `allowDefaultFor(code)` methods**. Tab needs `preventDefault` to suppress browser focus traversal, but the Input system was emitting normalised payloads only — consumers had no way to call `event.preventDefault`. Two alternatives considered: leak the raw event in the payload (encourages misuse since synthetic events can be pooled), or have the App register its own `keydown` listener bypassing Input (sets a precedent of multi-source keyboard input). Both rejected. The opt-in registry on Input keeps the abstraction clean: App registers `Tab` once at startup, the rest of the system is unaware.
- **FP camera initial position = room centre**. Same `centre` Vector3 the BuilderCamera uses for `initialFocus`, with the `.clone()` because BuilderCamera mutates its internal copy. y is clamped to `eyeHeight` (1.7m) inside the FirstPersonCamera constructor.
- **Pointer-lock click target is `canvasWrapper`, not the canvas directly**. The wrapper is the stable DOM element with reliable click semantics. Stored on `App.canvasWrapper` for clean access (was inline in `start()` before).
- **Tab toggle ignores key repeats** (`!event.repeat`). Holding Tab would otherwise spam mode switches. Reads `viewModel.cameraMode()` rather than tracking state separately — single source of truth.
- **HUD chip wrapped in `#hud` container** with `pointer-events: none` so empty HUD area doesn't intercept canvas clicks (interactive widgets restore `pointer-events: auto` via the `#hud > *` rule). The `#camera-mode-chip` itself overrides back to `none` since it's purely informational and shouldn't block clicks underneath.
- **No tests for FirstPersonCamera** — same reasoning as BuilderCamera: pointer-lock and mouse-look feel are visually verified, jsdom can't meaningfully exercise them.
- **Walking has no collision yet**. The room walls don't stop the FP camera — you can walk straight through them. Foundation scope; collision arrives later.
- **Post-verify mouse-look fix:** changed from "click-to-lock-then-free-look" to **WoW-style hold-right-mouse-to-look**. Free-cursor mode is now the default in FP — the cursor remains available for HUD interaction. Only while right-mouse is held does yaw/pitch follow mouse movement.
- **Post-verify pointer-lock removal:** dropped `Element.requestPointerLock` entirely. Each lock cycle made the browser pop up a "Press Esc to release" banner, which is unacceptable noise for a hold-to-look interaction. Now the FP camera just tracks `event.dx/dy` from the Input emitter while right-button is held — cursor stays visible, no banner, no `pointerlockchange` listener needed. Trade-off: the cursor can hit the screen edge during a long horizontal/vertical drag and further movement in that direction will stop registering. Acceptable for foundation; if it bites in practice we can add a "grab hand" cursor swap and revisit. `Input.requestPointerLock` / `exitPointerLock` remain in the engine for any future feature that genuinely needs them, but the FP camera no longer calls them.
- **Post-verify pointer-lock RESTORATION:** the no-lock approach felt "very weird" in practice — the cursor visibly drifting during drag was more disorienting than the banner. Pointer-lock reinstated. Confirmed with the user that the W3C-mandated banner ("Press Esc to release") and cursor-hiding-while-locked **cannot be suppressed** in any major browser; both are part of the Pointer Lock spec's security model. The banner appears briefly once per lock cycle and self-dismisses. Implementation matches Task 13's interim version: right-mouse-down requests lock, right-mouse-up exits, `pointerlockchange` keeps state in sync for browser-side unlocks (Esc, focus loss). `Input.requestPointerLock` / `exitPointerLock` are again the FP camera's call-site.

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

- [*] Add a character asset entry to the manifest (e.g. `character.placeholder` pointing at any KayKit character `.gltf`, or skip if no character asset is in the pack — use a capsule fallback).
- [*] Create `scripts/modules/world/components/walker.js` — holds waypoints array, current index, speed, `update(dt)` moves the entity along the path and ping-pongs at the endpoints.
- [*] In `App.start()`, after `buildEmptyRoom`: place a character entity at one corner of the room with a Walker component patrolling between two opposite cells.
- [*] Bump `VERSION` to `V1_14_0`.
- [*] Verify in browser: **THIS IS THE FOUNDATION DEMO** — the room is visible, builder camera frames it on boot, the placeholder character walks back and forth, Tab switches to FP mode where you can walk around with WASD and watch the character patrol from a first-person perspective.

### Decisions

- **Asset choice: `Skeleton_Minion.glb`** from the KayKit Skeletons pack. On-theme for the cute-evil aesthetic (a minion in your lair) and uses GLTFLoader's transparent `.glb` support — no manifest schema change needed.
- **Walker is straight-line waypoint ping-pong**, no easing or pause-at-endpoints. Two waypoints, snap to start, walk to the other, reverse, repeat. `update(dt)` runs in the entity's normal update cycle (driven by `world.update` from the game loop's `fixedUpdate`).
- **Y rotation faces the direction of travel** via `Math.atan2(dx, dz) + FACING_OFFSET`. `FACING_OFFSET = 0` assumes the model's local +Z is "forward". If the skeleton walks backward in-game, flip the offset to `Math.PI`.
- **`PATROL_SPEED = 1.6 m/s`** — slow enough to read clearly at 4m cells, fast enough to be a clear motion signal.
- **Patrol path: cell (3, 2) ↔ cell (6, 7)** — diagonal across the interior of the 6×8 room, leaving a 1-cell margin from walls.
- **No tests for Walker.** Pure visual feature; Grid math + `cellToWorld` already tested elsewhere.

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

- [*] Create `scripts/modules/world/world-serializer.js` exporting `WorldSerializer` (or a pair of free functions `toJSON`, `fromJSON`).
- [*] `toJSON(world)` iterates entities, for each calls `entity.toJSON()` (which iterates components and calls each component's `toJSON()`), produces `{ version: 1, entities: [...] }`.
- [*] `fromJSON(world, snapshot, assets)` clears the world (remove all entities), iterates `snapshot.entities`, calls `Entity.fromKind(...)`, applies component data, collects unknown-kind warnings; returns `{ loaded: n, skipped: m, warnings: [...] }`.
- [*] Create `tests/data/world/empty-room-6x8.json` — a hand-authored snapshot of the room from Task 12 (ok to generate this once via a temporary `console.log(JSON.stringify(WorldSerializer.toJSON(world)))` and commit the result).
- [*] Create `tests/world/world-serializer.test.js` covering: round-trip equality, unknown-kind warnings, version field present.
- [*] Run `npm test`.
- [*] Bump `VERSION` to `V1_15_0`.
- [*] Verify: tests pass; no browser-side change.

### Decisions

- **Module exports two free functions, not a class.** `toJSON(world)` and `fromJSON(world, snapshot, assets)` — there's no instance state to carry, and the namespace-import convention (`import * as WorldSerializer`) reads cleanly at the call site.
- **Component reconstruction uses a class-name → builder registry.** A small `COMPONENT_BUILDERS` table maps the saved class name (e.g. `"GridPlacement"`) to a function that constructs the component and adds it to the entity. New components register here when their save shape is finalised.
- **Renderable is auto-added by `Entity.fromKind`, so its snapshot entries are skipped on load.** Including `Renderable` in `toJSON` keeps the snapshot self-describing; skipping it on load avoids a duplicate component on the entity. Documented at the top of `world-serializer.js`.
- **`Transform` is the one component that uses `applyJSON` rather than constructor args.** It mutates the entity's existing `Object3D`, so the builder calls `addComponent(new Transform())` then `applyJSON(data)`. Other components use constructor args directly.
- **Unknown kinds and unknown component classes never throw.** Both produce entries in `result.warnings` and the lair loads minus the orphan. Matches the design's "graceful degrade" stance for save/load.
- **Fixture authored by hand**, not generated. Six entities covering every component class (`GridPlacement`, `EdgePlacement`, `CornerPlacement`, `Walker`, `Renderable`); enough surface to exercise round-trip without depending on `buildEmptyRoom` output.
- **VERSION bump corrected to `V0_15_0`** (not `V1_15_0` as the original step says). Plan-v0 means plan number 0; the V1.x.x was the bug fixed before resuming. Task list keeps the original wording so the original intent stays visible in the diff history.

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

- [*] Create `scripts/modules/engine/save-service.js` extending `Emitter`.
- [*] `constructor({ getSnapshot, autosaveIntervalMs = 30000 })` — stores the snapshot-producer callback.
- [*] `save()`: if `_handle` is null and `window.showSaveFilePicker` exists, prompt and store the handle. If no FSA support, trigger a download. Write the snapshot. Emit `saved` or `saveFailed`.
- [*] `_startAutosave()`: every interval, write `getSnapshot()` to `localStorage["cozy-lairs.autosave"]`. Catch quota errors and emit `saveFailed`.
- [*] `loadFromAutosave()`: read and parse from localStorage; null if absent or invalid.
- [*] `dispose()`: clear interval.
- [*] Create `tests/engine/save-service.test.js` with `// @vitest-environment jsdom`. Mock `window.showSaveFilePicker`, `FileSystemFileHandle`, `createWritable`. Cover: first save prompts and retains handle, second save silent, fallback when picker undefined, autosave writes to localStorage, autosave catches quota error.
- [*] In `App.start()`, instantiate SaveService, subscribe `viewModel.saveStatus` to its events. Bind `Ctrl+S` on `input.keydown` to call `saveService.save(WorldSerializer.toJSON(world))` (preventDefault).
- [*] Run `npm test`.
- [*] Bump `VERSION` to `V1_16_0`.
- [*] Verify in browser: Ctrl+S opens the file picker the first time; subsequent Ctrl+S writes silently; reload the page, check `localStorage` has the autosave entry; tests pass.

### Decisions

- **Autosave is started explicitly via `startAutosave()`, not from the constructor.** Lets tests instantiate the service without timer side-effects. App.js calls `startAutosave()` after wiring listeners. `dispose()` calls `stopAutosave()`.
- **Autosave size is exposed for monitoring.** User flagged the ~5 MB localStorage cap as a concern. SaveService tracks `lastAutosaveSize` and `lastAutosaveAt`, and a new `autosaved` event carries `{ size, at }` so the dev console (Task 18) can show growth. `QuotaExceededError` is detected by both `err.name === "QuotaExceededError"` and DOMException `code === 22`, then re-emitted as `saveFailed` with a human-readable message; the timer keeps ticking.
- **Picker cancellation surfaces as `saveFailed` with `cause.name === "AbortError"`.** The view-model differentiates and shows "Save cancelled" rather than a scary failure message. SaveError preserves the original cause via the `Error.cause` option so consumers can inspect it.
- **`Ctrl+S` binding**: `input.preventDefaultFor("KeyS")` suppresses the browser's "Save Page As" default. A dedicated `_saveHandler` on `input.keydown` checks `event.code === "KeyS" && event.ctrl && !event.repeat`. Trade-off: every plain `KeyS` keydown also has `preventDefault` called; this is harmless today (no text inputs in the HUD, FP camera reads `KeyS` from `_keys` which isn't affected by preventDefault), but if a text input ever lands in the HUD this binding will need to become input-aware.
- **Storage is dependency-injected** (`storage` constructor option, defaults to `window.localStorage`). Tests pass a Map-backed stub for predictability; the FSA-cancellation test and download-fallback test use real `URL.createObjectURL` mocks. No `forceFailNextSave` debug hook yet — that lands with the dev console quick actions in Task 19.
- **VERSION bump corrected to `V0_16_0`** (not `V1_16_0` as the original step says). Plan number 0 stays until plan-v1 is created. Step text left as-was for diff visibility.
- **Input fix surfaced during verify**: Ctrl+S was registering KeyS as held (camera nudged back) and the picker dialog stealing focus could leave KeyS stuck "on" indefinitely. Fixed in `engine/input.js`: keydowns with Ctrl or Meta held no longer add to `_keys`, and a new `window.blur` listener clears `_keys` whenever focus leaves the page (covers dialogs, Alt-Tab, OS prompts). 3 new Input tests cover these cases. See plan-level Issues / Adjustments.

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

- [*] Create `scripts/modules/engine/dev/dev-console-view-model.js` exposing observables for `isOpen`, `activeTab`, `eventsBuffer` (an `ko.observableArray` of the last 500 events), `isPaused`, `emitterFilter`, `eventFilter`.
- [*] Create `scripts/modules/engine/dev/dev-console.js` with `install()` that sets `Emitter._devSink = (emitter, event, payload) => this._record(emitter, event, payload)`.
- [*] `_record` short-circuits if `isPaused`; constructs `{ time: performance.now(), emitterClass, emitterName, event, payload }` and pushes to the ring buffer (replacing oldest if at cap).
- [*] Add HTML in `index.html`: a `<aside id="dev-console" data-bind="visible: isOpen">` containing tab buttons and an `<ul>` for events. CSS for slide-in animation, monospace font, dark theme.
- [*] Add a KO `foreach` over the filtered events buffer (computed observable applying regex filters).
- [*] In `App.start()`: instantiate `DevConsole`, call `install()`. Bind backtick on `input.keydown` to toggle. On boot, check `URLSearchParams` for `debug=1` and auto-open.
- [*] Bump `VERSION` to `V1_17_0`.
- [*] Verify in browser: press backtick — panel slides in; observe live events from Input (keydown, pointermove), World (entityAdded), SaveService (saved). Filter by class name; pause/resume works; `?debug=1` auto-opens.

### Decisions

- **Capture and display are decoupled.** `DevConsole` owns the ring buffer (a fixed 500-slot array with `_writeAt` + `_count`); the view-model owns the displayed `eventsBuffer` observableArray. A `setInterval(100ms)` flush copies the buffer snapshot into the observable only when `_dirty`, so high-frequency events (pointermove, fixedUpdate) don't trigger a KO re-evaluation per emit.
- **Payload capture stringifies at record time** using a `JSON.stringify` replacer that swaps any class instance (constructor !== Object, not an Array) for `[ClassName]`. This bounds the payload size and prevents Three.js Object3D cycles from blowing up the buffer; circular structures still throw inside JSON.stringify and are caught into a `[unserialisable: ...]` placeholder. Records are truncated at 240 chars for display.
- **Re-entrancy guard** (`_recording` flag) short-circuits any sink call that fires while the sink is already running. The dev sink itself never emits, but a logging handler in gameplay code might (e.g. logging an error during emit) — the guard keeps the sink honest under those conditions.
- **`uninstall` only clears `Emitter._devSink` if it still points at our sink.** If something else has installed itself in the meantime (e.g., a future profiler), `uninstall` leaves the new sink in place. Tested.
- **`?debug=1` auto-open and Backquote toggle.** Backquote uses `preventDefaultFor("Backquote")` like the other game shortcuts; the toggle handler also early-returns when the focused element is an `INPUT`/`TEXTAREA`/`contenteditable`, so typing backticks in the dev console's regex filters doesn't slam the panel shut.
- **CSS lives in `styles/main.css`**, not a separate file. Visual aesthetic note from CLAUDE.md ("not terminal/IDE chrome") is honoured for the *game's* visual identity; the dev console is a developer tool, monospace + neutral dark is appropriate there. Section header `DEV CONSOLE` keeps the file navigable.
- **VERSION bump corrected to `V0_17_0`** (not `V1_17_0`). Plan number 0 stays until plan-v1.
- **Verify-time noise pass.** User asked why we were spamming events for held keys and pointer movement. Two fixes:
    1. **Input** now suppresses keydown emit + `_keys.add` on `event.repeat === true`. No consumer in the codebase wanted them — every command binding already gated on `!event.repeat`, and cameras poll `isDown` rather than listening. `preventDefault` still fires on repeats so held shortcut keys (Tab, KeyS) keep suppressing their browser defaults. The existing "repeat flag is included" test was rewritten to assert the new behaviour, plus a preventDefault-on-repeat test added.
    2. **DevConsole** gained a `noisyEvents` option (defaulting to `["pointermove"]`) and the view-model gained a `showNoisy` observable + checkbox. Pointermove is dropped at capture time when `showNoisy` is false, so the 500-slot ring buffer no longer fills up in seconds. Three new tests cover noisy-default-drop / noisy-on / noisyEvents-override.

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

- [*] Add observables to `DevConsoleViewModel`: `fps`, `frameMs`, `simTickRate`, `drawCalls`, `triangles`, `entityCount`, `assetCacheSize`.
- [*] Create a `_pollStats()` method scheduled via `setInterval(100ms)` that reads `renderer.info.render.calls`, `.triangles`, `world.entities.size`, `assetManager.cacheSize`, and a frame timer kept in the GameLoop.
- [*] Extend `GameLoop` with public `fps` and `frameMs` properties (rolling average over last ~30 frames).
- [*] Add a stats tab section to `index.html` with KO bindings for each value.
- [*] Add a small fixed-corner FPS chip visible whenever `isOpen` is true.
- [*] Bump `VERSION` to `V1_18_0`.
- [*] Verify in browser: stats update; numbers respond when entities are added/removed; FPS chip is visible during dev console use; closing the console hides the chip.

### Decisions

- **Stats poll piggybacks on the existing 100ms flush timer**, not a second `setInterval`. The events flush already runs at 10 Hz; doubling up the timer would just be noise. Renamed the timer callback `_tickPoll` (calls `_flushIfDirty` then `_pollStats`).
- **DevConsole takes a `sources: { gameLoop, renderer, world, assets, saveService }` option** rather than reaching for app-wide globals. All sources are optional — missing ones leave their observables at default. Tested explicitly.
- **Renderer wraps THREE.WebGLRenderer.info behind a `stats` getter** (`drawCalls`, `triangles`, `geometries`, `textures`). Avoids leaking `renderer.renderer.info.render.calls` plumbing into the dev console.
- **Bonus: `autosaveSize` stat** — wired from `SaveService.lastAutosaveSize` and rendered with a human-readable formatter (`B`/`KB`/`MB`). Driven by the user's earlier "keep an eye on localStorage quota" feedback. The stats tab now shows live autosave size, so quota pressure is visible before it becomes a `saveFailed` toast.
- **GameLoop stats shape**: `frameMs` is a rolling mean over the last 30 frames (fixed-size ring); `fps` is derived (1000/frameMs). `simTickRate` is recomputed once per second from a tick counter — the 30-frame window doesn't make sense at variable refresh rates for tick rate. All three are zero before the first `step()`.
- **App.start() ordering changed**: split `_startLoop` into `_buildLoop` (constructs GameLoop) called *before* `_wireDevConsole`, plus `gameLoop.start()` called last. DevConsole needs a reference to the gameLoop instance for stats; the loop must exist by then but shouldn't be running before all wiring completes.
- **VERSION bump corrected to `V0_18_0`** (not `V1_18_0`). Plan number 0 stays.
- **Verify-time UX pass: relative event timestamps.** User flagged that the events tab's `time.toFixed(0) + 'ms'` display grew unbounded (page-load monotonic clock) and would blow out the column within minutes of session time. Switched to a "how long ago" formatter (`<1s` → `234ms`, `1–60s` → `12.3s`, `>=60s` → `>1m`). Implementation: `viewModel.nowMs` observable, ticked by the existing 100ms poll timer; per-row text binding calls `$parent.formatRelativeTime(time)` which subtracts `nowMs() - time` and formats. KO's expression-level dependency tracking re-evaluates the per-row bindings whenever `nowMs` changes, so displayed times keep updating even when no new events are firing. Formatter extracted to `dev/time-format.js` for direct testing without jsdom; 5 unit tests cover the bands, rounding, and clock-skew clamp.

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

- [*] Add a `<div id="dev-quick-actions">` to the dev console template with four buttons.
- [*] Wire each button to a `DevConsoleViewModel` method:
  - `toggleCameraMode()` → calls `App.setCameraMode(...)`.
  - `dumpWorldJSON()` → `console.log(JSON.stringify(WorldSerializer.toJSON(world), null, 2))`.
  - `forceSaveFailure()` → calls a debug-only `SaveService._forceFailNextSave()` flag-setter, then `saveService.save(...)`.
  - `reloadManifest()` → calls `assetManager.reload()` (new method that clears cache and re-runs preloadCore), then walks `world.entities` and calls each `Renderable.reattach()`.
- [*] Implement `SaveService._forceFailNextSave()` (sets a debug flag; next save emits `saveFailed` with a synthetic error and clears the flag).
- [*] Implement `AssetManager.reload()` and `Renderable.reattach()`.
- [*] Bump `VERSION` to `V1_19_0`.
- [*] Verify in browser: each button performs as documented; force-save-failure correctly fires the toast and leaves the world consistent; reload-manifest visibly refreshes the room.

### Decisions

- **Actions live on `viewModel.dev.actions` as a plain object**, not as KO-bound methods. The view-model creates four no-op stubs at construction; `App._wireDevConsole()` overwrites them with real implementations after services are built. Keeps the view-model independent of the App and lets the buttons bind harmlessly even if invoked before App overwrites the stubs.
- **`SaveService.forceFailNextSave()` is public**, not `_forceFailNextSave` as the plan said. Underscore-prefix would imply "don't call this from outside" but the dev console action *is* an outside caller — there's no reason to fight the convention. Logic: sets `_forceFailNext = true`; the next `save()` checks the flag, clears it, and emits `saveFailed` with a synthetic SaveError. Doesn't touch the FSA picker.
- **Renderable mount logic refactored** — `onAddedToWorld` now delegates to a new public `reattach()` method (and `onRemovedFromWorld` to a private `_detach()`). Reattach is idempotent: detaches the existing mesh first, then mounts a fresh clone. Used by the reload-manifest action to swap visuals without removing/re-adding entities.
- **`AssetManager.reload()` clears `_cache`, `_inFlight`, and `_index`, then re-runs `loadManifest()` + `preloadCore()`.** This means manifest *additions* are picked up on reload (new test covers it), as well as path / tier changes. World-tier (lazy) assets are NOT reloaded — they re-fetch on next `load(id)` since the cache is empty.
- **No toast yet for force-save-failure.** The plan's verify says "toast appears" but the toast tray lives in Task 20. For now the existing `saveStatus` observable shows "Save failed: Forced save failure (debug action)." in the HUD chip — surfaced through the same path real failures use. Once Task 20 lands, the toast will simply piggyback on the existing `saveFailed` subscription.
- **Quick actions strip placement**: between the header tabs and the active-tab pane. Always visible regardless of which tab is selected — the actions are global, not per-tab. Reused the existing `dev-console-button` style with a smaller font for compactness.
- **VERSION bump corrected to `V0_19_0`** (not `V1_19_0`). Plan number 0 stays.

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

- [*] Add to `index.html`: `<div id="fatal-overlay" hidden>` with `<h1>Cozy Lairs failed to start</h1>`, an `<h2>` for error class name, a `<p>` for message, a `<details>` for stack. Style as a full-screen modal.
- [*] Wrap `App.start()`'s body in a try/catch that calls a `_showFatalError(err)` method which un-hides the overlay and populates fields. Do NOT continue with rendering loops or asset loading after a fatal.
- [*] Add global `window.addEventListener("error", ...)` and `unhandledrejection` listeners in `App.start()`. These call a `viewModel.toast(msg, level: "error")` method that pushes to a small toast queue (display top-right, 4 s auto-dismiss).
- [*] Add a `<div id="toast-tray">` bound to `viewModel.toasts` (`foreach`).
- [*] Add a `<div id="min-viewport-overlay" data-bind="visible: viewportTooSmall">` to `index.html`. `viewportTooSmall` is a KO computed driven by a `window.resize` listener that updates `viewModel.viewport({ width, height })`.
- [*] Style the min-viewport overlay (centered, friendly message: "Cozy Lairs needs a bit more room — try 1024×640 or larger.").
- [*] Bump `VERSION` to `V1_20_0`.
- [*] Verify in browser: deliberately throw inside `App.start()` (e.g. `throw new Error("test")` then revert) — fatal overlay appears with name/message/stack, nothing else runs; from the dev console, run `Promise.reject("test")` — toast appears; resize the window narrow — min-viewport overlay covers the canvas; resize back — overlay hides.

### Decisions

- **Toast queue extracted to `scripts/modules/ui/toast-queue.js`** rather than inlined into AppViewModel. `ToastQueue` takes a sink with `push(item)` and `remove(predicate)` — KO observableArray fits naturally, and tests use a Map-backed stub. 8 tests cover push/dismiss/clear/auto-dismiss/timer cancellation/monotonic ids. Default 4 s dismiss; configurable via constructor.
- **Fatal overlay is static markup with no KO bindings.** A fatal during `App.start()` may fire BEFORE `ko.applyBindings`, in which case any data-bind on the overlay would be inert. Plain DOM (`document.getElementById` + `textContent` + `hidden = false`) is bulletproof. `_showFatalError` also stops the gameLoop so a half-initialised app doesn't keep rendering behind the overlay.
- **`start()` is split into a thin outer `try/catch` and `_startInner`.** Lets the inner method stay readable while the wrapper handles fatals uniformly. The fatal path calls `_showFatalError(err)` then re-throws so the bootstrap's `.catch` still fires (preserving the existing console.error logging for devtools).
- **Global handlers go through the toast queue, not the fatal overlay.** Per the design — uncaught errors at *runtime* are non-blocking; the game keeps running. `window.addEventListener("error", ...)` reads `event.message`; `unhandledrejection` reads `event.reason.message` (or stringifies). Toast level is "error" for both.
- **`saveFailed` now ALSO pushes a toast** (in addition to the existing `saveStatus` chip). AbortError (user-cancelled picker) is a benign info toast; everything else is error-level. This closes the Task 19 loose end about "force save failure should show a toast" — both real and forced failures now go through the same toast path.
- **Min-viewport threshold: 1024×640** (constants in `app-view-model.js`). The pre-init guard (`width === 0 && height === 0`) keeps the overlay hidden during construction in node tests / SSR-like contexts, only flipping true once a real `viewport()` value is set.
- **Z-stack ordering** (per design): `fatal-overlay: 1000` > `toast-tray: 300` > `dev-console: 200` > `fps-chip: 199` > `min-viewport-overlay: 150` > `loading-overlay: 100` > `hud: 50` > canvas. Toasts deliberately float over the dev console — they're notifications.
- **VERSION bump corrected to `V0_20_0`** (not `V1_20_0`). Plan number 0 stays.

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

- [*] Update `.claude/CLAUDE.md` with new convention sections: **Eventing — direct subscription, no global bus**; **Events are facts, never commands**; **Per-pack asset folder layout under `assets/kaykit/<pack-slug>/`**; **Testing — Vitest with logic-only by default, jsdom opt-in**; **Dev console — backtick toggle, `?debug=1` auto-open, dev sink is one-way**.
- [*] Create `README.md` at the project root with sections: Overview, Running the dev page (mentions a local static server with `npx serve`), Running tests (`npm test`), Asset setup (KayKit Dungeon Remastered placement, link to itch.io, encouragement to support Kay Lousberg), Demo controls, Project layout (link to design + plan).
- [*] Bump `VERSION` to `V1_21_0`.
- [*] Bump `.project/project.md`'s `Current Version` to `V1.21.0` and double-check that the design and plan links resolve.
- [*] Verify in browser: open the page, the boot banner / version display reads `V1_21_0`; `README.md` renders correctly when viewed on disk.

### Decisions

- **CLAUDE.md was mostly already current.** The "Eventing — direct subscription", "Asset folders", and "Tests" sections all existed from earlier task journaling. This task added one new section — **Dev console** — covering the backtick toggle, `?debug=1` auto-open, capture-vs-display split, the noise filter, and that `Emitter.devSink` is a one-way mirror. Two small refreshes at the same time: the stale `Emitter._devSink` reference in the eventing section was updated to `Emitter.devSink` (matched the rename pass under Task 20), and the namespace-imports list now mentions `world-serializer.js` alongside `errors.js`.
- **CLAUDE.md is the durable convention store; the rules under `.claude/rules/` are the canon.** During Task 20's verify, the user asked for the "no `_` prefix" and "selective alignment" conventions to land in BOTH places — they're now in `.claude/rules/coding-style.md` (canonical) AND in CLAUDE.md (project-specific notes). README does not duplicate them; it points to the design and plan.
- **README intentionally avoids implementation detail** that already lives in design-v0 and CLAUDE.md. It covers: how to run, how to test, where to put the assets, what the demo controls are, what the directory layout looks like — the things a fresh contributor needs the first 30 seconds. Anything deeper, the README links to the design / plan / LICENSE.
- **Asset setup section pays Kay Lousberg forward.** The "Please support Kay Lousberg" subsection is in both LICENSE.md (legal context) and the README (because contributors land on README first, and a "pay above the suggested price" nudge goes a lot further there than buried in a license file).
- **VERSION bump corrected to `V0_21_0` / `V0.21.0`** (not `V1_21_0` / `V1.21.0` as the original step says). Same plan-number-correction story as every prior task.

---

### Notable Deviations from Design

<!-- Filled in during execution. -->

---

### Issues and Adjustments

**[2026-05-08] Namespace-imports convention applied to utility modules.**

`.claude/rules/javascript/coding-style.md` requires `import * as Namespace` for stateless utility modules ("Direct named imports are prohibited"). Applied between Tasks 8 and 9 to all consumers of `errors.js` and the `engine/index.js` façade. Single-class modules (Renderer, GameLoop, Input, AssetManager, Emitter, World, Grid, Entity, etc.) keep named imports — the rule's example targets utility functions, and `import * as Renderer from "./renderer.js"; new Renderer.Renderer(...)` is genuinely worse than the named form. If the user later wants stricter (namespace-style for class modules too), a one-shot follow-up refactor is straightforward.

Files touched: `renderer.js`, `asset-manager.js`, `world/grid.js`, `engine/index.js` (switched to `export * from`), and tests for errors, asset-manager, and grid. All 82 tests still pass.

**[2026-05-08] Comment-density cleanup pass.**

User flagged that file-header comments had grown into multi-paragraph essays narrating decisions and recent changes — exactly what `.claude/rules/coding-style.md` calls out as "lengthy exposition" / "pointers to the recent X change". Cleaned up the worst offenders across `engine/`, `world/`, and `world/components/`: kept only the constraint-explaining and reference-table content (event vocabularies, lifecycle hooks, asset coordinate quirks, KayKit half-wall origin offset rationale), dropped narrative paragraphs that restated code or referenced rejected alternatives. Decision history stays in this plan; it doesn't belong in source headers where it'll rot.

All 82 tests still pass.

**[2026-05-09] Input held-key state fixed for modifier shortcuts and lost focus.**

User reported during Task 16 verify that pressing Ctrl+S triggered the camera's S-axis movement, and that the S key would sometimes get stuck "held" while the file-save picker dialog was open. Both bugs traced to `engine/input.js`:

1. `_onKeydown` unconditionally added `event.code` to `_keys`, so Ctrl+S registered KeyS as held — and any other future Ctrl/Meta shortcut would do the same to its trigger key. Fix: skip `_keys.add(...)` when `event.ctrlKey || event.metaKey`. The keydown event itself still emits with all modifier flags so listeners that *want* the combo (the save handler) keep working.
2. The browser swallows keyup events when focus moves to a native dialog. Whatever was held when the dialog opened stayed in `_keys` forever. Fix: bind a `window.blur` listener that clears `_keys`. Covers Alt-Tab and other focus-loss too.

3 new tests in `tests/engine/input.test.js`. 148 tests pass.
