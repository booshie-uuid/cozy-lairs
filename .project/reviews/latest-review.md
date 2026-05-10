# Code Review V3.8.0

Scope: V3 work (Tasks 1–7 in [plan-v3.md](../plans/plan-v3.md)) plus the V3.8 follow-up bundle. Files reviewed:

- `scripts/modules/world/grid.js` (new methods: `isAvailable`, `findClosestAvailable`)
- `scripts/modules/world/components/walker.js`
- `scripts/modules/world/components/wander-behaviour.js`
- `scripts/modules/world/components/animator.js` (V3.8 `filterClipForRoot`)
- `scripts/modules/world/builders/decor.js`
- `scripts/modules/world/chaos-controller.js`
- `scripts/modules/engine/pathfinding/pathfinder.js`
- `scripts/modules/engine/cameras/first-person-camera.js`
- `scripts/modules/engine/player-marker.js`
- `scripts/app.js` (V3 wiring, V3.8 player + collision)
- Corresponding test files under `tests/`

Tests at time of review: 279 / 279 passing.

Overall: the core V3 collision model is sound and well-tested. The decision register in `plan-v3.md` does an unusually good job of capturing the mid-task pivots (boundary-crossing model, smooth withdrawal, pathfinder occupant-awareness, V3.8 player + collision). Most findings below are coherence sharp-edges around the player-marker / walker-occupancy interaction, log-spam risk in diagnostics, and small encapsulation slips. Nothing critical.

---

## CRITICAL FINDINGS

_None._

---

## HIGH FINDINGS

### Finding 1: FP camera marker write clobbers walker occupancy without conflict handling

[first-person-camera.js:265-281](../../scripts/modules/engine/cameras/first-person-camera.js#L265-L281) — `syncMarker()` unconditionally calls `grid.setOccupant(cell.cx, cell.cz, PLAYER_MARKER)` whenever the camera crosses into a new cell. There is no pre-check against the destination's existing occupant.

Walking-through-walkers is documented as intentional (`walkers don't block the player — by design, walking through minions is fine`, [first-person-camera.js:35-36](../../scripts/modules/engine/cameras/first-person-camera.js#L35-L36)). But the `setOccupant` call silently overwrites whichever walker entity reference was registered there. Three knock-on effects:

1. The displaced walker's `currentCell` pointer ([walker.js:60](../../scripts/modules/world/components/walker.js#L60)) still points at the cell it no longer "owns" in the grid. Its next `update` tick triggers the drift warning ([walker.js:201-212](../../scripts/modules/world/components/walker.js#L201-L212)) — see Finding 2 for the spam consequences.
2. When the player walks back out of that cell, `clearMarker()` ([first-person-camera.js:283-292](../../scripts/modules/engine/cameras/first-person-camera.js#L283-L292)) deletes the `PLAYER_MARKER` and the cell becomes "empty" in the grid — but the walker is still physically there. A third walker pathfinding through that cell will plan a route through it, and its boundary-cross pre-check will pass (cell is `isAvailable`), so it walks straight onto the original walker. Brief multi-occupancy until the original walker's next `registerOccupancy` call.
3. `Walker.registerOccupancy` ([walker.js:401-406](../../scripts/modules/world/components/walker.js#L401-L406)) emits a "overwriting occupant" diagnostic if it later re-registers a cell containing some other occupant. With marker clobbering as a normal flow, this warning fires routinely, blunting its diagnostic value.

Walking through walkers is fine; the silent state corruption around it is not.

#### Recommended Remediations/Controls
- [ ] Pre-check `grid.getOccupant(newCell)` in `syncMarker`. If non-null and not already `PLAYER_MARKER`, skip the write — the player passes through without claiming the cell. Only set the marker on truly empty cells.
- [ ] Document the new contract in [first-person-camera.js:25-30](../../scripts/modules/engine/cameras/first-person-camera.js#L25-L30): "PLAYER_MARKER is only written to cells the player exclusively occupies. While transiting another walker's cell, no marker is written and no displacement is triggered against the player."
- [ ] Add a test in `tests/engine/cameras/` (new file) or in `decor.test.js` exercising the player-walks-into-walker-cell case.

---

## MEDIUM FINDINGS

### Finding 2: `Walker.update` drift warning is per-frame, will spam the console

[walker.js:201-212](../../scripts/modules/world/components/walker.js#L201-L212) — once any walker's physical cell drifts away from its registered cell, `console.warn` fires at the simulation tick rate (60Hz with the default GameLoop). A few seconds of drift fills the dev-console ring buffer with the same message and crowds out everything else (the buffer is fixed-size per [`CLAUDE.md` → "Dev console"](../../.claude/CLAUDE.md)).

The warn was added during the V3 collision debugging cycle (per the plan deviations note) and is genuinely useful as a signal — but it should fire once per drift episode, not per frame. Combined with Finding 1, every player-through-walker pass-through can cause a sustained burst.

#### Recommended Remediations/Controls
- [ ] Throttle to one log per drift episode: track `this.driftWarned` and only warn on the transition from "matches" to "doesn't match". Reset when alignment is restored.
- [ ] Consider gating behind a debug flag (`?debug=1` or a dev-console toggle) so production builds stay quiet — the diagnostic is invaluable when hunting bugs and noise otherwise.

---

### Finding 3: `WanderBehaviour.kickTrip` self-rescue can loop silently

[wander-behaviour.js:111-133](../../scripts/modules/world/components/wander-behaviour.js#L111-L133) — when the walker is on a non-walkable cell and `findClosestAvailable` returns `null`, the code falls through to `scheduleNextTrip()` with no warning. Every subsequent idle expiry will re-enter `kickTrip`, fail the same check, schedule again — forever, silently.

In practice the trigger is exotic (entire walkable set occupied), but with chaos teleporting decor onto the player and onto walkers continuously, edge cases can arise (e.g. a walker temporarily wedged between a chaos barrel and the player on a small grid). With no surfaced warning, debugging requires reading the source.

The comment acknowledges "extremely unlikely" but doesn't log; the equivalent placement-skip path in `decor.js` ([decor.js:108-110](../../scripts/modules/world/builders/decor.js#L108-L110)) does log. Consistency would help.

#### Recommended Remediations/Controls
- [ ] Add a one-shot `console.warn` at [wander-behaviour.js:131](../../scripts/modules/world/components/wander-behaviour.js#L131) along the lines of `[WanderBehaviour] ${this.entity.kind} stuck on non-walkable (${cx}, ${cz}) — no free cell found, will retry next tick.` Use a `this.rescueWarned` latch so it doesn't spam.
- [ ] Add a vitest case covering the "no free cell" branch (currently uncovered by [wander-behaviour.test.js:236-257](../../tests/world/components/wander-behaviour.test.js#L236-L257), which exercises the success branch only).

---

### Finding 4: `world.playerDisplaceHandler` is an unencapsulated bare property

[app.js:455](../../scripts/app.js#L455) sets `this.world.playerDisplaceHandler = (cell) => …`; [decor.js:114-119](../../scripts/modules/world/builders/decor.js#L114-L119) reads `world.playerDisplaceHandler` and calls it. There is no setter, no documentation in `World`, no guard against multiple registrations, and no public interface — it's entirely a backchannel between two modules tied together by a string ("playerDisplaceHandler") that World never declares.

Per [`.claude/rules/coding-style.md` → Encapsulated Mutation](../../.claude/rules/coding-style.md): "Only an object should be allowed to modify its own internal state." `World` is having a field smuggled into it from `App` and read by `decor.js`. The plan-v3 Task 6 decision register acknowledges this is "pragmatic, not architectural" — but pragmatism without encapsulation rots fast.

The same pattern in V3 — events flowing through Emitter for any cross-module notification, callbacks installed via explicit setter — already exists everywhere else.

#### Recommended Remediations/Controls
- [ ] Add an explicit `World.setPlayerDisplaceHandler(fn)` method that validates `typeof fn === "function"` and stores it. Remove the bare-property write from `App`.
- [ ] Document the contract in `world.js` next to the field declaration: "Optional callback invoked when decor placement / chaos teleport lands on the player marker. Receives `{cx, cz}` of the closest available cell."
- [ ] Alternative: model this as a topic-scoped emitter (`world.events.on("playerDisplaced", ...)`) per the [`CLAUDE.md` → Eventing](../../.claude/CLAUDE.md) escalation pattern. Heavier than a callback but consistent with the rest of the codebase.

---

### Finding 5: `relocateDecor` mutates `GridPlacement.cx` / `.cz` directly

[decor.js:81-88](../../scripts/modules/world/builders/decor.js#L81-L88) — the inline comment notes this is a deliberate encapsulation slip. The slip is small; the fix is small.

Per [`.claude/rules/coding-style.md` → Encapsulated Mutation (CRITICAL)](../../.claude/rules/coding-style.md): "External logic must call methods rather than modifying properties directly." This is exactly the case the rule warns against. The justification in the comment ("the fields are otherwise inert after construction; toJSON round-trips the updated values correctly") is true today but ages poorly — anything someone adds to `GridPlacement` that depends on construction-time `cx`/`cz` consistency (cached world-coords, listener subscriptions, etc.) will silently break.

#### Recommended Remediations/Controls
- [ ] Add `GridPlacement.moveTo(cx, cz)` that updates `this.cx` / `this.cz`. (Current implementation needn't do anything else, but creating the method establishes the seam.)
- [ ] Replace the direct property writes in `relocateDecor` with `placement.moveTo(newCx, newCz)`.
- [ ] Remove the apologetic comment.

---

### Finding 6: `Walker.registerOccupancy` warns about overwrites but proceeds anyway

[walker.js:399-408](../../scripts/modules/world/components/walker.js#L399-L408) — when a cell is already occupied by something other than `this.entity`, the code emits a warning and then unconditionally calls `setOccupant`, clobbering the existing occupant.

The comment says "Pre-checks should make this impossible — if it ever fires, there's a race or pre-check bypass somewhere." Right — so why complete the operation? A genuine race or pre-check bypass means the resulting state is wrong; clobbering compounds it. Combined with Finding 1, this also means the FP camera's marker can be silently overwritten by a Walker's `registerOccupancy` if a walker's pre-check ever passes against PLAYER_MARKER (currently can't, because `isAvailable` rejects it — but the hard guarantee lives in `isAvailable`, not here).

#### Recommended Remediations/Controls
- [ ] Either: refuse the write when an existing non-self occupant is present, force the walker to re-evaluate (caller must decide to abort the move). Promote the warn to an error/throw to make the bug obvious.
- [ ] Or: keep the clobber but raise the warn level (call out the overwrite as a state-corruption event explicitly), and add a regression test that this branch is unreachable from production code paths.
- [ ] Worst-of-both-worlds (the current code) is the wrong choice — pick one.

---

### Finding 7: `Animator.filterClipForRoot` (V3.8) has no test coverage

[animator.js:127-140](../../scripts/modules/world/components/animator.js#L127-L140) — added in V3.8 to suppress PropertyBinding warnings on the Mannequin. The existing animator tests use stub clip objects (`{ name: "Idle" }`) with no `tracks` array, so the filter's `Array.isArray(clip.tracks)` early return ([animator.js:131](../../scripts/modules/world/components/animator.js#L131)) is the only branch exercised. The new clip-clone branch — where a track's `nodeName` doesn't resolve via `THREE.PropertyBinding.findNode` — has no coverage.

This is the very code that gates the user-visible "weird warnings on load" fix. If a future Three.js update changes `PropertyBinding.parseTrackName` semantics or `findNode` return values, tests won't catch it.

#### Recommended Remediations/Controls
- [ ] Add a test in [animator.test.js](../../tests/world/components/animator.test.js) that constructs a stub clip with mixed-binding tracks (some that resolve, some that don't) and an Object3D root with a known subset of named nodes. Assert the resulting clip's `tracks.length` excludes the unbindable ones.
- [ ] Cover the all-tracks-valid path (returns the original clip identity, no clone) and the some-tracks-invalid path (returns a new `THREE.AnimationClip` with the same `name` and `duration`).

---

## LOW FINDINGS

### Finding 8: `bboxHitsNonFloor` reaches into `grid.floorCells` directly

[app.js:529](../../scripts/app.js#L529) calls `grid.floorCells.has(grid.cellKey(cx, cz))`. The `Grid` class exposes `isWalkable` (which combines floor + blocker) but no public `isFloor` query. Per [coding-style.md → Encapsulated Mutation](../../.claude/rules/coding-style.md), reaching into `floorCells` from outside `Grid` is the same shape of violation as Finding 5.

The collision check needs floor-only semantics (it ignores decor, which is `blockedCells`) — that's a legitimate distinction. But it should go through a method, not a Set lookup.

#### Recommended Remediations/Controls
- [ ] Add `Grid.isFloor(cx, cz)` that wraps the bounds + `floorCells.has` check.
- [ ] Replace the direct lookup at [app.js:529](../../scripts/app.js#L529) with `grid.isFloor(cx, cz)`.

---

### Finding 9: `clearMarker` parses the cell key string instead of tracking the cell object

[first-person-camera.js:286](../../scripts/modules/engine/cameras/first-person-camera.js#L286) — `const [pcx, pcz] = this.lastCellKey.split(",").map(Number);` — this assumes the `cellKey` format `"cx,cz"`, which couples FP camera to Grid's internal serialisation. If `cellKey` ever returns a different shape (binary-packed integer for perf, e.g.), this breaks.

Cheap fix: store `this.lastCell = {cx, cz}` alongside (or instead of) `this.lastCellKey`. The key is only used for equality comparison, which `cx === oldCx && cz === oldCz` does just as well.

#### Recommended Remediations/Controls
- [ ] Replace `lastCellKey` (string) with `lastCell` ({cx, cz} or null). Update `syncMarker` and `clearMarker` to use object-equality / direct field access.

---

### Finding 10: Two-line alignment groups in `decor.js`

[decor.js:27-28](../../scripts/modules/world/builders/decor.js#L27-L28):
```javascript
const KIND_BARREL = "decor.barrel";
const KIND_CRATE  = "decor.crate";
```

Per [`.claude/rules/coding-style.md` → Aligned Columns](../../.claude/rules/coding-style.md): alignment requires "3+ consecutive lines, same shape". Two lines doesn't qualify; the pad is decoration here.

Same pattern in [pathfinder.js:24-25](../../scripts/modules/engine/pathfinding/pathfinder.js#L24-L25):
```javascript
const SQRT2 = Math.SQRT2;
const SQRT2_MINUS_1 = Math.SQRT2 - 1;
```
(no padding here — but unaligned would pass anyway, this one's already fine).

Cosmetic only.

#### Recommended Remediations/Controls
- [ ] Drop the trailing space in `KIND_BARREL = "decor.barrel";` and the extra space before `=` in `KIND_CRATE  =`. Plain single-space formatting.

---

### Finding 11: 5-key alignment in `App.buildCameraControllers` is borderline decorative

[app.js:443-450](../../scripts/app.js#L443-L450):
```javascript
this.cameraControllers.firstPerson = new FirstPersonCamera(this.input,
{
    lockTarget:        this.canvasWrapper,
    initialPosition:   playerStart,
    grid:              this.world.grid,
    playerEntity:      this.player,
    resolveCollision:  (cx, cz, dx, dz) => this.resolvePlayerCollision(cx, cz, dx, dz)
});
```

5 lines, same `key: value` shape — just inside the "3+ consecutive" rule. But the values are heterogeneous (DOM ref, Vector3, Grid, Entity, arrow function), so the alignment isn't really revealing structural rhythm — it's just lining up colons.

Per the [coding-style.md → Aligned Columns](../../.claude/rules/coding-style.md) example showing heterogeneous fields without padding, this is borderline. Reasonable people could disagree; flagging for consistency.

The same call's `BuilderCamera` literal three lines above ([app.js:433-437](../../scripts/app.js#L433-L437)) uses single-space — already inconsistent within the same method.

#### Recommended Remediations/Controls
- [ ] Drop the column padding on the FirstPersonCamera options block. Keep BuilderCamera as is.

---

### Finding 12: `App.shutdown` doesn't reset V3 state collections

[app.js:207-255](../../scripts/app.js#L207-L255) — `shutdown` does extensive teardown but leaves `this.minions`, `this.chaosBarrels`, `this.player`, `this.diagGrid`, `this.types` in their post-construction state. The bare property `this.world.playerDisplaceHandler` (Finding 4) also stays attached to a shutdown world.

In production this never matters (the App is a singleton with a one-shot lifecycle). But the pattern is sloppy: shutdown half-cleans, and any future re-`start` after shutdown would inherit zombie state. Hot-reload in dev mode is the most plausible trigger.

#### Recommended Remediations/Controls
- [ ] Null out `this.minions = null`, `this.chaosBarrels = null`, `this.player = null` in `shutdown`. Or, more thoroughly, reset to construction-time defaults (`this.minions = []`).
- [ ] Consider whether `shutdown` should also be safe to invoke before `start` completes (currently it is, by virtue of the `if(...)` guards on each disposal).

---

### Finding 13: `ChaosController.dispose` is incomplete cleanup

[chaos-controller.js:51-60](../../scripts/modules/world/chaos-controller.js#L51-L60) — sets `this.walkers = []` after unsubscribing, but leaves `this.tripEndedHandler`, `this.chaosBarrels`, and `this.world` referenced. The handler is the most relevant — it can still be invoked if the disposal happens to race with a queued walker event.

Trivial concern; included for completeness.

#### Recommended Remediations/Controls
- [ ] After the off-loop, set `this.tripEndedHandler = null`, `this.chaosBarrels = []`. Belt-and-braces.

---

### Finding 14: `resolvePlayerCollision` linearly iterates all entities every collision check

[app.js:485-507](../../scripts/app.js#L485-L507) — the decor depenetration loop iterates `this.world.entities` (currently a Set of ~100+ entities — walls, floors, decor, minions, player), calling `entity.getComponent(GridPlacement)` on each, then filtering by `placement.blocks`. Runs every `fixedUpdate` while the player is moving, so up to 60Hz × 100 = 6000 component lookups/sec while WASD is held.

Cheap in absolute terms (Map lookups), and the room has hard upper bounds on entity count (8×10 cells). But scales linearly with world size, and there are no benchmarks documenting it.

#### Recommended Remediations/Controls
- [ ] Consider an entity-by-component index in `World` (`this.entitiesByComponent.get(GridPlacement)` returns the subset). Out of scope for V3 — note for V4+ when world size grows.
- [ ] Alternative cheaper fix: walk a known list (`App.placeDecor` could push placed entities into a `this.placedDecor` array) rather than the full `world.entities` set. Reuses the existing `chaosBarrels` pattern.

---

### Finding 15: Inconsistent two-line guard formatting in `chaos-controller.js`

[chaos-controller.js:65-66](../../scripts/modules/world/chaos-controller.js#L65-L66):
```javascript
if(now - this.lastFiredAt < this.cooldownMs) { return; }
if(this.chaosBarrels.length === 0)            { return; }
```

The extra padding before the second `{ return; }` is cosmetic and doesn't reveal a meaningful pattern (different conditions, just both early-returns). Same per-call shape as the trailing two `walkable` checks just below — but those are unpadded ([chaos-controller.js:68-69](../../scripts/modules/world/chaos-controller.js#L68-L69)).

#### Recommended Remediations/Controls
- [ ] Drop the column padding; use plain single-space `{ return; }` on both.

---

### Finding 16: `world.entities` direct iteration in `resolvePlayerCollision` and `App.diagnoseWalkers`

[app.js:485](../../scripts/app.js#L485) and [app.js:752](../../scripts/app.js#L752) iterate `this.world.entities` directly. `World` doesn't expose an iteration helper. Same encapsulation theme as Findings 5 and 8 — `App` reaches into a Set field of `World`.

For-of iteration over a public Set is mild as encapsulation slips go. Pragmatic; flagging.

#### Recommended Remediations/Controls
- [ ] Optional: add `World.eachEntity(callback)` or expose entity iteration via a dedicated method. Low priority — `for (const e of world.entities)` is a common JS pattern and `entities` is genuinely an iterable collection that World owns.

---

## OBSERVATIONS — Design / Plan Adherence (no remediation required)

Documenting for completeness; these are deviations from the design that are correctly captured in the plan's deviations register, with implementations matching what the deviation notes describe.

- **Pathfinder considers occupants** — design said `isWalkable` only; implementation uses `isAvailable` with `excludeOccupant`. Documented at plan-v3.md "Issues and Adjustments" entry 4. Implementation in [pathfinder.js:48-56](../../scripts/modules/engine/pathfinding/pathfinder.js#L48-L56) and call sites in [wander-behaviour.js:144](../../scripts/modules/world/components/wander-behaviour.js#L144) match the description.
- **Boundary-crossing collision model** — design said "register on commit, clear after"; implementation registers on cell *entry* (boundary crossing) with no look-ahead. Documented in plan deviations entry 3. Implementation in [walker.js:251-265](../../scripts/modules/world/components/walker.js#L251-L265) matches; tests in [walker.test.js:310-334](../../tests/world/components/walker.test.js#L310-L334) cover the no-look-ahead invariant.
- **Smooth withdrawal model** (V3.5 hot-fix) — undocumented in design (not anticipated); implementation in [walker.js:304-337](../../scripts/modules/world/components/walker.js#L304-L337) and `MESH_BUFFER = 1.0`. Tests at [walker.test.js:354-404](../../tests/world/components/walker.test.js#L354-L404). Captured in plan deviations entry 6.
- **Player avatar (V3.8)** — design said "no player entity, FP camera writes marker"; V3.8 added a Mannequin entity ([app.js:308-340](../../scripts/app.js#L308-L340)) with `PLAYER_MARKER` registered at spawn unconditionally (regardless of camera mode). Documented in plan deviations entry 7. The marker now persists across camera-mode toggles, which matches the design's *intent* (player-as-presence) better than the original "marker only while FP-active" wording.
- **Hybrid wall + decor collision (V3.8)** — design said walls don't collide for the player (open question 6); V3.8 added bbox wall check + circle-depenetration decor collision ([app.js:458-516](../../scripts/app.js#L458-L516)). Documented in plan deviations entries 9 and 10. Implementation matches.
- **PropertyBinding track filtering (V3.8)** — design didn't anticipate this concern. Documented in plan deviations entry 11. Implementation in [animator.js:127-140](../../scripts/modules/world/components/animator.js#L127-L140) — see Finding 7 for the test-coverage gap.

No undocumented deviations from design were found — every significant departure has a corresponding entry in the plan's "Issues and Adjustments" or "Decisions" section.

---

## OBSERVATIONS — Coding-Style Adherence (positive)

Calling these out because they're done well and worth preserving:

- Allman braces, paragraph-style spacing, and one-line guard returns (`if(...) { return; }`) are consistently applied across all V3 files.
- No `_` prefix on class members anywhere in V3 work; no `vm` abbreviations.
- Comment hygiene is generally good — `walker.js` comments explain WHY (boundary-crossing rationale, MESH_BUFFER reasoning, drift diagnostic context) not WHAT. The few exceptions (the apologetic `relocateDecor` comment, the verbose drift-diagnostic preamble) are flagged above as small fixes rather than systemic issues.
- Section banners (`/******/`) are used consistently and at the right granularity.
- Emitter pattern adhered to (Walker / WanderBehaviour / ChaosController) — no global bus.
- Component lifecycle hooks used correctly (`onAddedToWorld` / `onRemovedFromWorld` for grid registration / cleanup).
- Namespace imports for utility modules: `Pathfinder`, `DecorBuilder`, `Errors` — all using `import * as`. Single-class modules use named imports — consistent with [`.claude/rules/javascript/coding-style.md`](../../.claude/rules/javascript/coding-style.md) and the project guidance in [`CLAUDE.md`](../../.claude/CLAUDE.md).
- Test naming and AAA structure are consistent. The `setup()` / `makeOpenWorld()` / `makeMinion()` factory pattern is good — kept tests legible despite the V3 fixture growth.
