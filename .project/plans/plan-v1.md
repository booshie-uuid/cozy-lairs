# Plan: Cozy Lairs V1 — Animated Minions, Pathfinding, Decor & Aesthetic Pass

## Context

V0 shipped a walkable empty room with a hardcoded patrol path. V1 lifts that toward a believably inhabited lair: a wandering AI replaces the patrol, the minion plays Idle / Walk animations from the KayKit rig, decor (barrels and crates) becomes first-class grid-blocking entities, the room widens slightly to give the pathfinder meaningful space to navigate, and a first aesthetic pass replaces the generic dark-blue HUD with a "dark grimoire with cozy marginalia" look. Developer surfaces (dev console, fatal overlay, FPS chip) stay deliberately neutral. The AI architecture leaves room for goal-driven behaviours in V2+ — wandering is one swappable strategy.

Full design: [.project/designs/design-v1.md](../designs/design-v1.md).

Tasks are sequenced so prerequisite chains are respected:

- Grid walkability methods (Task 1) land before the placement extensions that consume them (Task 2).
- Pathfinder (Task 3) lands before the WanderBehaviour that calls it (Task 7).
- Walker refactor (Task 5) lands before WanderBehaviour replaces the patrol (Task 7), with a temporary fixed cell-path keeping the demo alive in the interim.
- Decor + room scale-up (Task 4) lands after the Grid walkability extensions but before WanderBehaviour, so the obstacles are real by the time the minion starts routing around them.
- Animator (Task 6) integrates with the refactored Walker.
- Aesthetic pass (Tasks 8–9) lands last so the gameplay loop is verified before chrome is layered on.

`VERSION` in `scripts/app.js` is bumped as the *first* code change of each task per the project's versioning convention. Plan-v1 uses the `V1_N_0` format throughout; the value advertised after task N completes is `V1.N.0`.

---

## Task 1: Grid walkability — `floorCells`, `blockedCells`, `isWalkable`, `walkableCells`

### Objective

Add the four Set-tracking mutators on `Grid` that pathfinding will query, plus the derived `isWalkable(cx, cz)` and `walkableCells()` accessors. Pure data-structure work; no callers yet.

### Expected Outcomes

- `Grid` has `markFloor` / `unmarkFloor` / `setBlocked` / `clearBlocked` mutators backed by two internal `Set<cellKey>` instances.
- `isWalkable(cx, cz)` returns true iff the cell is in bounds, in `floorCells`, and not in `blockedCells`. Out-of-bounds returns false (no throw).
- `walkableCells()` returns an array of `{cx, cz}` for every passable cell.
- New tests cover the mutator round-trips and the `isWalkable` truth table.

### Risks / Constraints

- These are pure data structures with no callers yet (added in Task 2). Browser-facing demo is unchanged; verification is tests-only.
- Cell-key format already exists (`Grid.cellKey(cx, cz)` from plan-v0). Reuse it — don't introduce a parallel format.

### Steps

- [ ] Bump `VERSION` to `V1_1_0` in `scripts/app.js`.
- [ ] Add `floorCells = new Set()` and `blockedCells = new Set()` to the `Grid` constructor.
- [ ] Implement `markFloor(cx, cz)` and `unmarkFloor(cx, cz)` — out-of-bounds throws `GridBoundsError`.
- [ ] Implement `setBlocked(cx, cz)` and `clearBlocked(cx, cz)` — same bounds policy.
- [ ] Implement `isWalkable(cx, cz)` — false (no throw) for out-of-bounds; otherwise `floorCells.has(key) && !blockedCells.has(key)`.
- [ ] Implement `walkableCells()` returning `[{cx, cz}, ...]` derived from `floorCells \ blockedCells`.
- [ ] Extend `tests/world/grid.test.js` with the new methods (round-trips, `isWalkable` truth table, `walkableCells` filter).
- [ ] Run `npm test`.
- [ ] Verify: tests pass; no browser-side change.

### Decisions

<!-- Filled in during execution. -->

---

## Task 2: GridPlacement `walkable` / `blocks` flags + room builder wiring

### Objective

Extend `GridPlacement` with the two flags. Register / clear cells with the Grid in lifecycle hooks. Update the empty-room builder so floor tiles register as walkable. After boot, `world.grid.walkableCells()` returns the room interior.

### Expected Outcomes

- `GridPlacement(cx, cz, rotationStep, { walkable, blocks })` accepts the new flags, both default false.
- `onAddedToWorld` calls `grid.markFloor` if `walkable: true`; `grid.setBlocked` if `blocks: true`. `onRemovedFromWorld` clears both.
- `toJSON` round-trips the flags. WorldSerializer factory passes them through.
- `buildEmptyRoom` constructs floor tiles with `walkable: true`. Walls and corners stay edge-/corner-placed and don't touch the new flags.
- After boot, `world.grid.walkableCells().length === width × depth` for the room interior.

### Risks / Constraints

- Existing `GridPlacement` callers pass `(cx, cz, rotationStep)` — the new options object is the fourth, optional arg, so call sites without it must continue to work.
- Any existing GridPlacement consumer that's NOT a floor and NOT a blocker must keep working with default flags.

### Steps

- [ ] Bump `VERSION` to `V1_2_0`.
- [ ] Update `GridPlacement.constructor` to accept a 4th options arg `{ walkable = false, blocks = false }`. Validate types.
- [ ] Update `onAddedToWorld` to call `world.grid.markFloor(cx, cz)` when `walkable`, and `world.grid.setBlocked(cx, cz)` when `blocks`.
- [ ] Add `onRemovedFromWorld(world)` — call `unmarkFloor` / `clearBlocked` matching the flags that were set.
- [ ] Update `toJSON` to emit the flags.
- [ ] Update the `GridPlacement` factory entry in `WorldSerializer.COMPONENT_BUILDERS` to pass the flags through to the constructor.
- [ ] Update `scripts/modules/world/builders/empty-room.js` floor-tile loop to pass `{ walkable: true }`.
- [ ] Extend `tests/world/components.test.js` with `GridPlacement` flag tests (registers/clears in the right Set, default flags don't touch either Set).
- [ ] Update `tests/data/world/empty-room-6x8.json` if the round-trip test depends on the exact `GridPlacement` toJSON shape.
- [ ] Run `npm test`.
- [ ] Verify in browser: open dev console, run `App.world.grid.walkableCells().length` — should equal the room footprint area.

### Decisions

<!-- Filled in during execution. -->

---

## Task 3: Pathfinder — 8-way A* with octile heuristic

### Objective

Implement the `findPath(grid, start, end)` free function with 8-way A*, octile heuristic, and corner-cutting prevention. Pure function; node tests only.

### Expected Outcomes

- `scripts/modules/engine/pathfinding/pathfinder.js` exports `findPath(grid, start, end)`.
- `scripts/modules/engine/pathfinding/index.js` re-exports for namespace consumption (`import * as Pathfinder from "..."`).
- Returns `[{cx, cz}, ...]` cell list inclusive of both endpoints.
- Returns `null` when no path exists, or when start/end is out of bounds, or when start/end is non-walkable.
- Orthogonal cost 1; diagonal cost √2.
- Corner-cutting between two diagonally-adjacent blockers is rejected.

### Risks / Constraints

- A simple binary heap or sorted-array priority queue is fine for grids of this size. Don't over-engineer.
- `start === end` is a legitimate input — return `[{start}]` (length 1), not null.
- The octile heuristic matters for path quality (paths "feel" optimal); tests should assert against expected canonical paths on small fixtures.

### Steps

- [ ] Bump `VERSION` to `V1_3_0`.
- [ ] Create `scripts/modules/engine/pathfinding/pathfinder.js` with `findPath(grid, start, end)` and a small internal priority-queue helper.
- [ ] Implement octile heuristic: `h = max(dx, dz) + (√2 − 1) × min(dx, dz)`.
- [ ] Implement neighbour generation (8 directions) with corner-cutting rejection for diagonals.
- [ ] Reconstruct path from the came-from map; return inclusive of both endpoints.
- [ ] Create `scripts/modules/engine/pathfinding/index.js` with `export * from "./pathfinder.js"`.
- [ ] Create `tests/engine/pathfinding/pathfinder.test.js` with 6–8 tests: open-grid path, route around single block, route around cluster, no-path on impossible setup, no diagonal corner-cutting between two blockers, octile cost correctness, start === end returns single-cell path.
- [ ] Run `npm test`.
- [ ] Verify: tests pass; no browser-side change.

### Decisions

<!-- Filled in during execution. -->

---

## Task 4: Decor entities + room scale-up

### Objective

Add `decor.barrel` and `decor.crate` to the manifest. Add `addBarrel` / `addCrate` placement helpers. Scale the room from 6×8 to 8×10 (with the underlying Grid grown to fit). Lay out a hand-authored cluster of 4–6 obstacles. Browser shows decorations in the room and `walkableCells()` excludes their cells.

### Expected Outcomes

- `assets/manifest.json` has `decor.barrel` and `decor.crate` core-tier entries pointing at appropriate KayKit GLTFs.
- `App.buildWorld` constructs a wider room and an array of 4–6 decor entities in 1–2 visible clusters.
- `world.grid.walkableCells().length === room area − decor count`.
- Browser: barrels and crates visible in the room, sitting on grid cells; minion's start cell remains walkable.

### Risks / Constraints

- The KayKit pack's exact filenames for barrel and crate need looking up. Inspect `assets/kaykit/dungeon-remastered/models/gltf/`.
- Decor layout is feel-tuned: pick coordinates that leave the minion's start cell walkable AND produce a visibly-routed pathfinding scenario in Task 7.
- Grid size is currently 10×10. With room 8×10 (or chosen footprint), the Grid likely needs growing (e.g. 10×12) to give the room margin.

### Steps

- [ ] Bump `VERSION` to `V1_4_0`.
- [ ] Identify barrel and crate GLTFs in the KayKit pack; add `decor.barrel` and `decor.crate` to `assets/manifest.json` as core-tier entries.
- [ ] Decide where the decor placement helpers live — inline in `app.js` or in a new `scripts/modules/world/builders/decor.js`. Implement `addBarrel(world, assets, cx, cz)` and `addCrate(world, assets, cx, cz)`. Each validates `cx, cz` against `grid.floorCells` first; warns + returns if invalid.
- [ ] In `scripts/app.js`, change `ROOM` to the new footprint (e.g. `{ x0: 1, z0: 1, width: 8, depth: 10 }`).
- [ ] Bump the `Grid` size in `buildWorld` to fit the new room with margin.
- [ ] Add a `DECOR_LAYOUT = [{kind: "decor.barrel", cx, cz}, ...]` constant with 4–6 entries in 1–2 clusters.
- [ ] Iterate `DECOR_LAYOUT` in `buildWorld` after `buildEmptyRoom` — call the right helper per entry.
- [ ] Verify in browser: room is visibly larger; barrels/crates sit on the floor; `App.world.grid.walkableCells().length` reflects exclusion of decor cells; the (still-patrolling) minion routes through cells that aren't blocked.

### Decisions

<!-- Filled in during execution. -->

---

## Task 5: Walker refactor — `followPath(path)` and `arrived` event

### Objective

Replace Walker's ping-pong patrol API with a single-shot `followPath(path)` consumer. Walker becomes an `Emitter` so siblings can subscribe to `arrived`. Wire the demo with a temporary fixed cell-path so the minion still moves while WanderBehaviour is being built (Task 7).

### Expected Outcomes

- `Walker` constructor takes only `{ speed }` — no waypoints.
- `walker.followPath([{cx, cz}, ...])` translates cells to world coords on the fly via `entity.world.grid.cellToWorld(...)` and walks to each in turn.
- `arrived` fires when the path completes (or immediately for an empty path).
- Walker `extends Emitter` so subscribers attach via `walker.on("arrived", handler)`.
- Existing patrol minion temporarily wired with a hand-coded cell list (e.g. a square route across the room). Minion walks the loop once and stops.
- Walker tests rewritten — about 4 of the existing 10 change shape; the rest carry over.

### Risks / Constraints

- This is a breaking change. `Walker.toJSON` shape changes. WorldSerializer factory and the round-trip test fixture need updating.
- Until Task 7 lands, the minion only walks once and stops — intentional and acceptable for the interim.
- Path-coords are now in cell space, not world space. `cellToWorld` translation happens lazily in `update`, not eagerly in `followPath`, so the path is decoupled from grid `cellSize`.

### Steps

- [ ] Bump `VERSION` to `V1_5_0`.
- [ ] Refactor `scripts/modules/world/components/walker.js`: extend `Emitter`, drop the waypoints constructor arg, replace internal patrol state with `currentPath` + `pathIndex` + a flag for "completed".
- [ ] Implement `followPath(path)` — copies the cell array, resets index, computes initial heading. Empty path → emit `arrived` immediately.
- [ ] Rewrite `update(dt)` to advance toward the world-coord of `path[index]`, emit `arrived` when the index passes the last cell.
- [ ] Update `toJSON` — `{ speed, path: [...], pathIndex }` so an in-progress path round-trips.
- [ ] Update the `Walker` factory entry in `WorldSerializer.COMPONENT_BUILDERS`.
- [ ] In `scripts/app.js`, rename `spawnPatrollingMinion` to `spawnMinion`. Construct `new Walker({ speed: PATROL_SPEED })`, then call `walker.followPath([...cells])` after `world.addEntity(minion)`.
- [ ] Rewrite `tests/world/components/walker.test.js` to cover: `followPath` advances through cells in order, `arrived` fires at end, empty path fires `arrived` immediately, cell-to-world translation correct, speed config respected.
- [ ] Update `tests/data/world/empty-room-6x8.json` if it contains a Walker entry — match new shape.
- [ ] Run `npm test`.
- [ ] Verify in browser: minion walks the new fixed cell-path once, then stands still at the final cell.

### Decisions

<!-- Filled in during execution. -->

---

## Task 6: Animator component + Walker integration

### Objective

Wrap `THREE.AnimationMixer` in an `Animator` component. Walker calls `crossfade("walk")` on `followPath` start and `crossfade("idle")` on `arrived`. Minion plays the walk cycle while moving and idles when stopped.

### Expected Outcomes

- `scripts/modules/world/components/animator.js` exports `Animator`.
- Constructor takes `{ clipMap }` mapping state names to GLTF clip names.
- `onAddedToWorld` reads the entity's loaded asset bundle's `animations` array, builds a `THREE.AnimationMixer`, and registers `THREE.AnimationAction` for each mapped clip.
- `crossfade(stateName, durationMs = 200)` fades the named state in and current state out.
- `update(dt)` advances the mixer.
- Walker calls `entity.getComponent(Animator)?.crossfade(...)` at path start and on `arrived`. Missing Animator silently no-ops.
- The minion has Animator wired with `{ idle: "<KayKit Idle clip>", walk: "<KayKit Walk clip>" }`; clip names confirmed by inspecting the loaded GLTF on first boot.

### Risks / Constraints

- KayKit clip names need confirming. Add a one-time `console.log` of the bundle's `animations` array on first load, then transcribe the names into `app.js` and CLAUDE.md.
- AssetManager's current `get(id)` returns a clone of the scene root only — `Animator` needs the bundle's `animations` array. Either add `assets.getAnimations(id)` or have `Animator` accept the bundle directly. Decide during implementation.
- `SkeletonUtils.clone` (used by AssetManager for skinned meshes) preserves bone names, so `AnimationClip` references resolve against the cloned skeleton. Confirm on first boot.

### Steps

- [ ] Bump `VERSION` to `V1_6_0`.
- [ ] Add `getAnimations(id)` to `AssetManager` (or pass the bundle directly into `Animator` — implementer's choice in `Decisions`).
- [ ] Create `scripts/modules/world/components/animator.js` with the constructor + `onAddedToWorld` (build mixer + actions) + `crossfade` + `update`.
- [ ] Update `Walker` to call `entity.getComponent(Animator)?.crossfade("walk")` on `followPath` start and `crossfade("idle")` on `arrived`. Verify `?.` chaining handles the missing-Animator case cleanly.
- [ ] Update `App.spawnMinion` to attach `Animator` with the discovered clip names.
- [ ] Console-log the clip names on first boot; transcribe to a comment in `app.js` and to CLAUDE.md (under "Project layout — Asset folders" or similar).
- [ ] Add `tests/world/components/animator.test.js` with 3–4 tests using a stub mixer and a fake bundle: clip-map construction, `crossfade(state)` triggers `fadeIn` / `fadeOut`, `update(dt)` advances the mixer, missing clip warns + skips.
- [ ] Run `npm test`.
- [ ] Verify in browser: minion plays the walk cycle while moving on the fixed path; switches to idle when the path completes.

### Decisions

<!-- Filled in during execution. -->

---

## Task 7: WanderBehaviour replaces the fixed path

### Objective

Add the `WanderBehaviour` component: picks random walkable destinations, runs the Pathfinder, hands paths to Walker, gates trips behind a brief idle delay. Replace the temporary fixed cell-path with `WanderBehaviour` on the minion. Demo: minion roams freely around the room, routing around the decor clusters from Task 4.

### Expected Outcomes

- `scripts/modules/world/components/wander-behaviour.js` exports `WanderBehaviour`.
- Constructor takes `{ idleMin = 0.5, idleMax = 1.5, retryLimit = 3, minTargetDistance = 3 }`.
- `onAddedToWorld(world)` subscribes to sibling `Walker.arrived` and queues an initial trip.
- `update(dt)` ticks the idle countdown; on zero, picks a random walkable cell (excluding current cell + cells within `minTargetDistance`), runs `Pathfinder.findPath`, hands the path to Walker. On null, retries up to `retryLimit`, then extends the idle.
- `onRemovedFromWorld` unsubscribes cleanly.
- App spawns the minion with `Walker` + `Animator` + `WanderBehaviour`; the fixed `followPath(...)` call from Task 5 is removed.
- Browser: minion picks new destinations and walks to them, routing around obstacles, idling briefly between trips.

### Risks / Constraints

- Adjacent-cell filter (`minTargetDistance`) keeps trivial 1-step paths from making the minion look twitchy. Tune to taste during browser-verify.
- The minion's start cell must be walkable. Verify the spawn cell is in `floorCells` and not in `blockedCells`.
- `Pathfinder.findPath` cost on each `arrived` is fine for V1's room size; no caching needed.

### Steps

- [ ] Bump `VERSION` to `V1_7_0`.
- [ ] Create `scripts/modules/world/components/wander-behaviour.js` with the constructor + lifecycle hooks + idle countdown.
- [ ] Implement `pickTarget(world, currentCell)` — random walkable cell excluding current and cells within `minTargetDistance` of current. Returns null if none found.
- [ ] Implement `kickTrip()` — `Pathfinder.findPath`, retry-on-null up to `retryLimit`, hand to Walker.
- [ ] Wire subscription / unsubscription to sibling Walker's `arrived` in `onAddedToWorld` / `onRemovedFromWorld`.
- [ ] Update `App.spawnMinion` — remove the fixed `followPath(...)` call from Task 5, attach `WanderBehaviour` instead.
- [ ] Add `tests/world/components/wander-behaviour.test.js` with stub Walker (records `followPath` calls) and stub Pathfinder (returns canned paths or null on demand): picks new target on `arrived`, idles when no walkable cells, gives up gracefully on repeated null pathfinds.
- [ ] Run `npm test`.
- [ ] Verify in browser: minion roams continuously, routes visibly around the decor clusters, briefly pauses between trips.

### Decisions

<!-- Filled in during execution. -->

---

## Task 8: Aesthetic pass — palette, typography, panel chrome

### Objective

Replace the generic dark-blue HUD palette with the cozy-grimoire colour scheme. Switch headings to a humanist serif and body to a humanist sans (both self-hosted woff2). Restyle the in-scope HUD elements with the new panel chrome (rounded corners, double-line gold border, paper-grain background). Dev console / fatal overlay / FPS chip stay neutral.

### Expected Outcomes

- New `styles/cozy.css` (and `styles/fonts/` with the woff2 files) holds the cozy theme.
- `index.html` links `cozy.css` after `main.css`.
- HUD camera-mode chip, save-status chip (newly bound to the DOM), loading overlay, toast tray, and min-viewport overlay all use the new palette / type / chrome.
- `font-display: swap` on every `@font-face`. System fallback readable during font load.
- Dev console, fatal overlay, FPS chip visually unchanged from V0.

### Risks / Constraints

- Loading overlay was tuned for the old palette (cream progress bar over dark background); contrast must stay strong with the new palette.
- Toast tray's existing slide-in animation should survive the restyle.
- The save-status observable is currently NOT bound to any DOM. Adding the binding is part of this task.
- Self-hosted fonts are subject to license terms — record source and license in `styles/fonts/SOURCE.md`.

### Steps

- [ ] Bump `VERSION` to `V1_8_0`.
- [ ] Choose heading + body font pair, download woff2 files into `styles/fonts/`. Record source / license in `styles/fonts/SOURCE.md`.
- [ ] Create `styles/cozy.css`. Define `@font-face` rules (`font-display: swap`), the palette as CSS custom properties, and overrides for the in-scope HUD selectors.
- [ ] Link `cozy.css` in `index.html` after `main.css`.
- [ ] Add a save-status DOM element in the HUD bound to `viewModel.saveStatus`. Position bottom-right or near the camera chip — implementer's choice in `Decisions`.
- [ ] Update HUD chip elements with any new classes the cozy theme expects.
- [ ] Restyle the loading overlay (background, progress bar, status text) under the new palette. Confirm contrast at small sizes.
- [ ] Restyle toasts (info / warning / error variants) under the new palette.
- [ ] Restyle the min-viewport overlay's centered message.
- [ ] Verify in browser: HUD reads as dark grimoire; loading overlay, save-status, toasts, min-viewport overlay all match. Dev console + fatal stay neutral. Resize below 1024×640 to check the new min-viewport overlay styling. Force a save failure (dev console quick action) to verify the error toast variant.

### Decisions

<!-- Filled in during execution. -->

---

## Task 9: Aesthetic pass — decorative motifs

### Objective

Add the SVG ornaments: corner flourishes on panel frames, divider rules with a central candle / star / bat dingbat, a hand-drawn marginal sketch on the loading overlay. The cozy theme should now feel illustrated, not just colour-shifted.

### Expected Outcomes

- A small set of SVG assets under `styles/icons/` (or inlined in `index.html`).
- Loading overlay sports a small minion-silhouette-with-candle sketch.
- HUD chips and toasts have subtle corner ornaments framing them.
- Min-viewport overlay's "needs more room" message is bracketed by a dividing flourish.
- Inline SVG only — no raster images for these motifs (sharp at any DPI).

### Risks / Constraints

- "Hand-drawn" sketches can take hours to source. Time-box: pick from a CC0 SVG icon library (e.g. Game-icons.net) and adjust strokes / colours to match the palette. If that fails, degrade to plain ornamental geometric flourishes — still better than nothing.
- Adding ornaments to existing tight HUD chips can crowd them; verify legibility after each addition.
- Document each SVG's source / license in `styles/icons/SOURCE.md` (or equivalent).

### Steps

- [ ] Bump `VERSION` to `V1_9_0`.
- [ ] Source / draw the SVG motifs: corner flourish, divider with central dingbat, loading-overlay marginal sketch.
- [ ] Document source / license in `styles/icons/SOURCE.md`.
- [ ] Apply corner flourishes to the cozy panel chrome via CSS pseudo-elements with SVG `background-image` (or inline SVG inside the panel markup if pseudo-elements are awkward).
- [ ] Inline the loading-overlay sketch in `index.html` so it animates with the rest of the overlay's fade-out.
- [ ] Add a `.cozy-divider` style (with the central dingbat) for use in the min-viewport overlay and as a toast separator if it reads well.
- [ ] Verify in browser: HUD now feels illustrated; ornaments don't crowd content; loading-overlay sketch reads at the displayed size on both desktop and the minimum-supported viewport.
- [ ] Update CLAUDE.md with a brief "Cozy theme" section noting what's in `cozy.css` vs `main.css`, where the fonts and SVGs live, and the rule that dev / fatal surfaces stay neutral.

### Decisions

<!-- Filled in during execution. -->

---

### Notable Deviations from Design

<!-- Filled in during execution. -->

---

### Issues and Adjustments

<!-- Filled in during execution. -->
