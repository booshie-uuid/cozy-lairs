# Plan: Cozy Lairs V4 — Decor Placement & Room Expansion

## Context

V4 introduces interactive authoring of rooms, decor, and minions via a tabbed right-side panel in Builder mode. The three tabs (Build / Decor / Minions) share a uniform tool grammar: select a tool, hover for a ghost preview, click to commit, right-click to cancel, Q/E to rotate. Floor painting auto-traces walls; wall decor snaps to the nearest wall edge. V3's auto-spawned scaffolding (4 minions, 9 hardcoded decor entries, 3 chaos barrels) is removed; new worlds open with a 6×6 starter room and the player avatar only. No cost system or tech-tree restrictions in V4 — placement is god-mode-immediate.

Full design: [.project/designs/design-v4.md](../designs/design-v4.md).

The plan sequences foundational primitives (Tasks 1–3: manifest schema, WallTracer, WorldEditor) before consumers (Tasks 5–8: IconRenderer, Tool abstraction, BuilderInputAdapter, AuthoringPanel). Task 4 (strip V3 auto-spawn + `seedStarterRoom`) lands early — right after the WorldEditor — to surface any V3-only assumptions in the codebase via an empty-room browser verify before any UI work begins. Tasks 1, 2, 3, 5, 6, 7 verify via tests only (no visible browser change). Tasks 4, 8, 9, 10 produce visible browser outcomes.

`VERSION` in `scripts/app.js` is bumped as the *first* code change of each task per the project's versioning convention. Plan-v4 uses the `V4_N_0` format throughout; the value advertised after task N completes is `V4.N.0`.

The user has stated long-term intent the plan must not box out (memory: `project_v4_future_intent.md`): costs / tech-tree restrictions (manifest `meta` bag), inventoried removal, minion-driven construction, a dual catalogue surface (panel + bottom toolbar), free Y-rotation, and a move-player tool. None of these ship in V4 — but the V4 surfaces they would extend are called out per-task.

---

## Task 1: Manifest schema extension + `AssetManager` accessors

### Objective

Extend the manifest entry shape with optional `kind`, `displayName`, and `meta` fields. Add `AssetManager` accessors that V4 consumers (catalogue, future cost/unlock checks) read from. Annotate existing decor manifest entries so the catalogue can discover them. Pure data + accessor work; tests-only verification.

### Expected Outcomes

- Manifest entries gain optional `kind` (`decor.floor` | `decor.wall` | `character`), `displayName` (string), and `meta` (arbitrary object) fields. `AssetManager.loadManifest` preserves them on each entry.
- `AssetManager.getKind(id)`, `getDisplayName(id)`, `getMeta(id)` return the stored values (or `null` / `{}` defaults). Unknown ids throw the existing `AssetNotFoundError`.
- Existing decor entries in [assets/manifest.json](../../assets/manifest.json) annotated: `decor.barrel` → `{ kind: "decor.floor", displayName: "Barrel" }`; `decor.crate` → `{ kind: "decor.floor", displayName: "Crate" }`. Skeleton minion → `{ kind: "character", displayName: "Skeleton Minion" }`. (Mannequin stays unannotated — it's the player avatar, not a catalogue entry.)
- Tests cover the accessor methods, the default values for unannotated entries, and round-trip preservation of `meta`.
- All 291 existing tests still pass.

### Risks / Constraints

- `AssetManager` currently filters entries by `tier` (core / world). Don't break that — `kind` is orthogonal to `tier`.
- `meta` is preserved verbatim (no schema). Future versions read fields like `cost`, `requiresUnlock`. V4 reads nothing from `meta` itself, so the access surface is `getMeta(id)` returning the whole object.
- Existing manifest tests assert entry shape — they must be updated to accept the new optional fields without false-negatives.
- WorldSerializer round-trips entity references by `kind` (the entity kind, distinct from manifest `kind`). Don't confuse the two — the entity kind is the dot-id (`"decor.barrel"`); the manifest `kind` is the catalogue category (`"decor.floor"`).

### Steps

- [*] Bump `VERSION` to `V4_1_0` in `scripts/app.js`.
- [*] Read existing `AssetManager` implementation and tests to understand the current entry shape.
- [*] Extend `AssetManager.loadManifest` (or wherever entries are normalised) to preserve `kind`, `displayName`, `meta` fields per entry. Default `meta` to `{}` if absent; leave `kind` / `displayName` as `null` if absent.
- [*] Add `AssetManager.getKind(id)`, `getDisplayName(id)`, `getMeta(id)` methods. Match the existing pattern for `getAnimations` / etc. (throw `AssetNotFoundError` on unknown id).
- [*] Annotate `assets/manifest.json`: `decor.barrel` → `kind: "decor.floor"`, `displayName: "Barrel"`. `decor.crate` → `kind: "decor.floor"`, `displayName: "Crate"`. `character.skeleton.minion` → `kind: "character"`, `displayName: "Skeleton Minion"`. Leave Mannequin and structural entries (floors, walls) unannotated.
- [*] Add `AssetManager.listByKind(kind)` returning an array of `{id, displayName}` for all entries with the given `kind`. (Catalogue calls this to populate tabs.)
- [*] Extend `tests/engine/asset-manager.test.js` with: accessor truth tables (annotated entry → returns annotated value; unannotated → returns `null` / `{}`); `getMeta` round-trips arbitrary nested objects; `listByKind` returns the expected ids for each kind; unknown id throws.
- [*] Run `npm test`.
- [*] Verify: all tests pass; no browser-side change.

### Decisions

- Threw `AssetLoadError` (not a new `AssetNotFoundError`) for unknown ids in the new accessors: matches the existing pattern in `get` / `load` / `getAnimations`. Introducing a sibling error class for the same "id not in manifest" condition would be churn for no caller benefit. Plan's mention of `AssetNotFoundError` was indicative, not prescriptive.
- Normalised entries via a dedicated `normaliseEntry(entry)` helper rather than inlining the defaults into the loop. Keeps `loadManifest` short and lets the validation pass operate on raw input while the index stores cleaned entries.
- Added `listAllIds()` in this task (the plan deferred it to Task 5). Free, and `listByKind` validated the entry-iteration shape so it was a natural pairing.
- New tests added: 297 total (291 prior + 6 new). All passing.

---

## Task 2: `WallTracer` module

### Objective

Add a `WallTracer` that maintains the auto-traced wall entity set in lockstep with floor entity changes. Subscribes to `World.entityAdded` / `entityRemoved`; when a floor entity changes, recomputes the wall entity set for the affected cell and its 4 orthogonal neighbours. Tests-only verification.

### Expected Outcomes

- New `scripts/modules/world/wall-tracer.js` exporting `WallTracer`.
- Constructor takes `{ world, assets }`. Installs subscribers on `world.entityAdded` and `world.entityRemoved`.
- On floor entity added/removed: walks the 4 edges of the affected cell + 4 edges per neighbouring cell, recomputes the desired wall presence (an edge is a wall iff exactly one side is a floor cell), reconciles by adding missing wall entities and removing extra ones.
- Wall entities use `EdgePlacement` (existing component) with the wall GLTF asset.
- Idempotent: re-running the trace for a cell already in the correct state is a no-op.
- `dispose()` unsubscribes from world events.
- Tests cover truth tables (single floor tile → 4 walls; 2×1 → 6 walls with no interior wall; remove a floor in a 2×2 → walls reappear on the now-exposed edges; load-time replay matches build-time incremental).

### Risks / Constraints

- Walls are an "auto-traced view" of floors — `WallTracer` is the only writer of auto-traced walls. If V3's `buildEmptyRoom` also writes walls directly, those collide with V4's trace; Task 4 will remove `buildEmptyRoom` from the boot path.
- Two adjacent floor cells must NOT have a wall between them. The trace's "exactly one side is floor" rule handles this.
- The grid is finite (10×12). Wall edges at the grid boundary have one side as floor (in-bounds, floor) and the other as out-of-bounds — treat OOB as "not floor" so the boundary edges are still walls.
- Wall entities themselves are tracked separately (`WallTracer` owns the registry; world entities are the source of truth). Use a `Map<edgeKey, wallEntity>` keyed by `"cx,cz,side"` for fast reconcile.
- Cascade with wall decor (Task 9): when a wall is removed because its other side became a floor, any wall decor attached to that wall must also be removed. V4 handles this in Task 9 — Task 2 just removes the wall.
- World.events is the existing emitter; check current event names match the design (`entityAdded`, `entityRemoved`).

### Steps

- [*] Bump `VERSION` to `V4_2_0`.
- [*] Add `WallTracer` class in `scripts/modules/world/wall-tracer.js`. Constructor stores `world` and `assets`, registers handlers on `world.entityAdded` / `entityRemoved`, initialises `this.walls = new Map()` (key = `"cx,cz,side"`).
- [*] Add helper `wallEdgeKey(cx, cz, side)` returning the canonical edge key (where `side` is one of `"n"`, `"s"`, `"e"`, `"w"`).
- [*] Add `shouldHaveWall(cx, cz, side)` — checks the current floor entity set: returns true iff exactly one of (this cell, the cell on the other side of `side`) is a floor.
- [*] Add `addWallAt(cx, cz, side)` — creates an `EdgePlacement` wall entity at the appropriate world position and orientation, calls `world.addEntity`, stores in `this.walls`.
- [*] Add `removeWallAt(cx, cz, side)` — looks up the wall entity, calls `world.removeEntity`, deletes from `this.walls`.
- [*] Add `retraceCell(cx, cz)` — for each of the 4 sides, calls `shouldHaveWall`; reconciles with current state.
- [*] Wire `entityAdded` handler: if the entity has a `GridPlacement` with `walkable: true`, call `retraceCell` for that cell and each of its 4 orthogonal neighbours.
- [*] Wire `entityRemoved` handler: same logic — retrace the cell + neighbours.
- [*] Add `dispose()` — unsubscribes handlers; clears `this.walls`.
- [*] Add `tests/world/wall-tracer.test.js` with the 5 truth-table cases listed in Expected Outcomes plus dispose-clears-subscriptions.
- [*] Run `npm test`.
- [*] Verify: all tests pass; no browser-side change.

### Decisions

- Used full side names (`"north"`, `"south"`, `"east"`, `"west"`) instead of the plan's suggested single letters. Matches the existing `EdgePlacement` convention so the wall entity's `side` field is consistent with the rest of the codebase.
- Canonicalised edge keys to `"cx,cz,north"` or `"cx,cz,east"` using the lower-index cell of the shared edge. Both sides of any edge collapse onto a single key, which means tracing the same edge from two adjacent cells is naturally idempotent without extra dedup logic. South/west keys are normalised to their north/east twins via simple coordinate arithmetic.
- Placed wall entities using *the floor cell's* perspective for the `EdgePlacement` (rather than always the canonical-key cell). The decorated face of the wall mesh must point into the floor, so the EdgePlacement reference must be the floor cell. Canonical-key cell and placement cell can differ for south/west walls.
- OOB cells are treated as non-floor by `Grid.isFloor` (added in V3.8 remediation). No special-casing needed in WallTracer — the boundary walls fall out for free.
- Combined `entityAdded` and `entityRemoved` into one `onEntityChanged` handler. Both events trigger the same retrace logic because `GridPlacement.onAddedToWorld` / `onRemovedFromWorld` runs *before* the event fires, so the grid's floor state already reflects the change.
- ~~Single straight wall asset (`wall.stone.straight`) used everywhere; no corner pieces or half-walls.~~ Reverted during Task 4 browser verify (user flagged corner Z-fighting). WallTracer now also tracks corner pieces and uses half-walls on cells whose perimeter wall ends at a corner — same pattern as V3's `buildEmptyRoom`. Algorithm: each retrace updates corners first (corner needed at a vertex iff exactly 2 perpendicular walls meet — L-shape), then rebuilds walls in the 3x3 affected region with geometry chosen from {full straight, low-half, high-half, two halves} based on endpoint corner presence. T- and +-junctions skip the corner piece (no native KayKit geometry); accepted as V4 polish gap.
- 17 tests covering wall truth tables, corner-piece truth tables (single tile / 2x2 / L-shape interior), wall geometry (full vs half), corner orientations (SE/SW/NW/NE), dispose, OOB. 344 total passing.

---

## Task 3: `WorldEditor` module

### Objective

Add `WorldEditor` — the single mutation entry point for authored changes. Hosts paired action methods (`paintFloor`, `placeDecor`, etc.) and predicate methods (`canPaintFloor`, etc.) used by both tools and ghost-tint logic. Validation gates and cascade behaviour live here. Tests-only verification.

### Expected Outcomes

- New `scripts/modules/world/world-editor.js` exporting `WorldEditor`.
- Constructor takes `{ world, assets, viewModel }` (viewModel optional — used only for toast emission).
- Action methods: `paintFloor(cx, cz)`, `eraseFloor(cx, cz)`, `placeDecor(kind, cx, cz, rotationStep)`, `placeWallDecor(kind, edge, rotationStep)`, `removeDecor(entity)`, `spawnMinion(kind, cx, cz)`, `removeMinion(entity)`. Each returns `true` on success, `false` on refusal.
- Paired predicate methods: `canPaintFloor`, `canEraseFloor`, `canPlaceDecor`, `canPlaceWallDecor`, `canRemoveDecor`, `canSpawnMinion`, `canRemoveMinion`. Pure — never mutate.
- Refusal gates per the design's [error-handling table](../designs/design-v4.md):
  - `paintFloor`: refused if OOB; idempotent if already a floor (returns `true`, no mutation).
  - `eraseFloor`: refused if OOB, not a floor, cell holds `PLAYER_MARKER`, or cell holds a walker. Decor in the cell is cascade-removed first.
  - `placeDecor`: refused if OOB, cell not floor, cell holds blocking decor, cell holds walker or `PLAYER_MARKER`.
  - `placeWallDecor`: refused if no wall at the edge, or edge already has wall decor.
  - `spawnMinion`: refused if OOB, cell not floor, cell already has an occupant.
- Active-attempt refusals (the user clicked, not just hovered) emit a toast via `viewModel.toast` if available.
- Tests cover every gate, the idempotent paint, and the cascade-decor-then-floor on `eraseFloor`.

### Risks / Constraints

- `WorldEditor` is the *only* writer of authored content. The existing `DecorBuilder.addBarrel` / `addCrate` / `relocateDecor` helpers should not be removed (chaos / future code might use them) but the V4 authoring path goes through `WorldEditor` exclusively.
- The displacement flow in `DecorBuilder.displaceOccupantAt` is opt-in for V5+; V4's `placeDecor` refuses rather than displaces. The displacement helper stays in place for `ChaosController` (which Task 4 deactivates but doesn't remove).
- Hover predicates and active-attempt actions share the same gate logic — extract the shared check into a private `validatePlaceDecor(...)` returning a `{ ok, reason }` shape so the toast text is consistent with the refusal reason.
- `WorldEditor` mutations rely on `World.entityAdded` / `entityRemoved` for fan-out (WallTracer, autosave). Don't reach into the world's internal state — always go through `world.addEntity` / `removeEntity`.
- Spawning a minion requires building an `Entity` with the same component set as V3's `App.spawnMinion` (Walker, Animator, WanderBehaviour). Lift that into a `buildMinionEntity(kind, animations)` helper in `WorldEditor` (or a new `MinionFactory`) so the App's `spawnPlayer` and the future move-player tool can use it too.

### Steps

- [*] Bump `VERSION` to `V4_3_0`.
- [*] Add `WorldEditor` class in `scripts/modules/world/world-editor.js`. Constructor stores `world`, `assets`, `viewModel`.
- [*] Add the 7 `canX` predicate methods — pure, mirror the refusal table from the design.
- [*] Add `paintFloor(cx, cz)` — creates a floor entity (`Entity.fromKind("floor.stone.basic", assets)` + `GridPlacement(cx, cz, 0, { walkable: true })`), calls `world.addEntity`. Idempotent.
- [*] Add `eraseFloor(cx, cz)` — looks up the floor entity at the cell, cascade-removes decor entities sitting in the cell, then removes the floor entity. Refuses if player or walker is in the cell (emit toast).
- [*] Add `placeDecor(kind, cx, cz, rotationStep)` — creates entity with `GridPlacement(cx, cz, rotationStep, { blocks: true })`, adds to world.
- [*] Add `placeWallDecor(kind, edge, rotationStep)` — uses `EdgePlacement` (or thin subclass if Task 9 introduces one) at the wall edge. Stores back-pointer or registers cascade for Task 9.
- [*] Add `removeDecor(entity)` — removes from world. Returns the entity reference so future versions can inventory it.
- [*] Add `spawnMinion(kind, cx, cz)` — builds a Walker + Animator + WanderBehaviour entity, positions it at the cell centre, adds to world.
- [*] Add `removeMinion(entity)` — removes from world.
- [*] Add a private `findDecorAtCell(cx, cz)` helper used by `eraseFloor`, `canPlaceDecor`, and `removeDecor` to discover decor entities in a cell. (Iterates `world.entities` filtered by `GridPlacement`. Linear scan — acceptable; same concern as the V3 review's perf finding for `resolvePlayerCollision`.)
- [*] Add `tests/world/world-editor.test.js` covering each action's happy path, idempotent and refusal cases, and the cascade for `eraseFloor`. Use a stub `viewModel` with a `toast` spy.
- [*] Run `npm test`.
- [*] Verify: all tests pass; no browser-side change.

### Decisions

- Wall detection in `findWallAtEdge` uses `entity.kind.startsWith("wall.")` and `EdgePlacement` presence. Wall decor uses `assets.getKind(entity.kind) === "decor.wall"` (the catalogue kind annotated in Task 1). Brittle on `kind` prefix but the manifest convention is stable enough; revisit in Task 9 if a different discriminator emerges.
- Used `EdgePlacement` directly for wall decor (no `WallDecorPlacement` subclass). Plan left this open; for V4 a per-instance `rotationStep` stored on `entity.userData` is enough. Subclass with back-pointer waits for Task 9 if cascade behaviour proves it necessary.
- `findFloorAtCell` / `findDecorAtCell` / `findWallAtEdge` are linear scans over `world.entities`. Same perf class as the V3 `resolvePlayerCollision` finding — acceptable for V4 (< 100 entities expected). A spatial index can land later if profiling demands it.
- `floorSideOfEdge` normalises any edge reference to the floor-cell side so the wall-decor mesh always faces into the room. Mirrors WallTracer's wall placement logic; the canonical-key dedup is symmetric but the actual placement is asymmetric.
- `collectMinionAnimations` wraps `getAnimations` calls in try/catch so missing rig libraries (or stub assets in tests) don't crash spawning — the minion just renders in its rest pose. Keeps the action method robust under partial asset state.
- `MINION_SPEED` and `MINION_CLIPS` defined as module-level constants in `world-editor.js` rather than imported from `app.js`. The constants are stable and tied to the spawn semantics, not to app-level orchestration. Future MinionFactory extraction (V5+) would lift them with no churn.
- `placeWallDecor` accepts an edge reference from either side; `floorSideOfEdge` picks the floor cell for the EdgePlacement reference. Tests confirm both perspectives resolve to the same physical edge.
- 30 new tests; 337 total passing (307 prior + 30 new).

---

## Task 4: Strip V3 auto-spawn + add `seedStarterRoom()`

### Objective

Remove V3's hardcoded `DECOR_LAYOUT`, `MINION_COUNT` spawn, and `ChaosController` wiring from `App.buildWorld`. Replace with a `seedStarterRoom()` that paints a 6×6 footprint via `WorldEditor` (letting `WallTracer` auto-trace the walls) and spawns the player avatar. First task with a visible browser change — and the first integration of WorldEditor + WallTracer end-to-end.

### Expected Outcomes

- `App.buildWorld` no longer constructs `ChaosController`, no longer loops over `DECOR_LAYOUT`, no longer calls `spawnMinions`. `placeDecor` / `spawnMinions` methods are deleted (or kept as private legacy helpers used only by `ChaosController`'s future re-enablement).
- `App` constructs `WorldEditor` and `WallTracer` early in `buildWorld` (after `world` is created, before `seedStarterRoom`).
- New `App.seedStarterRoom()` method: paints a 6×6 footprint of floor cells via `worldEditor.paintFloor` (`WallTracer` traces the perimeter as floors are added), then calls `App.spawnPlayer` (existing method) at a centre cell. No minions, no decor.
- `buildEmptyRoom` builder is no longer called from `App.buildWorld` — `seedStarterRoom` replaces it. Keep `buildEmptyRoom` in the repo for now; remove in Task 10 if no other consumers materialise.
- `App.minions`, `App.chaosBarrels`, `App.chaosController` fields removed (no longer populated).
- Browser verify: load the app, see an empty 6×6 room with the player avatar standing inside. No minions, no decor, no chaos. Tab into FP mode and walk around the room. Save → reload → state round-trips correctly (just the floor entities + player).

### Risks / Constraints

- This is the first integration where `WallTracer` is actually wired up — surfaces any handler-ordering issues (does WallTracer get the `entityAdded` event before SaveService's autosave?). Order: World emits `entityAdded` synchronously to all subscribers; trace before save is fine because both are sync.
- The player spawn cell `(2, 2)` is inside the starter footprint (which will paint cells `(2..7, 2..7)`). Verify before painting; if outside, adjust starter footprint or spawn cell.
- `buildEmptyRoom` is still imported in `app.js` — remove the import. Empty rooms are now an empty grid, not a pre-built room.
- `App.placeDecor` and `App.spawnMinions` may have callers in the dev console actions or save-load reconstruction. Check before deleting; convert to call-through-WorldEditor if needed.
- `WorldSerializer` round-trips entities by kind — a saved V3 world with hardcoded decor will still load fine (decor entities have the same kind names; only the spawn path changed).

### Steps

- [*] Bump `VERSION` to `V4_4_0`.
- [*] Remove `import { ChaosController }` and `import { buildEmptyRoom }` from `scripts/app.js`.
- [*] Remove `DECOR_LAYOUT`, `MINION_COUNT`, `MINION_SPAWN_MIN_SEPARATION` constants. Remove `chaosBarrels`, `chaosController`, `minions` from the `App` constructor (leave `player`).
- [*] In `App.buildWorld`, after `this.world = new World(...)`, construct `this.worldEditor = new WorldEditor({ world: this.world, assets: this.assets, viewModel: this.viewModel })`. Construct `this.wallTracer = new WallTracer({ world: this.world, assets: this.assets })`.
- [*] Remove the `buildEmptyRoom` call, the `placeDecor` call, the `spawnMinions` call, and the chaos-controller construction from `App.buildWorld`.
- [*] Add a `seedStarterRoom()` method: loops over a 6×6 footprint (cells `(2..7, 2..7)`), calls `this.worldEditor.paintFloor(cx, cz)` for each. Then calls `this.spawnPlayer()`.
- [*] Call `this.seedStarterRoom()` from `App.buildWorld` after `this.wallTracer` is constructed.
- [*] Delete `App.placeDecor`, `App.spawnMinions`, `App.spawnMinion`, `App.pickMinionSpawnCells` (or keep `App.spawnMinion` as a thin wrapper around `worldEditor.spawnMinion` if dev-console actions reference it — check first).
- [*] Update `App.diagnoseWalkers` to iterate world entities for walkers instead of `this.minions`.
- [*] Remove `App.shutdown`'s chaos disposal block.
- [*] Run `npm test` to confirm headless suite still passes.
- [*] Verify in browser: empty 6×6 room visible, player avatar inside, no minions, no decor, no chaos. Tab→FP mode walks correctly. Save and reload preserve the 6×6 floor footprint and player position.

### Decisions

- Replaced the V3 `ROOM` constant (`{ x0: 1, z0: 1, width: 8, depth: 10 }`) with `STARTER_ROOM` (`{ x0: 2, z0: 2, width: 6, depth: 6 }`). Painted via `WorldEditor.paintFloor` so `WallTracer` auto-traces the perimeter walls. Camera focus recentred on the new footprint.
- Renamed `MINION_CLIPS` to `PLAYER_CLIPS` in `app.js`. `WorldEditor` owns its own `MINION_CLIPS` constant for minion spawning; the player avatar uses the same clip names but the constant ownership now lives at the user of each. Keeps app.js's PLAYER_KIND / PLAYER_CLIPS / PLAYER_SPAWN_CELL co-located, and lets the minion configuration evolve independently inside WorldEditor.
- Kept `Walker`, `Animator`, `WanderBehaviour` imports in `app.js` even though the App no longer spawns minions — they're still surfaced via `this.types` for dev-console use (`entity.getComponent(Walker)` etc.).
- Kept `buildEmptyRoom`, `DecorBuilder`, and `ChaosController` modules in the repo (just removed imports from `app.js`). Plan defers their physical removal to Task 10 pending a sweep for other consumers. Their tests still pass.
- Did NOT shoe-horn `App.spawnMinion` into a thin wrapper around `WorldEditor.spawnMinion` — no dev-console action references it, so it's just dead code. Deleted outright.
- 337 tests still passing — no test churn for Task 4 since the affected code paths are App-level orchestration, not unit-level logic.

---

## Task 5: `IconRenderer`

### Objective

Build the offscreen Three.js renderer that produces a catalogue thumbnail per decor / minion / character entry at boot. Each entry's GLTF is rendered to a 96×96 PNG via a tiny offscreen scene + camera; failures fall back to a text-tile. Returns a `Map<id, dataURL>` consumed by the AuthoringPanel in Task 8. Tests-only verification.

### Expected Outcomes

- New `scripts/modules/builder/icon-renderer.js` exporting `IconRenderer`.
- `IconRenderer.renderCatalogue(assets)` — walks every manifest entry where `getKind(id)` is non-null. For each: gets the loaded GLTF scene (via `assets.get(id)`), clones it into a tiny offscreen `THREE.Scene` with a fixed three-quarter perspective camera + a single `HemisphereLight`, renders to an offscreen `THREE.WebGLRenderer` at 96×96, calls `renderer.domElement.toDataURL("image/png")`, stores in the result map.
- On failure for any single entry (missing GLTF, render error), the renderer logs once via `console.warn` and falls back to a text-tile: 96×96 canvas with the `displayName` text rendered on a neutral background.
- Renderer instance is reusable across boots — `renderCatalogue` can be called once at boot or re-called if assets reload (the dev-console `reloadManifest` action).
- Tests run under `// @vitest-environment jsdom`. Use a stub GLTF with a single mesh; verify the returned map contains an entry with a `data:image/png;base64,...` string. Failure path tested by passing in a kind that has no GLTF loaded.

### Risks / Constraints

- Three.js's `WebGLRenderer` doesn't work in plain `jsdom` (no `WebGL2RenderingContext`). For the unit test, either: (a) stub the WebGL renderer in the test, (b) detect headless and fall through to text-tile for every entry in tests (acceptable since boot-time test only verifies the data flow, not pixel correctness). Pick (b) — simpler and surfaces the fallback path for free.
- Catalogue size is small (V4 expects < 10 entries). Boot cost is negligible (~100ms total even with shader compilation).
- The cloned mesh's bounding box drives camera framing — different decor have different scales. Use `THREE.Box3().setFromObject(clone)` and position the camera to frame the bbox.
- Skinned meshes (the minion) have animation — render at the default rest pose. Don't run `mixer.update` in the offscreen scene.
- Text-fallback needs a font that renders in headless canvas. Use a stack `system-ui, sans-serif` and a fixed `font-size` to avoid font-loading races.

### Steps

- [*] Bump `VERSION` to `V4_5_0`.
- [*] Add `IconRenderer` class in `scripts/modules/builder/icon-renderer.js`. Constructor takes no args; instantiates an offscreen `THREE.WebGLRenderer` lazily on first render.
- [*] Add `renderCatalogue(assets)` returning `Map<id, dataURL>`. Iterates `assets.listAllIds()` (add to `AssetManager` in this task if not already exposed), filters by `assets.getKind(id) !== null`, renders each.
- [*] Add private `renderOne(assets, id)` — orchestrates clone, scene, camera, light, render, toDataURL. Try/catch around the WebGL operations.
- [*] Add private `renderTextFallback(displayName)` — 96×96 canvas, neutral dark bg per cozy palette, `displayName` text centred.
- [*] Add private `frameCamera(camera, bbox)` — positions the camera at the right distance to fill the viewport given the bbox extent.
- [*] Wire `IconRenderer` into `App.startInner`: after `assets.preloadCore`, before `buildWorld`. Store the result map on `this.viewModel` as `catalogueIcons` (KO observable).
- [*] Add `tests/builder/icon-renderer.test.js` with `// @vitest-environment jsdom`. Test the fallback path (no GLTF) and the data flow (returns a map, ids match expected).
- [*] Run `npm test`.
- [*] Verify: all tests pass; no browser-side change (icons aren't shown anywhere until Task 8 wires them into the panel).

### Decisions

- `listAllIds()` was already added to `AssetManager` in Task 1 (deviation noted at the time) — Task 5 just consumes it without further AssetManager change.
- Renamed the internal method `renderOne` to `renderEntry` and added `renderMesh` as a sub-helper. Cleaner separation between "outer flow with fallback" (`renderEntry`) and "do the actual WebGL render" (`renderMesh`). Plan's `renderOne` is the same role as `renderEntry`.
- WebGL renderer is lazy-constructed in `ensureRenderer()` and reused across all entries in a `renderCatalogue` call. Sets a single 96×96 framebuffer, swaps the mesh in/out of the scene per entry. Cheaper than constructing N renderers; reusing renderer + scene + camera between entries makes idempotent re-call cheap too.
- `initFailed` latch added — once the WebGL renderer fails to construct (headless / no WebGL), subsequent entries don't re-try. Each falls through to the text tile without re-throwing the same WebGL error.
- `renderTextFallback` guards `canvas.getContext("2d") === null`. jsdom returns null without the optional `canvas` npm package; rather than make the test suite depend on it, the renderer returns a synthetic `data:image/png;base64,placeholder:...` URL in that case. Test asserts the prefix only — semantic content of the PNG isn't testable headlessly.
- Text wrapping (`wrapLines`) splits on whitespace and caps at 3 lines — handles long display names without sprawling off-tile.
- 6 new tests; 350 total passing.
- No browser-visible change in V4.5 — icons are stored on `viewModel.catalogueIcons` but not displayed until Task 8.

---

## Task 6: `Tool` abstraction + concrete tools

### Objective

Introduce the `Tool` base class and the seven concrete subclasses (`FloorPaintTool`, `FloorEraseTool`, `DecorPlaceTool`, `DecorEraseTool`, `WallDecorPlaceTool`, `MinionSpawnTool`, `MinionEraseTool`). Each tool owns a ghost mesh and delegates to `WorldEditor` for mutation + validation. Tests-only verification with stub `WorldEditor`.

### Expected Outcomes

- New `scripts/modules/builder/tools/tool.js` exporting `Tool` (abstract base): defines `activate(editor, scene)`, `deactivate()`, `onCellHover(cell)`, `onCellClick(cell, button)`, `onWallEdgeHover(edge)`, `onWallEdgeClick(edge, button)`, `rotate(direction)`. Base class manages `ghostMesh` add/remove from scene.
- 7 concrete tool files under `scripts/modules/builder/tools/`. Each tool overrides the relevant hooks; default for unused hooks is a no-op.
- `DecorPlaceTool` and `WallDecorPlaceTool` track a `rotationStep` field (0..3) updated by `rotate("cw" | "ccw")`. Floor tools and minion tools ignore rotation (no-op).
- Each `onCellClick(cell, "left")` calls the matching `WorldEditor` action method. Right-click is the cancel gesture — tools no-op on right-click and the BuilderInputAdapter (Task 7) swaps back to a default no-op tool.
- Ghost tint follows the matching `canX` predicate: green when valid, red when invalid. (Cell-overlay tools use a transparent material; mesh-clone tools tint via material color override.)
- Tests cover: `onCellClick` calls the right `WorldEditor` method with the right args; `rotate("cw")` increments `rotationStep` modulo 4; `onCellHover` calls the predicate and updates ghost colour; right-click is a no-op.

### Risks / Constraints

- Ghost mesh creation requires the asset GLTF for place tools. The tool receives a `kind` argument at construction (e.g. `new DecorPlaceTool({ kind: "decor.barrel" })`) and looks up the GLTF via `worldEditor.assets.get(kind)`.
- Wall decor's ghost orientation depends on the snapped wall edge — recomputed in `onWallEdgeHover`, not at construction.
- Disposal: when a tool deactivates, remove the ghost from the scene and dispose its geometries / materials. Reusing the same Three.js material across all green ghosts is fine; tint is set via `material.color.setHex` per hover.
- The seven tools share a lot of code shape — extract a `CellOverlayTool` mixin and a `MeshGhostTool` mixin if duplication starts hurting. For V4, plain inheritance from `Tool` is enough.
- The `MinionSpawnTool` doesn't need a true ghost — a translucent minion clone is heavy and the wandering animation isn't useful as a preview. Use a tinted cylinder placeholder until further notice.

### Steps

- [*] Bump `VERSION` to `V4_6_0`.
- [*] Add `Tool` base class in `scripts/modules/builder/tools/tool.js`. Public methods stubbed; protected helpers `addGhostToScene(mesh)` / `removeGhostFromScene()` / `setGhostTint(valid)`.
- [*] Add `FloorPaintTool`, `FloorEraseTool` — both use a cell-overlay quad as the ghost. Tint green / red.
- [*] Add `DecorPlaceTool` — constructor takes `{ kind }`. Ghost = translucent clone of the decor GLTF. Tracks `rotationStep`. `rotate("cw" | "ccw")` updates it.
- [*] Add `DecorEraseTool` — no constructor args. Ghost = red bbox outline that follows the hovered decor entity. Click removes the entity.
- [*] Add `WallDecorPlaceTool` — constructor takes `{ kind }`. Ghost = translucent clone aligned to the snapped wall edge. Rotation supported.
- [*] Add `MinionSpawnTool` — constructor takes `{ kind }`. Ghost = a 0.6m-radius tinted cylinder placeholder.
- [*] Add `MinionEraseTool` — bbox outline ghost; click removes the hovered minion entity.
- [*] Add a `NoopTool` (default when no tool is selected). Always-hidden ghost; all interactions no-op.
- [*] Add `tests/builder/tools/` directory with one test file per tool (or a single `tools.test.js` covering them all). Stub `WorldEditor` exposes `paintFloor`, `canPaintFloor`, etc. spies. Assert dispatch correctness.
- [*] Run `npm test`.
- [*] Verify: all tests pass; no browser-side change.

### Decisions

- Grouped the 8 tools into three files by family: `floor-tools.js`, `decor-tools.js`, `minion-tools.js`. Plan suggested one file per tool but the file count would be cosmetic; grouping matches the panel-tab grouping in Task 8 and keeps the import graph small. `Tool` base class is its own file.
- Bundled tool tests into a single `tests/builder/tools.test.js` rather than per-tool files. The contract per tool is small (dispatch + rotate); per-file boilerplate would dwarf the assertions. 18 tests covering all 8 tools.
- Ghost mesh approach: cell-overlay quads for floor tools (cheap), translucent mesh clones for place tools, bbox wireframe for erase tools, plain cylinder placeholder for minion spawn (per plan's note that a skinned-minion ghost would be heavy and the wandering anim isn't useful as a preview).
- Centralised `TINT_VALID` (`0x5af0a0`, `--cozy-neon`) and `TINT_INVALID` (`0xff4565`, `--cozy-danger`) constants exported from the base. Tools delegate tinting to `Tool.setGhostTint(valid)` which walks the ghost and updates each material's `color`.
- Right-click is a no-op at the tool level — the BuilderInputAdapter (Task 7) handles the swap-back-to-NoopTool gesture. Tools just check `button !== "left"` and return.
- `DecorEraseTool.onCellClick` uses `editor.findDecorAtCell()` (currently a private WorldEditor helper — needs to be exposed) to look up the decor entity at the cell. **Deviation**: `findDecorAtCell` was already exposed for this use by Task 3's implementation (it lives on the editor surface for the same kind of cascade reasoning), so no API churn was needed. Similar for `floorSideOfEdge` used by `WallDecorPlaceTool`.
- `MinionEraseTool.findMinionAtCell` falls back to a `worldToCell` scan over entities when the grid occupant isn't a walker (walkers don't claim the destination cell while mid-step). Linear scan, acceptable for V4.
- 18 new tests; 368 total passing.

---

## Task 7: `BuilderInputAdapter`

### Objective

Add the pointer-event adapter that runs while Builder camera is active. Raycasts cursor position to grid cell or wall edge, dispatches hover and click events to the active tool, and routes `Q`/`E` key presses to `tool.rotate`. Tests-only verification.

### Expected Outcomes

- New `scripts/modules/builder/builder-input-adapter.js` exporting `BuilderInputAdapter`.
- Constructor takes `{ input, scene, grid, getWallRegistry }`. `input` is the existing `Input` module; `getWallRegistry` returns the WallTracer's wall-entity map (used as the raycast target list for wall-decor hover).
- `setTool(tool)` swaps the active tool — calls `deactivate` on the old, `activate(editor, scene)` on the new.
- `install()` — registers pointer + key handlers via `this.input.on(...)`. `uninstall()` — `off(...)`. Called by App on `setCameraMode("builder")` / `setCameraMode("firstPerson")`.
- Pointer move handler: raycasts against the Y=0 floor plane → derives `{cx, cz}` → `tool.onCellHover(cell)`. Also raycasts against wall meshes → if a wall is hit and the tool is a `WallDecorPlaceTool`, derives `{cx, cz, side}` → `tool.onWallEdgeHover(edge)`.
- Pointer down/up: left-button click → `tool.onCellClick(cell, "left")` (or `onWallEdgeClick` for wall tools). Right-button click → cancel (swap back to `NoopTool`).
- Key down: `KeyQ` → `tool.rotate("ccw")`; `KeyE` → `tool.rotate("cw")`. Ignored when a text input is focused (reuse the same `isTextInputFocused` helper from `App.wireDevConsole`).
- Tests stub the `Input` module + use a manual raycaster setup. Assert: pointermove dispatches to `onCellHover`; pointerdown left dispatches to `onCellClick`; Q dispatches `rotate("ccw")`; pointer events with no raycast hit don't dispatch.

### Risks / Constraints

- The Y=0 floor plane raycast uses `THREE.Plane(new THREE.Vector3(0, 1, 0), 0)` and `raycaster.ray.intersectPlane`. Stable, no need for the actual floor meshes as raycast targets.
- Wall meshes need to be in a separate raycast list — `WallTracer` exposes a `getWallMeshes()` accessor (add in Task 2 if not already there, or extract here).
- Right-click during cell-tool use should swap to NoopTool; right-click during NoopTool is a no-op. The existing `contextMenuHandler` (preventDefault) on `canvasWrapper` is independent — keep it.
- Pointer events come through the existing `Input` emitter (`pointerdown`, `pointerup`, `pointermove`). The events carry `clientX` / `clientY` (or normalised device coords) — verify by reading `Input` and `Renderer`. The `Renderer` already exposes camera + canvas size; adapt as needed.
- The adapter is constructed once at App start (before any camera mode is set). `install()` runs on entering Builder mode, `uninstall()` on leaving. No state to preserve across uninstall/install except the selected tool (handled at App level).

### Steps

- [*] Bump `VERSION` to `V4_7_0`.
- [*] Add `BuilderInputAdapter` class in `scripts/modules/builder/builder-input-adapter.js`. Stores `input`, `scene`, `grid`, `getWallRegistry`. Holds `this.tool = new NoopTool()` and a `THREE.Raycaster` + reusable `THREE.Vector2` for normalised device coords.
- [*] Add `setCamera(camera)` — stores the active camera reference (needed for `raycaster.setFromCamera`).
- [*] Add `setTool(tool)` — deactivates old, activates new.
- [*] Add `install()` / `uninstall()` — manage `input.on` / `input.off` for `pointermove`, `pointerdown`, `pointerup`, `keydown`.
- [*] Add private `screenToCell(event)` — raycasts against the Y=0 plane, returns `{cx, cz}` or `null` if OOB.
- [*] Add private `screenToWallEdge(event)` — raycasts against wall meshes, returns `{cx, cz, side}` or `null`.
- [*] Pointer-move handler: dispatches `onCellHover` or `onWallEdgeHover` depending on tool kind.
- [*] Pointer-down handler: dispatches click for left button; swaps to `NoopTool` for right button.
- [*] Key-down handler: routes `KeyQ` / `KeyE` to `tool.rotate`. Ignores if `isTextInputFocused()`.
- [*] Wire into `App.buildCameraControllers` — construct adapter, `setCamera(this.cameraControllers.builder.camera)`, install on `setCameraMode("builder")`, uninstall on `setCameraMode("firstPerson")`.
- [*] Add `tests/builder/builder-input-adapter.test.js` with stub `Input` (emits manually-fired events) and stub tool (spies on hooks). Assert dispatch correctness for each input.
- [*] Run `npm test`.
- [*] Verify: all tests pass; no browser-side change (tool selection isn't possible until Task 8).

### Decisions

- Routed wall-vs-cell dispatch through `tool.targetType` ("cell" | "wallEdge" | "none") rather than reflection on the tool's prototype. Each tool sets `this.targetType` in its constructor. Cleaner than the duck-typing the plan implied; also lets `NoopTool` opt out of all dispatch.
- Skipped `pointerup` handler. Plan listed it but no V4 tool acts on pointerup — clicks dispatch on pointerdown. Adding the subscription just to satisfy the plan would be dead code; revisit if a drag-to-paint UX is added later.
- `setCamera` is called on each `setCameraMode("builder")` rather than once at construction. The Builder camera reference is stable in V4 but the redundant set is cheap and removes a stale-camera footgun if the controller is ever swapped.
- `WallTracer.getWallEntities()` added in this task to flatten the `Map<edge, [entity]>` registry into a flat raycast target list. Single new method; ~10 lines.
- Middle-button (button=1) pointerdown is now ignored — only "left" dispatches the click, "right" cancels. Caught by a test.
- `screenToCell` / `screenToWallEdge` are public methods so tests can stub them and exercise the dispatch path without a real Three.js raycast. The actual raycast logic is still tested in the browser integration (Task 10).
- 14 new tests; 382 total passing.

---

## Task 8: `AuthoringPanel` UI

### Objective

Build the right-side tabbed authoring panel (Build / Decor / Minions) and wire it to the BuilderInputAdapter. Each tab renders the per-tab dedicated tools at the top, then catalogue tiles below (showing the rendered thumbnails from `IconRenderer`). Selecting a tile constructs the matching tool and hands it to the adapter. First user-visible task with the full V4 authoring loop working end-to-end.

### Expected Outcomes

- New `scripts/modules/ui/authoring-panel.js` (KO-driven) exporting `AuthoringPanel` view-model.
- New `index.html` markup for the panel: a right-edge `<aside id="authoring-panel">` styled per `cozy.css` chrome formula. Tab strip at the top (Build / Decor / Minions). Content area below renders tools + tiles for the active tab.
- New `styles/cozy.css` additions: `.authoring-panel`, `.authoring-tab`, `.tool-tile`, `.catalogue-tile` (active-state borders use `--cozy-neon`; inactive use `--cozy-neon-dim`).
- KO bindings declared in `bindings.js` if needed (likely just `click`, `visible`, `css`).
- Build tab: `FloorEraseTool` tile + `FloorPaintTool` tile. No catalogue (rooms are paintable, not catalogued).
- Decor tab: `DecorEraseTool` tile + catalogue tiles (one per manifest entry with `kind: "decor.floor"`). Click a catalogue tile → construct a `DecorPlaceTool({ kind: id })` and hand to adapter.
- Wall decor: shares the Decor tab. Catalogue tile for `kind: "decor.wall"` entries — clicking constructs `WallDecorPlaceTool`. (Tab is shared; tile UX makes the distinction visible via the tile label.)
- Minions tab: `MinionEraseTool` tile + catalogue tiles for `kind: "character"`. Click → construct `MinionSpawnTool({ kind: id })`.
- Panel is visible only when `cameraMode === "builder"` (KO `visible` binding).
- Dev console coexistence: pressing `Backquote` opens the dev console as before. The authoring panel stays in place — they don't overlap because the dev console slides over the right edge above the panel. (If overlap appears, narrow the panel by 360px when the dev console is open.) Picked at execution time.
- Browser verify: full authoring loop. Paint a floor extension to the starter room; place a barrel; place a banner on a wall; spawn a minion; watch the minion wander; remove all of the above; save / reload. Existing 291+ tests still pass.

### Risks / Constraints

- Panel size: 320px wide, 70% viewport height, anchored top-right. The dev console is also on the right edge — verify no overlap in cozy.css. Test with the dev console open.
- KO templates for the tiles need image sources from the icons map. Use a `style="background-image: url(...)"` binding via a custom KO handler if `attr.style` doesn't compose well. Or simpler: bind `<img src="...">` directly.
- Switching tools mid-hover should remove the old ghost cleanly. `BuilderInputAdapter.setTool` already does this — the panel just calls it.
- The panel ships without keyboard shortcuts (the future bottom toolbar binds 1–9 keys). For V4, click-only.
- The Build tab's tools have no `kind` — they're plain action tools. The panel can hard-code their tile defs (icon = simple SVG or text label; click = construct the matching tool class).
- View-model unit tests exercise the observables (selected tab, selected tool id, tile collections derived from `assets.listByKind`). DOM rendering is browser-verify only.
- The `Tab` keypress already toggles camera mode (existing behaviour) — verify it still works when focus is in the panel. Likely needs the `preventDefaultFor` already in place.

### Steps

- [*] Bump `VERSION` to `V4_8_0`.
- [*] Add HTML markup for `<aside id="authoring-panel">` in `index.html` with the tab strip + content area.
- [*] Add `.authoring-panel` + descendant styles to `styles/cozy.css`. Follow the chrome formula.
- [*] Add `AuthoringPanel` view-model in `scripts/modules/ui/authoring-panel.js`. Observables: `selectedTab` ("build" | "decor" | "minions"), `selectedToolId` (string | null). Computeds: `decorTiles`, `wallDecorTiles`, `minionTiles` — derived from `assets.listByKind` + the icons map.
- [*] Wire the panel into `AppViewModel` — add `authoringPanel` as a property. Add `cameraMode` accessor for the `visible` binding.
- [*] Wire panel → App: `authoringPanel.toolSelected.subscribe(id => app.setTool(id))` (or a method-call equivalent).
- [*] Add `App.setTool(toolId)` that constructs the right `Tool` instance and hands it to `BuilderInputAdapter.setTool`.
- [*] Add `tests/ui/authoring-panel.test.js` — observable transitions, computed correctness, tile click dispatches the right `toolId`.
- [*] Run `npm test`.
- [*] Verify in browser: open app → see starter room + panel. Click Build tab → see paint + erase tools. Click paint → ghost follows cursor. Click cells → floor extends; WallTracer adds/removes walls. Click Decor tab → click barrel tile → place barrels. Click Minions tab → click skeleton tile → spawn minions; they wander. Click each erase tool to remove. Save and reload — full state round-trips.

### Decisions

- Tool id format: `tab:slug[:kind]`. Examples: `build:paint`, `build:erase`, `decor:erase`, `decor:place:decor.barrel`, `decor:wall:place:decor.banner`, `minion:erase`, `minion:spawn:character.skeleton.minion`. Stable, parseable, includes the manifest kind verbatim so the App.setTool dispatcher doesn't need a lookup table.
- View-model exposes computeds (`decorTiles`, `wallDecorTiles`, `minionTiles`) rather than observables so a manifest reload would re-derive automatically without manual refresh. Tile shape: `{id, kind, displayName, iconURL}` — `id` is the tool id (for selection state), `kind` is the manifest id (for the tool to use).
- Panel uses the cozy.css chrome formula verbatim — rounded 12px corners, neon-dim 2px border, chunky drop-shadow, top-edge inset highlight. Active tabs / tiles swap `--cozy-neon-dim` for `--cozy-neon` on the border.
- AuthoringPanel constructor wired via a new `AppViewModel.installAuthoringPanel(assets)` method. Called from `App.startInner` after `catalogueIcons` is set so the panel binds the populated icons map.
- Test environment: the real Knockout UMD doesn't attach to jsdom's window reliably (its `(0,eval)("this")` lands on a module-private scope under ESM). Wired a minimal `window.ko` stub (`observable` + `pureComputed`) at `beforeAll` time before dynamic-importing the AuthoringPanel module. Sufficient for the view-model contract tests.
- 12 new tests; 394 total passing.

---

## Task 9: Wall decor manifest entries + asset wiring

### Objective

Wire wall decor (banners, torches) into the catalogue + placement flow. Add manifest entries for at least two KayKit Dungeon Remastered wall items, confirm orientation conventions, and ensure `WallDecorPlaceTool` + `WorldEditor.placeWallDecor` correctly position and orient the placed mesh against the wall mesh underneath. Browser-visible.

### Expected Outcomes

- At least two new wall decor entries in `assets/manifest.json` with `kind: "decor.wall"` and appropriate `displayName`s. Sourced from `assets/kaykit/dungeon-remastered/models/gltf/`. Probable candidates: a `banner_pattern.gltf` and a `torch.gltf` if those exist (verify via a manifest-build sweep before writing entries).
- Wall decor entities use `EdgePlacement` directly (no new component subclass) — confirmed at execution time. If a back-pointer to the host wall is needed for cascade-remove (when a wall is auto-removed because both sides became floor), introduce a `WallDecorPlacement` subclass that registers itself with the WallTracer.
- WallTracer's `removeWallAt` now scans for wall decor entities at the same edge and cascade-removes them. Emits a toast warn so the user knows the decor was removed.
- Decor tab's catalogue now shows wall decor tiles alongside floor decor. Tile thumbnails generated by `IconRenderer` (the renderer's framing handles wall-decor meshes OK — verify lighting + cropping).
- Browser verify: place a banner on a wall — appears on the correct side facing inward. Q/E rotates between adjacent wall edges if the cell has multiple walls (or rotates the decor's facing). Paint the floor through the wall the banner is on — the wall is removed; the banner is also removed; toast surfaces "Banner removed — wall no longer present".

### Risks / Constraints

- KayKit wall decor may not be 0-rotation aligned with the wall. Check the GLTF in the browser: walls in V3 use `EdgePlacement` with a side (`n`/`s`/`e`/`w`) → rotation step mapping. Wall decor needs to inherit that mapping OR add a per-entity rotation offset in the meta.
- Decor on the inside of a wall vs. outside: the player walks inside the room, so the visible face is the inside. The orientation must respect this — verify with each KayKit asset.
- Cascade-removal during a flood-paint operation could fire many toasts. If 5 walls are removed in one paint stroke, batch the toast to one summary ("3 wall decor removed").
- The `IconRenderer`'s default camera framing may not flatter wall decor (banners are tall thin rectangles). Consider a per-kind framing hint in `meta` (V5+) or hard-code a different framing if the entry's bbox aspect ratio is far from square. For V4, accept the default — text labels carry the load.
- The KayKit manifest sweep might reveal that walls and wall-decor share a model (e.g. a wall-with-banner combined mesh). Sweep first; if combined, defer wall-decor to V5 and ship only floor decor in V4.

### Steps

- [*] Bump `VERSION` to `V4_9_0`.
- [*] Inventory KayKit Dungeon Remastered for wall-decor candidates. Use `glob` against `assets/kaykit/dungeon-remastered/models/gltf/**` to list candidates. Identify banner, torch, sconce, or equivalent.
- [*] Add manifest entries for the selected wall decor items: `kind: "decor.wall"`, `displayName: "..."`, `tier: "world"`.
- [*] If wall decor needs a back-pointer to the host wall, add `WallDecorPlacement` extending `EdgePlacement` in `scripts/modules/world/components/`. Otherwise reuse `EdgePlacement` directly. Pick at execution time.
- [*] Extend `WallTracer.removeWallAt` (or a new helper called from it) to scan world entities for wall decor at the same edge and cascade-remove. Emit toast(s).
- [*] Verify `WorldEditor.placeWallDecor` produces an entity at the correct world position + orientation. Adjust per-side rotation mapping if needed.
- [*] Add a `tests/world/wall-tracer.test.js` case: a wall with attached wall decor is removed when the floor on both sides exists; the decor entity is also removed.
- [*] Add a `tests/world/world-editor.test.js` case: `placeWallDecor` fails if the edge has no wall.
- [*] Run `npm test`.
- [*] Verify in browser: place a banner on a wall, paint floor through that wall, see the cascade-remove + toast.

### Decisions

- Picked 3 wall-decor entries from KayKit Dungeon Remastered: `decor.banner.blue`, `decor.banner.green`, `decor.torch.mounted`. Kept the count small for V4 — user can extend later. Torch needs `meta: { yOffset: 2 }` because its GLTF origin is at the torch's mid-height with bottom at local y=-0.38 (would put it below floor without the lift). Banners need no meta — their origin sits at y=0 with the cloth hanging from a horizontal bar at the top, which positions correctly on a wall placed at floor level.
- Reused `EdgePlacement` directly for wall decor (no `WallDecorPlacement` subclass). The cascade-remove iterates world entities at the target edge and filters by `assets.getKind(entity.kind) === "decor.wall"`. A back-pointer isn't needed for V4 — the iteration is O(n) where n is small (<100 entities). Subclass remains a V5+ option if perf matters.
- Cascade fires only when a wall is genuinely gone (`shouldExist === false` in `retraceWallAt`), not when the wall is torn down for a geometry rebuild (corner appeared/changed). Banner survives wall-geometry shifts; it only goes when the wall itself is gone.
- Skipped batch-toast for cascade (the plan suggested it for flood-paint). V4 single-cell paints touch at most one wall edge per retrace — no batching needed yet. Revisit if a future flood-paint operation surfaces it.
- Test stub for `WallTracer` extended to support `assets.getKind(id)` via an injected `kindMap`. Existing tests pass empty map (no kinds annotated). Cascade tests use `{ "decor.banner.blue": "decor.wall" }`.
- 3 new tests; 402 total passing.

---

## Task 10: End-to-end browser verify + final cleanup

### Objective

Manual playthrough of the full V4 authoring loop, plus a sweep to remove now-dead code paths and reconcile any small integration issues surfaced by tasks 4–9. Final task — produces a polished V4.10 release-candidate.

### Expected Outcomes

- A documented playthrough sequence (paint footprint, place all decor types, spawn minions, watch wander + collision behaviour, remove everything, save / reload) completes without errors or visible regressions.
- Any integration bugs surfaced by the playthrough are fixed inline. (Likely candidates: ghost tint flicker, save/load entity ordering, panel layout overlap with dev console at small viewport sizes.)
- Dead code removed: `App.placeDecor`, `App.spawnMinions`, `buildEmptyRoom` if no longer referenced, `ChaosController` and its tests if Task 4 left it unused (keep only if the chaos toy still has documented dev-time value).
- `CLAUDE.md` updated with V4-specific notes: tool grammar, panel coexistence with dev console, manifest schema's `kind` / `displayName` / `meta`, the V4+ long-term-intent pointers.
- `scripts/app.js` `VERSION` bumped to `V4_10_0`.
- Final test count: 291 + the new V4 suite (expect ~50 new tests across tasks 1–9). All passing.

### Risks / Constraints

- Manual playthrough discovers issues that aren't obvious from unit tests. Plan to budget extra time; the actual fixes may exceed the nominal task size.
- Dead-code removal needs caution: if a future task / decision register references a method that's now deleted, the breadcrumb is lost. Keep the V3 chaos system in `git log` only if removed.
- If the `IconRenderer` produces unusably-bad thumbnails for some entries (lighting, framing), V4 may need a per-entry framing override in manifest `meta` — escalate to a follow-up if it surfaces.
- Save / load round-trip is the highest-risk verification — V4 introduces new entity kinds and a Wall registry that needs to reconcile against loaded entities. Verify with both fresh and V3-era save files.

### Steps

- [*] Bump `VERSION` to `V4_10_0`.
- [*] Sweep `scripts/app.js` for unused imports, fields, methods. Remove `App.placeDecor`, `App.spawnMinions`, `App.pickMinionSpawnCells` if no callers remain.
- [*] Check `buildEmptyRoom` (`scripts/modules/world/builders/empty-room.js`) for external consumers (tests, dev-console actions). If unused, remove the module + its tests.
- [*] Check `ChaosController` for external consumers. If unused, remove the module + its tests (and the `decor.js` `displaceOccupantAt` helper if it has no other callers).
- [*] Run a full manual browser playthrough per the script in Expected Outcomes. Capture any defects.
- [*] Fix each defect inline with a brief commit-trail-friendly description.
- [*] Run `npm test` and confirm green.
- [*] Update `.claude/CLAUDE.md` with V4 sections: a "V4 authoring grammar" subsection (tool model, hover→click→commit, Q/E rotate, right-click cancel), a "Manifest schema" subsection covering `kind` / `displayName` / `meta`, and a pointer to `memory/project_v4_future_intent.md` for V5+ context.
- [*] Verify in browser: full playthrough completes cleanly + save/reload preserves the authored state.

### Decisions

- Removed 3 dead modules entirely (no production consumers after V4 transition):
  - `scripts/modules/world/builders/empty-room.js` + test (replaced by `WorldEditor.paintFloor` + `seedStarterRoom`)
  - `scripts/modules/world/chaos-controller.js` + test (V3-only stress harness; V4 has no in-game motivation for it)
  - `scripts/modules/world/builders/decor.js` + test (only consumer was ChaosController; new placement goes through `WorldEditor`)
  - The now-empty `scripts/modules/world/builders/` and `tests/world/builders/` directories also removed.
- Cleared stale "chaos teleport" comments from `app.js`, `world.js`, `wander-behaviour.js`, `player-marker.js` — code is the same, but the named feature no longer exists.
- App constructor verified clean (already done in Task 4): no `minions`, `chaosBarrels`, `chaosController` fields. Live fields are `worldEditor`, `wallTracer`, `iconRenderer`, `builderInputAdapter`, `player`, `diagGrid`.
- Final test count: 382 (down from 402 — the 20 dropped tests covered the deleted dead modules, no live coverage lost).
- CLAUDE.md updated with: (a) extended Manifest schema (kind/displayName/meta + scale/yOffset/zOffset), (b) new "V4 authoring grammar" section under Coding Conventions with the full dispatch flow, (c) "Builder camera multi-button safety" note, (d) "V4+ long-term intent" pointer to the user-memory file. The "Cute evil" aesthetic and Cozy theme sections are unchanged.

**Playthrough fixes (Task 10):**
- Wall decor placement failed on 1-tile alcove edges because `findWallAtEdge` scanned for `wall.*` entities, and those edges have no wall entity (just corner-piece arms). Replaced with `hasWallAtEdge` which checks floor topology directly — wall existence is now a property of the grid pattern, not of rendered entities.
- `DecorEraseTool` only saw floor decor. Extended its `findDecorTarget` helper to fall back to scanning the 4 edges of the hovered cell for wall decor when no floor decor is found.
- `BuilderInputAdapter.screenToWallEdge` used a single floor-plane raycast + nearest-edge, which mis-resolved when the cursor was over a tall wall mesh (ray tunneled past to the cell behind). Switched to a hybrid: wall-entity raycast first (precise) → floor-plane nearest-edge fallback (for cases without a wall mesh, e.g. alcoves).
- Walls behind a front corner piece were still tunneling through the raycast. Extended the raycast target set to include corner-piece meshes via `WallTracer.getCornerEntities()`; corner-piece hits return null from the wall resolver (no single edge), which falls through to the local nearest-edge — so the cursor stays anchored to the front corner area instead of jumping to a far wall.

**User-requested scope additions during Task 10 (out-of-plan but small):**
- Controls overlay modal on app load — lists Tab, Left Click, Right Click, Escape, Right Drag, WASD, Wheel, Q/E, Ctrl+S. Dismissed with OK. Always-shows (no localStorage persistence yet — easy to add later).
- Tool tile labels switched to Title Case ("Paint Floor", "Erase Block", "Remove Decor", "Remove Minion").
- Escape now cancels the active tool — mirrors right-click-cancel's `setTool(NoopTool) + onCancel()` path. Matches design intent ("right-click or Escape to cancel"); was a natural-instinct gap the user surfaced during playthrough.
- `meta.zOffset` added to Renderable + WallDecorPlaceTool ghost. Local +Z is the room-facing direction after `EdgePlacement` rotation, so this acts as "depth out from the wall". Used to push wall torches out from the wall's centerline to its room-side face. Banners didn't need it.

---

### Notable Deviations from Design

**Block-bits terrain added under Build tab (mid-Task-8 user request).** Design's manifest schema had `decor.floor`, `decor.wall`, and `character` kinds. User asked to add `terrain.block` kind for KayKit block-bits (gravel + dirt) as the foundation for a future minion-dig gameplay. New `BlockPlaceTool` / `BlockEraseTool`, `WorldEditor.placeBlock` / `removeBlock` / `canPlaceBlock` / `canRemoveBlock`, panel `blockTiles` computed under the Build tab. Renderable also extended to read `meta.scale` / `meta.yOffset` so non-cell-sized assets can sit cleanly in cells.

**Bug fixes batched during Task 8 verify (out-of-plan but in-scope of Task 8):**
- `THREE.GridHelper` is always square — replaced with custom rectangular `buildRectGrid` so the helper grid matches the actual `Grid` dimensions (the square helper made 2 columns of the 10×12 grid appear clickable but actually OOB).
- Builder camera left-pan was engaging on click-to-place, panning during the click. Disabled left-pan while a tool is active (`BuilderCamera.setPanEnabled`); WASD + wheel still work.
- Right-click cancel was firing on right-drag-orbit (which also uses the right button) — now distinguished by movement (`RIGHT_CLICK_DRAG_THRESHOLD = 4px`). Cancel only fires on a stationary right-click.
- Tool ghost was being clobbered by clicks on panel chrome (target propagating through `Input`'s window listener). Added `event.target` pass-through in `Input`; `BuilderCamera` and `BuilderInputAdapter` ignore drag-engages whose target isn't the canvas.
- Multi-button pointer state could get stuck (right-orbit + left-click → release right) if a pointerup was missed. `BuilderCamera` now uses `event.buttons` bitmask as the source of truth for held buttons, self-healing on the next event.
- Right-click cancel cleared the adapter's tool but left `panel.selectedToolId` set — re-clicking the same tile didn't fire KO's subscribe. Added `onCancel` callback so the adapter clears the panel selection observable.
- Per-cell ghost Y was below the floor mesh (KayKit floor is 0.15m tall; ghost at Y=0.01 was buried). Raised `GHOST_Y` to 0.18.
- Tool ghost stranded in the scene when the user Tabbed to FirstPerson mid-place. `BuilderInputAdapter.uninstall` now resets to `NoopTool`.
- Tint semantics split: create-actions use green/red, remove-actions use amber (`TINT_REMOVE = 0xffaa33`) for "will remove" + red for "refused". Floor-paint goes red on already-floored cells to surface the no-op.

---

### Issues and Adjustments

- **WallTracer T-/+-junction polish (deferred follow-up)** — Surfaced during Task 4 browser verify when the corner-piece work was retrofitted. V4's WallTracer skips the corner piece at vertices with 3 or 4 walls (T- and +-junctions) — no native KayKit geometry fits. User noted "we will have to keep corners in mind as we get in to editing and more complex geometries." Acceptable for V4 (user-painted shapes are usually rectangular-ish in V4); revisit once user-painted complex shapes are common. Likely fix: custom geometry, or special-case wall-end caps where one of the L-corner arms is replaced by a straight wall passing through.

- **Minion mesh visually clips with interior corner pieces (deferred follow-up)** — Surfaced during Task 8 browser verify. Walker collision is purely cell-based; the walker's mesh radius isn't aware of wall/corner geometry. When a walker is in a cell adjacent to an interior corner (alcove inner angle), the corner_piece's arm extends into the floor cell area and overlaps the walker mesh visually. V3 didn't surface this (rectangular room, no interior corners). Fix paths: (a) mesh-aware collision against wall entities, (b) per-cell footprint that excludes wall-adjacent regions, (c) smaller walker mesh. None are V4 scope. Acceptable polish gap for V4.

- **Bug fixes during Task 8 verify (all in-task, not deferred):**
  - **Floor-erase overlay buried under floor mesh** — Tool ghost Y was 0.01, but KayKit floor_tile_large is 0.15m tall. Raised `GHOST_Y` to 0.18 so the overlay sits above the floor surface.
  - **Tool ghost stranded on Builder-mode exit** — Tab-to-FirstPerson uninstalled the input adapter but left the active tool's ghost in the scene. Now `BuilderInputAdapter.uninstall` resets the tool to `NoopTool` (deactivates the old ghost), and `App.setCameraMode` clears `panel.selectedToolId` so the active-tile highlight reflects reality.
  - **Camera initial framing missed outer 2 grid rows** — Builder camera initial focus was the *room* centre (20, 20); the grid centre is (20, 24) for the 10×12 grid. Outer rows of the build surface fell outside the initial frustum and weren't clickable without panning. Changed initial focus to grid centre and bumped initial distance from 30 to 40.
  - **Tint semantics improved (user feedback)** — Original model was "valid = green, invalid = red". Now: create-actions (paint, place, spawn) use green when the action will create something, red when it'd be a no-op or refused. Remove-actions (erase, remove-decor, remove-minion) use amber (`TINT_REMOVE = 0xffaa33`) when the action will remove something, red when refused. Made `TINT_REMOVE` a third constant on the `Tool` base.
