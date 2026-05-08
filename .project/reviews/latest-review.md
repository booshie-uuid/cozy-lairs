# Code Review V1.14.0 (Foundation, Tasks 1–14)

Reviewed: all source under `scripts/`, all tests under `tests/`, `index.html`, `assets/manifest.json`, `package.json`, `vitest.config.js`. Cross-checked against `.project/designs/design-v0.md`, `.project/plans/plan-v0.md`, `.claude/CLAUDE.md`, `.claude/rules/coding-style.md`, `.claude/rules/javascript/coding-style.md`.

Overall assessment: foundation is in good shape. Architecture matches the design closely. No critical defects. Several latent issues around fault tolerance, test coverage, and lifecycle management are documented below — these are the kind of cracks that widen as Tasks 15–21 build on the foundation, so addressing them now is cheaper than later.

---

## CRITICAL FINDINGS

None.

---

## HIGH FINDINGS

### Finding 1: Renderable.onAddedToWorld assumes asset is loaded; no graceful failure path

[scripts/modules/world/components/renderable.js:26-31](scripts/modules/world/components/renderable.js#L26-L31) calls `this.assets.get(this.kind)`, which throws `AssetLoadError` if the kind is not in cache. That error propagates through `World.addEntity` → `buildEmptyRoom` → `App._buildWorld` → top-level catch in the bootstrap (which only logs). Effect: a single missing manifest entry crashes room construction mid-way, leaving a partially populated `World.scene` with no recovery and only a console line as feedback. The design's open question on save-load partial failure ("orphaned entities are dropped and the user gets a summary") implies fail-soft is expected behaviour, but it's not yet implemented.

#### Recommended Remediations/Controls
- [*] Catch the throw inside `Renderable.onAddedToWorld` and log a warning + render a visible placeholder (debug cube or wireframe), so a missing asset is loud-but-non-fatal. **Done — magenta wireframe cube as the placeholder. Test added confirming `world.addEntity` doesn't throw for unknown kinds.**
- [ ] Alternatively, validate-up-front in `buildEmptyRoom` (or any future builder): assert each kind it intends to use is in `assets.has(kind)` before placing entities. **Skipped — the per-Renderable fallback handles the case more generically (any builder, any caller). Up-front validation is cheap to add later if a builder wants stricter semantics.**
- [*] Add a regression test that confirms placing an entity with an unknown kind fails predictably (not via uncaught throw mid-loop). **Done.**


### Finding 2: No tests for `EdgePlacement`, `CornerPlacement`, `Walker`, or `buildEmptyRoom`

These are the modules with the most subtle coordinate math, and three of them went through user-flagged bug-fix iterations during execution (z-fighting, half-wall origin offset, A/D inversion). [Walker](scripts/modules/world/components/walker.js) ping-pongs through waypoints with non-trivial state; [EdgePlacement.onAddedToWorld](scripts/modules/world/components/edge-placement.js#L50-L86) has length-offset + origin-offset + per-side rotation logic; [CornerPlacement](scripts/modules/world/components/corner-placement.js) maps corner → rotation. All silent regressions if the math is broken.

The plan (Task 12 Decisions) explicitly punted: "no new tests for `buildEmptyRoom` or `EdgePlacement` — visual is the verifier." This is fine for the visual builder loop but not for the placement math, which is pure-functional and trivially testable.

#### Recommended Remediations/Controls
- [*] Add `tests/world/components/edge-placement.test.js` covering: each side's position and rotation, `lengthOffset` shifts along the correct axis, `originOffset` correctly compensates for asymmetric assets, invalid `side` throws. **Done — 11 cases.**
- [*] Add `tests/world/components/corner-placement.test.js` covering: all four corners place at the right vertex with the correct rotation. **Done — 7 cases.**
- [*] Add `tests/world/components/walker.test.js` covering: snaps to first waypoint, advances toward target, ping-pongs correctly at endpoints, throws on <2 waypoints, faces direction of travel. **Done — 9 cases including edge-of-array ping-pong.**
- [*] Add `tests/world/builders/empty-room.test.js` covering: floor count = `width × depth`, wall count per side, corner pieces present at the four vertex positions. **Done — 5 cases (caught a wrong assertion in my own test draft, confirming the implementation is correct).**


### Finding 3: AssetManager doesn't validate the loaded glTF has a usable scene

[scripts/modules/engine/asset-manager.js:177](scripts/modules/engine/asset-manager.js#L177) does `const root = gltf.scene || gltf.scenes[0];`. If the glTF parses but has no scenes (rare but possible with malformed files or glTF extensions we don't handle), `root` is `undefined`, and the next line `this._containsSkinnedMesh(root)` throws `TypeError: Cannot read property 'traverse' of undefined`. The thrown error is wrapped in `AssetLoadError` only if it originates from the loader's error callback — but a synchronous JS throw inside the success callback bypasses that wrapping and propagates as a generic `TypeError`.

#### Recommended Remediations/Controls
- [*] Validate `root` is defined before use; reject with a descriptive `AssetLoadError` if the glTF has no scene. **Done.**
- [*] Wrap the success-callback body in try/catch so synchronous throws also surface as `AssetLoadError` with the asset id attached. **Done — synchronous throws inside the success callback are caught and re-wrapped as `AssetLoadError` (or passed through if already one). Test added covering the no-scene case.**


### Finding 4: `AssetManager.preloadCore` rejects on first failure; partial-load progress goes silent

[scripts/modules/engine/asset-manager.js:80-90](scripts/modules/engine/asset-manager.js#L80-L90) uses `Promise.all`. If one of N core assets fails, the returned promise rejects immediately, but the other in-flight loads keep running in the background. The progress callback only fires on success, so the loading overlay hangs at whatever percentage was reached when the failure occurred. The error then propagates to `App.start()` which only logs it. For a user, this manifests as "loading screen stuck at 80%" with no UI feedback.

#### Recommended Remediations/Controls
- [*] Switch to `Promise.allSettled` and aggregate failures into a single `AssetLoadError` thrown after all results settle, so the progress callback completes its run. **Done — successful loads still report progress; final aggregate error includes one line per failure. Test added.**
- [ ] When the fatal-error overlay lands (Task 20), make sure `preloadCore` failures surface there with a list of failed asset ids, not just the first one.


---

## MEDIUM FINDINGS

### Finding 5: Encapsulation rule violation — `World` writes `entity.world` directly

`.claude/rules/coding-style.md` and `.claude/rules/javascript/coding-style.md` both state the encapsulation rule: "Only a class should be allowed to modify its own internal state. External logic must call methods rather than modifying properties directly." [World.addEntity](scripts/modules/world/world.js#L36) does `entity.world = this`, and [World.removeEntity](scripts/modules/world/world.js#L66) does `entity.world = null`. The `Entity` class has no method to set or clear this back-reference; consumers reach in and write the field.

This is the spirit of the rule, not just the letter — `entity.world` is part of `Entity`'s state and should be controllable by `Entity` (e.g., to validate, emit, or guard).

#### Recommended Remediations/Controls
- [*] Add `Entity.setWorld(world)` (or a pair `_attachToWorld(world)` / `_detachFromWorld()`) and have `World.addEntity` / `removeEntity` call it. **Done — `Entity.setWorld(world)` (single method, accepts null for detach).**
- [*] Optionally add a guard inside `Entity.setWorld` that prevents reassignment without prior detach (currently checked by `World.addEntity` but it's the wrong layer). **Done — moved the guard into `Entity.setWorld`. Existing world test still passes.**


### Finding 6: App has no shutdown / dispose path; listeners and the game loop leak on rebuild

[scripts/app.js:54-93](scripts/app.js#L54-L93) attaches:
- `contextmenu` listener on canvasWrapper (no off in App lifecycle)
- `keydown` subscriber for the Tab toggle (no unsubscribe)
- `Input` instance (has `dispose()` but never called)
- `Renderer` instance (has `dispose()` but never called)
- `GameLoop` (has `stop()` but never called)
- KO bindings (no `ko.cleanNode` ever called)

Single-instance per page-load lifecycle means real-world impact is zero. But the dev console reload-manifest action (Task 19) and any future hot-reload story will leak these. More immediately: tests that ever instantiate `App` will leak listeners across tests.

#### Recommended Remediations/Controls
- [*] Add `App.shutdown()` that stops the game loop, calls `dispose()` on Input/Renderer, clears KO bindings, and removes the canvas-wrapper `contextmenu` listener (store the bound handler so it can be removed). **Done — `shutdown()` is idempotent (`_shutdown` guard), tears down loop → camera → Input + Renderer → DOM listeners → KO bindings.**
- [*] Wire the `keydown` Tab handler with a stored handler reference so it can be `off`'d in shutdown. **Done — handler stored as `this._tabHandler`.**
- [ ] Optional: wire `window.addEventListener("beforeunload", () => app.shutdown())` so dev-mode reloads clean up. **Skipped — browsers handle teardown on page unload anyway. Added the method so tests / future hot-reload can call it; that's the actual value.**


### Finding 7: `Walker.constructor` and `Walker.toJSON` share a waypoints array reference

[scripts/modules/world/components/walker.js:24](scripts/modules/world/components/walker.js#L24) stores the constructor's `waypoints` parameter directly. [scripts/modules/world/components/walker.js:75](scripts/modules/world/components/walker.js#L75) returns the same reference in `toJSON`. Two consequences:

1. If a caller passes `[wp1, wp2]` and later mutates `wp1.x`, the walker's internal `targetIndex` and movement integrate against the new value mid-step.
2. Serialised output is the live array — `JSON.stringify(walker.toJSON())` snapshots correctly, but holding the toJSON result and inspecting it later sees mutations.

Defensive deep-cloning at construction time (`this.waypoints = waypoints.map(p => ({ x: p.x, z: p.z }))`) eliminates both.

#### Recommended Remediations/Controls
- [*] Deep-clone waypoints in the constructor so the walker owns its own state. **Done — `waypoints.map(wp => ({ x: wp.x, z: wp.z }))` produces an internal copy. Test added confirming source-mutation isolation.**
- [*] Optionally validate each waypoint has numeric `x` and `z` (currently invalid waypoints silently produce NaN positions). **Done — throws on missing or non-numeric x/z. Test covers undefined, missing key, null, and string-typed coords.**


### Finding 8: `buildEmptyRoom` doesn't validate room dimensions

[scripts/modules/world/builders/empty-room.js:23](scripts/modules/world/builders/empty-room.js#L23) accepts `{ x0, z0, width, depth }` and assumes `width >= 2 && depth >= 2`. With `width = 1`, the only column is both the west end and the east end — `atWestEnd === atEastEnd === true` — and two half-walls land at the same cell. Same for `depth = 1`. Currently only called with `{ width: 6, depth: 8 }` so unreachable, but the function will be called with arbitrary dims when the build mode lands.

#### Recommended Remediations/Controls
- [*] Throw on `width < 2 || depth < 2 || width < 0 || depth < 0` with a clear error message. **Done — also rejects non-integer dimensions.**
- [*] Add a regression test that asserts the throw. **Done.**


### Finding 9: GameLoop has no tests despite being deterministic and easily testable

[scripts/modules/engine/game-loop.js](scripts/modules/engine/game-loop.js) implements the accumulator pattern that's the heart of the simulation determinism. The plan decision said "tightly coupled to requestAnimationFrame and performance.now, both fiddly to mock cleanly under jsdom" — but the testable parts are the accumulator math (how many fixed ticks fire per RAF for a given realDt) and the clamp behaviour. Neither requires mocking RAF; both can be exercised by directly invoking `_tick` after stubbing `performance.now` or by extracting the accumulator into a pure function.

#### Recommended Remediations/Controls
- [*] Extract the accumulator step into a pure helper (e.g. `function consumeAccumulator(accumulator, realDt, fixedDt, max) -> { ticks, remaining, alpha }`) and test it directly. **Done — added `step(realDt)` as a public method called by `_tick`. Preserves the original tick-then-decrement pattern (so callback throws don't lose accumulator state). 10 tests covering tick counts, accumulator carry, alpha range, default callbacks, start/stop idempotency.**
- [*] Add a test for the spiral-of-death clamp: one giant `realDt` produces at most `MAX_ACCUMULATED_SECONDS / fixedDt` ticks, not infinite. **Done — `step(10)` produces exactly 15 ticks (0.25 / (1/60)), verified.**


### Finding 10: Magic numbers in App scene setup

[scripts/app.js:113-118](scripts/app.js#L113-L118) hardcodes lighting and grid-helper values inline:

```js
new THREE.HemisphereLight(0xffffff, 0x303040, 1.2);
sun.position.set(4, 8, 4);
new THREE.GridHelper(worldSize, grid.width, 0x445566, 0x2a3340);
helper.position.set(worldCentre, 0.001, worldCentre);
```

Per the project rule "Use named constants for meaningful thresholds, delays, and limits" (and the JS style's "Magic Numbers" callout). Specifically the `0.001` y-offset for grid helper is a non-obvious z-fight workaround that deserves a name (`GRID_HELPER_Y_OFFSET` or similar with a comment).

#### Recommended Remediations/Controls
- [*] Extract scene-setup constants to a small `SCENE_DEFAULTS` block at the top of `app.js`, or move scene composition into a `scripts/modules/world/builders/lighting.js` helper. **Done — extracted as a block of `SCENE_*` and `GRID_HELPER_*` constants at the top of `app.js`. Moving to a dedicated lighting builder is a follow-up if scene composition grows.**


---

## LOW FINDINGS

### Finding 11: Inconsistent input validation between placement components

`EdgePlacement` and `CornerPlacement` validate `side` / `corner` and throw on invalid input. [GridPlacement](scripts/modules/world/components/grid-placement.js#L20) silently normalises with `rotationStep & 3` — passing 5 quietly becomes 1, passing -1 becomes 3, passing "north" becomes 0 (because `"north" & 3 === 0`). Inconsistent: edge/corner are loud-on-error, grid is silent-on-error.

#### Recommended Remediations/Controls
- [*] Either make GridPlacement throw on non-integer or out-of-range rotationStep, or document the silent-coerce behaviour explicitly. **Done** — GridPlacement now throws `PlacementError` on invalid input. Also aligned EdgePlacement and CornerPlacement to throw `Errors.PlacementError` (instead of plain `Error`) for consistency.


### Finding 12: `Renderer.setActiveCamera` doesn't gate on `isPerspectiveCamera` like `setSize` does

[scripts/modules/engine/renderer.js:60-69](scripts/modules/engine/renderer.js#L60-L69) sets `aspect` directly. [setSize](scripts/modules/engine/renderer.js#L84) checks `isPerspectiveCamera` first. Asymmetric. Won't crash on an orthographic camera (the field assignment is a no-op for it) but inconsistent.

#### Recommended Remediations/Controls
- [*] Add the same `isPerspectiveCamera` guard in `setActiveCamera`, or extract the aspect-update logic into a private helper called from both places. **Done — extracted `_syncCameraAspect()`; both `setActiveCamera` and `setSize` call it. Helper null-checks the camera and gates on `isPerspectiveCamera` consistently.**


### Finding 13: `Renderer` constructor allocates a `THREE.Scene` that's discarded

[scripts/modules/engine/renderer.js:41](scripts/modules/engine/renderer.js#L41) creates `this.scene = new THREE.Scene()`, but App immediately replaces it via `setScene(world.scene)` after the World is constructed. Not a leak (the original scene has no children), but a misleading initial state — between Renderer construction and `setScene`, `renderer.render()` would render an empty scene with whatever camera defaults Renderer set up.

#### Recommended Remediations/Controls
- [*] Defer scene creation: Renderer's `scene` starts as `null`; `render()` no-ops if `scene` is null. Or require `setScene` before `render`. **Done — both `scene` and `activeCamera` start as null; `render()` no-ops until both are set; constructor no longer allocates a placeholder Scene or Camera.**
- [ ] Alternatively, accept the scene as a constructor argument so the lifecycle is "Renderer always has a scene". **Skipped — chose deferred over constructor-arg because Renderer is constructed before World, and forcing scene-as-arg would require reordering App's bootstrap.**


### Finding 14: `import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js"` is a named import

Per `.claude/rules/javascript/coding-style.md`: "Use `import * as Namespace` exclusively. Direct named imports … are prohibited." This is a named-from-utility import. The plan documented that single-class modules retain named imports for ergonomics, but this is from a multi-export utility module, just a third-party one.

#### Recommended Remediations/Controls
- [*] Switch to `import * as SkeletonUtils from "..."; SkeletonUtils.clone(...)` for consistency, OR document a "third-party named imports allowed" exception in CLAUDE.md. **Done — switched to namespace import.**


### Finding 15: `tests/sanity.test.js` is leftover scaffolding

[tests/sanity.test.js](tests/sanity.test.js) is the trivial `expect(1).toBe(1)` test from Task 1's vitest setup. It served its purpose; now there are 81 real tests around it and the sanity check is noise.

#### Recommended Remediations/Controls
- [*] Delete `tests/sanity.test.js`. **Done.**


### Finding 16: `bindings.js` exports `__sideEffectImport`

[scripts/modules/ui/bindings.js:25](scripts/modules/ui/bindings.js#L25) exports a sentinel `__sideEffectImport = true` to defeat tree-shaking. Two issues: the leading underscore signals "private" but it's exported (publicly available), and there is no bundler in this project (per Task 1 decision: no Vite/Webpack), so the tree-shaking concern doesn't apply yet. The sentinel is unnecessary today and slightly contradictory in naming.

#### Recommended Remediations/Controls
- [*] Remove the export entirely; revisit only if a bundler enters the picture. **Done.**


### Finding 17: Duplicate `const ko = window.ko` aliases across UI modules

[app-view-model.js:1](scripts/modules/ui/app-view-model.js#L1) and [bindings.js:1](scripts/modules/ui/bindings.js#L1) both repeat `const ko = window.ko;`. Each module's local alias is the established convention (per CLAUDE.md), so this is per-design — but the duplication suggests a tiny `lib/ko.js` (`export default window.ko`) could remove the boilerplate without changing semantics.

#### Recommended Remediations/Controls
- [ ] Optionally extract a single-line `scripts/modules/ui/_ko.js` and have UI modules `import ko from "./_ko.js"`. Lower priority — the current pattern works.


### Finding 18: `EdgePlacement.onAddedToWorld` accumulates floating-point error in originOffset application

[scripts/modules/world/components/edge-placement.js:79-81](scripts/modules/world/components/edge-placement.js#L79-L81) computes `Math.cos(rotY)` and `Math.sin(rotY)` for rotations that are exactly π/2, π, etc. `Math.cos(π/2)` is `~6.12e-17`, not `0`. For half-walls, this introduces sub-millimeter offsets in the perpendicular direction. Empirically invisible (user verified no micro-gaps), but technically not pixel-clean.

#### Recommended Remediations/Controls
- [ ] Replace `Math.cos(rotY)` / `Math.sin(rotY)` with an explicit per-side lookup table mapping rotation → `{ cos, sin }` with exact `0`/`1`/`-1` values.


---

## INFO / STYLE NOTES

### Finding 19: `App.start()` orchestrates many setup steps with implicit ordering

[scripts/app.js:54-93](scripts/app.js#L54-L93) calls private setup methods in a specific order (renderer → input → viewModel → assets → world → cameras → toggle → loop → ready). The order is correct but only documented by "code reads top to bottom". A future reader changing `_buildCameraControllers` to depend on `_startLoop` would not be warned. Not a defect; just acknowledging that App is the implicit DAG glue.

#### Recommended Remediations/Controls
- [ ] No action required for the foundation. If App grows past ~200 lines, consider a phase-list pattern (`PHASES = [...]; for (const phase of PHASES) await phase()`).


### Finding 20: `console.error` calls bypass the project's logging-wrapper guidance

`.claude/rules/javascript/coding-style.md` says "Wrap logging in a production-safe wrapper that can be disabled or redirected as needed." Code uses raw `console.error` in `Emitter.emit`'s exception handler and `App.start()`'s catch. Acceptable for foundation (no logger abstraction yet), but worth flagging that Task 20 (fatal error overlay + global handlers) is the natural place to introduce a thin `Logger` shim.

#### Recommended Remediations/Controls
- [ ] When Task 20 lands, introduce `scripts/modules/engine/logger.js` and replace `console.error` call sites.


### Finding 21: Tests use named imports from vitest

`import { test, expect, vi, ... } from "vitest"` — strict reading of the namespace-imports rule prohibits this. Plan acknowledged this as a third-party-convention exception. No action required; just confirming the deviation is on file.

#### Recommended Remediations/Controls
- [ ] None. Logged for completeness.


---

## DESIGN / PLAN ALIGNMENT

The implemented foundation matches the design (`design-v0.md`) closely. All major architectural decisions (scene-graph + components, direct emitter→subscriber, manifest-driven assets, Knockout UI overlay, switchable cameras, KayKit at native 4m cells) are present and match the design's intent. Plan-recorded deviations (no global EventBus, room builder uses corners + half-walls instead of plain straight walls at corners, mouse-look uses pointer-lock with right-mouse-hold) are all captured in the relevant tasks' Decisions sections.

Outstanding design open-questions remain deferred per plan: File System Access API behaviour on Firefox/Safari (Task 16), animation pipeline (later), pathfinding (later), build-mode UX (later), min-viewport threshold (Task 20).

No design deviations require remediation.

---

## SUMMARY

- **0 critical** findings.
- **4 high** findings — fault tolerance and test coverage (Findings 1–4).
- **6 medium** findings — encapsulation, lifecycle, and code hygiene (Findings 5–10).
- **8 low** findings — minor inconsistencies and cleanup (Findings 11–18).
- **3 info/style** notes (Findings 19–21).

The four high-severity items are all fixable in <1 hour each and would meaningfully harden the foundation before Tasks 15–21 (save/load, dev console, error overlays) build on top. The medium findings are nice-to-have but not urgent.

---

## REMEDIATION (V1.14.1)

Remediations applied as a single pass after review sign-off. Findings 1–11, 13, 15, 16 closed; Findings 17 and 18 deliberately skipped (per-module `ko` alias is the documented convention; Math.cos(π/2) drift is empirically invisible). Finding 12 closed via shared helper. Finding 14 closed by switching to namespace import. Findings 19–21 are info-only with no action required.

Test count: **128** (was 82). New coverage: EdgePlacement (11), CornerPlacement (7), Walker (11), buildEmptyRoom (6), GameLoop (10), AssetManager glTF-no-scene + partial-failure (2), Renderable placeholder fallback (1).

Major behaviour changes:
- **Renderable** now mounts a magenta wireframe placeholder if an asset fails to resolve, instead of throwing mid-room.
- **AssetManager.preloadCore** uses `Promise.allSettled` and aggregates failures into a single error after all settle.
- **Entity** owns its `world` field via `setWorld(world)`; `World` no longer writes the field directly.
- **App** has `shutdown()` for clean teardown of loop, listeners, KO bindings, and Renderer.
- **Renderer** no longer allocates a placeholder Scene/Camera in its constructor; aspect-update extracted into `_syncCameraAspect()` shared helper.
- **GameLoop** exposes `step(realDt)` for direct testing; `_tick` is the RAF wrapper.
- **Walker** deep-clones waypoints and validates numeric coords at construction time.
- **Placement components** (Grid, Edge, Corner) all throw `Errors.PlacementError` on invalid input — consistent typed-error story.

VERSION bumped to `V1_14_1` (release 1 within Task 14).
