# Design: Cozy Lairs V4 — Decor Placement & Room Expansion
Date: 2026-05-11

## Summary

V4 introduces interactive authoring of rooms, decor, and minions via a tabbed side panel that appears in Builder mode. Three tabs — **Build**, **Decor**, **Minions** — each follow the same pattern: a row of dedicated tools at the top (always including a "remove" tool), then a catalogue of items below (rendered thumbnails for decor and minions, generated from the 3D models at boot). Tools follow a uniform interaction grammar: select a tool, hover to see a ghost preview, left-click to commit, right-click or `Escape` to cancel, `Q`/`E` to rotate. Floor painting auto-traces walls — the user never places walls explicitly. Wall decor (banners, torches) snaps to the nearest wall edge under the cursor. V3's auto-spawned scaffolding (4 minions, 9 hardcoded decor entries, 3 chaos barrels) is removed; new worlds open with a 6×6 starter room, the player avatar, and nothing else. No costs, no tech tree — V4 is god-mode-immediate placement.

## Architecture

V4 layers four new concepts on top of the V3 entity-component world: an **AuthoringPanel** (the right-edge tabbed UI surface), a **Tool** abstraction (one class per tool type), a **WorldEditor** (the single mutation entry point for authored changes), and a **WallTracer** (keeps the auto-traced wall entity set in sync with floor changes). Two supporting services land alongside: a **BuilderInputAdapter** routes raycast results from cursor events to the active tool, and an **IconRenderer** generates catalogue thumbnails at boot.

The existing engine, world, and component modules are untouched in shape — V4 only **adds**. The single change to V3 code paths is removing the auto-spawn block in `App.buildWorld` and replacing the hardcoded `DECOR_LAYOUT` / `MINION_COUNT` / `ChaosController` setup with a small `seedStarterRoom()` call.

The dev console keeps its own slide-in chrome unchanged. The right-edge slot is shared with the AuthoringPanel via a lightweight policy: the dev console toggle (`Backquote`) opens the dev console and dismisses the AuthoringPanel; selecting a tab on the AuthoringPanel dismisses the dev console. Final wiring picked at task-time (probable: dev-console stays Backquote-only, no UI toggle for it).

### Long-term context — informs V4 shape but out of V4 scope

These are user-stated future intents that V4 should not box out:

- **Cost / tech-tree restrictions**: future versions add resource cost to placements; some items may require unlocks. Manifest schema must accommodate this without a breaking change.
- **Inventoried removal**: some decor types will be inventoried on removal (returned to the player) rather than destroyed. V4's `removeDecor` returns the entity; future versions will branch on a manifest flag.
- **Minion-driven construction**: floor paint is currently god-mode-immediate; future versions will queue painted cells as work orders for minions to build over time.
- **Dual catalogue surface**: long-term the catalogue is a side panel **plus** a bottom toolbar with assignable shortcut slots. V4 ships only the side panel.
- **Free Y-rotation**: V4 uses 90° snap rotation. Future versions add nudging and free Y-axis rotation.
- **Player avatar move tool**: V4 has no way to reposition the player avatar in Build mode; future versions add a `MovePlayerTool` in the Build tab that reuses the V3.8 `world.playerDisplaceHandler` plumbing.
- **Manifest entry meta**: arbitrary `meta: { … }` bag preserved verbatim by AssetManager — future versions read fields from it; V4 reads nothing.

## Components

### AuthoringPanel
[scripts/modules/ui/authoring-panel.js](../../scripts/modules/ui/authoring-panel.js) (new). KO-driven UI bound to a tabbed `<aside>` on the right edge. Visible only in Builder mode (KO `visible` binding against `cameraMode === "builder"`). Owns the selected-tab observable and selected-tool observable; emits `toolSelected` when a tile is clicked. Styled per [cozy.css](../../styles/cozy.css) chrome formula (rounded, neon-dim border, chunky drop shadow).

### Tool (abstract base + concrete subclasses)
`scripts/modules/builder/tools/` (new directory). Base class declares the interaction protocol:

```
activate(editor, scene)
deactivate()
onCellHover(cell)
onCellClick(cell, button)
onWallEdgeHover(edge)
onWallEdgeClick(edge, button)
rotate(direction)        // "cw" | "ccw"
ghostMesh                // THREE.Object3D | null — owned by the tool
```

Concrete subclasses (one file each):
- `FloorPaintTool` — paints floor cells. Ghost: a translucent green cell-overlay quad.
- `FloorEraseTool` — erases floor cells. Ghost: a translucent red cell-overlay quad.
- `DecorPlaceTool` — places a configured decor kind. Ghost: translucent clone of the decor mesh.
- `DecorEraseTool` — removes a hovered decor entity. Ghost: red outline around the hovered decor's bounding box.
- `WallDecorPlaceTool` — places wall decor on the nearest wall edge. Ghost: clone of the decor mesh aligned to the snapped edge.
- `MinionSpawnTool` — spawns a Skeleton_Minion (the only minion kind in V4) at the hovered cell. Ghost: translucent clone of the minion mesh.
- `MinionEraseTool` — removes a hovered minion entity.

### WorldEditor
[scripts/modules/world/world-editor.js](../../scripts/modules/world/world-editor.js) (new). Single mutation surface for authored changes. Holds a reference to the `world` and the `assets`. Methods:

```
canPaintFloor(cx, cz)   → bool         placeDecor(kind, cx, cz, rot)        → bool
paintFloor(cx, cz)      → bool         placeWallDecor(kind, edge, rot)      → bool
canEraseFloor(cx, cz)   → bool         removeDecor(entity)                  → bool
eraseFloor(cx, cz)      → bool         spawnMinion(kind, cx, cz)            → bool
                                       removeMinion(entity)                 → bool
```

Tools call into WorldEditor; tests exercise WorldEditor headlessly. Each `canX` predicate mirrors its action method's gates so ghost tinting and gates use the same code path.

### WallTracer
[scripts/modules/world/wall-tracer.js](../../scripts/modules/world/wall-tracer.js) (new). Subscribes to the World's `entityAdded` / `entityRemoved` events. When a floor entity changes, recomputes the wall entity set for the affected cell + its 4 orthogonal neighbours. Adds/removes wall entities via `world.addEntity` / `removeEntity` so save/load round-trips them automatically. Idempotent: re-running the trace for a cell already in the correct state is a no-op.

### BuilderInputAdapter
[scripts/modules/builder/builder-input-adapter.js](../../scripts/modules/builder/builder-input-adapter.js) (new). Installed when Builder camera activates. Holds a `THREE.Raycaster`, the active tool reference, and registries of floor / wall meshes. Translates pointer events into cell or wall-edge hits, dispatches to the active tool's hover/click handlers. Listens for `Q`/`E` key events while in Builder mode and routes to `currentTool.rotate("ccw" | "cw")`.

### IconRenderer
[scripts/modules/builder/icon-renderer.js](../../scripts/modules/builder/icon-renderer.js) (new). Given an asset id + GLTF, renders a 96×96 PNG via an offscreen `THREE.WebGLRenderer` + tiny scene with a fixed three-quarter-perspective camera + a HemisphereLight. Returns a data URL. Runs once per decor / minion kind during boot (after asset preload, before `setCameraMode`). On render failure, falls back to a text-tile generated by drawing the `displayName` onto a 96×96 canvas.

### Manifest schema extension

The current manifest entry shape (`{ id, path, type, tier }`) is extended with three optional fields:

```json
{
  "id":          "decor.barrel",
  "path":        "...",
  "type":        "gltf",
  "tier":        "world",
  "kind":        "decor.floor",
  "displayName": "Barrel",
  "meta": {
    "comment": "V4 reads nothing here. Future versions will read fields like cost, requiresUnlock, category, inventoryOnRemove, etc."
  }
}
```

V4 reads `kind` (one of `decor.floor`, `decor.wall`, `character`) to decide which catalogue tab the entry belongs to, and `displayName` for the tile label. The catalogue ignores entries with no `kind`. Anything in `meta` is preserved verbatim by AssetManager and exposed via `assets.getMeta(id)` for future consumers — but no V4 code reads it. Future cost/unlock fields land here without a schema migration.

### Modified existing modules

- [scripts/app.js](../../scripts/app.js) — `buildWorld` loses the `DECOR_LAYOUT` loop, the `MINION_COUNT` spawn, and the `ChaosController` wiring; gains a `seedStarterRoom()` call. Constructs `WorldEditor`, `WallTracer`, `BuilderInputAdapter`. Swaps `setCameraMode` to install/uninstall the input adapter.
- [scripts/modules/engine/asset-manager.js](../../scripts/modules/engine/asset-manager.js) — preserves `kind`, `displayName`, `meta` on each manifest entry; new `getKind(id)`, `getDisplayName(id)`, `getMeta(id)` accessors.
- [scripts/modules/world/world-serializer.js](../../scripts/modules/world/world-serializer.js) — no shape change. Painted-floor entities and authored decor entities serialise the same way as V3's hardcoded ones; no special case needed.
- [assets/manifest.json](../../assets/manifest.json) — annotate existing decor entries with `kind` + `displayName`; add new wall-decor entries (banner, torch — sourced from KayKit Dungeon Remastered).

## Data Flow

### Boot
1. `App.start` runs as today through `assets.preloadCore`.
2. `IconRenderer.renderCatalogue(assets)` walks every manifest entry with a `kind` and produces a Map<id, dataURL>. The `AppViewModel` exposes this map as a KO observable consumed by the catalogue tile templates.
3. `App.buildWorld` runs `seedStarterRoom()` — paints a 6×6 footprint of floors via WorldEditor (WallTracer auto-traces the walls each step), spawns the player avatar at a centre cell. No minions, no decor, no chaos.
4. `BuilderInputAdapter` is constructed but inactive; activates when `setCameraMode("builder")` runs.

### Tool activation
1. User clicks a tile in the panel.
2. `AuthoringPanel` view-model emits `toolSelected(toolId)` to App.
3. App constructs the matching `Tool` instance, calls `currentTool.deactivate()` on the old, swaps in the new, calls `activate(worldEditor, scene)`.
4. The new tool builds its ghost mesh and adds it to the scene with `visible = false` (made visible on first hover hit).

### Hover
1. Pointer move → `BuilderInputAdapter.onPointerMove` → raycast against (a) the floor plane Y=0 for cell tools, (b) the wall mesh registry for wall-edge tools.
2. Hit converted to `{cx, cz}` or `{cx, cz, side}`.
3. Adapter calls `currentTool.onCellHover(cell)` / `onWallEdgeHover(edge)`.
4. Tool repositions ghost; tints green if `worldEditor.canX(...)` returns true, red otherwise.

### Place / remove
1. Left click → `currentTool.onCellClick(cell, "left")` → tool calls `worldEditor.paintFloor(cx, cz)` / `placeDecor(kind, cx, cz, rotation)` / etc.
2. WorldEditor mutates the world (adds/removes entities).
3. The existing `World.entityAdded` / `entityRemoved` events fan out to WallTracer (retraces if needed) and to the SaveService autosave (already wired in V3).
4. Right click cancels by deactivating the current tool back to a no-op default.

### Save / load
WorldSerializer already round-trips entities — painted floor entities, auto-traced wall entities, and authored decor entities all serialise the same way as V3's hardcoded ones. Loading a world re-emits `entityAdded` for each entity; WallTracer's idempotent retrace is a no-op for cells already in the loaded set.

## Error Handling

Validation lives in WorldEditor — every mutation method returns `true` on success, `false` on refusal. Tools use the same predicate via `worldEditor.canX(...)` to drive ghost-tint state, so the green/red preview is always consistent with the actual gate.

### Refusal table

| Operation | Refused when |
| --- | --- |
| `paintFloor` | OOB. Already a floor → idempotent no-op (returns `true`). |
| `eraseFloor` | OOB; not a floor; cell holds PLAYER_MARKER (toast); cell holds a walker (toast). Decor in cell is cascade-removed first. |
| `placeDecor` | OOB; cell not a floor; cell holds blocking decor; cell holds a walker or PLAYER_MARKER. (V4 refuses the placement; the V3 displacement flow stays available as a `placeWithDisplacement` opt-in flag for V5+.) |
| `placeWallDecor` | Edge has no wall entity; edge already holds a wall decor. |
| `removeDecor` | Entity isn't a placed decor. |
| `spawnMinion` | OOB; cell not a floor; cell already holds an occupant. |
| `removeMinion` | Entity isn't a spawned minion. |

### Toasts

Invalid placements that the user actively attempted (clicked, not just hovered) emit a one-line toast via the existing `viewModel.toast` infrastructure ("Can't erase floor — player is standing here"). Hover-only refusals just show red ghost; no toast.

### Other failure modes

- **IconRenderer per-item failures** — fallback text-tile + `console.warn`; catalogue still loads fully.
- **Manifest entry has `kind` but no preloaded GLTF** — skipped from catalogue with a single boot-time warn.
- **Tool deactivated mid-hover** — ghost mesh removed from scene + disposed; new tool's ghost takes over.
- **Builder camera deactivated while a tool is active** — BuilderInputAdapter detaches; current tool deactivates; tool selection persists, so re-entering Builder mode auto-reactivates the last tool.
- **Saved world references missing decor kind** (e.g. user removed an asset between save and load) — entity skipped with a warn; rest of save state intact.

### Edge cases worth calling out

- The player avatar can never end up standing on void — floor erase under the player is refused.
- The player can never end up overlapping decor — decor place on the player cell is refused.
- Wall decor cannot orphan: when an auto-traced wall is removed because its floor neighbour got painted (the wall is now internal), wall decor on that wall is cascade-removed too. Surfaces a warn so the user notices.

## Testing Strategy

V4's logic is testable headlessly using the same Vitest pattern as V3. UI gestures (hover, click, Q/E) get manual browser verify; everything they call into has unit coverage.

### WorldEditor unit tests
[tests/world/world-editor.test.js](../../tests/world/world-editor.test.js) (new). Bulk of new coverage. Each method gets:
- Happy path (paint a floor on an empty cell — entity added, WallTracer fires).
- Idempotent no-ops (paint a floor on an existing floor cell — returns `true`, no duplicate entity).
- Validation refusals (erase floor under player — returns `false`, no mutation, toast invoked via stub).
- Cascade behaviour (erase floor with decor on it — decor removed first; if walker present, refusal).

### WallTracer unit tests
[tests/world/wall-tracer.test.js](../../tests/world/wall-tracer.test.js) (new). Given a floor entity set, asserts:
- Single floor tile gets walls on all 4 edges.
- 2×1 footprint gets walls on the perimeter, no wall between the two floors.
- Removing a floor adds walls on the now-exposed neighbour edges.
- Adding a floor adjacent to existing floors removes the now-internal wall.
- Idempotent: load-time replay produces same wall set as build-time incremental.

### IconRenderer integration test
[tests/builder/icon-renderer.test.js](../../tests/builder/icon-renderer.test.js) (new, jsdom). Given a stub `THREE.Object3D`, returns a non-empty data URL. Failure path returns the text-fallback tile.

### Tools unit tests
[tests/builder/tools/*.test.js](../../tests/builder/tools/) — each tool with a stub `WorldEditor`: `onCellClick(cell, "left")` calls the right method with the right args; `rotate("cw")` increments `rotationStep` modulo 4; `onCellHover` triggers `canX` and tints the ghost accordingly.

### BuilderInputAdapter unit tests
Pointer event → cell or wall-edge translation given a stub raycaster. Active tool dispatch correctness.

### AuthoringPanel
KO bindings tested at the existing `tests/ui/` level (toast-queue style — view-model state changes, no DOM needed).

### Manual browser verify per tab
Paint a floor footprint, place a barrel, place a banner, spawn a minion, watch it wander, remove all of the above. Save / reload — state round-trips. Existing 291 tests must still pass.

## Open Questions

- **Wall decor source**: KayKit Dungeon Remastered ships banners, torches, sconces under `assets/kaykit/dungeon-remastered/models/gltf/`. Need to add manifest entries (and confirm orientation conventions — KayKit walls are 4m wide; wall decor sits at edge centres). One small browser sweep to inventory candidates before plan execution.
- **Dev-console / panel coexistence on the right edge**: dev-console becomes Backquote-only (no UI toggle), AuthoringPanel owns the visible chrome on the right edge. Picked at wiring time.
- **WallDecorPlacement component vs. EdgePlacement reuse**: V3's `EdgePlacement` already places meshes at grid edges with rotation. V4 should be able to reuse it directly for wall decor — but if wall decor needs a `wallEntityRef` back-pointer (so removing a wall cascades to its decor), a thin subclass might be cleaner. Pick at task-3 scope.
- **Batch flag for WallTracer during bulk operations**: `seedStarterRoom` paints 36 cells, each retriggering WallTracer. Microsecond cost so probably fine, but if save-load replay shows visible jank, add `worldEditor.beginBatch()` / `endBatch()`.
- **Player avatar move tool**: V5+ note. Probable shape: a `MovePlayerTool` in the Build tab; click cell → calls `world.playerDisplaceHandler({cx, cz})` (the V3.8 plumbing already exists).
