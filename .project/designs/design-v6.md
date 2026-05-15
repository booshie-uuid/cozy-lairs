# Design — V6: Walkability Sub-Grid + Nudging Foundations

Date: 2026-05-15

---

## Summary

V6 introduces a **1×1m walkability sub-grid** that lives alongside the existing 4×4m authoring grid. Sub-cells are stamped and unstamped by placement events using per-asset AABB footprints, with a small primitive registry for non-rectangular shapes like wall corners. Minion pathing migrates onto this sub-grid, eliminating the corner-clipping bug and unlocking sub-tile minion co-occupancy. Nudging (free X/Z decor offset within a cell) lands as data + minimal arrow-key UX, with the sub-grid as the natural collision substrate.

---

## Architecture

- The main `Grid` (4m, 20×20) is unchanged. It still owns floors, authoring rules, save schema integration, and tab catalogues.
- A new `WalkGrid` (1m, 80×80 = 6,400 cells) is the authoritative obstacle map. Backed by a `Uint16Array` of per-sub-cell **refcounts** (multiple blockers can overlap; a sub-cell is walkable iff refcount = 0). `Uint16Array` rather than bitset because overlapping stamps need to compose cleanly — refcount ensures removing one blocker doesn't accidentally clear another.
- **Sub-grid is derived, not persisted.** Like tracer walls and corners, it rebuilds deterministically from authored entities. Save schema only adds `xOffset` / `zOffset` to `GridPlacement`. No schema version bump needed — schema-v2's component dict tolerates added optional fields with default 0.
- **Footprint computation** lives in a single new module (`scripts/modules/world/footprint.js`) — pure functions, asset-driven, rotation-aware, offset-aware. Two primitives at launch: `"aabb"` (default, derived from mesh bounding box) and `"wall-corner"` (L-shape generator). Adding a new primitive is a registry entry plus a function.
- **Coverage threshold** for the AABB stamper is a single tunable constant (start at `MIN_SUB_CELL_COVERAGE = 0.4`). A sub-cell counts as occupied if the projected footprint covers ≥40% of its 1m² area. Absorbs tiny nudges without pathological blocking.
- **Minion pathing** swaps its grid-source from `world.grid` cell occupancy to `world.walkGrid.isWalkable(sx, sz)`. Step size becomes 1m. Visual movement remains continuous (animation interpolates between sub-cell waypoints).
- **Player movement** is largely untouched. Its existing mesh-based collision continues; the sub-grid is invisible to it.

---

## Components

### New modules

- **`scripts/modules/world/walk-grid.js`** — class `WalkGrid` owns the `Uint16Array` refcount buffer. API:
  - `isWalkable(sx, sz)` — bounds + refcount check.
  - `isWalkableAtWorld(x, z)` — convenience for path queries from world coords.
  - `applyStamp(subCells)` / `revertStamp(subCells)` — increment/decrement refcounts for a list of `{sx, sz}` tuples. Always called as a matched pair via an entity's recorded stamp.
  - `worldToSub(x, z)` / `subToWorld(sx, sz)` / `mainToSub(cx, cz)` — coordinate helpers.
  - `clear()` — reset for `World.clear()`.

- **`scripts/modules/world/footprint.js`** — pure functions:
  - `computeFootprint(kind, cx, cz, rotationStep, xOffset, zOffset, assets)` — returns `{ subCells: [{sx, sz}, ...] }`. Reads `meta.collision` from the asset record (default `"aabb"`) and dispatches to the primitive function.
  - Internal: `aabbStamp(aabb, transform)` — projects an axis-aligned bounding box through translation + rotation onto the sub-grid; returns sub-cells whose intersected area ≥ `MIN_SUB_CELL_COVERAGE × subCellArea`.
  - Internal: `wallCornerStamp(transform)` — L-shape generator parameterised by the corner's anchor cell + arm directions; emits exactly the two-arm sub-cell set (no AABB over-blocking).
  - Registry: `const STAMPERS = { aabb, "wall-corner": wallCornerStamp }`.

### Modified modules

- **`AssetManager`** — at load time, computes and caches each mesh's local AABB (`new THREE.Box3().setFromObject(scene)`). Exposed via `assets.getAabb(id)` for the footprint module.
- **`GridPlacement`** — gains optional `xOffset` / `zOffset` fields (default 0). `toJSON` emits each only when non-zero. `onAddedToWorld` records `this.stampedSubCells`, calls `world.walkGrid.applyStamp(subCells)`. `onRemovedFromWorld` calls `revertStamp(this.stampedSubCells)`. Updating offsets calls revert-then-apply.
- **`World`** — gains `this.walkGrid = new WalkGrid(grid.width × 4, grid.depth × 4)`. `clear()` clears it. The grid is built once and never resized.
- **`WallTracer`** — `wall.stone.corner` entries in the manifest carry `meta.collision: "wall-corner"`, which drives the L-shape stamp automatically through the normal `GridPlacement` hook. No bespoke tracer code for stamping.
- **Minion pathing module** — query target swaps from main-grid occupancy to `walkGrid.isWalkable`. A* / BFS neighbourhood becomes 1m sub-cells, 4-neighbour (no diagonals in V6 — revisit if movement feels janky).
- **Diagnostic grid overlay** — gains a sub-grid mode. A dev-console toggle ("Sub-grid debug: off / overlay / sub-only") renders the 1m sub-cells with red tint for unwalkable, faint outline for walkable. Overlay mode draws both grids; sub-only replaces the main-grid overlay.
- **`AuthoringPanel`** — adds a "Select" tool icon. Single shared tool surfaced above the tab content, since selection is cross-tab (you might select a decor while on the Build tab). New tool subclass `SelectTool`.
- **`BuilderInputAdapter`** — `SelectTool.targetType = "entity"`. The adapter, on pointer-down with that target type, raycasts against the scene (not just the floor plane). On hit, walks up to find the owning entity via `object3D.userData.entity` backref, and calls `tool.onEntityClick(entity)`. Arrow keys while a selection exists call `tool.nudge(dx, dz)`.
- **`WorldEditor`** — gains `nudgeEntity(entity, deltaX, deltaZ)` which validates the new offset (new footprint must clear placement rules) and applies. Predicate `canNudge(entity, deltaX, deltaZ)` mirrors. Returns `true/false`. Refusals toast.

---

## Data Flow

### Stamp lifecycle

```
WorldEditor.placeDecor(kind, cx, cz)
  → new Entity → addComponent(new GridPlacement(cx, cz, rotationStep, xOffset=0, zOffset=0))
  → world.addEntity(entity)
    → entity.onAddedToWorld(world)
      → GridPlacement.onAddedToWorld
        → footprint.computeFootprint(kind, cx, cz, rotationStep, 0, 0, assets)
        → this.stampedSubCells = subCells
        → world.walkGrid.applyStamp(subCells)
    → world emits "entityAdded"
      → WallTracer reacts → may add wall/corner entities → their own stamps cascade

WorldEditor.removeDecor(entity)
  → world.removeEntity(entity)
    → entity.onRemovedFromWorld
      → GridPlacement.onRemovedFromWorld
        → world.walkGrid.revertStamp(this.stampedSubCells)
    → world emits "entityRemoved"
      → WallTracer reacts → may remove/replace walls/corners → their stamps revert/re-stamp

WorldEditor.nudgeEntity(entity, dx, dz)
  → canNudge(entity, dx, dz)? (recomputes footprint at new offset, checks overlap rules)
  → if ok:
    → world.walkGrid.revertStamp(placement.stampedSubCells)
    → placement.setOffset(placement.xOffset + dx, placement.zOffset + dz)
    → placement.stampedSubCells = computeFootprint(... newOffsets)
    → world.walkGrid.applyStamp(placement.stampedSubCells)
    → entity.object3D.position updates
```

### Nudge UX flow

```
User clicks Select tool icon
  → AuthoringPanel.selectedToolId("select")
  → App.setTool builds SelectTool
  → BuilderInputAdapter.setTool(selectTool)

User clicks a placed decor
  → Input emits pointerdown (canvas target)
  → BuilderInputAdapter raycasts scene (not just floor plane)
  → finds owning entity via object3D.userData.entity backref
  → tool.onEntityClick(entity)
    → SelectTool.selected = entity
    → adds outline / tint to entity's object3D

Arrow keys while selected
  → Input emits keydown
  → BuilderInputAdapter detects active SelectTool + arrow
  → tool.nudge(±1, 0) or (0, ±1)  [in metres → 1m = one sub-cell]
    → editor.nudgeEntity(selected, dx, dz)

Esc / click empty floor
  → tool.deselect()
  → outline removed
```

### Minion pathing flow

Existing pathing module, with substrate swapped:

```
Minion.tick(dt)
  → if no path: world.walkGrid.findPath(startSub, goalSub) [BFS, 4-neighbour]
  → walk toward next sub-cell waypoint
  → on arrival: walkGrid.revertStamp(prev minion claim), walkGrid.applyStamp(new sub-cell), advance waypoint
```

Minion self-occupancy uses the same refcount system — its current sub-cell is `+1` in the refcount buffer, released on the next step. Other minions' pathfinders see it as blocked. Resolves the "two minions can't share a tile" jank.

### Nudge eligibility

- Floors are not nudgeable (tile-aligned tiling).
- Tracer-derived walls and corners (`wall.stone.*` kinds) are not nudgeable (auto-placed).
- Everything else with a `GridPlacement` is nudgeable: decor, terrain.block, minions, surface-placeables.

---

## Save Compatibility

V5 saves load transparently into V6. No compatibility break, no schema bump.

- Schema stays at `v: 2`. `xOffset` / `zOffset` are optional `GridPlacement` fields with default 0. They're emitted only when non-zero — V6 saves with no nudging are byte-identical in shape to V5 saves.
- The sub-grid is derived state. During `fromJSONv2`, each entity's `onAddedToWorld` stamps the sub-grid from its asset's footprint. Tracer-derived walls/corners remain excluded by `SAVE_SKIP_KINDS` and re-derive (and re-stamp) on load.
- A V5 save loaded under V6 ends up with a fully-populated, correct sub-grid. Any minion previously placed inside a now-blocked sub-cell (e.g. a corner-arm sub-cell from the long-standing clipping bug) will be one path-step "off" once it next moves — which is the bug fix, not a regression.
- No `SAVE_SKIP_KINDS` additions needed. The sub-grid is purely derived and never serialised.

---

## Error Handling

- `WalkGrid` constructor rejects non-positive dimensions. `applyStamp` / `revertStamp` bounds-check each sub-cell and skip out-of-range entries silently (cheap, predictable).
- `GridPlacement` constructor rejects non-finite `xOffset` / `zOffset`. `toJSON` round-trips finite values only.
- `WorldEditor.canNudge` mirrors `nudgeEntity` — predicate first, mutation second. Refusal returns `false`; active attempts emit a toast (`"Cannot nudge — would overlap [X]"`). Ghost tinting during nudge drag is out of scope for V6.
- `computeFootprint` with an unknown `meta.collision` value: dev-console warn + fall back to `"aabb"`. Same fallback if `assets.getAabb(kind)` returns null.
- Sub-grid refcount over/underflow: refcount is `Uint16` (max 65535). In practice no sub-cell is reffed more than ~4× (overlapping decor + wall arm + corner arm + minion). Asserted in dev builds only.

---

## Testing Strategy

- **`tests/world/walk-grid.test.js`** (new) — refcount stamp/revert symmetry, bounds checks, `isWalkable` correctness, coord conversions, `clear()`.
- **`tests/world/footprint.test.js`** (new) — AABB primitive stamps for varying rotations + offsets + asset sizes; `wall-corner` primitive emits exactly the expected L-shape sub-cells for all four corner orientations; coverage threshold absorbs <40% intrusions; unknown primitive falls back to AABB.
- **`tests/world/world-editor.test.js`** — extend with `nudgeEntity` happy path, refusal on overlap, sub-grid re-stamp on nudge; surface-placed decor doesn't stamp the sub-grid; floors and tracer-derived kinds reject nudge attempts.
- **`tests/world/wall-tracer.test.js`** — corner pieces produce correct L-shape stamps; removing a floor reverts tracer-emitted stamps.
- **`tests/world/world-serializer.test.js`** — V5-shaped save fixture loads under V6 → sub-grid is populated as expected; `xOffset` / `zOffset` round-trip through v2 save format; absent fields default to 0.
- **`tests/world/components.test.js`** — `GridPlacement` records `stampedSubCells` on attach, reverts on detach; non-finite offsets rejected.

Target: +30-40 tests across the new + extended files. Pushes us to ~470-480 tests total.

---

## Open Questions

1. **Sub-grid pathfinder algorithm**: BFS or A*? BFS is sufficient for V6 (small grid, no weights). A* lands later if heuristic weighting becomes useful.
2. **Diagonals on the sub-grid**: 4-neighbour or 8-neighbour? Defaulting to 4-neighbour for V6. Revisit if movement feels janky.
3. **Sub-grid debug overlay UX**: dev-console toggle is the proposed mechanism. Hotkey could be added later if it's used a lot.
4. **Existing minion idle behaviour**: do minions currently random-walk, patrol, or stand still until commanded? Affects how aggressively the sub-grid is exercised at runtime. Worth a quick code check during plan-writing.
5. **Nudge increment granularity**: 1m (one sub-cell) is the V6 default. Finer increments (0.5m / 0.25m) would need either a sub-sub-cell stamp pass or just accept that stamps quantise while visuals don't.
