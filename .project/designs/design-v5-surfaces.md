# Design V5 Addendum — Surface Placement
Date: 2026-05-14

> Extension to [design-v5.md](./design-v5.md). Added mid-execution after V5 Task 10 (six new decors) shipped a table alongside candle + bottles, and the natural mismatch — clutter that obviously belongs *on* a table — surfaced (no pun intended) as a feature gap. Implemented as new tasks appended to plan-v5.md rather than as a fresh version.

## Summary

Two new manifest meta categories let decor entries opt into surface roles:

- `meta.surface = { surfaceY: <number> }` — marks the entry as a surface (e.g. table). `surfaceY` is the world-Y of the top face, relative to the cell floor at Y=0.
- `meta.placeableOnSurface: true` — marks the entry as eligible to sit on either the floor or a surface (e.g. candle, bottles).

The placement engine auto-prefers a surface when one is present in the hovered cell; falls back to the floor otherwise. V5 enforces one surface-placeable per surface cell (multi-per-cell is locked behind the future "nudging" feature). Removing a surface cascade-removes any placeables sitting on it.

The data model deliberately stays minimal: no new component class. `GridPlacement` gains an optional `surfaceY` field that drives the entity's Y position and round-trips through the v2 snapshot. The `meta.surface` shape is an object so future additions (`surfaceX` for wall anchors, `surfaceFootprint`, `slots`) don't need a schema bump.

---

## Architecture

### Manifest schema additions

V5 catalogue entries gain two optional `meta` keys:

| Decor | Mark as |
|---|---|
| `decor.table` | `meta.surface = { surfaceY: <tuned in browser> }` |
| `decor.candle.triple` | `meta.placeableOnSurface: true` |
| `decor.bottles` | `meta.placeableOnSurface: true` |

A decor *could* be both a surface and surface-placeable in the future (small-table-on-big-table); V5 won't exercise that combination.

### Data model

No new component. `GridPlacement` constructor accepts an optional `surfaceY` in its options bag:

```js
new GridPlacement(cx, cz, rotationStep, { surfaceY: 0.85 })
```

- `surfaceY` defaults to `0` (floor level).
- `GridPlacement.onAddedToWorld` adds `surfaceY` to `object3D.position.y` after the standard cell-to-world calc.
- `GridPlacement.toJSON` emits `surfaceY` only when non-zero (snapshot stays compact for the floor-decor majority).

**Why GridPlacement and not a new `SurfacePlacement` component?** GridPlacement already owns "where this entity sits in the grid". Surface-placement is a Y-offset variation of the same concern. Future X/Z nudging will follow the same pattern (`xOffset` / `zOffset`).

### Surface lookup

Pure manifest-driven. `WorldEditor.getSurfaceAtCell(cx, cz)` iterates entities at the cell, returns the first whose `assets.getMeta(entity.kind).surface` is set. V5 guarantees at most one surface per cell (validation rule in `placeDecor`); the "first match" semantics is forward-compatible with multi-surface cells when nudging arrives.

### Multi-per-cell readiness

`world.entities` already holds multiple entities per cell — no data-model constraint. V5's "one placeable per surface" is enforced as a *validation rule* in `WorldEditor.canPlaceDecor`, not as a schema invariant. Lifting the rule (when nudging ships) requires no migration.

---

## Components

### Changed files

- **`assets/manifest.json`** — `decor.table` gets `meta.surface`; `decor.candle.triple` and `decor.bottles` get `meta.placeableOnSurface`.
- **`scripts/modules/world/components/grid-placement.js`** — constructor accepts `surfaceY` in options; `onAddedToWorld` applies the Y offset; `toJSON` emits when non-zero.
- **`scripts/modules/world/world-serializer.js`** — `COMPONENT_BUILDERS.GridPlacement` passes `surfaceY` through to the constructor.
- **`scripts/modules/world/world-editor.js`** — new `getSurfaceAtCell(cx, cz)`; `canPlaceDecor` and `placeDecor` branch on surface-placement; `removeDecor` cascades placeables when a surface is removed; new `getPlacementYFor(kind, cx, cz)` shared helper.
- **`scripts/modules/builder/tools/decor-tools.js`** (or wherever the `DecorPlaceTool` ghost positioning lives) — uses `getPlacementYFor` to position the ghost mesh at the correct Y when hovering a surface cell.

### Unchanged

- No new component class.
- No save schema bump (still v2 — additive optional field).
- No new tool variant — `decor:place:decor.candle.triple` works for both floor and surface targets.
- AuthoringPanel catalogue tile — no visual differentiation in V5. Discoverability comes from hovering a surface cell.

---

## Data Flow

### Place a candle on a table

```
User selects "Place Triple Candle" tool, hovers cell (5, 5):
  BuilderInputAdapter.onPointerMove → DecorPlaceTool.onCellHover(cell)
    → editor.canPlaceDecor("decor.candle.triple", 5, 5)
        → kindMeta.placeableOnSurface = true
        → surface = editor.getSurfaceAtCell(5, 5)  // returns the table
        → no other surface-placeable already on this cell
        → return true
    → editor.getPlacementYFor("decor.candle.triple", 5, 5)
        → returns surface.kindMeta.surface.surfaceY (e.g. 0.85)
    → ghost.position.set(cellWorldX, 0.85, cellWorldZ)
    → ghost tinted green

User left-clicks:
  → DecorPlaceTool.onCellClick("left")
    → editor.placeDecor("decor.candle.triple", 5, 5, rotationStep)
        → surfaceY = getPlacementYFor(...)
        → entity.addComponent(new GridPlacement(5, 5, 0, { surfaceY: 0.85 }))
        → world.addEntity(entity)
        → entity sits on top of the table
```

### Remove the table

```
User selects "Erase Decor" tool, clicks the table:
  → editor.removeDecor(tableEntity)
    → tableMeta.surface is set → cascade pass
    → for each entity at cell (5, 5):
        if entity.getComponent(GridPlacement).surfaceY > 0:
            world.removeEntity(entity)        // candle removed first
    → world.removeEntity(tableEntity)         // then the table
```

### Save / load round-trip

```
Save:
  candle.toJSON() → { kind: "decor.candle.triple",
                       components: { GridPlacement: { cx: 5, cz: 5, rotationStep: 0, surfaceY: 0.85 } } }

Load:
  COMPONENT_BUILDERS.GridPlacement(entity, { cx: 5, cz: 5, rotationStep: 0, surfaceY: 0.85 })
    → new GridPlacement(5, 5, 0, { surfaceY: 0.85 })
    → world.addEntity(entity)
    → onAddedToWorld → object3D.position.set(cellWorldX, 0.85, cellWorldZ)
```

The candle's visual position is correct independently of the table's load order — `surfaceY` is self-contained data on the placeable.

---

## Error Handling

- **Place candle on a cell with another surface-placeable already there** — `canPlaceDecor` refuses; toast: "Can't place Triple Candle here." (existing copy pattern). Hover ghost tinted red.
- **Place chair (non-surface-placeable) on a surface cell** — refused; same toast and tint as any other "cell occupied" refusal.
- **Place a surface (table) on a cell that already has decor** — existing floor-decor placement rule applies; refused.
- **Erase a placeable directly** — single removal, no cascade. Surface stays.
- **Erase the floor under a surface** — existing `eraseFloor` cascade already iterates everything in the cell; just confirm the cascade path picks up surface + placeables. (Implementation note: the current eraseFloor cascade may need a brief audit.)
- **Hand-edited save with `surfaceY > 0` but no matching surface entity** — placeable floats. Editor never produces this state; no defensive check.

---

## Testing Strategy

Existing test files extended; no new files.

- **`tests/world/components.test.js`** — `GridPlacement` cases:
    - `surfaceY` defaults to 0 when omitted.
    - `surfaceY` accepted via constructor options.
    - `onAddedToWorld` raises `object3D.position.y` by `surfaceY`.
    - `toJSON` omits `surfaceY` when 0; includes it when non-zero.

- **`tests/world/world-editor.test.js`** — new cases:
    - `getSurfaceAtCell` returns the surface entity / null.
    - `canPlaceDecor` allows placing a `placeableOnSurface` decor on a surface cell.
    - `canPlaceDecor` refuses if the cell already has a surface-placeable.
    - `canPlaceDecor` refuses a non-`placeableOnSurface` decor on a surface cell.
    - `placeDecor` of a placeable-on-surface decor → entity's `GridPlacement.surfaceY` matches the surface meta.
    - `placeDecor` of the same decor on a bare floor cell → `surfaceY === 0`.
    - `removeDecor` of a surface entity cascades placeables (`surfaceY > 0`) at the same cell.
    - `removeDecor` of a placeable directly leaves the surface intact.

- **`tests/world/world-serializer.test.js`** — `surfaceY` round-trips through `toJSON` / `fromJSONv2`.

- **Manual browser verification** per task:
    - Place a table, place a candle on it; cycle Q/E rotation on each.
    - Place a candle on bare floor (visible at floor) — confirms floor fallback.
    - Place a chair in a table cell → red ghost + refusal toast.
    - Place a second candle on a table that already has one → red ghost.
    - Erase the table → both vanish.
    - Save + reload via Ctrl+S / Ctrl+O — candle round-trips at the right Y.

---

## Open Questions

- **`surfaceY` value for `decor.table`** — tuned during browser verify. Initial guess ~0.85 (table_medium.gltf top face inspection).
- **"Floor mode" placement-toggle hotkey** — explicitly deferred. When it lands (likely alongside nudging), `placeDecor` and `getPlacementYFor` grow an optional `target` parameter (`"surface" | "floor" | "auto"`); default `"auto"` preserves V5 behaviour.
- **Visual catalogue indicator for surface-placeable decor** — deferred. Revisit if discoverability becomes a problem in playtesting.
- **Multi-placeable per surface** — locked behind nudging arrival. Schema doesn't preclude it.
- **Multi-surface per cell** — schema doesn't preclude it (`getSurfaceAtCell` returns "first match" semantics). Validation rule enforces V5's "one surface per cell" for now.
- **Should `decor.chest` be a surface too?** Not in V5; a future pass can add `meta.surface` without code changes.
- **Wall-style surfaces** — `meta.surface` shape supports adding `surfaceX` / `surfaceZ` later for vertical anchor points (e.g. a coat hook on a wall) without a schema migration.
