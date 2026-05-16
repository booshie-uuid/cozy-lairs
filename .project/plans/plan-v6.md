# Plan: V6 — Walkability Sub-Grid + Nudging Foundations

## Context

Implements [design-v6.md](../designs/design-v6.md): a 1×1m walkability sub-grid that fixes the minion corner-clipping bug, frees minions to share a 4×4m tile, and lays foundations for nudging (free X/Z decor offsets within a cell). Sub-grid is derived from authored entities at load time — no save schema break, V5 saves load transparently.

This plan is sequenced to maximise autonomous runtime between human-intervention checkpoints. Tasks marked **Verification: automated** can auto-progress on a green test suite. Tasks marked **Verification: browser** need the user to physically check the change before sign-off. The longest autonomous stretch is Tasks 1-7 (foundation + integration); Tasks 8, 9, 11 are the browser-verify checkpoints; Task 10 fills the gap between 9 and 11.

A fresh-machine reset preceded this plan, so Task 1 is environment re-bootstrap (npm install + tests + dev server smoke) rather than code work.

---

## Task 1: Environment bootstrap on fresh machine

### Objective

Re-establish a working dev environment after the machine swap. Confirm tests, vendored libs, and the dev server all behave as they did at V5.13.0 before any V6 code lands.

### Expected Outcomes

- `node_modules/` present and matches `package-lock.json`.
- `npm test` reports **440 passing across 28 files**.
- Dev server serves `index.html`; V5 autosave (if present) loads, or a fresh starter room builds.

### Risks / Constraints

- Verification: automated (test suite + dev-server HTTP smoke).
- If `package-lock.json` drift surfaces vendored-lib version mismatches, surface in the Decisions section and re-vendor per CLAUDE.md before continuing.

### Steps

- [*] Run `npm install` from the project root.
- [*] Run `npm test` and confirm 440 tests pass.
- [*] Start the dev server in the background; curl the index to confirm it serves.
- [*] Confirm tests green and server up — auto-progress.

### Decisions

- Back on main dev machine; skipped `npm install` (already restored). Verified env by running `npx vitest run` (440 passing, 28 files) and confirming `libs/three/` + `libs/lz-string/` vendored bundles are present. Dev server smoke deferred to the Task 8 browser-verify gate.

---

## Task 2: WalkGrid module

### Objective

Land the sub-grid data structure as a self-contained module with unit tests. No integration yet — `World` does not yet own one.

### Expected Outcomes

- `scripts/modules/world/walk-grid.js` exports a `WalkGrid` class backed by a `Uint16Array` of per-sub-cell refcounts.
- `tests/world/walk-grid.test.js` covers stamp/revert symmetry, bounds checking, `isWalkable`, coord conversions, and `clear()`.
- Test count rises by ~8-10.

### Risks / Constraints

- Verification: automated.
- Refcount over/underflow is asserted in dev only — no runtime guard in production.

### Steps

- [*] Create `scripts/modules/world/walk-grid.js` with `WalkGrid(width, depth, cellSize=1)` constructor; reject non-positive dims.
- [*] Implement `applyStamp(subCells)` / `revertStamp(subCells)` with bounds-skip on out-of-range entries.
- [*] Implement `isWalkable(sx, sz)` and `isWalkableAtWorld(x, z)`.
- [*] Implement coord helpers: `worldToSub`, `subToWorld`, `mainToSub`.
- [*] Implement `clear()`.
- [*] Bump `VERSION` constant in `scripts/app.js` to `V6_2_0` (first code change of the task per CLAUDE.md).
- [*] Add `tests/world/walk-grid.test.js` covering all of the above.
- [*] Run `npm test`; confirm new tests green and no existing regressions — auto-progress.

### Decisions

- Constructor signature: `WalkGrid(width, depth, subCellSize=1, subsPerMain=4)`. Stored `subsPerMain` on the instance so `mainToSub(cx, cz)` works without a ratio parameter. Default of 4 matches cozy-lairs' main grid (4m cells, 1m sub-cells). Also derives `mainCellSize = subCellSize * subsPerMain` for footprint module use.
- Reused `GridBoundsError` for invalid construction rather than adding a new error class — keeps the registry slim and matches `Grid`'s convention.
- `revertStamp` guards against underflow (skips when refcount is 0) instead of asserting. Silent guard rather than crash because a derived data structure shouldn't kill a load on a programmer mistake; the diagnostic overlay will surface logic errors visibly anyway.
- Refcount buffer indexed as `sz * width + sx` (row-major in Z). `Uint16Array` per design.
- Tests: 16 new, all green. Full suite 456 passing across 29 files (was 440/28).

---

## Task 3: footprint.js — AABB primitive

### Objective

Implement the default footprint stamper: project an asset's mesh AABB through `(position, rotation, xOffset, zOffset)` onto sub-cells, applying a coverage threshold.

### Expected Outcomes

- `scripts/modules/world/footprint.js` exports `computeFootprint(kind, cx, cz, rotationStep, xOffset, zOffset, assets)`.
- `MIN_SUB_CELL_COVERAGE = 0.4` (top-level constant).
- AABB primitive correctly handles all 4 rotation steps + arbitrary offsets.
- `tests/world/footprint.test.js` covers identity, rotation, offset, threshold absorption.

### Risks / Constraints

- Verification: automated.
- Rotation-aware AABB projection is the trickiest geometry — keep the math obvious; cite the approach in a brief code comment only if non-trivial.

### Steps

- [*] Bump `VERSION` to `V6_3_0`.
- [*] Create `scripts/modules/world/footprint.js` with `STAMPERS = { aabb }` registry and the `computeFootprint` dispatch.
- [*] Implement `aabbStamp(aabb, transform)` — coverage-thresholded sub-cell projection.
- [*] Add `MIN_SUB_CELL_COVERAGE = 0.4` constant.
- [*] Add `tests/world/footprint.test.js`: identity, 90° / 180° / 270° rotations, 1m / 0.5m offsets, coverage threshold edge cases.
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- `MIN_SUB_CELL_COVERAGE` set to **0.2**, not the design's starting value of 0.4. Reason: a centred 1m × 1m decor placed at the centre of a 4m main cell straddles a sub-cell boundary and lands 25% in each of 4 neighbouring sub-cells. A 0.4 threshold rejects all 4 (entity blocks nothing). 0.2 captures the straddle while still filtering tiny-nudge intrusions (< 10% coverage from sub-2cm overflows into an adjacent sub-cell). Will revisit once minion pathing reveals whether the centred-straddle "2m effective width" feels right in motion.
- `computeFootprint` takes an options bag (`{ kind, cx, cz, rotationStep, xOffset, zOffset, assets, walkGrid }`) rather than the design's positional 7-arg signature. Same parameters, self-documenting at call sites, no behavioural deviation.
- `walkGrid` is required by the function so it can derive `subCellSize` + `mainCellSize` from one source of truth (subCellSize × subsPerMain). Avoids a project-wide cell-size constant living in the footprint module.
- Added `COVERAGE_EPSILON = 1e-9` to the threshold comparison. Float noise on boundary intrusions (e.g. `-1.8 + 2 = 0.19999999999999996`) was making "exactly at threshold" stamps fail. Subtracting the epsilon from the threshold keeps the comparison robust at the boundary without meaningfully widening the gate.
- Tests: 11 new, full suite 467/30. Centred-1×1 cube test confirms the four-quadrant straddle case that motivated the 0.2 threshold.

---

## Task 4: footprint.js — wall-corner primitive

### Objective

Add the L-shape primitive for `wall.stone.corner`. The AABB primitive over-blocks for corners (full 4×4 footprint); the L-shape emits only the two-arm sub-cells.

### Expected Outcomes

- `wallCornerStamp` registered as `STAMPERS["wall-corner"]`.
- Correct L-shape sub-cells for all 4 corner orientations (NE, NW, SE, SW per the `+X east, +Z north` convention).
- Tests cover all 4 orientations + verify the result matches the visual corner-arm geometry.

### Risks / Constraints

- Verification: automated.
- Anchor cell + arm-direction convention must match how WallTracer positions corner entities. Cross-check by running the WallTracer test suite after this lands.

### Steps

- [*] Bump `VERSION` to `V6_4_0`.
- [*] Implement `wallCornerStamp(transform, cornerOrientation)` emitting the 2-arm sub-cell set.
- [*] Register in `STAMPERS["wall-corner"]`.
- [*] Add tests for all 4 orientations to `tests/world/footprint.test.js`.
- [*] Add fallback test: unknown `meta.collision` value → warn + falls back to AABB.
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- Corner-piece arm layout: each arm contributes a single "tip" sub-cell (2m from the vertex, at the far end of the L-arm). The inner-junction sub-cell (1m from the vertex, where the two arms meet) is intentionally excluded — it's shared with the adjacent straight/half wall segments that frame the corner, so letting those wall AABBs claim it avoids double-stamping.
- Tip deltas relative to vertex sub-coord, derived assuming wall thickness extends into the room: SE = [(-2, 0), (-1, +1)]; SW = [(+1, 0), (0, +1)]; NW = [(+1, -1), (0, -2)]; NE = [(-2, -1), (-1, -2)]. Held in `ARMS_BY_CORNER` rather than using a generated rotation table — the four entries are easy to verify by eye against the corner orientations described in `CornerPlacement`.
- Wall-corner primitive reads `{ vx, vz, corner }` from the options bag rather than `{ cx, cz, rotationStep }`, because corners are vertex-anchored (per `CornerPlacement`), not cell-anchored. `computeFootprint`'s options bag accepts both shapes — each primitive reads only the keys it needs.
- Unknown corner string warns and emits empty footprint (matches the unknown-primitive fallback pattern). Tests cover all four cardinal corners + a distinctness check + the unknown-corner warn case.
- Tests: 7 new (4 orientations + distinctness + unknown corner + unknown-primitive-fallback-to-AABB). Full suite 474/30.
- While reviewing the AABB primitive for this task, spotted that `rotateY` had cases 1 and 3 swapped. Three.js right-handed Y-rotation by +π/2 maps local (x, z) → world (z, -x); the code had (-z, x). Corrected. The Task 3 AABB tests still pass either way because every test AABB is symmetric around the origin (KayKit convention), so the world-space AABB of a rotated symmetric box is identical regardless of rotation direction. The fix is for correctness with potential future asymmetric assets.

---

## Task 5: AssetManager AABB caching

### Objective

Compute each loaded asset's local AABB once and cache it on the asset record so the footprint module can look it up without recomputing.

### Expected Outcomes

- `AssetManager` computes `new THREE.Box3().setFromObject(scene)` at load time per asset.
- `assets.getAabb(id)` returns the cached `Box3` (or null for unknown id).
- Test coverage for cache population + null-safety.

### Risks / Constraints

- Verification: automated.
- World-tier assets are lazy-loaded; AABB cache populates on first load, not at boot. Tests must cover both core-tier (eager) and world-tier (lazy) paths.

### Steps

- [*] Bump `VERSION` to `V6_5_0`.
- [*] Modify `AssetManager` to compute + cache `Box3` after each successful asset load.
- [*] Add `assets.getAabb(id)` accessor.
- [*] Extend `tests/engine/asset-manager.test.js` (or equivalent) with AABB cache tests.
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- AABB cached on the per-asset `bundle` object (alongside `root`, `animations`, `hasSkinnedMesh`) via `new THREE.Box3().setFromObject(root)` at load time. Same code path covers core-tier (preload) and world-tier (lazy `load()`).
- `getAabb(id)` returns `null` for both unknown and unloaded ids — symmetric with `has(id)` returning `false`. Footprint module already handles the null case (warns + empty footprint), so callers don't need to disambiguate.
- Tests added: 3 (core-tier cache, world-tier lazy cache, unknown id null). Full suite 477/30.

---

## Task 6: GridPlacement xOffset/zOffset + stamp lifecycle

### Objective

Wire the sub-grid into the component lifecycle so any entity with `GridPlacement` stamps the walk-grid on add and reverts on remove. Land the nudge data fields at the same time so they're plumbed through save/load.

### Expected Outcomes

- `GridPlacement` accepts optional `xOffset` / `zOffset` (default 0), rejects non-finite.
- `toJSON` emits each only when non-zero (no V5 save format change for un-nudged entities).
- `onAddedToWorld` computes footprint, records `this.stampedSubCells`, calls `world.walkGrid.applyStamp`.
- `onRemovedFromWorld` reverts via `revertStamp(this.stampedSubCells)`.
- Save round-trip preserves non-zero offsets.

### Risks / Constraints

- Verification: automated.
- This task changes the component lifecycle but `World` does not yet have a `walkGrid` (lands Task 7). Stamp calls are gated: if `world.walkGrid` is absent, skip silently. Task 7 will remove the gate.

### Steps

- [*] Bump `VERSION` to `V6_6_0`.
- [*] Add `xOffset` / `zOffset` constructor fields to `GridPlacement` with finite-validation.
- [*] Update `toJSON` to emit each only when non-zero.
- [*] Update `fromJSON` (or schema-v2 component decoder) to accept missing fields as 0.
- [*] Add `this.stampedSubCells = []` field.
- [*] In `onAddedToWorld`: compute footprint via `footprint.js`, stamp walk-grid (gated on `world.walkGrid`).
- [*] In `onRemovedFromWorld`: revert stamp (gated).
- [*] Add `setOffset(x, z)` method that revert-applies if attached to a world.
- [*] Extend `tests/world/components.test.js` with: finite validation, save round-trip, stamp lifecycle (using a mock walk-grid).
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- Gate is on `world.walkGrid && world.assets`. Both checks are needed because the footprint module reads `assets.getAabb` / `assets.getMeta`; Task 7 attaches both onto `World` in the same pass so the gate disappears in production.
- Split the lifecycle into private `applyTransform` / `stampWalkGrid` / `revertWalkGrid` helpers so `setOffset` can reuse the exact same sequence as add/remove. Avoids duplicating the four-line stamp call.
- `setOffset` on a detached placement (no `entity.world`) updates the fields but skips stamping. Consistent with `moveTo`'s detached behaviour; the next `onAddedToWorld` will pick up the new offsets and stamp from there.
- `import * as Footprint from "../footprint.js"` per the project's namespace-import rule for utility modules; saves a redundant `Footprint.` qualifier nowhere visible at the call site.
- Tests: 9 new in `components.test.js` (default 0, finite validation, toJSON conditional emit, position update on add, stamp on add + revert on remove, gate when either of walkGrid/assets is missing, setOffset round-trip, setOffset on detached placement). Full suite 486/30.

---

## Task 7: Wire WalkGrid into World + manifest wall-corner annotation

### Objective

Hook the walk-grid onto the `World` so every entity actually stamps it; annotate the manifest so corner pieces opt into the L-shape primitive. After this task, the sub-grid is fully populated from any V5 save — but nothing yet queries it.

### Expected Outcomes

- `World` constructs `this.walkGrid = new WalkGrid(grid.width * 4, grid.depth * 4)`; `World.clear()` clears it.
- `wall.stone.corner` manifest entry carries `meta.collision: "wall-corner"`; `wall.stone.straight` / `wall.stone.half` use the default (AABB).
- Removing the gate added in Task 6 — stamps are now unconditional.
- V5 save fixture loads under V6 and produces the expected sub-grid state (including corner-arm blocks).

### Risks / Constraints

- Verification: automated. This is the last autonomous task before browser-verify gates. Make sure the V5 save-compat test is strong here.
- Sub-grid debug is not yet visible in browser at this point — a regression here would only surface in Task 8.

### Steps

- [*] Bump `VERSION` to `V6_7_0`.
- [*] Add `walkGrid` field to `World` constructor; clear in `World.clear()`.
- [*] Remove `world.walkGrid` gate from `GridPlacement.onAddedToWorld` / `onRemovedFromWorld`.
- [*] Update `assets/manifest.json`: `wall.stone.corner` gets `meta.collision: "wall-corner"`.
- [*] Add tests to `tests/world/world.test.js`: walk-grid initialised at correct dimensions; `World.clear` resets it.
- [*] Extend `tests/world/world-serializer.test.js`: load a V5 fixture and assert sub-grid is correctly populated (floor cells walkable; corner-arm sub-cells blocked).
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- `World` constructor signature grew to `new World(grid, assets = null)`. `assets` is optional so tests that don't exercise the sub-grid don't have to mock it; production passes `this.assets` from `App.buildWorld`.
- WalkGrid dimensions derived from `grid.cellSize` rather than hard-coded `× 4` per the design. `subsPerMain = grid.cellSize` and `subCellSize = 1` keeps the 1m sub-cell invariant for both cozy-lairs' 4m cells and the test fixture's 2m `Grid` default. Helper `buildWalkGrid` documents the assumption that `cellSize` is an integer (cozy-lairs is always 4; tests use 2 or 4).
- `World.clear` calls `walkGrid.clear()` after iterating entities — belt-and-braces, since each placement's `revertWalkGrid` should already have zeroed it. Documented inline as defensive-only.
- **Deviation from design.** Design said the wall-corner stamp would land "through the normal GridPlacement hook" because corners "carry meta.collision: wall-corner". Reality: corners use `CornerPlacement` (vertex-anchored), not `GridPlacement` (cell-anchored), so the dispatch can't happen via a shared hook. Added the same stamp/revert lifecycle to `CornerPlacement` directly. It calls `computeFootprint` with the `{ vx, vz, corner }` shape the wall-corner primitive expects.
- **Gate kept, not removed.** Plan step said "remove the gate". Kept it as `if(!world.walkGrid || !world.assets) return` to support test fixtures that construct `World` without assets. In production both are always present so the gate is a runtime no-op; in tests it lets the existing `STUB_ASSETS` patterns keep working without a mass mock-out.
- **EdgePlacement also gained stamp lifecycle.** Same reasoning as the CornerPlacement deviation — walls are tracer-derived but use EdgePlacement, not GridPlacement, so the dispatch can't piggyback on the GridPlacement hook. EdgePlacement computes its world transform from `{ cx, cz, side, lengthOffset, originOffset }` (same logic as the visual placement) and feeds it to `computeFootprint` as a precomputed `worldTransform` shape. Required extending `footprint.aabbStamp` to accept that shape in addition to the cell-anchored shape — `resolveWorldTransform` helper picks whichever input the caller supplied. Without this, walls would render visually but not block sub-grid pathing, so minions would walk through walls in Task 9.
- **GridPlacement stamp gated on `this.blocks`.** Floors are added via GridPlacement with `walkable: true, blocks: false`; without a blocks-gate they'd erroneously stamp the walk-grid (making their own floor sub-cells unwalkable). Walks the same pattern surface-placeables already use: only entities that genuinely obstruct movement contribute to the refcount.
- **rotateY → rotateYRadians.** The cell-anchored aabbStamp used a switch-on-rotationStep for clean 90°-multiple math. Edge-anchored placements rotate by arbitrary radians (e.g. `-π/2` for east walls), so the rotation helper had to generalise to `(cos, sin)` form. Existing tests still pass because the AABBs used in tests are symmetric around the origin — float noise from the trig functions cancels at the bounding-box step.
- **Floors don't stamp.** Added an extra gate: `GridPlacement.stampWalkGrid` skips when `this.blocks === false`. Floor entities (`walkable: true, blocks: false`) would otherwise paint their own 4×4 cell into the obstacle map, making the cell unwalkable on the sub-grid. The two grids have opposite polarity — main grid's `walkable` is an allowlist; walk-grid refcounts are a blocklist — and floors are baseline, not blockers.
- `EdgePlacement` stamping for straight/half walls is deferred. Task 9 (minion pathing migration) needs it; flagged in "Issues and Adjustments" as a Task 9 prerequisite.
- Manifest entry for `wall.stone.corner` annotated with `meta: { "collision": "wall-corner" }`. `wall.stone.straight` / `wall.stone.half` left without annotation; they default to the AABB primitive (once EdgePlacement stamps them).
- Tests: 6 new in `world.test.js` (walk-grid dimensions, subsPerMain scaling, World.clear, assets stash). 2 new in `world-serializer.test.js` (V5-shape load populates walk-grid; world without assets silently skips stamping). Full suite 496/31.
- One bug fixed during this task — the linter's intermediate footprint refactor left `aabbStamp` calling an undefined `rotateYRadians`; finalised the helper so AABB rotation now uses the radians-based transform consistently.

---

## Task 8: Sub-grid diagnostic overlay

### Objective

Add a visible debug overlay so the sub-grid can be inspected in browser. First browser-verify checkpoint: confirms the foundation (Tasks 1-7) actually produces correct sub-grid state.

### Expected Outcomes

- Dev console gains a "Sub-grid debug" select: `off` / `overlay` / `sub-only`.
- `overlay`: main grid + sub-grid both rendered.
- `sub-only`: sub-grid replaces the main grid overlay.
- Sub-cell rendering: red tint for unwalkable, faint outline for walkable.
- Visible end-to-end correctness: corner-piece arms render red.

### Risks / Constraints

- **Verification: browser.** User reviews the overlay against placed corner pieces, decor, and terrain blocks; confirms blocked sub-cells match visual geometry.
- Performance: redrawing 6,400 sub-cells per frame should be batched into a single mesh or instanced geometry — not 6,400 separate meshes.

### Steps

- [*] Bump `VERSION` to `V6_8_0`.
- [*] Add the select control to the dev-console view-model + template.
- [*] Extend the existing diagnostic-grid module with a sub-grid mode (instanced/batched mesh).
- [*] Wire the select to the diagnostic-grid mode setter.
- [*] Manual test: place corner-creating walls, toggle overlay, verify arms are red.
- [*] Manual test: place a 2-cell-wide table, toggle overlay, verify the AABB stamp covers the expected sub-cells.
- [*] Verify in browser.

### Decisions

- Three-state select instead of a button (off / overlay / sub-only) replaces the old binary "Toggle grid" button. The `setDiagMode` action manages visibility on all three meshes (`diagGrid`, `subGridLines`, `subGridBlockers`); the legacy `toggleDiagnosticGrid` is kept as a thin shim that flips between off and overlay so any existing hotkey bindings still work.
- Sub-grid lines are a faint blue-grey `LineSegments` mesh built once. Blockers use a single `THREE.InstancedMesh` with `width * depth` instances — every sub-cell gets a slot; walkable sub-cells set their matrix to a zero-scale (effectively hidden) and blocked sub-cells set a translation to the sub-cell centre. Avoids 6,400 individual meshes and avoids reallocating each frame.
- Refresh hooks into `world.on("entityAdded" | "entityRemoved")` and rebuilds the instance matrices only when the overlay is visible. `setOffset`-based nudges (Task 11) will need an extra hook or a frame-based refresh — flagged below for Task 11.
- `dev-console-view-model.js` gained a `diagMode` observable + an `actions.setDiagMode` slot; the observable's `subscribe` forwards changes to the App-side handler. The view-model's `actions` slot is rewritten by `App.wireDevConsole` (existing pattern), so the App-side `setDiagMode` ends up wired even though the subscribe fires later.
- `.dev-console-select` CSS mirrors `.dev-console-filter` styling — same dim background and focus outline — so the select sits visually next to the existing search inputs.

### Manual-test notes (filled in after browser verify)

<!-- Filled in by the user / next-session agent on sign-off. -->

---

## Task 9: Migrate minion pathing to walk-grid

### Objective

Swap the minion pathfinder's grid source from the main 4m grid to the 1m sub-grid. Migrate minion self-occupancy onto the refcount system. **This is the headline V6 bug-fix.**

### Expected Outcomes

- Minion pathing uses `walkGrid.isWalkable(sx, sz)` for neighbour expansion (4-neighbour BFS).
- Minion step size is 1m (visual interpolation between sub-cell waypoints remains continuous).
- A minion's current sub-cell is `+1` in the refcount buffer; released on the next step.
- Two minions can occupy the same 4×4 tile (different sub-cells).
- Corner-piece arms are correctly avoided.

### Risks / Constraints

- **Verification: browser.** Watch a minion navigate a corner without clipping. Place two minions in the same starter-room tile to confirm co-occupancy.
- If the existing minion module random-walks idly, this exercises pathing immediately on load. If it idles, manually trigger movement during browser verify.
- Open Question #4 from the design — minion idle behaviour — surfaces here. Document what was found in Decisions.

### Steps

- [*] Bump `VERSION` to `V6_9_0`.
- [*] Inspect the current minion pathing module; note whether minions idle or random-walk (record in Decisions).
- [*] Replace main-grid neighbour expansion with walk-grid 4-neighbour expansion.
- [*] Migrate self-occupancy: stamp current sub-cell on tick, revert on step.
- [*] Update minion tests for the new substrate.
- [*] Run `npm test`; confirm green.
- [*] Manual test: minion paths around a corner without clipping; sub-grid overlay shows it threading single-blocked sub-cells correctly.
- [*] Manual test: two minions share a 4×4 tile by occupying different sub-cells.
- [*] Verify in browser.

### Decisions

- Pre-existing minion behaviour: `WanderBehaviour` random-walks minions via `idleMin`/`idleMax` countdowns + `Pathfinder.findPath` route planning. Idle behaviour kicks a new trip automatically on `walker.arrived`/`blocked`/`displaced`. The migration preserves the same outer shape; only the substrate changes.
- **Pathfinder**: full rewrite. 8-way BFS over the walk-grid. Caller supplies an `isTraversable(sx, sz)` predicate so the pathfinder stays substrate-agnostic — `WanderBehaviour` composes `walkGrid.isWalkable` with `grid.isFloor` for floor-presence filtering (NOT `grid.isWalkable` — that excludes barrel cells whose 12 surrounding sub-cells are still walkable). Lost: octile heuristic, `excludeOccupant`. Gained: simpler API, sub-cell resolution.
- **No anti-pinch rule.** Initially landed it for symmetry with the pre-V6 pathfinder, then tried orthogonal-intermediate splicing for diagonal-step grazing, both wrong. A perfect single-cell diagonal between two sub-cell centres traces `y = x` and `worldToSub` floor-rounds straight from the start cell to the target at the midpoint — the walker never enters either corner cell, so corner blockers are physically bypassed without any guard. Anti-pinch was rejecting valid squeezes; splicing was producing visible drunken zigzags in open space. Both removed in the final landing. The user flagged the suspicion early — should have listened instead of iterating on overcomplicated fixes.
- **Walker**: sub-cell path representation (`{sx, sz}`), sub-cell-centre-to-sub-cell-centre traversal at 1m granularity, walk-grid stamp-then-revert as the self-occupancy mechanism. The walker's own stamp lives at `currentSubCell`; pathfinder consultations un-stamp temporarily so the start cell reads as traversable.
- **No walker main-grid occupancy.** The V6 design's "multiple minions per main cell" requirement makes single-value main-grid occupancy untenable — two walkers' stamps would race and spam "refusing to overwrite occupant" errors. Walkers stamp the walk-grid only; world-editor's `canPlaceDecor` / `canEraseFloor` use a new `walkerInMainCell(cx, cz)` helper that scans `world.entities` for any walker whose `currentSubCell` falls in the queried main cell. `canSpawnMinion` checks the spawn sub-cell (main-cell centre) directly against the walk-grid.
- **Save format**: walker paths serialise as `[{sx, sz}, ...]`. Legacy V5 paths shaped `[{cx, cz}, ...]` are detected on load and dropped (walker idles, wander re-plans on the new substrate). No SCHEMA_VERSION bump — saves without walker paths are byte-identical.
- **Withdrawal MESH_BUFFER**: tightened from 1.0m (main-cell scale) to 0.25m (sub-cell scale). Walkers blocked at a sub-cell boundary withdraw to their 1m sub-cell centre rather than back to a 4m main-cell centre.
- **`WanderBehaviour.pickTarget`** samples sub-cells within a bounded radius (16 sub-cells = 4 main cells) of the walker's current position rather than from the entire world's floor cell pool. A global sample piles picks into other rooms/disconnected components, where pathfinder reliably returns null and burns the retry quota; local sampling keeps targets in the walker's reachable neighbourhood with high probability. Two passes: first prefers targets at or beyond `minTargetDistance` (default lowered from 12 → 4 sub-cells), falls back to any traversable cell so small accessible regions still kick trips.
- **`Grid.isAvailable` / `findClosestAvailable`** retained as dead code on `Grid`. No production caller after migration, but they're part of the public class API and harmless. Will sweep if a later pass cleans up.
- **Tests**: pathfinder 13 → 13. Walker 30 → 28. WanderBehaviour 11 → 13. Full suite 495 across 30 files.

---

## Task 10: WorldEditor nudge methods

### Objective

Land the nudge mutation surface as code + tests — predicate, mutator, eligibility rules. UX still pending (Task 11).

### Expected Outcomes

- `WorldEditor.canNudge(entity, deltaX, deltaZ)` predicate: recomputes footprint at proposed offset, verifies it clears placement rules and the new sub-cells aren't blocked by other entities.
- `WorldEditor.nudgeEntity(entity, deltaX, deltaZ)`: revert-stamp, apply offset, recompute footprint, re-stamp. Returns true/false. Refusals emit a toast.
- Eligibility rules enforced: floors and tracer-derived `wall.stone.*` kinds reject; everything else accepts.

### Risks / Constraints

- Verification: automated.
- The "doesn't overlap" check needs to compare against the sub-grid refcounts excluding the entity's own existing stamp. Implementation note: revert stamp first, test, re-stamp on rejection.

### Steps

- [*] Bump `VERSION` to `V6_10_0`.
- [*] Implement `canNudge` + `nudgeEntity` on `WorldEditor`.
- [*] Add eligibility guard: rejects `floor.*` kinds, rejects `wall.stone.*` kinds.
- [*] Extend `tests/world/world-editor.test.js`: happy path, refusal on overlap, surface-placed decor doesn't stamp, eligibility rejections.
- [*] Extend `tests/world/world-serializer.test.js`: nudged decor round-trips through save/load with offsets preserved.
- [*] Run `npm test`; confirm green — auto-progress.

### Decisions

- `canNudge` runs the revert-test-reapply dance against the walk-grid: temporarily un-stamps the entity's own footprint so it never collides with itself, recomputes the footprint at the proposed offset, then walks the new sub-cells checking `walkGrid.isWalkable`. The own-stamp is always re-applied (no early-return paths skip it). The empty-footprint case is treated as "clear" (returns true) — a footprint that overlaps zero sub-cells can't overlap anything else.
- Surface-placeables (`blocks: false`) short-circuit to `true` before touching the walk-grid: they don't contribute to the refcount, so there's nothing to check against. Matches the existing `GridPlacement.stampWalkGrid` gate. Side-effect: nudging a candle off its table is permitted regardless of where it lands. Surface-bound clamping is a Task 11 UX concern, not a Task 10 data invariant.
- When `world.walkGrid` or `world.assets` is missing (test-only world setup), `canNudge` returns `true` rather than throwing. Mirrors how `GridPlacement.stampWalkGrid` silently skips when either is missing — tests that don't seed assets still get to exercise the nudge surface, and production always has both. Non-finite deltas are rejected by `canNudge` directly so the toast path fires cleanly.
- Eligibility filter is `(has GridPlacement) AND (!kind.startsWith("floor.") AND !kind.startsWith("wall.stone."))`. The `wall.stone.*` arm is belt-and-braces: tracer-derived walls live on `EdgePlacement` / `CornerPlacement`, so the `GridPlacement` test already rejects them — but the prefix guard also rejects any future manually-placed wall variants and provides a semantic-not-structural refusal.
- `nudgeEntity` delegates the actual sub-grid + transform update to `placement.setOffset` (revert → mutate fields → re-apply transform → re-stamp). Avoids duplicating the four-step sequence; the only WorldEditor work is the predicate gate plus the refusal toast.
- Toast wording: `"Can't nudge ${name} — would overlap."`. Single message for any refusal — eligibility failures + overlap failures share the same toast to keep the user-facing vocabulary small. The active-attempt-only toast pattern (predicate silent, action toasts) matches the other editor pairs.
- Tests: world-editor 11 new (canNudge accepts blocking decor with clear neighbour, nudge applies delta + re-stamps, position update, overlap refusal predicate, overlap refusal action with toast + walk-grid unchanged, surface-placed decor doesn't stamp, floor rejection, wall.stone.* prefix rejection, non-GridPlacement entity rejection, non-finite delta rejection, can/action gate agreement). world-serializer 1 new (post-attach `setOffset` mutation round-trips). Full suite **507 / 30** (was 495 / 30).
- Existing pre-task tests already covered the constructor-passed offset round-trip and the `xOffset`/`zOffset` snapshot omission for centred entities — left untouched. The new round-trip test exercises the path `nudgeEntity` actually uses (`setOffset` after the entity is in-world).

---

## Task 11: SelectTool + nudge UX

### Objective

Ship the minimal nudge UX: a Select tool, click-to-select on canvas, arrow keys to nudge in 1m increments, Esc to deselect.

### Expected Outcomes

- New `SelectTool` class with `targetType: "entity"`.
- AuthoringPanel surfaces a Select icon (shared across tabs).
- `BuilderInputAdapter` raycasts against the scene when SelectTool is active; resolves to owning entity via `object3D.userData.entity` backref.
- Arrow keys nudge in 1m world-axis increments (↑↓ = ±Z, ←→ = ±X).
- Selection visual: subtle outline or tint on the selected entity's mesh.
- Esc deselects; clicking elsewhere deselects/swaps.

### Risks / Constraints

- **Verification: browser.** The headline user-facing V6 feature.
- Object3D backrefs to entity must exist — verify the current Entity constructor sets `object3D.userData.entity = this` (or add it).
- Surface-placed decor on a table should be selectable; nudging it should respect surface bounds. If out-of-scope for the minimal V6 UX, document in Decisions.

### Steps

- [*] Bump `VERSION` to `V6_11_0`.
- [*] Confirm/add `object3D.userData.entity` backref in `Entity`.
- [*] Create `SelectTool` class with `onEntityClick(entity)`, `nudge(dx, dz)`, `deselect()`.
- [*] Extend `BuilderInputAdapter`: handle `targetType: "entity"` (scene raycast); arrow-key dispatch to `tool.nudge`.
- [*] Add Select icon to `AuthoringPanel` (single shared button above tab content).
- [*] Wire selection outline (consider `THREE.OutlinePass`, or a simpler emissive tint).
- [*] Add Esc handler to deselect.
- [*] Add tests for the tool: selection state, eligibility, deselect on Esc.
- [*] Run `npm test`; confirm green.
- [*] Manual test: select a chair, nudge ±X / ±Z by 1m each, save, refresh, confirm offsets persisted.
- [*] Manual test: try to nudge into a wall — refusal toast appears.
- [*] Verify in browser.

### Decisions

- **Entity backref** lives at the *root* `object3D.userData.entity`, not on every descendant Mesh. Adapter raycast walks `intersectObjects(scene.children, true)` and then climbs each hit's parent chain until a `userData.entity` shows up. Ghost meshes, sub-grid overlays, and other root-level scene nodes don't have an entity backref and naturally fall through. Cheaper than seeding the ref on every Mesh and copes with grouped GLTF imports where the entity root is two or three Object3Ds up from the hit Mesh.
- **Tool id is plain `"select"`**, not tab-prefixed. Mirrors the design's intent that the Select tile is shared across all three tabs. `App.buildToolFromId` short-circuits on the literal `"select"` string before falling into the `tab:slug` parser. The AuthoringPanel exposes `selectToolId` so the HTML binding stays decoupled from the literal.
- **Panel button placement** added a new `.authoring-panel-global-tools` strip *above* the tab nav, inside the `<aside>`. Same chrome formula as the existing `.tool-tile`, one-pixel `--cozy-neon-dim` underline separating it from the tab strip. Active state mirrors the other tool tiles (`--cozy-neon` border + label). Only one tile lives there for now — when the future "move-player" or other panel-wide tools land, they'll slot into the same strip.
- **Selection highlight** uses an emissive-channel boost (`emissive = 0x2a5a3a`, `emissiveIntensity = 0.6`) on cloned materials, not an `OutlinePass`. Reasons: post-processing is not currently wired into the renderer, and adding a composer just for selection would balloon the V6 scope; the KayKit GLTF models all use `MeshStandardMaterial` which has an emissive channel, so the look lands consistently. `MeshBasicMaterial` placeholders (missing-asset magenta wireframes) are skipped — they have no emissive, so the selection is silent for them rather than crashing. Materials are cloned per-selection and disposed on deselect to avoid mutating the shared cache.
- **Arrow-key mapping** is fixed to world axes: ↑ = +Z (north), ↓ = -Z, ← = -X, → = +X. Matches the project's `+X east, +Z north` compass convention. Camera-relative nudging would feel more natural when the builder camera is orbited away from the default theta, but quantising the camera yaw to 90° steps is out of V6 scope. Browser-verify will judge whether the world-axis mapping is acceptable; if not, a camera-relative variant is a one-method swap.
- **Arrow-key dispatch lives on the adapter, not the app**, so a non-SelectTool active tool never sees them. The branch in `onKeyDown` gates on `tool.targetType === "entity" && typeof tool.nudge === "function"` — tightly scoped so future entity-targeted tools can opt in cheaply without inheriting arrow-key behaviour they don't want. `event.repeat` is *allowed* for the arrow keys (Q/E/Esc still suppress repeats) — holding an arrow continues to nudge cell-by-cell, which is what arrow keys feel like outside this app.
- **Esc + right-click both cancel SelectTool** via the existing `setTool(new NoopTool()) + onCancel` path. `SelectTool.deactivate()` calls `deselect()` first so the emissive swap unwinds. This is simpler than adding a separate "soft deselect that keeps the tool armed" path — if the user wants to keep selecting, they click another entity (re-selection swap is in the happy-path).
- **Clicking empty floor** while SelectTool is active passes `entity = null` through to `onEntityClick`, which the tool interprets as a deselect (mirrors the design's "clicking elsewhere deselects"). Raycast against the floor plane is *not* short-circuited — the adapter just runs the scene raycast and gets a null entity if nothing under the cursor has a backref.
- **Self-deselect on entity removal.** `SelectTool.nudge` reads `selected.world` before calling `editor.nudgeEntity`; if the entity was removed mid-selection (e.g. user paints over its cell with Floor Erase while a barrel is selected), the tool deselects and returns false. Avoids weird state where arrow keys mutate an orphan placement.
- **Tests**: 12 new `SelectTool` tests (targetType + no ghost, click selects + highlights, ignore non-left, click null deselects, re-selection material swap, deselect restores, deactivate deselects, nudge delegates, nudge no-selection no-op, nudge on removed-entity self-deselects, skip MeshBasicMaterial). 8 new adapter tests (entity pointerdown dispatch + null fallback, four arrow-key directions, arrow inert for non-entity tools, Esc on entity tool cancels to NoopTool). Full suite **526 / 30**, all green.

### Manual-test notes (filled in after browser verify)

- **Floors leaked into the selection.** Floors are entities with a `GridPlacement`, so the original "any entity under cursor → highlight" logic happily selected the floor tile when the user clicked anywhere without decor. Fixed in [select-tool.js:46-58](../../scripts/modules/builder/tools/select-tool.js#L46-L58) by gating selection on `editor.isNudgeable(entity)` — non-nudgeable hits (floors, walls, minions, scene meshes without a backref) route through the same path as clicking empty space and clear any active selection. Two new tests cover the gate. Final suite count after this and the relocation/hint additions: **528 / 30**.
- **Select moved from a panel-wide global strip to the Decor tab.** Earlier landing put a "Select" tile above the tab nav for cross-tab access, but it showed on Build/Minions too where it has no use. Relocated to the Decor tab tool row as the first entry ("Select Decor"), sitting next to "Remove Decor". Tool id stays as the literal `"select"`; `App.buildToolFromId` short-circuits on it before falling into the `tab:slug` parser, so the same id works wherever the AuthoringPanel surfaces it. Dropped `.authoring-panel-global-tools` + the `selectToolId` field from the view-model — neither has a remaining caller.
- **Added a centre-top hint tray.** A second `ToastQueue` lives on `AppViewModel.hintQueue` and feeds a new `#hint-tray` positioned centre-top in [main.css](../../styles/main.css), kept apart from the top-right warning/error feed so teaching prompts don't compete with the user's reflexive glance for refusal messages. `SelectTool` fires `editor.hint("Use arrow keys to nudge decor.")` on a *new* selection (re-clicks of the already-selected entity don't re-fire); the hint auto-dismisses on the standard 4s timer. `WorldEditor` gained a thin `hint(message)` passthrough mirroring the existing `toast`.

---

### Notable Deviations from Design

- **Corner stamping lives on `CornerPlacement`, not on `GridPlacement`.** Design said the wall-corner primitive would dispatch through the normal `GridPlacement` hook driven by `meta.collision`. But corner entities use `CornerPlacement` (vertex-anchored), not `GridPlacement` (cell-anchored). Wired the same stamp/revert lifecycle into `CornerPlacement` directly. See Task 7 Decisions.
- **`GridPlacement` only stamps when `blocks: true`.** Stamping unconditionally would paint floor cells into the obstacle map. Added a `this.blocks` gate so floors (and any other walkable-only placements) skip the stamp. See Task 7 Decisions.
- **AABB rotation direction corrected.** While reviewing for the wall-corner primitive (Task 4), found `rotateY` had cases 1 and 3 swapped. Three.js's right-handed Y-rotation by +π/2 maps (x, z) → (z, -x); fixed in place. Symmetric-AABB tests (Task 3) pass either way, so no test regression — but the geometry is now honest for any future asymmetric assets. See Task 4 Decisions.
- **Coverage threshold lowered from 0.4 to 0.2.** The design's starting value of 0.4 rejected the four-quadrant straddle case of a centred 1×1 decor inside a 4m cell (25% per sub-cell, all four rejected). 0.2 captures the straddle while still filtering sub-10% intrusions. See Task 3 Decisions.

---

### Issues and Adjustments

- **`EdgePlacement` doesn't stamp yet.** Task 7 stopped at corners. Straight/half walls (which use `EdgePlacement`, AABB primitive) don't yet contribute to the walk-grid. Required for Task 9 — without wall stamping, minions can sub-cell-path through walls. Task 9's first sub-step should add stamp/revert to `EdgePlacement` (mirroring the pattern already in `GridPlacement` / `CornerPlacement`).
