# Plan: Cozy Lairs V3 — Collision & Chaos

## Context

V3 makes the world physical. Static decor and other walker entities block movement; walkers discover blockages lazily when they encounter them and re-plan; the player participates in the same collision rules while in first-person mode. Decor that lands on a walker or the player teleports the occupant to the nearest free cell as a safety net. A small `ChaosController` teleports a few designated barrels to random cells whenever any walker arrives, blocks, or gets displaced — a reactive feedback loop that stress-tests the collision system continuously without a setInterval or any manual triggering.

Full design: [.project/designs/design-v3.md](../designs/design-v3.md).

The framework treats all mobile entities identically — the implementation operates on `Walker` components and grid occupancy without discriminating on entity kind. "Minion" is the only walker we currently have; future monsters / creatures / visitors will inherit V3's collision behaviour by attaching the same `Walker` (and any chosen behaviour component).

Tasks are sequenced so foundational primitives (Grid extensions in Task 1, multi-minion spawn in Task 2 to give us something to bonk) land before the consumers (Walker collision in Task 3 starts producing visible behaviour). Each task ends with a tick-able verification — most are browser-demoable except Task 1 which is tests-only.

`VERSION` in `scripts/app.js` is bumped as the *first* code change of each task per the project's versioning convention. Plan-v3 uses the `V3_N_0` format throughout; the value advertised after task N completes is `V3.N.0`.

---

## Task 1: `Grid.isAvailable` + `Grid.findClosestAvailable`

### Objective

Add the two new `Grid` query methods that drive every collision decision in V3. Pure data-structure work; tests-only verification. No callers yet — Tasks 2+ wire them in.

### Expected Outcomes

- `grid.isAvailable(cx, cz, excludeOccupant = null)` returns true iff `isWalkable(cx, cz)` AND no occupant (or the occupant is `excludeOccupant`). Returns false (no throw) for out-of-bounds.
- `grid.findClosestAvailable(cx, cz, excludeOccupant = null)` returns the first cell satisfying `isAvailable` via BFS spiral (8-way), or `null` if the grid is exhausted.
- New tests cover the truth tables, the `excludeOccupant` parameter, BFS spiral correctness on small fixtures, and BFS exhaustion.
- Tests pass; no browser-side change.

### Risks / Constraints

- BFS visited set should reuse the existing `cellKey` format — do not introduce a parallel encoding.
- 8-way BFS expands fast; for a 10×12 grid the worst case visits all ~120 cells. Fine.
- BFS visit order is well-defined (queue order), so the first-match cell is deterministic for a given start. Tests should rely on that determinism.

### Steps

- [*] Bump `VERSION` to `V3_1_0` in `scripts/app.js`.
- [*] Add `isAvailable(cx, cz, excludeOccupant = null)` to `Grid`. Returns false on out-of-bounds; otherwise `isWalkable(cx, cz) && (occupants.get(key) === undefined || occupants.get(key) === excludeOccupant)`.
- [*] Add `findClosestAvailable(cx, cz, excludeOccupant = null)` to `Grid` — BFS over 8 neighbours, queue + visited Set, returns first cell satisfying `isAvailable`. Includes the start cell itself in the search. Returns `null` if exhausted.
- [*] Extend `tests/world/grid.test.js` with: `isAvailable` truth table (walkable+empty=true, walkable+occupied=false, walkable+occupied-by-excluded=true, non-walkable=false, OOB=false); `findClosestAvailable` returns expected cell on a small open grid; respects `excludeOccupant`; returns null when nowhere is free.
- [*] Run `npm test`.
- [*] Verify: tests pass; no browser-side change.

### Decisions

<!-- Filled in during execution. -->

---

## Task 2: Multi-minion spawn (4 minions)

### Objective

Loop `App.spawnMinion` to spawn N=4 minions at distinct walkable cells. Visible foundation for collision testing (you can't see minion-vs-minion bonking with just one minion). Still no collision behaviour at this point — minions phase through each other.

### Expected Outcomes

- `App.spawnMinion(cell)` accepts a spawn cell argument (drops the global `MINION_SPAWN_CELL`); each call spawns one fully-equipped minion.
- A new `MINION_COUNT` constant (default 4) and a small spawn-cell-picker helper that returns N walkable cells separated by at least 1 cell (Chebyshev) to avoid stacking.
- `App.buildWorld` calls the picker, then loops `spawnMinion(cell)` for each.
- Browser: 4 minions visible at distinct starting cells, all wandering independently (still phasing through each other — collision lands in Task 3).

### Risks / Constraints

- Spawn-cell picker may not find N cells separated enough for very small grids — fall back to fewer minions with a `console.warn`.
- Each minion needs its own Walker / Animator / WanderBehaviour. Animation clips can be fetched once outside the loop and shared (clips are immutable; `mixer.clipAction` makes per-mixer actions).
- Initial idle crossfade (currently in `spawnMinion`) needs to fire per minion — keep that line inside the per-minion logic.

### Steps

- [*] Bump `VERSION` to `V3_2_0`.
- [*] Add `MINION_COUNT = 4` constant in `scripts/app.js`. Remove `MINION_SPAWN_CELL`.
- [*] Refactor `spawnMinion()` to `spawnMinion(spawnCell)` — takes the cell as an argument, drops the global constant lookup. Keep all per-minion logic (Walker, Animator, WanderBehaviour, position, idle crossfade) inside.
- [*] Add a private helper `pickMinionSpawnCells(grid, count)` — returns an array of N walkable cells, each separated by Chebyshev distance ≥ 2 from previously-picked cells. Warns and returns fewer if it can't satisfy.
- [*] In `App.buildWorld`, after `placeDecor`, call `pickMinionSpawnCells(this.world.grid, MINION_COUNT)` and loop `spawnMinion` over the result.
- [*] Lift the `getAnimations` calls outside `spawnMinion` (so all minions share the same fetched animation arrays) — store as `this.minionAnimations` or pass into `spawnMinion`.
- [*] Run `npm test`.
- [*] Verify in browser: 4 minions visible, each at a distinct cell, all wandering. Still no collision behaviour (minions phase through each other and through decor — Task 3 fixes this).

### Decisions

<!-- Filled in during execution. -->

---

## Task 3: Walker collision detection — occupancy, `"blocked"` event, WanderBehaviour repath

### Objective

Walker registers / clears `grid.occupants` on cell change. Before committing to the next path cell, Walker checks `isAvailable` (excluding itself); if unavailable, emits `"blocked"`. WanderBehaviour subscribes to `"blocked"` with the same handler as `"arrived"` so blocked walkers idle briefly then re-plan.

### Expected Outcomes

- `Walker` tracks `currentCell`. `snapToCell` registers occupancy; reaching the next cell mid-path clears the old and registers the new (atomic from JS's perspective).
- Pre-step check via `grid.isAvailable(nextCell, this.entity)` runs both at `followPath` start (path[1]) and after each cell arrival before committing to path[pathIndex].
- Walker emits `"blocked"` when the next cell is unavailable, transitions to `idle`, sets `completed = true`, retains the path remainder for diagnostics.
- `Walker.onRemovedFromWorld` clears the current cell's occupancy.
- `WanderBehaviour.onAddedToWorld` subscribes to `walker.blocked` with the same handler as `walker.arrived` (schedule next trip after idle).
- Browser: 4 minions wander, occasionally bonking and pausing, then re-routing via the pathfinder around the now-static blocker (which is the OTHER minion).

### Risks / Constraints

- Race window: two walkers in the same frame both pre-check the same target, both pass, both commit, both move toward it. They'll collide mid-cell. The next pre-check (at the NEXT cell-arrival) catches it. Acceptable for V3 — a slight visual "near miss" before the bonk registers.
- Don't reserve cells "ahead of time" — registration happens on physical arrival only. The simpler model trades a frame of visual jank for a much simpler implementation.
- `Walker` already has `onRemovedFromWorld`-style hooks (none currently defined; add one for occupancy cleanup).
- Existing walker tests still need to pass — they use a single-walker world with no occupancy contention. Add new tests for the multi-walker / collision paths separately.

### Steps

- [*] Bump `VERSION` to `V3_3_0`.
- [*] Add `this.currentCell = null` to `Walker` constructor.
- [*] Add a private helper `registerOccupancy(cx, cz)` that clears the old `currentCell` from `grid.occupants` (if any) and registers the new cell with `this.entity`.
- [*] In `Walker.snapToCell`, after setting position, call `registerOccupancy(cell.cx, cell.cz)`.
- [*] In `Walker.update`, when reaching the current target (step >= dist) and BEFORE incrementing `pathIndex`: call `registerOccupancy(path[pathIndex].cx, path[pathIndex].cz)`.
- [*] After incrementing `pathIndex`, if not at end of path: check `grid.isAvailable(path[pathIndex], this.entity)`. If false: `completed = true`, crossfade idle, emit `"blocked"`, return.
- [*] In `Walker.followPath` after `snapToCell(path[0])`, also pre-check `isAvailable(path[1], this.entity)` if `path.length > 1`. If unavailable: `completed = true`, crossfade idle, emit `"blocked"`.
- [*] Add `Walker.onRemovedFromWorld(world)` that clears `currentCell` from `grid.occupants` (if set) and nulls `currentCell`.
- [*] In `WanderBehaviour.onAddedToWorld`, also subscribe to `walker.on("blocked", this.arrivedHandler)` (same handler instance as arrived).
- [*] In `WanderBehaviour.onRemovedFromWorld`, also `walker.off("blocked", ...)`.
- [*] Update `tests/world/components/walker.test.js`: occupancy registered on `snapToCell`; `crossCell` flow during update; `"blocked"` emitted when next cell unavailable; occupancy cleared on `onRemovedFromWorld`.
- [*] Update `tests/world/components/wander-behaviour.test.js`: `walker.blocked` triggers repath via the same handler.
- [*] Run `npm test`.
- [*] Verify in browser: 4 minions wandering. With repeated trips, watch for occasional pause-and-pivot moments where one minion bonks another and re-routes.

### Decisions

- **Re-check on arrival, not just at leg-start**: the planned single pre-check after `pathIndex` increment is insufficient — it doesn't catch a cell that becomes occupied *while the walker is mid-leg toward it*. Without re-check, the walker arrives at the contested cell, registers occupancy (clobbering the obstacle's claim), and the `"blocked"` event never fires. Added a second `isAvailable` check at the moment `step >= dist`, *before* snapping into the cell. The walker stops one frame short of entering and emits `"blocked"`. Two checks per arrival is cheap (one Map lookup each).
- Occupancy clear-then-set is intentionally non-atomic in JS (sequential statements, single threaded). No race within a single tick; the only race is the multi-walker-same-frame case the design explicitly accepts (one will arrive first and the other will block on the next pre-check).
- All existing walker tests started failing because the `spawn()` helper didn't mark cells as walkable — the new `isAvailable` pre-check returned false on every `followPath`. Updated `spawn()` to mark every grid cell as walkable. New tests for collision behaviour use that same baseline and add specific occupants where needed.
- WanderBehaviour subscribes to `"blocked"` with the *same* handler reference as `"arrived"` — keeps the handler-tracking simple (one variable, one off-call sequence). The behaviour doesn't need to distinguish "arrived because I finished" from "arrived because I bonked"; both end the trip and need a fresh kick after the idle countdown.

---

## Task 4: `Walker.teleportTo` + `"displaced"` event

### Objective

Add `walker.teleportTo(cx, cz)` for the displacement scenarios (decor lands on a walker; chaos barrel lands on a walker). Emits `"displaced"`. WanderBehaviour subscribes to `"displaced"` with the same handler as `"arrived"` and `"blocked"`.

### Expected Outcomes

- `walker.teleportTo(cx, cz)` snaps `object3D.position` to the cell's world centre, clears `currentPath`, resets `pathIndex`, transitions Animator to `idle`, updates occupancy via `registerOccupancy`, sets `completed = true`, emits `"displaced"`.
- WanderBehaviour subscribes to `walker.displaced` (in addition to `arrived`/`blocked`); handler is the same — schedule next trip after idle.
- Demo (manual): in dev console, find a minion entity and call `entity.getComponent(Walker).teleportTo(5, 5)` — minion teleports, idles briefly, walks again.

### Risks / Constraints

- `teleportTo` assumes the target cell is free (occupancy-wise). Caller (decor placement, chaos controller) is responsible for using `findClosestAvailable` to pick a free cell. Walker doesn't double-check.
- Should clear `currentPath` completely so `update` doesn't accidentally resume from a stale `pathIndex`.
- If walker was mid-leg when teleported, `crossfadeAnimator` should switch to idle immediately (`update` would otherwise do this on next tick once `completed` is true; explicit call is defensive).

### Steps

- [*] Bump `VERSION` to `V3_4_0`.
- [*] Add `walker.teleportTo(cx, cz)` method to `Walker`: sets `object3D.position` from `grid.cellToWorld(cx, cz)`, calls `registerOccupancy(cx, cz)`, clears `this.path = []` and `this.pathIndex = 0`, sets `this.completed = true`, calls `crossfadeAnimator("idle")`, emits `"displaced"` with `{ walker: this }`.
- [*] In `WanderBehaviour.onAddedToWorld`, also subscribe to `walker.on("displaced", this.arrivedHandler)`.
- [*] In `WanderBehaviour.onRemovedFromWorld`, also `walker.off("displaced", ...)`.
- [*] Update `tests/world/components/walker.test.js`: `teleportTo` snaps position + clears path + emits `"displaced"` + updates occupancy.
- [*] Update `tests/world/components/wander-behaviour.test.js`: `walker.displaced` triggers repath.
- [*] Run `npm test`.
- [*] Verify in browser: open dev console; pick a minion via `[...App.world.entities].find(e => e.kind === "character.skeleton.minion")`; call `.getComponent(Walker).teleportTo(5, 5)`. Minion appears at cell (5, 5) in idle pose, then schedules a new trip.

### Decisions

<!-- Filled in during execution. -->

---

## Task 5: Decor placement teleports occupants

### Objective

`decor.js`'s `placeFloorDecor` checks for occupants at the target cell before final placement. If a Walker entity is present, displaces it to the closest free cell via `findClosestAvailable` + `walker.teleportTo`. PLAYER_MARKER handling lands in Task 6.

### Expected Outcomes

- `addBarrel` / `addCrate` route through the updated `placeFloorDecor`.
- When the target cell already has an occupant (Walker entity): `findClosestAvailable` selects a free cell, the occupant is teleported, the decor is then placed.
- If no free cell exists (BFS exhaustion): `console.warn`, skip placement, occupant stays put, no decor placed.
- Tests cover: empty-cell-place-normally; occupied-by-walker triggers teleport; no-free-cell warns and skips.
- Functional demo deferred to Task 7 (ChaosController exercises this end-to-end).

### Risks / Constraints

- `placeFloorDecor` has only ever been called at boot before any minions exist, so the existing path was never exercised against an occupant. Tests need to cover the new branch.
- The `getOccupant` value can be either an Entity (with `getComponent`) or `PLAYER_MARKER` (Task 6) or some future occupant kind. For V3 Task 5, only handle the Entity case; the marker case is added in Task 6 alongside the FP camera changes.
- Walker import in `decor.js` is unavoidable for the `getComponent(Walker)` call. This is a one-direction dependency — fine for V3.

### Steps

- [*] Bump `VERSION` to `V3_5_0`.
- [*] In `scripts/modules/world/builders/decor.js`'s `placeFloorDecor`: after the existing `floorCells.has` check, also check `grid.getOccupant(cx, cz)`. If non-null:
    - Call `grid.findClosestAvailable(cx, cz, occupant)`. If null → `console.warn` + return null.
    - If `occupant` has `getComponent` (i.e. is an Entity): grab its `Walker` and call `walker.teleportTo(free.cx, free.cz)`.
    - (Future) If `occupant === PLAYER_MARKER`: handled in Task 6.
    - (Else) `console.warn` about unrecognised occupant type and return null.
- [*] Update `tests/world/builders/decor.test.js`: place-on-walker calls `findClosestAvailable` + `walker.teleportTo`; place-with-no-free-cell warns and skips.
- [*] Run `npm test`.
- [*] Verify: tests pass; functional verification deferred to Task 7.

### Decisions

- `findClosestAvailable` is called **without** `excludeOccupant` here, deviating from the plan's wording. With `excludeOccupant = occupant`, the BFS treats the contested cell as available and returns it — walker "displaces" to its current spot, decor places, both end up registered together. Passing no exclude makes BFS skip the contested cell (correctly, since it's occupied) and return the nearest empty cell. The plan's wording was wrong; the implementation does what the plan *intended*.
- Non-Entity occupant case (where `occupant === PLAYER_MARKER` from Task 6 or any future marker type) refuses placement with a warning rather than silently overwriting state. Task 6 will add a `world.playerDisplaceHandler` callback, and that branch will route into it.
- Non-Walker entity occupant case (defensive — no current production path produces this) also refuses placement to avoid stranding entities the displacement code can't handle.

### Decisions

<!-- Filled in during execution. -->

---

## Task 6: First-person player presence + decor handling for `PLAYER_MARKER`

### Objective

`FirstPersonCamera` registers a sentinel `PLAYER_MARKER` in `grid.occupants` on cell change while active; clears on `deactivate`. Decor placement (Task 5) extends to handle the marker case by routing through a `world.playerDisplaceHandler` callback registered by `App` against the FP camera's teleport method.

### Expected Outcomes

- New module `scripts/modules/engine/player-marker.js` exporting `PLAYER_MARKER` (a unique `Symbol`).
- `FirstPersonCamera` accepts a `grid` reference (constructor option), tracks the camera's current cell, registers / clears `PLAYER_MARKER` on cell change while active, clears on `deactivate`.
- `FirstPersonCamera.teleportPlayer(cell)` snaps the camera position to the cell's world centre and updates occupancy.
- `World` gains an optional `playerDisplaceHandler` field. `App` sets it after wiring cameras: `world.playerDisplaceHandler = (free) => fpCamera.teleportPlayer(free)`.
- `decor.js`'s `placeFloorDecor` handles `occupant === PLAYER_MARKER` by calling `world.playerDisplaceHandler(free)` (warns + skips if no handler set).
- Demo: enter FP mode (`Tab`), walk to a known cell, run a manual barrel-drop on that cell via dev console — camera teleports.

### Risks / Constraints

- FP camera's `update` runs every frame but cell change is infrequent — only update occupancy when the worldToCell result changes (track `lastCellKey`).
- `FirstPersonCamera` doesn't currently have a `deactivate` hook for clearing state — verify the camera-controller base class has one or add the override.
- If FP mode isn't active and a barrel is dropped on the player's "last seen" FP cell, no displacement should happen (the marker should already be cleared on `deactivate`).
- Coupling of `World` to a `playerDisplaceHandler` callback is pragmatic, not architectural. Acceptable for V3; revisit if it grows.

### Steps

- [*] Bump `VERSION` to `V3_6_0`.
- [*] Create `scripts/modules/engine/player-marker.js` exporting `PLAYER_MARKER = Symbol("PLAYER")`.
- [*] Modify `FirstPersonCamera` constructor to accept a `grid` option (or a setter). Add `this.lastCellKey = null` field.
- [*] In `FirstPersonCamera.update` (or `frameUpdate`): compute `grid.worldToCell(camera.position.x, camera.position.z)` and its key. If different from `lastCellKey`: clear old (if any) via `grid.clearOccupant`, register new via `grid.setOccupant(cx, cz, PLAYER_MARKER)`, update `lastCellKey`.
- [*] Add `FirstPersonCamera.deactivate` override (or extend existing) to clear `lastCellKey` cell from occupants and null `lastCellKey`.
- [*] Add `FirstPersonCamera.teleportPlayer(cell)` that snaps `camera.position` to `grid.cellToWorld(cell.cx, cell.cz)` (Y stays at the eye-level constant) and updates occupancy.
- [*] In `App.buildCameraControllers`, pass `world.grid` to `FirstPersonCamera`.
- [*] In `App` after building cameras: `this.world.playerDisplaceHandler = (free) => this.cameraControllers.firstPerson.teleportPlayer(free);` (wherever the world is fully wired).
- [*] In `decor.js`'s `placeFloorDecor`: add the `occupant === PLAYER_MARKER` branch — calls `world.playerDisplaceHandler(free)` if set; otherwise warns + skips.
- [*] Update `tests/world/builders/decor.test.js`: stub `world.playerDisplaceHandler` and verify it's called with the free cell when placing on `PLAYER_MARKER`.
- [*] Run `npm test`.
- [*] Verify in browser: enter FP mode (`Tab`), walk to a cell. In dev console, find that cell via `App.cameraControllers.firstPerson.lastCellKey`. Call `DecorBuilder.addBarrel(App.world, App.assets, cx, cz)` at that cell. Camera teleports to a free neighbouring cell, barrel appears.

### Decisions

- `active` flag added to `FirstPersonCamera` (separate from `pointerLocked` which is about the mouse). `syncOccupancy` is called from `frameUpdate` only when `active`, and from `activate`/`deactivate` for the initial register / final clear. Avoids leaving phantom `PLAYER_MARKER` registrations when the camera is swapped out for Builder mode.
- `clearOccupancy` checks that the cell's current occupant is still `PLAYER_MARKER` before clearing — defensive against the case where decor placement displaced the player elsewhere and registered the new cell, while the old `lastCellKey` still pointed at the original cell. Without the check we'd risk clearing some other occupant's claim.
- `world.playerDisplaceHandler` is set inside `buildCameraControllers` rather than a separate wiring step. The handler has to be set after both `world.grid` and `cameraControllers.firstPerson` exist; the camera controllers method is the natural seam.
- Decor placement's occupant dispatch is now an `if/else if/else` chain: `PLAYER_MARKER` first, Entity case second, fallback `console.warn` last. The non-Walker entity branch (Task 5 deviation) and the unrecognised-type branch (defensive) both refuse placement.

### Decisions

<!-- Filled in during execution. -->

---

## Task 7: `ChaosController` — barrels teleport on walker arrival

### Objective

A small `ChaosController` subscribes to all spawned walkers' `arrived` / `blocked` / `displaced` events. On each event (rate-limited), it picks one of the designated chaos barrels and teleports it to a random walkable cell — routing through the same decor placement displacement code path so a chaos barrel landing on a minion triggers that minion's BFS displacement.

### Expected Outcomes

- New `scripts/modules/world/chaos-controller.js` exporting `ChaosController`.
- Constructor takes `{ world, walkers, chaosBarrels, cooldownMs = 1500 }`. Subscribes to each walker's `arrived` / `blocked` / `displaced` events.
- On any trip-end event: if cooldown elapsed, pick one random chaos barrel + one random walkable cell, relocate the barrel via the helper (which itself triggers occupant displacement if the destination has a walker).
- `App.buildWorld` (or post-spawn): instantiate `ChaosController` with the spawned minions' walker components and the chaos-flagged barrel entities.
- `DECOR_LAYOUT` entries gain an optional `chaos: true` flag; entries with the flag are tracked separately by `App` and passed to `ChaosController`. Default is 3 chaos barrels.
- Browser: chaos barrels visibly teleport around the room as minions complete trips. Occasionally a barrel lands on a minion → that minion teleports out → chain of activity.
- Tests cover: cooldown rate-limit; subscription to all three event types; relocate calls grid clear/set + entity position + displacement when needed.

### Risks / Constraints

- Relocating an existing decor entity is different from adding a fresh one. Need a helper (in `decor.js` or `chaos-controller.js`) — `relocateDecor(world, entity, newCx, newCz)` — that clears the old `blockedCells` entry, runs the placement-on-occupied-cell check at the new cell, sets the new `blockedCells` entry, and updates the entity's `object3D.position`.
- If the random walkable cell is the SAME as the chaos barrel's current cell: no-op (cheap to check before clear/set).
- Chaos barrels remain `GridPlacement(blocks: true)` — their cell is in `blockedCells`. When teleporting, `clearBlocked` then `setBlocked` keeps the grid in sync.
- Visually distinguishing chaos barrels from static barrels is out of scope for V3 (open question in design). User identifies them by motion.
- All four spawned minions emit events — many subscribers fire often. Cooldown keeps the actual teleport rate manageable.

### Steps

- [*] Bump `VERSION` to `V3_7_0`.
- [*] Add a `relocateDecor(world, entity, newCx, newCz)` helper in `scripts/modules/world/builders/decor.js` (or a new sibling module): no-op if same cell; otherwise clear old `blockedCells`, run the occupant displacement check at new cell (same logic as `placeFloorDecor`), set new `blockedCells`, update `entity.object3D.position` from `grid.cellToWorld`. Returns true on success, false if BFS exhaustion blocked the move.
- [*] Create `scripts/modules/world/chaos-controller.js` exporting `ChaosController`. Constructor takes `{ world, walkers, chaosBarrels, cooldownMs = 1500 }`. Subscribes to each walker's `arrived` / `blocked` / `displaced` events with one shared handler.
- [*] Handler: if `Date.now() - lastFiredAt < cooldownMs` → return. Otherwise pick `chaosBarrels[Math.floor(Math.random() * chaosBarrels.length)]`, pick a random walkable cell from `grid.walkableCells()`, call `relocateDecor`, update `lastFiredAt`.
- [*] Add `dispose()` method that unsubscribes from all walkers (defensive for hot-reload scenarios).
- [*] Update `DECOR_LAYOUT` in `scripts/app.js`: add 3 entries with `chaos: true`. Could be `{ kind: "decor.barrel", cx, cz, chaos: true }`.
- [*] In `App.placeDecor`: when a layout entry has `chaos: true`, push the resulting entity into `this.chaosBarrels` (new `App` field). Otherwise normal static decor.
- [*] In `App.buildWorld` after `spawnMinion` loop: `this.chaosController = new ChaosController({ world: this.world, walkers: this.minions.map(m => m.getComponent(Walker)), chaosBarrels: this.chaosBarrels })`. (Track spawned minions in `this.minions` if not already.)
- [*] In `App.shutdown` if applicable: `this.chaosController?.dispose()`.
- [*] Add `tests/world/chaos-controller.test.js` with stub walkers (using `Emitter`) + stub chaos barrels: subscribes to all three events; cooldown rate-limits; teleport call goes through `relocateDecor` (mocked); picks a random chaos barrel (deterministic via `Math.random` mock).
- [*] Run `npm test`.
- [*] Verify in browser: 4 minions wander; 3 chaos barrels visibly teleport around as minions arrive at destinations; occasionally a barrel lands on a minion and that minion teleports out (often followed by another chaos teleport since the displaced minion's repath ends, etc).

### Decisions

- Extracted a shared `displaceOccupantAt(world, cx, cz, kindForLog)` helper in `decor.js` so both `placeFloorDecor` (new placement) and `relocateDecor` (chaos / move) use the same dispatch logic. Returns `true` if displacement succeeded (or was unnecessary), `false` if the operation should be skipped.
- `ChaosController.lastFiredAt = -Infinity` (not `0`) — guarantees the first walker event always fires regardless of clock value at construction time. Setting it to `0` would suppress the first event whenever `now() < cooldownMs`.
- Constructor accepts an injectable `now` function (default `() => Date.now()`) so tests can use a virtual clock to exercise cooldown timing deterministically without `setTimeout` or fake timers.
- `relocateDecor` mutates `GridPlacement.cx` / `.cz` directly — slightly non-encapsulated. Documented inline; a `GridPlacement.moveTo(cx, cz)` method would be cleaner if there were more callers, but at one site it's overkill.
- `relocateDecor` rejects moves where the new cell isn't a floor cell, with a warning. Catches "chaos picked an OOB cell" type bugs early.
- 3 chaos barrels added to `DECOR_LAYOUT` at `(2, 3)`, `(7, 6)`, `(3, 8)` — visually distinct from the static decor cluster (NW barrels, central crates) and spread across the room. No visual differentiation from static barrels (open question 4 in the design — V3 doesn't bother; user identifies chaos barrels by their motion).
- `App.shutdown` disposes the chaos controller before camera deactivation. The order matters less than the fact of disposal — without it, hot-reloads in dev mode could accumulate stale walker subscriptions.

### Decisions

<!-- Filled in during execution. -->

---

### Notable Deviations from Design

<!-- Filled in during execution. -->

---

### Issues and Adjustments

- **Spawned-walker ghost-cell bug** (caught during Task 4 browser verify): a walker spawned via `App.spawnMinion` had a position but wasn't registered in `grid.occupants` until its first `followPath` call (~1s later, after the WanderBehaviour idle). During that gap, other walkers' pre-checks saw the spawn cell as empty and walked through the unregistered minion — visible as occasional clip-through. **Fix**: `Walker.onAddedToWorld` now auto-registers occupancy at the entity's current world cell (if in bounds) when there's no `pendingFollow` to handle. Closes the gap; tests stay green.
- **Dev-console can't see component classes**: `entity.getComponent(Walker)` requires a reference to the `Walker` class, but ES module imports don't leak to global scope. **Fix**: added `App.types = { Walker, Animator, WanderBehaviour }` so dev-console use is `entity.getComponent(App.types.Walker)`. Also added `App.minions = []` populated during `spawnMinion` so finding a minion is `App.minions[0]` rather than a `[...App.world.entities].find(...)` dance.
- **Walker collision rewrite — boundary-crossing model** (replaces the earlier "arrival re-check + snap-back" attempt): the original arrival-time check missed the actual problem — walkers register their occupancy at cell *arrival* (centre), but the entity's physical position can be inside the next cell already (mid-stride past the boundary). During that window, occupancy is stale: the walker is "physically here, registered there", and other walkers' pre-checks see the wrong state, leading to two walkers being inside the same cell briefly and visible clip-through. The previous fix attempts (look-ahead on next leg, snap-back on arrival re-check) treated symptoms — they introduced false-positive blocks (walkers stopping with no visible obstacle) and visible snap-back motion. **Fix**: rewrite `Walker.update` so the cell-availability check fires the moment the walker's predicted next position would land in a *different* cell. The walker registers occupancy on cell *entry* (boundary crossing), and pre-checks only the immediately-next cell (no look-ahead beyond it). If the entry pre-check fails, the walker doesn't advance into the contested cell — position stays put just shy of the boundary, walker emits `"blocked"`, walker is still aligned with its registered cell. No snap-back needed. Also removed `followPath`'s pre-checks on `path[1]` (fresh) and `path[pathIndex]` (restored) — the first update tick's boundary-cross check covers both. Two new tests assert no-look-ahead and that position never advances into a contested cell on block.
- **Pathfinder considers occupants — design deviation** (caught from "all minions stuck" symptom): the original design said the pathfinder uses `Grid.isWalkable` only and minion-vs-minion is collision-time only. In practice this caused a deadlock cycle — pathfinder kept returning paths *through* cells already occupied by other walkers, walkers blocked at the cell boundary, idled, repathed, got the same path again, ad infinitum. Net progress: zero. **Fix**: pathfinder now uses `Grid.isAvailable` and accepts an optional `excludeOccupant`. WanderBehaviour passes `this.entity` so the walker's own cell is considered available but other walkers' cells are not. Plan-time paths now route around current occupants. Runtime collision detection still catches the case where a cell becomes occupied between trip-plan and trip-end. The design's stated reason for ignoring occupants was avoiding *reactive* repathing on every event — plan-time occupant lookup doesn't violate that (each walker only consults occupants when it picks a new trip). Two new pathfinder tests cover the new behaviour.
- **`pickTarget` excludes occupied cells**: WanderBehaviour was rolling random destinations from `walkableCells()` without filtering, sometimes picking a cell currently held by another walker. Pathfinder then returned `null` (target unavailable), burning a retry slot. With 4 walkers in a small room this triggered the retry-exhausted path more than expected, leaving walkers idle for long stretches. Fix: filter candidates by `getOccupant(c) === null || === self` before the distance filter.
- **`dist <= ARRIVE_EPSILON` no longer defers indefinitely**: defensive change against degenerate paths (e.g. duplicate consecutive cells) that could leave a walker stuck animating "walk" forever. Now advances `pathIndex` (or completes the trip) rather than returning early.
- **No more snap-on-followPath when walker is already in `path[0]`'s cell** (caught from "snap back several tiles" — half a cell is 2m, the user reads that as "huge"): `Walker.followPath` no longer auto-snaps to the start cell's centre when the walker is already physically inside that cell. It just registers occupancy at `path[0]` and faces `path[1]`. Walker walks naturally from current position to `path[1]`'s centre (slight diagonal if started off-centre, but no visible jump). Falls back to a snap if the walker is somehow not in `path[0]`'s cell (defensive). Two existing tests that assumed cell-centre auto-snap were updated to position the entity at the centre explicitly.
- **Smooth withdrawal on collision instead of stop-at-boundary** (caught from "two minions can be embedded in each other if they are both right up against the edge"): walkers blocking on opposite sides of a cell boundary stopped at positions like `15.999` and `16.001` — each legally inside their own cell, but ~1m wide meshes overlapping visually. Fix: when a cross-cell pre-check fails, walker checks how far it is from `currentCell`'s centre. If within a `MESH_BUFFER = 1m` radius (close enough that meshes can't visually overlap with anything in adjacent cells), block immediately as before. Otherwise, replace the user-supplied path with a single-cell mini-path back to the centre, set a `withdrawing` flag, and let the existing path-follow logic walk the walker home. On reaching centre, `completePath` emits `"blocked"` (rather than `"arrived"`) and clears the flag. Effect: two walkers approaching head-on each withdraw to their respective cell centres, ending up a full cell apart with no mesh overlap. Three new diagnostics also installed: a red diagnostic GridHelper on the floor for tile-boundary visibility, a per-frame `worldToCell(position) !== currentCell` drift warning, and `App.diagnoseWalkers()` for on-demand state dumps. Two new tests cover the withdraw-then-block flow and the at-centre block-immediately flow.
- **WanderBehaviour self-rescue when stuck on a non-walkable cell** (caught from manual `teleportTo` test landing on a decor cell): `Pathfinder.findPath` rejects start cells where `isAvailable` is false (e.g. teleported onto decor). With no path generated, the walker would idle forever. **Fix**: at the top of `kickTrip`, check whether the walker's current cell is available. If not, call `findClosestAvailable` and `walker.teleportTo` the result. The `displaced` event re-triggers the schedule loop, so the walker resumes wandering from the rescued cell. In normal play this can't happen (real `teleportTo` callers — decor placement in Task 5, chaos in Task 7 — pre-pick a free cell via `findClosestAvailable`); the self-rescue is a safety net for dev-console use and any future bugs that drop a walker on bad terrain. One new test covers the rescue flow.
- **Player avatar + collision** (V3.8 follow-up; bumped VERSION to `V3_8_0`). Two related shortcomings caught during V3 verify: (1) the player had no visual presence in the world and (2) WASD movement walked freely through decor. **Fix**: `App.spawnPlayer` creates a player Entity (`Renderable + Animator`, no Walker / WanderBehaviour) at `PLAYER_SPAWN_CELL` (currently `(2, 2)`) and registers `PLAYER_MARKER` at that cell. `FirstPersonCamera` now takes a `playerEntity` option and: snaps to the entity's position on `activate`, hides the entity's mesh while active, shows it again on `deactivate`, and on `fixedUpdate` walks the camera (per-axis, with collision via the new `isBlocked` callback option), syncs the entity to follow, and updates the marker. `pickMinionSpawnCells` now filters out cells with any occupant so wandering minions never spawn on top of the player. The chaos / decor-placement displacement path already routed through `world.playerDisplaceHandler` → `FirstPersonCamera.teleportPlayer`; that method now also moves the player entity. Effect: player has a visible body in Builder view, snaps back into it when toggling to FP. Walking through other minions still permitted (occupants aren't checked for collision — by design, matches typical games).
- **Player uses Mannequin model + mesh-radius decor collision** (V3.8 refinement caught during V3.8 verify). Two changes: (a) `PLAYER_KIND` switched from `character.skeleton.minion` to `character.mannequin.medium` (a new manifest entry pointing at `assets/kaykit/character-animations/characters/gltf/Mannequin_Medium.glb` — Rig_Medium-compatible, so the same `MINION_CLIPS` map works). The player is now visually distinguishable from wandering minions in Builder view. (b) Cell-based decor collision was too coarse — cells are 4m, decor footprints are ~1m, so "this cell has a barrel" wrongly forbade the entire cell. Replaced with a hybrid `App.isPlayerBlocked(x, z)` callback wired into `FirstPersonCamera` via a new `isBlocked` constructor option: walls / non-floor cells still block (the player can't walk off the room), but decor is now a **circle-vs-circle check** with `PLAYER_RADIUS = 0.5` and `DECOR_RADIUS = 0.7`. Player can enter a cell containing decor as long as their circles don't overlap (~1.2m collision distance from decor centre). FP camera's default `isBlocked` fall-through stays as the cell-based check for backward compatibility / standalone use without the callback.
- **Wall mesh-clipping fix + slide-around-decor** (V3.8 final pass). Two improvements caught during V3.8 verify: (a) the wall collision was a centre-cell check, so the player's mesh visibly clipped past the wall when standing right at the cell boundary. **Fix**: bbox check — every cell the player's bounding box (`PLAYER_RADIUS` in each direction) overlaps must be a floor cell. Player now stops `PLAYER_RADIUS` short of any wall, mesh stays inside the room. (b) Per-axis decor blocking felt janky against round obstacles (stop-and-start when grazing a barrel). **Fix**: replaced `App.isPlayerBlocked` with `App.resolvePlayerCollision(currentX, currentZ, desiredX, desiredZ) → {x, z}` and the FP camera's `isBlocked` constructor option with `resolveCollision`. The new resolver does per-axis wall clamping first (sliding along axis-aligned walls) then **circle depenetration** for each blocking decor (player pushed tangentially around the obstacle along the line from decor centre to player). Final wall re-check reverts the decor push if it would put the player into a wall (rare edge case where decor is hugging a wall — player will appear to stick momentarily but never clips). Effect: walking into a barrel now slides the player around it WoW-style instead of stopping dead, and walls are mesh-tight.
- **PropertyBinding warnings on Mannequin load suppressed**: KayKit's Rig_Medium animation clips include tracks for `handslotr` / `handslotl` (weapon-attachment slots). The Skeleton_Minion has those bones; the Mannequin doesn't. `THREE.AnimationMixer.clipAction(clip)` would warn ("No target node found for track: handslotr.position", ...) on every load. **Fix**: `Animator.onAddedToWorld` now passes each clip through `filterClipForRoot(clip, root)` before handing it to `clipAction`. The filter clones the clip with only the tracks whose `parsed.nodeName` resolves to a node in the entity's hierarchy via `THREE.PropertyBinding.findNode`. Cheap (no keyframe-data duplication, just a track list filter), per-mount (each entity's clip-action sees only the tracks it can actually drive). Defensive `Array.isArray(clip.tracks)` check at the top so test stubs (`{ name: "Idle" }` without a `tracks` array) pass through unchanged.
