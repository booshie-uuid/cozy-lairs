# Code Review V7.10.0 — Duplication / Dead Code / Unification Audit

Scope: full codebase pass focused on (a) duplicative logic, (b) dead-end code, and (c) places where abstraction or unification would buy meaningful future-maintenance leverage. Read paths: every file under [scripts/](../../scripts/) plus the design + plan-v7 documents for context on what "should" be live.

Tests at time of review: per Task 10 sign-off, **579 / 33** passing.

Overall: V7 lands the UI architecture model cleanly — one VM per surface, constructor injection, AppViewModel as composition root — and the new chrome flow is solid. The build-up of *dead* code is the dominant finding: every prior task left a couple of methods, predicates, constants, or branches behind that nothing now calls. The runner-up is **builder tool duplication**: Block/Decor/WallDecor/Minion place tools and their erase counterparts share enough shape that the V7 `consumePickup` extension already had to be threaded through several near-identical files (and was correctly omitted from two — but the codebase has nothing that flags the asymmetry as deliberate). Neither category is critical for correctness today; both compound quickly once V8's wall-decor pickup, cost system, or minion-driven construction start touching these surfaces.

Two genuine bugs surfaced incidentally — a duplicate method declaration that silently shadows the first definition ([Finding 1](#finding-1-toggleCameraMode-is-defined-twice-in-appjs)), and an undefined variable in a dead-today fallback branch ([Finding 2](#finding-2-undefined-centre-variable-in-buildCameraControllers-fallback)). Both are surfaced as HIGH because they're trivial to fix and trivially bad to ship.

---

## CRITICAL FINDINGS

_None — no broken production paths._

---

## HIGH FINDINGS

### Finding 1: `toggleCameraMode` is defined twice in app.js

[app.js:825-829](../../scripts/app.js#L825-L829) and [app.js:1050-1054](../../scripts/app.js#L1050-L1054) declare the same method on `App` with identical bodies. The second declaration silently overrides the first per ES class semantics — the class behaves as if only the lower one exists, but a reader scanning top-down sees the first and assumes it's the live implementation. Two call sites refer to it ([app.js:332 via TopMenu](../../scripts/app.js#L332), [app.js:819 via Tab key](../../scripts/app.js#L819)) and three more reference `setCameraMode` directly — all currently resolve to identical behaviour because both definitions are identical, but a future change to the wrong copy is a guaranteed silent regression.

The second copy lives under the `/* DEV CONSOLE ACTIONS */` banner — the dev-console-actions section also wires `toggleCameraMode: () => this.toggleCameraMode()` ([app.js:960](../../scripts/app.js#L960)), so the section author likely intended the second declaration as part of the dev-action set but didn't notice the camera-toggle section had already defined it.

#### Recommended Remediations
- [ ] Delete the duplicate at [app.js:1050-1054](../../scripts/app.js#L1050-L1054). Keep the one in `wireCameraToggle`'s section.

---

### Finding 2: undefined `centre` variable in `buildCameraControllers` fallback

[app.js:713-715](../../scripts/app.js#L713-L715):

```js
const playerStart = this.player
    ? this.player.object3D.position.clone()
    : centre.clone();
```

`centre` is not defined in scope (the local is `gridCentre`, declared at [app.js:699-703](../../scripts/app.js#L699-L703)). If `this.player` is ever falsy when `buildCameraControllers` runs, this throws `ReferenceError`. Today the fallback is dead — `buildCameraControllers` runs after either `buildFreshWorld()` or `applyAutosaveSnapshot()`, both of which call `spawnPlayer()` which sets `this.player`. So `this.player` is always truthy at this site.

Still: a fallback branch that throws on its first execution is worse than no fallback — it implies a defensive guarantee that doesn't exist.

#### Recommended Remediations
- [ ] Fix the variable name to `gridCentre.clone()`.
- [ ] Or drop the fallback entirely and assert `this.player`, since the spawn invariant is enforced upstream.

---

### Finding 3: Place tools (Block/Decor/WallDecor/Minion) share ~70% of their shape with no base class

Four place-tool classes carry the same skeleton ([block-tools.js:30-68](../../scripts/modules/builder/tools/block-tools.js#L30-L68), [decor-tools.js:32-75](../../scripts/modules/builder/tools/decor-tools.js#L32-L75), [decor-tools.js:78-150](../../scripts/modules/builder/tools/decor-tools.js#L78-L150), [minion-tools.js:19-60](../../scripts/modules/builder/tools/minion-tools.js#L19-L60)):

| Concern | Block | Decor | WallDecor | Minion |
|---|---|---|---|---|
| `constructor({kind, consumePickup?})` | yes | yes | yes (no pickup hook) | yes |
| `buildGhost()` clones mesh, applies meta.scale/yOffset | yes | yes | yes (+zOffset) | n/a (placeholder) |
| `onCellHover` → canX → positionGhost → setGhostTint | yes | yes | edge variant | yes |
| `onCellClick` → consumePickup short-circuit → placeX | yes (no hook) | yes | yes (no hook) | yes |
| `rotate(direction)` updates `rotationStep` | no | yes | yes | no |

Each axis of variation is pure data. The V7 `consumePickup` extension landed in two of the four ([decor-tools.js:64](../../scripts/modules/builder/tools/decor-tools.js#L64), [minion-tools.js:57](../../scripts/modules/builder/tools/minion-tools.js#L57)) and was deliberately omitted from `BlockPlaceTool` and `WallDecorPlaceTool` — but there is no comment marking either omission as deliberate, and no class-level shape that makes the capability explicit. The next "thread X through all place tools" extension (cost gates, snap variants, batch placement) hits exactly the same dispersion.

Adjacent specific duplications:
- `makeTranslucent` helper defined verbatim in both [block-tools.js:13-27](../../scripts/modules/builder/tools/block-tools.js#L13-L27) and [decor-tools.js:15-29](../../scripts/modules/builder/tools/decor-tools.js#L15-L29).
- `GHOST_OPACITY = 0.5` declared at [block-tools.js:10](../../scripts/modules/builder/tools/block-tools.js#L10), [decor-tools.js:10](../../scripts/modules/builder/tools/decor-tools.js#L10), [minion-tools.js:12](../../scripts/modules/builder/tools/minion-tools.js#L12); floor uses `0.45` at [floor-tools.js:10](../../scripts/modules/builder/tools/floor-tools.js#L10) with no comment explaining the asymmetry.
- Meta-apply block (`mesh.scale.setScalar(meta.scale); mesh.position.y = meta.yOffset`) at [block-tools.js:43-45](../../scripts/modules/builder/tools/block-tools.js#L43-L45) and [decor-tools.js:93-96](../../scripts/modules/builder/tools/decor-tools.js#L93-L96).

#### Recommended Remediations
- [ ] Extract a `PlaceTool` base in `tools/tool.js` (or a new `tools/place-tool.js`) that owns the constructor signature, the ghost build/dispose pair, and the click-vs-consume-hook flow. Subclasses override `canPlace(cell)`, `positionGhost(cell)`, `commit(cell)`, and a `supportsPickup` flag.
- [ ] Move `makeTranslucent` and `GHOST_OPACITY` to `tools/tool.js`. If the floor's `0.45` is intentional, give it a named constant (`FLOOR_OVERLAY_OPACITY`) with a one-line comment on the difference.
- [ ] Document, by way of the base class's `supportsPickup` flag, why `BlockPlaceTool` and `WallDecorPlaceTool` don't consume pickups (Block isn't pickup-able; WallDecor pickup is V8 scope).

---

### Finding 4: Erase tools (Block/Decor/Minion) are near-verbatim copies

[block-tools.js:71-126](../../scripts/modules/builder/tools/block-tools.js#L71-L126), [decor-tools.js:153-217](../../scripts/modules/builder/tools/decor-tools.js#L153-L217), [minion-tools.js:63-134](../../scripts/modules/builder/tools/minion-tools.js#L63-L134) — three classes sharing the same shape:

- `buildGhost()` returns the same wireframe `LineSegments` box with `TINT_REMOVE`.
- `onCellHover()` calls a find-target lookup, hides the ghost on miss, else `snapToEntity(target)`.
- `onCellClick()` re-runs the find-target, calls a removal method.
- `snapToEntity()` is 17 lines copied verbatim across all three (axis-aligned bbox → scale + position + visible, `Math.max(size.x, 0.1)` clamps, defensive `if(!this.ghostMesh) return` guard).

Only meaningful variation: the find-target lookup (`findBlockAtCell` / multi-source decor lookup / `findMinionAtCell`) and the remove call (`removeBlock` / `removeDecor` / `removeMinion`).

Same compound cost as Finding 3 — any change to erase UX (different tint, snap geometry, hover-while-empty hint) lands in three files.

#### Recommended Remediations
- [ ] Extract an `EraseTool` base in `tools/tool.js` that owns the wireframe ghost, `snapToEntity`, and the hover/click flow. Subclasses provide `findTarget(cx, cz)` and `commitRemove(target)`.
- [ ] After extraction, the only remaining per-target asymmetry is `DecorEraseTool`'s wall-decor scan (see [Finding 14](#finding-14-decoreraseetools-4-side-wall-scan-is-a-targettype-workaround)) — handle it as an overridable `findAdditionalTargets` hook on the base, or by promoting decor-erase to dual cell/edge target type.

---

### Finding 5: Side/edge geometry helpers duplicated between WorldEditor and WallTracer

Identical declarations and helpers in [world-editor.js:30-38, 588-637](../../scripts/modules/world/world-editor.js#L30-L38) and [wall-tracer.js:18-26, 255-313](../../scripts/modules/world/wall-tracer.js#L18-L26):

| Symbol | world-editor.js | wall-tracer.js |
|---|---|---|
| `SIDES = ["north","south","east","west"]` | declared, **unused** | used |
| `OPPOSITE_SIDE = {north:"south", ...}` | declared, **unused** | used |
| `neighbourCell(cx, cz, side)` | line 588, used | line 255, used |
| `canonicalEdgeKey` / `edgeKey` | line 627 | line 303 |
| `floorSideOfEdge` / `floorSideOf` | line 619 | line 297 |

The two implementations are bit-identical but the method names have already drifted (`canonicalEdgeKey` vs `edgeKey`). If wall-decor pickup lands in V8 (per Task 2's deferred follow-up), WorldEditor will gain more edge-geometry surface and the drift accelerates.

#### Recommended Remediations
- [ ] Extract a `scripts/modules/world/edges.js` module exporting `SIDES`, `OPPOSITE_SIDE`, `neighbourCell`, `edgeKey`, `floorSideOf`, and the wall-endpoint helpers. Import via `import * as Edges` per project convention.
- [ ] Drop the unused `SIDES` and `OPPOSITE_SIDE` from world-editor.js as a no-op precursor.

---

### Finding 6: `flashSaveStatus` chip duplicates the toast/hint queue pattern

[app-view-model.js:33-35, 96-110](../../scripts/modules/ui/app-view-model.js#L33-L35) and three subscribers in [app.js:837-854](../../scripts/app.js#L837-L854). `flashSaveStatus` is a bespoke single-slot, 3.5-s, fade-out notification — manually tracked timer (`saveStatusFadeTimer`), manually managed observable pair (`saveStatus` / `saveStatusVisible`). All three call sites (`saved`, `autosaved`, `saveFailed`) *also* call `toast(...)`, so users see the same message twice in two chrome surfaces.

The codebase already has two `ToastQueue` instances (toasts + hints). A third instance configured with `dismissMs: 3500`, max 1 slot, chip-styled template, would replicate the chip behaviour and delete every imperative timer line currently living on `AppViewModel`.

#### Recommended Remediations
- [ ] Replace the `flashSaveStatus` plumbing with a third `ToastQueue` (`saveStatusQueue` or similar) sized to 1 slot. Update the cozy.css `#save-status-chip` rule to bind to the queue's single visible item.
- [ ] Decide whether the duplicate toast+chip messaging is intentional (chip = transient ack, toast = error escalation) and document. Today every save-status event fires both.

---

### Finding 7: `DevConsoleViewModel.actions` is monkey-patched post-construction

[dev-console-view-model.js:84-92](../../scripts/modules/engine/dev/dev-console-view-model.js#L84-L92) declares `this.actions = { toggleCameraMode: () => {}, … }` as no-op placeholders. [app.js:958-965](../../scripts/app.js#L958-L965) then overwrites the whole `actions` object after construction. This is the exact "no post-hoc patching" pattern V7's UI architecture model explicitly forbids and the rest of the V7 refactor eradicated for `TopMenuViewModel`, `ToolBarViewModel`, etc.

Worse: `diagMode.subscribe(mode => this.actions.setDiagMode(mode))` is wired *at construction* against the no-op stub ([dev-console-view-model.js:96](../../scripts/modules/engine/dev/dev-console-view-model.js#L96)). If anything ever flipped `diagMode` before `wireDevConsole` ran, the subscription would fire the no-op. Today it can't happen because the dev console isn't visible pre-`wireDevConsole`, but the contract violation is the same shape that ate Tasks 4-7 in V7.

#### Recommended Remediations
- [ ] Apply the `installDevActions(...)` pattern (mirror `installAuthoringPanel` / `installTopMenu`). DevConsoleViewModel's `actions` field starts as a null observable; `App` calls `viewModel.dev.installActions({...})` once the action handlers are ready.
- [ ] Or: pass the actions object into the DevConsoleViewModel constructor and defer construction until after they're ready (per the AuthoringPanel/TopMenu precedent).

---

## MEDIUM FINDINGS

### Finding 8: `buildToolFromId` retains ~30 lines of unreachable legacy-ID branches

[app.js:556-617](../../scripts/app.js#L556-L617). Per Task 10's own decision register, nothing in the live codebase emits the legacy IDs:

- `if(rest === "paint")` / `if(rest === "erase")` / `if(rest === "block:erase")` ([app.js:567-569](../../scripts/app.js#L567-L569))
- `block:place:<kind>` split ([app.js:571-574](../../scripts/app.js#L571-L574))
- `decor:erase`, `decor:place:<kind>`, `decor:wall:place:<kind>` ([app.js:589-596](../../scripts/app.js#L589-L596))
- `minion:erase`, `minion:spawn:<kind>` ([app.js:611-614](../../scripts/app.js#L611-L614))
- `if(toolId === "select")` legacy V6 ID ([app.js:548](../../scripts/app.js#L548))

A grep across `scripts/`, `tests/`, and `index.html` confirms zero producers. The Task 10 audit kept them as "documented aliases for one-version forgiveness" — that's now landed. They obscure the live contract and make the dispatch function 50% longer than it needs to be.

#### Recommended Remediations
- [ ] Delete the legacy branches; leave only the verb-form arms. Per Task 10 the V8 sweep was already pencilled in for this.

---

### Finding 9: `Tool.hoverCell` / `Tool.hoverEdge` written but never read

[tool.js:23-24, 53-54](../../scripts/modules/builder/tools/tool.js#L23-L24) declares and clears them; every `onCellHover` / `onWallEdgeHover` writes (`floor-tools.js:38,65`, `block-tools.js:54,87`, `decor-tools.js:54,105,167`, `minion-tools.js:47,79`). No reader exists anywhere in the codebase. Looks like leftover scaffolding from a deferred design (hover-state survives across reentrant pointerdown events?) that never materialised.

#### Recommended Remediations
- [ ] Delete the fields and all write sites; or wire them to actually serve a purpose (e.g. let `onCellClick` consult `this.hoverCell` when the click event doesn't include a fresh cell hit).

---

### Finding 10: `App.diagnoseWalkers` is defined but unregistered

[app.js:1091-1115](../../scripts/app.js#L1091-L1115). The method exists but is not wired into `viewModel.dev.actions` ([app.js:958-965](../../scripts/app.js#L958-L965)) — the dev console's other diagnostic actions all are. Grep across the project finds zero callers outside the declaration. Likely a V3 collision-debug helper that landed but didn't make it onto the dev-console panel.

#### Recommended Remediations
- [ ] Either register it as a dev-console action (it's clearly useful enough to have been kept) or delete it.

---

### Finding 11: `WorldEditor.canRemoveBlock` / `canRemoveDecor` / `canRemoveMinion` are dead

[world-editor.js:70-73, 117-120, 139-142](../../scripts/modules/world/world-editor.js#L70-L73). Zero callers outside their own declarations — no production code, no tests. plan-v4 design called for paired predicates per action; tools didn't adopt them for removal because PickTool/NudgeTool resolve targets via raycast, not predicate guards. Each is a one-line wrapper over its `isXEntity` sibling, so even if a future caller wants the predicate, the duplication is trivial to revive.

#### Recommended Remediations
- [ ] Delete the three predicates. Anyone reading the file currently has to ask why they exist and which authoring flow reaches them.

---

### Finding 12: Five `findXAtCell` linear scans on `world.entities` per authoring action

[world-editor.js:497-577](../../scripts/modules/world/world-editor.js#L497-L577) — `findFloorAtCell`, `findBlockAtCell`, `findDecorAtCell`, `findSurfaceAtCell`, `findSurfacePlaceablesAtCell` each walk `world.entities` doing the same `placement.cx === cx && placement.cz === cz` filter, then differentiate by component type. A single authoring action triggers several (`placeDecor` → `canPlaceDecor` → `findSurfaceAtCell` + `findSurfacePlaceablesAtCell` → `getPlacementYFor` → `findSurfaceAtCell` again). plan-v4 line 162 explicitly flagged this as known perf debt — still unpaid.

Beyond perf: five almost-identical scans drift independently. `findDecorAtCell` excludes block kinds (because they're decor-component-shaped); `findSurfaceAtCell` filters on `placement.surfaceY > 0`; a future "find by component AND state" predicate has to be re-implemented from scratch.

#### Recommended Remediations
- [ ] Add a single `entitiesAtCell(cx, cz)` iterator (or a generator) that yields all entities with a `GridPlacement` at that cell. The five wrappers become 1-line `.filter()` calls. Keep the wrappers as the named API.
- [ ] Optional follow-on: build a `cellIndex: Map<cellKey, Entity[]>` inside `World` that the GridPlacement onAdded/onRemoved hooks maintain. O(1) lookup, single source of truth. This is the V4-flagged perf fix.

---

### Finding 13: Edge / Corner / Grid placement components duplicate stamp/revert plumbing

[grid-placement.js:133-161](../../scripts/modules/world/components/grid-placement.js#L133-L161), [edge-placement.js:113-134](../../scripts/modules/world/components/edge-placement.js#L113-L134), [corner-placement.js:66-89](../../scripts/modules/world/components/corner-placement.js#L66-L89). All three implement `stampWalkGrid(world)` / `revertWalkGrid(world)` with the same shape:

```
gate on world.walkGrid && world.assets
Footprint.computeFootprint(...)
this.stampedSubCells = ...
applyStamp / revertStamp
```

Only difference: the args passed to `computeFootprint`. The `stampedSubCells = []` field is identical in all three. If wall-decor pickup lands per Task 2's deferred follow-up, edge/corner gain a `setOffset` companion and the trio grows by one more parallel method.

#### Recommended Remediations
- [ ] Extract a `WalkGridStamper` mixin or small base (`PlacementBase`) that owns the field + stamp/revert lifecycle. Subclasses provide a `computeFootprintArgs(world)` method.

---

### Finding 14: `DecorEraseTool`'s 4-side wall scan is a `targetType` workaround

[decor-tools.js:185-196](../../scripts/modules/builder/tools/decor-tools.js#L185-L196) iterates over `["north","south","east","west"]` calling `findWallDecorAtEdge` per side on every pointermove. The raycaster *already* identifies the actual wall edge under the cursor (see [builder-input-adapter.js:222-250](../../scripts/modules/builder/builder-input-adapter.js#L222-L250)), but `DecorEraseTool.targetType = "cell"` so the edge hit is discarded.

Two costs: (a) per-hover work that scales with side count, (b) when a cell has multiple wall-decor pieces (corner cell with banners on two sides), erase deletes the first one matched in NSEW order rather than the one the cursor is over.

#### Recommended Remediations
- [ ] Promote `DecorEraseTool.targetType` to dual cell/edge (or split into `DecorEraseTool` + `WallDecorEraseTool`) and use the real edge hit from the raycaster.

---

### Finding 15: `Grid` exposes a large pre-walk-grid API that production no longer uses

[grid.js:53-186](../../scripts/modules/world/grid.js#L53-L186) — `snapToEdge`, `walkableCells`, `isAvailable`, `findClosestAvailable`, and main-grid `isWalkable` are only consumed by tests. The V6 walk-grid migration moved walker pathing to `WalkGrid`; `Grid` retained the main-grid API but production now uses `grid.isFloor` + `walkGrid.isWalkable` instead.

#### Recommended Remediations
- [ ] Delete the dead methods (and their tests). Roughly halves `grid.js`'s public surface and removes the "is this still load-bearing?" question.
- [ ] If any are genuinely reserved for future use (`findClosestAvailable` for V4+ move-player tool?), keep them but add a one-line "reserved for X" comment so the next maintainer doesn't delete them speculatively.

---

### Finding 16: `WorldEditor.SIDES` and `OPPOSITE_SIDE` constants are dead

[world-editor.js:30-38](../../scripts/modules/world/world-editor.js#L30-L38) declares both; neither is referenced inside the file. Leftover from a refactor that moved the consuming logic into `wall-tracer.js`. Counts as duplicated declaration of [Finding 5](#finding-5-sideedge-geometry-helpers-duplicated-between-worldeditor-and-walltracer)'s WallTracer copies.

#### Recommended Remediations
- [ ] Delete (or move to the shared `edges.js` per Finding 5).

---

### Finding 17: `isWalkerEntity` overlaps `isMinionEntity` and is dead

[world-editor.js:688-693](../../scripts/modules/world/world-editor.js#L688-L693). Zero callers. Semantically identical to `isMinionEntity` ([world-editor.js:662](../../scripts/modules/world/world-editor.js#L662)) — both reduce to "has a Walker component". `isWalkerEntity` accepts an `occupant` parameter and rejects `PLAYER_MARKER`, but `isMinionEntity`'s `typeof getComponent === "function"` guard already rejects the marker sentinel.

#### Recommended Remediations
- [ ] Delete `isWalkerEntity`. If a future caller wants the "occupant-or-entity" form, fold it into `isMinionEntity` with a tagged comment.

---

### Finding 18: Two identical rotation handlers in decor-tools.js

[decor-tools.js:68-74](../../scripts/modules/builder/tools/decor-tools.js#L68-L74) (DecorPlaceTool) and [decor-tools.js:122-126](../../scripts/modules/builder/tools/decor-tools.js#L122-L126) (WallDecorPlaceTool):

```js
if(direction === "cw")       { this.rotationStep = (this.rotationStep + 1) % 4; }
else if(direction === "ccw") { this.rotationStep = (this.rotationStep + 3) % 4; }
```

Same code, same file. Additionally, `WallDecorPlaceTool.rotate()` doesn't reorient the ghost — the ghost rotation is set in `positionGhostAtEdge` only from the edge side, never from `rotationStep`. So Q/E mutate persistent state silently and the placed entity rotates but the preview doesn't. Either intentional (wall Y-rotation has no meaningful preview) or a bug — no comment marks which.

#### Recommended Remediations
- [ ] Move the rotation snap into `Tool.rotate(direction)` (or into the proposed PlaceTool base from Finding 3).
- [ ] Decide and document whether the ghost-doesn't-rotate behaviour is correct for WallDecorPlaceTool.

---

### Finding 19: `World.playerDisplaceHandler` is set but never invoked

[world.js:21-31](../../scripts/modules/world/world.js#L21-L31) defines `setPlayerDisplaceHandler`; [app.js:726](../../scripts/app.js#L726) wires it; nothing in `world-editor.js` ever invokes the handler. V3's `decor.js` builder used to call it when placing on `PLAYER_MARKER` — V4 replaced that path with `canPlaceDecor` REFUSING the placement entirely ([world-editor.js:92](../../scripts/modules/world/world-editor.js#L92)).

The plumbing is reserved for the V4+ move-player tool per the project's intent memory. Today it's encapsulated dead code.

#### Recommended Remediations
- [ ] Either delete (with a project-memory note pointing to where to revive when MovePlayerTool lands) or add a one-line "reserved for MovePlayerTool" comment on the setter so a future maintainer doesn't speculatively prune it.

---

### Finding 20: Builder/FirstPerson camera input-wiring is structurally duplicated

[builder-camera.js:63-67, 69-84](../../scripts/modules/engine/cameras/builder-camera.js#L63-L67) and [first-person-camera.js:59-63, 65-91](../../scripts/modules/engine/cameras/first-person-camera.js#L59-L63) both:

1. Bind every handler in the constructor (`this.onPointerDown = this.onPointerDown.bind(this); …`)
2. Call `input.on(event, handler)` per event in `activate()`
3. Call `input.off(event, handler)` per event in `deactivate()`

The base [CameraController](../../scripts/modules/engine/cameras/camera-controller.js) has empty `activate/deactivate` stubs — it exists exactly to absorb this pattern. A `subscriptions: Map<event, handler>` field with `subscribe(event, fn)` + base `activate()`/`deactivate()` that loops would let each subclass declare its subscriptions once.

#### Recommended Remediations
- [ ] Move the subscribe/activate/deactivate scaffolding to `CameraController`. Subclasses call `this.subscribe("pointerdown", this.onPointerDown)` once per handler at construction; lifecycle is automatic.

---

### Finding 21: `NoopTool` lives in `minion-tools.js`

[builder-input-adapter.js:3](../../scripts/modules/builder/builder-input-adapter.js#L3) imports `NoopTool` from `tools/minion-tools.js`. NoopTool is the universal "no tool active" sentinel referenced four times in the adapter — it has no minion-specific behaviour. A reader chasing the import wonders why pointer dispatch depends on minion code.

#### Recommended Remediations
- [ ] Move `NoopTool` to `tools/tool.js` (it's a one-liner that belongs next to its base class) or its own file. Update the two importers.

---

### Finding 22: `confirmModal.cancel()` is a one-line alias for `hide()`

[confirm-modal.js:39-48](../../scripts/modules/ui/confirm-modal.js#L39-L48). Three methods (`confirm`, `cancel`, `hide`) where `cancel` is just `this.hide()`. KO template binds Cancel to `cancel` and Confirm to `confirm`. The API implies a behavioural distinction (`onCancel` callback?) that doesn't exist.

#### Recommended Remediations
- [ ] Either fold `cancel` into `hide` (and rebind the template) or give `cancel` a real difference (fire an optional `onCancel` callback from `show()`'s args, parallel to `onConfirm`).

---

### Finding 23: `AppViewModel.install*` shape is inconsistent

[app-view-model.js:112-140](../../scripts/modules/ui/app-view-model.js#L112-L140) — `confirmModal` and `dev` are eagerly constructed in the constructor; `authoringPanel`, `toolBar`, `topMenu` are deferred via `installX(...)` methods. The deferral is required for the two that need `assets` (constructed asynchronously) and `saveService` (constructed after world build); `topMenu` is deferred for a less obvious reason — it only needs services that exist at App construction time, plus a `resetLair` callback that's just a method on `App`.

Not a bug, but the asymmetry is the maintainability cost — a reader can't tell from the AppViewModel shape which dependencies gate each surface's installation.

#### Recommended Remediations
- [ ] Either: document in a comment on each `install*` what the gate condition is, OR move surfaces that don't truly need deferral back into constructor injection. The mixed model invites bugs when a future surface picks the wrong pattern.

---

## LOW FINDINGS

### Finding 24: Three copies of `GHOST_OPACITY`
Already covered under [Finding 3](#finding-3-place-tools-blockdecorwalldecorminion-share-70-of-their-shape-with-no-base-class). Calling it out separately so the base-class extraction includes this as a pure-subtractive precursor that can land independently.

### Finding 25: `NudgeTool.buildGhost` / `PickTool.buildGhost` return null — base already does that
[nudge-tool.js:24](../../scripts/modules/builder/tools/nudge-tool.js#L24), [pick-tool.js:17](../../scripts/modules/builder/tools/pick-tool.js#L17). Base `Tool.buildGhost()` already returns null ([tool.js:69-72](../../scripts/modules/builder/tools/tool.js#L69-L72)). Pure dead overrides.

### Finding 26: `Renderer.CLEAR_COLOR` is dead — scene background takes precedence
[renderer.js:11, 34](../../scripts/modules/engine/renderer.js#L11). The constructor calls `setClearColor(0x0a0e14, 1)`, but [app.js:436](../../scripts/app.js#L436) sets `world.scene.background = new THREE.Color(SCENE_BACKGROUND)` and Three.js paints with the scene background. The clear-colour is the pre-cozy V0 grey and is invisible in the live game. Misleading — a maintainer changing the constant expects the world background to change.

### Finding 27: `engine/index.js` façade has only one consumer
Per the audit, only [tests/engine/errors.test.js](../../tests/engine/errors.test.js) uses the façade import. All production code imports `errors.js` and `emitter.js` directly. The façade re-exports `emitter` + `errors` only — neither Renderer, GameLoop, Input, SaveService, AssetManager, nor cameras — so calling it a "façade" overstates what it does.

#### Recommended Remediations
- [ ] Either drop the façade (a test can import the two modules directly) or extend it to cover the actual engine surface and use it from production imports.

### Finding 28: `ToastQueue.clear()` is dead; `scheduleTimeout` injection isn't exercised
[toast-queue.js:10, 49-57](../../scripts/modules/ui/toast-queue.js#L10). `clear()` has no production callers; `scheduleTimeout` / `cancelTimeout` constructor options are not exercised by any test. YAGNI fixtures.

### Finding 29: `Input.allowDefaultFor` is dead
[input.js:42-50](../../scripts/modules/engine/input.js#L42-L50). `preventDefaultFor` is called four times; `allowDefaultFor` has zero callers. Symmetry-for-symmetry's-sake.

### Finding 30: `AssetManager.reload()` has no UI feedback path
[app.js:1123-1138](../../scripts/app.js#L1123-L1138) writes `viewModel.loadStatus("Manifest reloaded")` — but `loadStatus` only renders inside `#loading-overlay`, which is hidden once `isReady` is true. Dev action runs, user sees nothing unless the reload throws. Should `toast(...)` on success too.

### Finding 31: `AuthoringPanel.isToolSelected` is dead
[authoring-panel.js:50-53](../../scripts/modules/ui/authoring-panel.js#L50-L53). HTML uses `isKindSelected` for tile highlights and `selectedToolId` for dispatch. No reader of `isToolSelected` exists.

### Finding 32: `DevConsoleViewModel.toggleOpen` and `DevConsole.toggle` are parallel toggles
[dev-console-view-model.js:74](../../scripts/modules/engine/dev/dev-console-view-model.js#L74) + [dev-console.js:57-60](../../scripts/modules/engine/dev/dev-console.js#L57-L60). Both flip `isOpen`. `TopMenuViewModel.toggleSettings()` calls the VM arrow; the Backtick key handler calls the service method. One redundant indirection.

### Finding 33: `SaveService.hasFileHandle` getter is dead
[save-service.js:39](../../scripts/modules/engine/save-service.js#L39). `clearFileHandle()` is used at [app.js:506](../../scripts/app.js#L506) and [app.js:921](../../scripts/app.js#L921); the getter has zero readers. Probably from a dev-console panel that displayed handle state and didn't ship.

### Finding 34: DevConsole capture reads display state from its view-model
[dev-console.js:98-99, 125, 134, 143-164](../../scripts/modules/engine/dev/dev-console.js#L98-L99). `DevConsole.record()` reads `this.viewModel.isPaused()` and `this.viewModel.showNoisy()` — capture depends on display state to decide whether to record. `pollStats()` writes 8 observables back onto the view-model. The CLAUDE.md "capture vs display kept apart" rule is documented but not actually enforced by the code.

#### Recommended Remediations
- [ ] Pull `paused` and `showNoisy` onto `DevConsole` as plain fields with setter methods. `DevConsoleViewModel` mirrors them and pushes updates via the setters. Capture reads its own fields; display state stays display-side.

### Finding 35: `TopMenuViewModel.modeTitle` fallback is unreachable
[top-menu.js:34-35](../../scripts/modules/ui/top-menu.js#L34-L35). `MODE_LABELS[this.cameraMode()] || "Builder Mode"` — there are exactly two modes and both have labels, so the `||` branch never fires. Either drop the fallback or change it to `"Unknown mode"` so it's diagnostic if it ever does.

### Finding 36: `MIN_SUB_CELL_COVERAGE` exported only for one test assertion
[footprint.js:217](../../scripts/modules/world/footprint.js#L217). Exported solely so a test can assert its value. Test then asserts `MIN_SUB_CELL_COVERAGE === 0.05`, which is purely tautological — behavioural tests already lock the value in. Leaks an internal tuning knob.

### Finding 37: Walker drift handling is per-frame, per-walker, with no recovery
[walker.js:160-179](../../scripts/modules/world/components/walker.js#L160-L179). Runs every fixed-update for every walker — allocates a `worldToSub` result, compares against `currentSubCell`, latches a `driftWarned` flag, emits a `console.warn` if drift. No recovery, no metric, no telemetry. Either it's load-bearing diagnostic infrastructure that should be guarded by a debug flag, or training wheels that can be removed now that the V6 collision model has shipped.

### Finding 38: `GridPlacement.moveTo` is dead and traps callers
[grid-placement.js:80-84](../../scripts/modules/world/components/grid-placement.js#L80-L84). Only the test references it. `WorldEditor.nudgeEntity` uses `setOffset` instead. `moveTo` bypasses `revertWalkGrid` / `applyTransform` / `stampWalkGrid` — any future caller introduces a walk-grid stamp leak.

#### Recommended Remediations
- [ ] Delete, OR fix `moveTo` to do the full revert/apply dance and document that it's the canonical mover.

### Finding 39: `displaceWalkersFromMainCell` rebuilds a traversable predicate that `WanderBehaviour` already has
[world-editor.js:730-759](../../scripts/modules/world/world-editor.js#L730-L759) builds an `isTraversable` closure that filters sub-cells by `walkGrid.isWalkable` + main-cell `grid.isFloor` — same shape as [wander-behaviour.js:167-180](../../scripts/modules/world/components/wander-behaviour.js#L167-L180), only difference is an extra "exclude origin main cell" filter. A `WalkSearch.traversableExcluding(walkGrid, grid, excludeMainCell)` helper would unify them.

### Finding 40: Save persists `Renderable` components that load silently discards
[world-serializer.js:168](../../scripts/modules/world/world-serializer.js#L168). Load path silently skips persisted `Renderable` records (since `Entity.fromKind` always attaches a fresh one). But save path has no symmetric guard — `Renderable.toJSON` returns `{kind}` and gets serialised. Every save file carries one redundant component record per entity. Minor size bloat plus a "why is this in the file?" question.

### Finding 41: `GridPlacement` serialisation filter duplicates the `toJSON` filter
[world-serializer.js:32-41](../../scripts/modules/world/world-serializer.js#L32-L41) cherry-picks fields on the way in; [grid-placement.js:111-120](../../scripts/modules/world/components/grid-placement.js#L111-L120) cherry-picks fields on the way out. Same schema in two places that must stay in lock-step. A round-trip `GridPlacement.fromJSON(data)` static method would centralise.

### Finding 42: `Tool.setGhostTint` is a 2-state shim around `setGhostColour`
[tool.js:85-88](../../scripts/modules/builder/tools/tool.js#L85-L88). `setGhostTint(valid)` chooses between `TINT_VALID` and `TINT_INVALID`. Erase tools need a 3-state choice (`TINT_REMOVE`/`TINT_INVALID`) so they bypass `setGhostTint` and call `setGhostColour` directly. Two adjacent helpers with overlapping responsibility.

### Finding 43: `IconRenderer.renderCatalogue` swallows asset failures silently
[icon-renderer.js:35-47, 197-201](../../scripts/modules/builder/icon-renderer.js#L35-L47). `safeGetKind` and the broad try/catch around `renderMesh` can drop a tile with only a `console.warn` breadcrumb. A broken asset can disappear from the catalogue without surfacing in the UI.

### Finding 44: `AppViewModel.controlsDismissed` never resets to false
[app-view-model.js:40, 77-84](../../scripts/modules/ui/app-view-model.js#L40). Once dismissed, stays dismissed for the page lifetime — even after Reset Lair. If that's the intent, the observable could just be a flag; if the overlay is meant to reappear after reset, a wire is missing.

### Finding 45: `WallTracer.endpointLow` / `endpointHigh` overlap
[wall-tracer.js:274-296](../../scripts/modules/world/wall-tracer.js#L274-L296). Two methods together encode "the two endpoints of a wall edge" with awkward redundancy — `endpointLow("east")` and `endpointHigh("west")` both return `cx+1, cz`. Single `wallEndpoints(cx, cz, side)` returning `{low, high}` would express geometry once.

### Finding 46: `WorldEditor.rehydrateMinion` manually invokes component lifecycle
[world-editor.js:452-483](../../scripts/modules/world/world-editor.js#L452-L483). Adds a component AFTER the entity is in the world, then manually calls `onAddedToWorld` because `Entity.addComponent` only calls `attach`. The workaround pattern will recur every time a non-serialised, world-context-dependent component needs late attachment. An `entity.addComponentInWorld(component)` shortcut on `Entity` would absorb the pattern.

### Finding 47: `Tool.positionGhostAtCell` `yOffset` parameter is unused or clobbered by most callers
[tool.js:77-83](../../scripts/modules/builder/tools/tool.js#L77-L83). Only `DecorPlaceTool` passes a non-zero yOffset. `BlockPlaceTool` calls it then `position.y = 0`; `MinionSpawnTool` calls it then `position.y = PLACEHOLDER_HEIGHT/2`. The helper's contract is "ghost sits at GHOST_Y + offset" — correct for one subclass and ignored by two. Splitting into `positionGhostAtCellXZ` + opt-in `liftGhost(y)` (or a `computeGhostY(cell)` hook) would make intent explicit.

### Finding 48: `loadHandler` / `confirmModalEscapeHandler` not declared in constructor
[app.js:884, 934](../../scripts/app.js#L884) — both are added to `App` instance state lazily inside their wiring methods, unlike `tabHandler`, `saveHandler`, `devToggleHandler`, etc. which are declared as `null` in the constructor and rebound later. Inconsistent and easy to miss in `shutdown()` cleanup (currently both ARE detached because they were added directly to `this.input`'s subscription list, but cleanup parity isn't enforced by the constructor declaration).

#### Recommended Remediations
- [ ] Declare both handlers as `null` fields in the constructor for consistency with the other handlers, and add explicit `input.off` calls in `shutdown()` for both.

---

## CROSS-CUTTING OBSERVATIONS

- **Dead code is the dominant finding.** Roughly 12 findings (3, 8, 9, 10, 11, 16, 17, 19, 25-29, 31-33, 38, 44) are pure subtractions. Most are leftovers from V3-V6 tasks that the V7 sweep didn't reach. A "dead-code sweep" follow-up — explicitly excluded from V7 per Task 10 — would remove around 200 LOC and meaningfully shrink the surface to read.

- **Place + Erase tool families are the duplication-cost epicentre.** Findings 3, 4, 18, 24, 25, 47 all live in `scripts/modules/builder/tools/`. A `PlaceTool` + `EraseTool` base extraction collapses 200+ LOC across four files and converts every cross-tool asymmetry (rotation, pickup hook, Y offset, meta keys) into explicit overridable hooks instead of "missing in two of four files, no comment why".

- **Edge geometry is the second epicentre.** Findings 5, 14, 16, 45 all touch the wall-edge math distributed across WorldEditor, WallTracer, and the wall-decor tooling. A `scripts/modules/world/edges.js` module would centralise it. The V8 wall-decor-pickup follow-up will need this regardless.

- **V7's "no post-hoc patching" rule is partially undermined by DevConsole.** Finding 7 is the only surviving V7-rule-violator. Bringing it in line (install pattern parallel to TopMenu / ToolBar / AuthoringPanel) finishes the architecture migration.

- **Three notification primitives compete.** `toast`, `hint`, and `flashSaveStatus` (Finding 6) all do "ephemeral message to user". Two share a class; one is bespoke timer plumbing on AppViewModel. Unifying eliminates the only imperative-timer state in the VM.

- **The "find by cell" perf debt has been outstanding since plan-v4.** Finding 12 is the highest-ROI infra fix outside V7's scope — five linear scans collapse to one indexed lookup, and every future read-of-world query gets the same benefit.

---

## SUGGESTED ORDER OF OPERATIONS

If a remediation sweep happens (likely V7.11 cleanup or early in a hypothetical V8):

1. **Pure deletions first** (cannot regress anything): Findings 1, 2, 8, 9, 10, 11, 16, 17, 19, 25-29, 31-33, 38, 44, 47, 48 — about 200 LOC removed, no behaviour change, no new tests.
2. **Centralisation passes** that absorb existing tests without API change: Finding 5 (edges.js), Finding 13 (WalkGridStamper), Finding 24 (GHOST_OPACITY).
3. **Behavioural refactors** that need fresh tests: Findings 3 (PlaceTool base), 4 (EraseTool base), 6 (saveStatusQueue), 7 (DevConsole install pattern), 20 (CameraController subscription scaffolding).
4. **Larger structural** work: Finding 12 (cellIndex), Finding 23 (AppViewModel install consistency).
