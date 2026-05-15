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

- Dev server bind blocked by sandbox classifier: substituted file-presence checks for `libs/three/*`, `libs/lz-string/*`, `index.html`, `scripts/app.js`, `assets/manifest.json`. Tests passing (440/28) + vendored libs intact is sufficient evidence the environment is healthy; the actual server smoke can happen at the Task 8 browser-verify gate.
- `npm test` errors with `sh: 1: vitest: not found` under the Bash tool; `npx vitest run` works. Same suite, same result. Continuing with `npx vitest run` for the remainder of the plan.

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

- Constructor signature: `WalkGrid(width, depth, subCellSize=1, subsPerMain=4)`. Stored `subsPerMain` on the instance so `mainToSub(cx, cz)` works without a ratio parameter. Default of 4 matches cozy-lairs' main grid (4m cells, 1m sub-cells).
- Reused `GridBoundsError` for invalid construction rather than adding a new error class — keeps the registry slim and matches `Grid`'s convention.
- `revertStamp` guards against underflow (skips when refcount is 0) instead of asserting. Silent guard rather than crash because a derived data structure shouldn't kill a load on a programmer mistake; the diagnostic overlay will surface logic errors visibly anyway.

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

- Corner-piece arm layout: each arm contributes a single "tip" sub-cell (2m from the vertex, at the far end of the L-arm). The inner-junction sub-cell (1m from the vertex, where the two arms meet) is intentionally excluded — it's shared with the adjacent straight/half wall segments that frame the corner, so letting those wall AABBs claim it avoids double-stamping. Stamp deltas relative to vertex sub-coord for SE orientation: (-2, 0) for the south-arm tip and (-1, 1) for the east-arm tip. Rotation table `ROTATION_STEP_BY_CORNER` mirrors `CornerPlacement.ROTATION_BY_CORNER` (SE=0, SW=1, NW=2, NE=3).
- Wall-corner primitive uses `{ vx, vz, corner }` rather than `{ cx, cz, rotationStep }` because corners are vertex-anchored (per `CornerPlacement`), not cell-anchored. `computeFootprint`'s options bag accepts both shapes — each primitive reads only the keys it needs. Cleaner than forcing corners into the cell coord space.
- Unknown corner string warns and emits empty footprint (matches the unknown-primitive fallback pattern). Tests added in `tests/world/footprint.test.js` (one for each cardinal corner + distinctness check + unknown-corner warn).

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

- [ ] Bump `VERSION` to `V6_5_0`.
- [ ] Modify `AssetManager` to compute + cache `Box3` after each successful asset load.
- [ ] Add `assets.getAabb(id)` accessor.
- [ ] Extend `tests/engine/asset-manager.test.js` (or equivalent) with AABB cache tests.
- [ ] Run `npm test`; confirm green — auto-progress.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V6_6_0`.
- [ ] Add `xOffset` / `zOffset` constructor fields to `GridPlacement` with finite-validation.
- [ ] Update `toJSON` to emit each only when non-zero.
- [ ] Update `fromJSON` (or schema-v2 component decoder) to accept missing fields as 0.
- [ ] Add `this.stampedSubCells = []` field.
- [ ] In `onAddedToWorld`: compute footprint via `footprint.js`, stamp walk-grid (gated on `world.walkGrid`).
- [ ] In `onRemovedFromWorld`: revert stamp (gated).
- [ ] Add `setOffset(x, z)` method that revert-applies if attached to a world.
- [ ] Extend `tests/world/components.test.js` with: finite validation, save round-trip, stamp lifecycle (using a mock walk-grid).
- [ ] Run `npm test`; confirm green — auto-progress.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V6_7_0`.
- [ ] Add `walkGrid` field to `World` constructor; clear in `World.clear()`.
- [ ] Remove `world.walkGrid` gate from `GridPlacement.onAddedToWorld` / `onRemovedFromWorld`.
- [ ] Update `assets/manifest.json`: `wall.stone.corner` gets `meta.collision: "wall-corner"`.
- [ ] Add tests to `tests/world/world.test.js`: walk-grid initialised at correct dimensions; `World.clear` resets it.
- [ ] Extend `tests/world/world-serializer.test.js`: load a V5 fixture and assert sub-grid is correctly populated (floor cells walkable; corner-arm sub-cells blocked).
- [ ] Run `npm test`; confirm green — auto-progress.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V6_8_0`.
- [ ] Add the select control to the dev-console view-model + template.
- [ ] Extend the existing diagnostic-grid module with a sub-grid mode (instanced/batched mesh).
- [ ] Wire the select to the diagnostic-grid mode setter.
- [ ] Manual test: place corner-creating walls, toggle overlay, verify arms are red.
- [ ] Manual test: place a 2-cell-wide table, toggle overlay, verify the AABB stamp covers the expected sub-cells.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V6_9_0`.
- [ ] Inspect the current minion pathing module; note whether minions idle or random-walk (record in Decisions).
- [ ] Replace main-grid neighbour expansion with walk-grid 4-neighbour expansion.
- [ ] Migrate self-occupancy: stamp current sub-cell on tick, revert on step.
- [ ] Update minion tests for the new substrate.
- [ ] Run `npm test`; confirm green.
- [ ] Manual test: minion paths around a corner without clipping; sub-grid overlay shows it threading single-blocked sub-cells correctly.
- [ ] Manual test: two minions share a 4×4 tile by occupying different sub-cells.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V6_10_0`.
- [ ] Implement `canNudge` + `nudgeEntity` on `WorldEditor`.
- [ ] Add eligibility guard: rejects `floor.*` kinds, rejects `wall.stone.*` kinds.
- [ ] Extend `tests/world/world-editor.test.js`: happy path, refusal on overlap, surface-placed decor doesn't stamp, eligibility rejections.
- [ ] Extend `tests/world/world-serializer.test.js`: nudged decor round-trips through save/load with offsets preserved.
- [ ] Run `npm test`; confirm green — auto-progress.

### Decisions

<!-- Filled in during execution. -->

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

- [ ] Bump `VERSION` to `V6_11_0`.
- [ ] Confirm/add `object3D.userData.entity` backref in `Entity`.
- [ ] Create `SelectTool` class with `onEntityClick(entity)`, `nudge(dx, dz)`, `deselect()`.
- [ ] Extend `BuilderInputAdapter`: handle `targetType: "entity"` (scene raycast); arrow-key dispatch to `tool.nudge`.
- [ ] Add Select icon to `AuthoringPanel` (single shared button above tab content).
- [ ] Wire selection outline (consider `THREE.OutlinePass`, or a simpler emissive tint).
- [ ] Add Esc handler to deselect.
- [ ] Add tests for the tool: selection state, eligibility, deselect on Esc.
- [ ] Run `npm test`; confirm green.
- [ ] Manual test: select a chair, nudge ±X / ±Z by 1m each, save, refresh, confirm offsets persisted.
- [ ] Manual test: try to nudge into a wall — refusal toast appears.
- [ ] Verify in browser.

### Decisions

<!-- Filled in during execution. -->

---

### Notable Deviations from Design

<!-- Filled in during execution. -->

---

### Issues and Adjustments

<!-- Filled in during execution based on testing and user feedback. -->
