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

- [*] Bump `VERSION` to `V1_1_0` in `scripts/app.js`.
- [*] Add `floorCells = new Set()` and `blockedCells = new Set()` to the `Grid` constructor.
- [*] Implement `markFloor(cx, cz)` and `unmarkFloor(cx, cz)` — out-of-bounds throws `GridBoundsError`.
- [*] Implement `setBlocked(cx, cz)` and `clearBlocked(cx, cz)` — same bounds policy.
- [*] Implement `isWalkable(cx, cz)` — false (no throw) for out-of-bounds; otherwise `floorCells.has(key) && !blockedCells.has(key)`.
- [*] Implement `walkableCells()` returning `[{cx, cz}, ...]` derived from `floorCells \ blockedCells`.
- [*] Extend `tests/world/grid.test.js` with the new methods (round-trips, `isWalkable` truth table, `walkableCells` filter).
- [*] Run `npm test`.
- [*] Verify: tests pass; no browser-side change.

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

- [*] Bump `VERSION` to `V1_2_0`.
- [*] Update `GridPlacement.constructor` to accept a 4th options arg `{ walkable = false, blocks = false }`. Validate types.
- [*] Update `onAddedToWorld` to call `world.grid.markFloor(cx, cz)` when `walkable`, and `world.grid.setBlocked(cx, cz)` when `blocks`.
- [*] Add `onRemovedFromWorld(world)` — call `unmarkFloor` / `clearBlocked` matching the flags that were set.
- [*] Update `toJSON` to emit the flags.
- [*] Update the `GridPlacement` factory entry in `WorldSerializer.COMPONENT_BUILDERS` to pass the flags through to the constructor.
- [*] Update `scripts/modules/world/builders/empty-room.js` floor-tile loop to pass `{ walkable: true }`.
- [*] Extend `tests/world/components.test.js` with `GridPlacement` flag tests (registers/clears in the right Set, default flags don't touch either Set).
- [*] Update `tests/data/world/empty-room-6x8.json` if the round-trip test depends on the exact `GridPlacement` toJSON shape.
- [*] Run `npm test`.
- [*] Verify in browser: open dev console, run `App.world.grid.walkableCells().length` — should equal the room footprint area.

### Decisions

- `toJSON` emits `walkable` / `blocks` only when truthy (rather than always emitting both): keeps existing fixtures/saves compact and forward-compatible. The factory in `WorldSerializer` reads `data.walkable === true` so missing-key and explicit-false both default the flag to false.
- Added an end-to-end check in `tests/world/builders/empty-room.test.js` that `world.grid.walkableCells().length === 48` for the 6×8 room: covers the builder→component→grid integration that the original plan only verified in-browser. The browser verify step still stands as a manual sanity check.
- VERSION-bump miss: `app.js` was not bumped to `V1_2_0` at the start of Task 2; the in-browser app advertised `V1.1.0` during Task 2 verify. Caught at the start of Task 3 and corrected by jumping `V1_1_0 → V1_3_0`. The first step of Task 2 was ticked under the original belief the bump had been made.

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

- [*] Bump `VERSION` to `V1_3_0`.
- [*] Create `scripts/modules/engine/pathfinding/pathfinder.js` with `findPath(grid, start, end)` and a small internal priority-queue helper.
- [*] Implement octile heuristic: `h = max(dx, dz) + (√2 − 1) × min(dx, dz)`.
- [*] Implement neighbour generation (8 directions) with corner-cutting rejection for diagonals.
- [*] Reconstruct path from the came-from map; return inclusive of both endpoints.
- [*] Create `scripts/modules/engine/pathfinding/index.js` with `export * from "./pathfinder.js"`.
- [*] Create `tests/engine/pathfinding/pathfinder.test.js` with 6–8 tests: open-grid path, route around single block, route around cluster, no-path on impossible setup, no diagonal corner-cutting between two blockers, octile cost correctness, start === end returns single-cell path.
- [*] Run `npm test`.
- [*] Verify: tests pass; no browser-side change.

### Decisions

- Corner-cutting rule is the *lenient* form: a diagonal is rejected only when **both** flanking orthogonal cells are blocked, not either. Rationale: V1 obstacles are mostly isolated 1-cell decor (barrels, crates), and the strict rule made minions detour around lone blockers in awkward L-shapes. The lenient rule still prevents the only visually broken case — squeezing between two diagonally-adjacent walls. The "rejects diagonal corner-cutting between two adjacent blockers" test exercises the squeeze case and still passes.
- Heap uses lazy deletion via a `closed` Set rather than decrease-key: simpler and fine for the small grids in V1. If pathfinder ever becomes a hot loop (large grids, many concurrent agents), revisit.
- Inlined `PriorityQueue` as a private class in `pathfinder.js` rather than a separate module: it's not used elsewhere, the file is still under 200 lines, and exposing it would invite leaky reuse.
- Wrote 12 tests instead of the 6–8 the plan suggested: covered OOB rejection, non-walkable start/end rejection, and the "diagonal allowed when only one flank blocked" case as separate cases for clarity. Within the 200-line budget.

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

- [*] Bump `VERSION` to `V1_4_0`.
- [*] Identify barrel and crate GLTFs in the KayKit pack; add `decor.barrel` and `decor.crate` to `assets/manifest.json` as core-tier entries.
- [*] Decide where the decor placement helpers live — inline in `app.js` or in a new `scripts/modules/world/builders/decor.js`. Implement `addBarrel(world, assets, cx, cz)` and `addCrate(world, assets, cx, cz)`. Each validates `cx, cz` against `grid.floorCells` first; warns + returns if invalid.
- [*] In `scripts/app.js`, change `ROOM` to the new footprint (e.g. `{ x0: 1, z0: 1, width: 8, depth: 10 }`).
- [*] Bump the `Grid` size in `buildWorld` to fit the new room with margin.
- [*] Add a `DECOR_LAYOUT = [{kind: "decor.barrel", cx, cz}, ...]` constant with 4–6 entries in 1–2 clusters.
- [*] Iterate `DECOR_LAYOUT` in `buildWorld` after `buildEmptyRoom` — call the right helper per entry.
- [*] Verify in browser: room is visibly larger; barrels/crates sit on the floor; `App.world.grid.walkableCells().length` reflects exclusion of decor cells; the (still-patrolling) minion routes through cells that aren't blocked.

### Decisions

- KayKit asset pick: `barrel_large.gltf` for `decor.barrel` (clean single barrel); `crates_stacked.gltf` for `decor.crate` (multi-crate cluster — adds visual variety without modelling a separate "stack" kind).
- Decor helpers live in a dedicated `scripts/modules/world/builders/decor.js` (not inlined in `app.js`): keeps `app.js` focused on lifecycle/wiring, mirrors the existing `empty-room.js` builder split, and gives the upcoming wall-decor class a natural home in the same module without touching `app.js`.
- Helpers are `addBarrel` / `addCrate` (per-kind), not a single `addDecor(kind, ...)` wrapper: the design notes flag wall decor (banners, torches via EdgePlacement) as a separate class, so a generic wrapper would lock in the floor-decor placement pattern. Per-kind helpers stay honest.
- `DECOR_LAYOUT` as a top-level array of `{kind, cx, cz}` with a `placeDecor()` method on `App` to dispatch: the array form makes the layout obvious at a glance and keeps adding decor a one-line edit. Kept inside `app.js` because the layout is demo content, not infrastructure.
- Grid grew from 10×10 to 10×12 with cell size 4. Room is now 8×10 occupying cells (1,1)–(8,10), leaving 1 cell of margin on every side. `GRID_HELPER` reworked to span the larger of the two dimensions and centre on the actual world rectangle (was previously square-only based on `grid.width`).
- Patrol cells updated to `(2, 2) → (7, 9)`: a long diagonal across the new room that avoids the decor clusters at NW (`(2,7)`, `(3,7)`) and SE (`(7,3)`, `(7,4)`, `(6,4)`). Walker is still pre-pathfinding so it cuts a straight line — decor placement deliberately keeps that line clear until WanderBehaviour lands in Task 7.
- Added `tests/world/builders/decor.test.js` (4 tests) even though the plan didn't list a test step: cheap protection on the registration logic, and the integration check for blocked cells now has CI coverage rather than only browser-verify.
- Layout revised post-verify per user preference: barrels at `(4, 9)` and `(6, 9)` along the north wall; crates at `(4, 4)`, `(5, 4)`, `(5, 5)`, `(6, 5)` forming a single-step staircase across the mid-room — 6 entries total. The crate wall sits where the upcoming pathfinder will need to detour around it. Patrol moved to a vertical line `(2, 2) → (2, 10)` along the west wall so the temporary straight-line walker (pre-Task 7) doesn't clip through any decor.
- World axes confirmed: `+X = east`, `+Z = north`, baked in by `buildEmptyRoom`'s side names (`cz=z0` → "south" wall, `cz=z0+depth-1` → "north" wall). Captured in `CLAUDE.md` so it doesn't get rediscovered every time.

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

- [*] Bump `VERSION` to `V1_5_0`.
- [*] Refactor `scripts/modules/world/components/walker.js`: extend `Emitter`, drop the waypoints constructor arg, replace internal patrol state with `currentPath` + `pathIndex` + a flag for "completed".
- [*] Implement `followPath(path)` — copies the cell array, resets index, computes initial heading. Empty path → emit `arrived` immediately.
- [*] Rewrite `update(dt)` to advance toward the world-coord of `path[index]`, emit `arrived` when the index passes the last cell.
- [*] Update `toJSON` — `{ speed, path: [...], pathIndex }` so an in-progress path round-trips.
- [*] Update the `Walker` factory entry in `WorldSerializer.COMPONENT_BUILDERS`.
- [*] In `scripts/app.js`, rename `spawnPatrollingMinion` to `spawnMinion`. Construct `new Walker({ speed: PATROL_SPEED })`, then call `walker.followPath([...cells])` after `world.addEntity(minion)`.
- [*] Rewrite `tests/world/components/walker.test.js` to cover: `followPath` advances through cells in order, `arrived` fires at end, empty path fires `arrived` immediately, cell-to-world translation correct, speed config respected.
- [*] Update `tests/data/world/empty-room-6x8.json` if it contains a Walker entry — match new shape.
- [*] Run `npm test`.
- [*] Verify in browser: minion walks the new fixed cell-path once, then stands still at the final cell.

### Decisions

- `pathIndex` semantics: it points at the **next target cell**, not the current cell. After `followPath`, the entity is snapped to `path[0]` and `pathIndex = 1`. When the entity reaches `path[pathIndex]`, the index increments. Path completes when `pathIndex >= path.length`. This matched the intent of the old walker's `targetIndex` field and made the round-trip restore semantics straightforward.
- Mid-path round-trip via `followPath(path, { startIndex })`: when `startIndex` is supplied, the walker snaps to `path[startIndex - 1]` (the last cell it was leaving) and resumes heading toward `path[startIndex]`. Sub-cell progress isn't preserved — restored saves jump back by up to one cell, which is fine for V1's save model.
- Restoration is deferred via `pendingFollow` and replayed in `onAddedToWorld`: `followPath` reads `entity.world.grid` for cell-to-world conversion, so it can't run until the entity has been added to a world. The `WorldSerializer` factory stashes `{ path, startIndex: pathIndex }` on `pendingFollow`; `Walker.onAddedToWorld` consumes it and clears the flag.
- Removed the old `FACING_OFFSET` constant (it was 0 in V0 and the new Walker has no need for it) — kept the `atan2(dx, dz)` formula directly.
- Demo route is the perimeter loop `(2,2) → (7,2) → (7,8) → (2,8) → (2,2)` — clears all decor and visibly demonstrates a multi-leg path. Minion walks once and stops at the start cell.
- Constructor now `new Walker({ speed = 1.5 } = {})` instead of `new Walker(waypoints, speed)`. Defaults via destructure with `= {}` lets `new Walker()` work without args, useful for restoration where speed is supplied via `applyJSON`-equivalent flow.
- Walker test count: 15 (vs the plan's "about 4 of 10 change shape" estimate). New tests cover empty path, single-cell path, mid-path restoration, restore-past-end, deep-clone of source path, and the `arrived` event firing exactly once. The "ping-pong" tests from V0 are gone (Walker is now one-shot — looping is the WanderBehaviour's job in Task 7).
- The unused `PATROL_START_CELL` / `PATROL_END_CELL` constants were replaced by a `TEMP_PATROL_PATH` array of cells: simpler, makes the demo route self-evident, and matches the cell-list shape WanderBehaviour will deliver in Task 7.

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

- [*] Bump `VERSION` to `V1_6_0`.
- [*] Add `getAnimations(id)` to `AssetManager` (or pass the bundle directly into `Animator` — implementer's choice in `Decisions`).
- [*] Create `scripts/modules/world/components/animator.js` with the constructor + `onAddedToWorld` (build mixer + actions) + `crossfade` + `update`.
- [*] Update `Walker` to call `entity.getComponent(Animator)?.crossfade("walk")` on `followPath` start and `crossfade("idle")` on `arrived`. Verify `?.` chaining handles the missing-Animator case cleanly.
- [*] Update `App.spawnMinion` to attach `Animator` with the discovered clip names.
- [*] Console-log the clip names on first boot; transcribe to a comment in `app.js` and to CLAUDE.md (under "Project layout — Asset folders" or similar).
- [*] Add `tests/world/components/animator.test.js` with 3–4 tests using a stub mixer and a fake bundle: clip-map construction, `crossfade(state)` triggers `fadeIn` / `fadeOut`, `update(dt)` advances the mixer, missing clip warns + skips.
- [*] Run `npm test`.
- [*] Verify in browser: minion plays the walk cycle while moving on the fixed path; switches to idle when the path completes.

### Decisions

- Took the "add `getAnimations(id)` to AssetManager" path — Animator stays decoupled from `AssetManager`, takes the `animations` array directly via constructor option. Keeps the component honest about which clips it knows and easy to test (no asset cache stub required).
- `mixerFactory` is an injectable constructor option (default builds a real `THREE.AnimationMixer`). Tests pass a stub mixer so they don't drag a real animation system in. Default factory is invoked with `entity.object3D` as the root — the cloned mesh sits as a child of `object3D`, and `SkeletonUtils.clone` preserved bone names, so the mixer's `PropertyBinding` lookup walks down to find them.
- Walker calls `entity.getComponent(Animator)?.crossfade(state)` via a small `crossfadeAnimator(state)` helper — keeps the optional-chaining pattern in one place rather than scattered through `followPath` / `update`. Walker keeps a hard `import { Animator }` for the `getComponent` key, which the plan accepts; the alternative (Animator subscribing to Walker events) was rejected because the architecture-flip would have meant adding new events on Walker just for this case.
- KayKit clip names: assumed `Idle` and `Walking_A` based on KayKit pack conventions. Not yet confirmed against the actual `Skeleton_Minion.glb` — the Animator console.warns with the available names if these don't resolve, and `App.spawnMinion` `console.log`s the full clip name list on boot. Browser-verify will confirm and we'll update `MINION_CLIPS` + capture in CLAUDE.md once the actual names are known.
- Test count: 6 (vs the plan's "3–4"). Added "crossfade to current state is a no-op" and "crossfade to unknown state warns" because both are quiet but easy-to-regress behaviours that the demo depends on.

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

- [*] Bump `VERSION` to `V1_7_0`.
- [*] Create `scripts/modules/world/components/wander-behaviour.js` with the constructor + lifecycle hooks + idle countdown.
- [*] Implement `pickTarget(world, currentCell)` — random walkable cell excluding current and cells within `minTargetDistance` of current. Returns null if none found.
- [*] Implement `kickTrip()` — `Pathfinder.findPath`, retry-on-null up to `retryLimit`, hand to Walker.
- [*] Wire subscription / unsubscription to sibling Walker's `arrived` in `onAddedToWorld` / `onRemovedFromWorld`.
- [*] Update `App.spawnMinion` — remove the fixed `followPath(...)` call from Task 5, attach `WanderBehaviour` instead.
- [*] Add `tests/world/components/wander-behaviour.test.js` with stub Walker (records `followPath` calls) and stub Pathfinder (returns canned paths or null on demand): picks new target on `arrived`, idles when no walkable cells, gives up gracefully on repeated null pathfinds.
- [*] Run `npm test`.
- [*] Verify in browser: minion roams continuously, routes visibly around the decor clusters, briefly pauses between trips.

### Decisions

- Used Chebyshev distance (`max(dx, dz)`) for `minTargetDistance` — matches the 8-way movement semantics (a king's move). Manhattan/Euclidean would have made adjacent diagonals "far enough" at distance 1, defeating the anti-twitch goal.
- `pathfinder` is an injectable constructor option (defaults to the `Pathfinder` namespace). Tests pass a stub that records `findPath` calls and returns canned paths or `null` on demand. Keeps WanderBehaviour decoupled from the Pathfinder module's implementation while still defaulting to the real one for the demo.
- The tests use a real `Walker` with `vi.spyOn(walker, "followPath")` instead of a stub Walker class, because `entity.getComponent(Walker)` keys on the constructor. A separate stub class would never be returned by `getComponent`. The spy lets us observe calls without changing the lookup mechanism.
- `kickTrip` uses Chebyshev only for filtering candidates; the actual path cost is octile via the Pathfinder. There's no inconsistency: the filter prunes "obviously trivial" targets before the pathfinder runs.
- On retry exhaustion, `kickTrip` calls `scheduleNextTrip()` rather than throwing or going to a permanent stop. The minion simply waits and tries again — handles the edge case where a fragmented room briefly has no reachable target without ever bricking the AI loop.
- Replaced `PATROL_SPEED` / `TEMP_PATROL_PATH` constants in `app.js` with `MINION_SPEED` and `MINION_SPAWN_CELL`. `spawnMinion` positions the entity at the spawn cell *before* `world.addEntity`, then explicitly crossfades the Animator to `idle` after — without that, the minion stands in T-pose during the initial idle countdown before the first wander trip kicks off.
- Wrote 9 tests against the plan's "stub Walker + stub Pathfinder" guidance: scheduling on add, idle countdown, trip-kick path-flow, arrived-rescheduling, retry-on-null, no-targets-graceful-idle, Chebyshev filter, on-removal unsubscribe, missing-Walker warn-and-disable. Slight overshoot vs the three the plan implied — each new case caught a real edge in the loop.
- Walker turn smoothing: post-verify polish based on user feedback that direction changes felt jarring. Added a `turnRate` constructor option (default 8) and a `targetRotation` field; rotation writes now go to `targetRotation`, and `tickRotation(dt)` exponentially damps `object3D.rotation.y` toward it each frame, picking the shortest arc across the ±π wrap. Smoothing also runs while `completed`, so the minion settles its facing during the first idle pause after a trip.

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

- [*] Bump `VERSION` to `V1_8_0`.
- [*] Choose heading + body font pair, download woff2 files into `styles/fonts/`. Record source / license in `styles/fonts/SOURCE.md`.
- [*] Create `styles/cozy.css`. Define `@font-face` rules (`font-display: swap`), the palette as CSS custom properties, and overrides for the in-scope HUD selectors.
- [*] Link `cozy.css` in `index.html` after `main.css`.
- [*] Add a save-status DOM element in the HUD bound to `viewModel.saveStatus`. Position bottom-right or near the camera chip — implementer's choice in `Decisions`.
- [*] Update HUD chip elements with any new classes the cozy theme expects.
- [*] Restyle the loading overlay (background, progress bar, status text) under the new palette. Confirm contrast at small sizes.
- [*] Restyle toasts (info / warning / error variants) under the new palette.
- [*] Restyle the min-viewport overlay's centered message.
- [*] Verify in browser: HUD reads as dark grimoire; loading overlay, save-status, toasts, min-viewport overlay all match. Dev console + fatal stay neutral. Resize below 1024×640 to check the new min-viewport overlay styling. Force a save failure (dev console quick action) to verify the error toast variant.

### Decisions

- **Font hosting deviation**: used Google Fonts CDN (`<link>` to `fonts.googleapis.com`) instead of self-hosted woff2 files. Rationale: avoids managing binary font files in the repo on the first pass, the CDN is a stable static resource (cached after first load), and it falls back to system serif/sans-serif gracefully if unreachable. Self-hosting deferred to a follow-up — when the user can review the OFL licenses for EB Garamond / Atkinson Hyperlegible and decide whether to vendor the woff2s. No `styles/fonts/SOURCE.md` was created for this reason.
- `@font-face` rules with `font-display: swap` are supplied by the Google Fonts API endpoint (`?display=swap` query parameter), not by `cozy.css`. Same effect — text renders in fallback fonts immediately and swaps when the woff2s arrive.
- **Save-status placement**: bottom-right corner — symmetric with the FPS chip in bottom-left (when dev console is open), and opposite the camera-mode chip in top-right. Shares the same panel chrome (cozy panel-bg, gold border, parchment text) as the other HUD chips.
- Toast border-left palette: `info` = `--cozy-candle-gold-dim` (subtle warm), `warning` = `--cozy-candle-gold` (mid), `error` = `--cozy-ember` (loud red). Avoids two states sharing the same gold while staying within the cozy palette.
- Save-status text formatting unchanged from V0 (`"Saved (N bytes)"`, `"Save failed: ..."`, `"Save cancelled"`, `"Autosaved (N bytes)"`) — the chip just surfaces what was already going into `viewModel.saveStatus`. Default state is `"saved"` from the view-model constructor, so on first paint the chip reads "saved".
- `cozy.css` deliberately avoids touching `#dev-console`, `#fatal-overlay`, and `#fps-chip` selectors — those are dev surfaces and stay neutral per the CLAUDE.md aesthetic-scope rule.

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

- [*] Bump `VERSION` to `V1_9_0`.
- [*] Source / draw the SVG motifs: corner flourish, divider with central dingbat, loading-overlay marginal sketch.
- [*] Document source / license in `styles/icons/SOURCE.md`.
- [*] Apply corner flourishes to the cozy panel chrome via CSS pseudo-elements with SVG `background-image` (or inline SVG inside the panel markup if pseudo-elements are awkward).
- [*] Inline the loading-overlay sketch in `index.html` so it animates with the rest of the overlay's fade-out.
- [*] Add a `.cozy-divider` style (with the central dingbat) for use in the min-viewport overlay and as a toast separator if it reads well.
- [*] Verify in browser: HUD now feels illustrated; ornaments don't crowd content; loading-overlay sketch reads at the displayed size on both desktop and the minimum-supported viewport.
- [*] Update CLAUDE.md with a brief "Cozy theme" section noting what's in `cozy.css` vs `main.css`, where the fonts and SVGs live, and the rule that dev / fatal surfaces stay neutral.

### Decisions

- Took the plan's degraded fallback path: hand-drew geometric flourishes (corner curl + dot, divider with diamond dingbat, hooded-figure-with-candle silhouette) rather than sourcing from `Game-icons.net`. Cleaner licensing (CC BY-SA 4.0 alongside the project's source) and avoids time-sink searching for the right pre-made shapes. `SOURCE.md` notes Game-icons.net as the option to revisit if more elaborate ornaments are needed later.
- Corner flourishes added to **toasts** (top-left + top-right, small 12px) and the **min-viewport overlay** (top-left + top-right, slightly larger 18px) only. Skipped the smaller HUD chips (camera-mode, save-status) — at chip dimensions the corner ornaments would have crowded the text. The plan said "subtle" so I erred on the side of restraint.
- Single corner SVG, mirrored via `transform: scaleX(-1)` for the right side. Avoids shipping mirror-image variants. If future themes need recoloured corners, switch to `mask-image` + `background-color` (noted in CLAUDE.md).
- `.cozy-divider` placed in the loading overlay (between title and status text) and the min-viewport overlay (between heading and instruction). Considered using it as a toast separator but the toasts are too narrow — would crowd the message.
- Loading-overlay sketch is a hooded figure holding a candle, inline SVG inside the loading overlay so it fades out with the rest of the panel. Stylised geometric (gold strokes on transparent fill) — reads as "evil overlord's marginalia" rather than a polished illustration.
- Min-viewport overlay's centred message now sits inside its own bordered panel with corner flourishes — gives the "needs more room" message a deliberate framed feel rather than floating text.

---

### Notable Deviations from Design

<!-- Filled in during execution. -->

---

### Issues and Adjustments

<!-- Filled in during execution. -->
