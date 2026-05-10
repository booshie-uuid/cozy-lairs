# Design — Cozy Lairs V3 — Collision & Chaos
Date: 2026-05-10

## Summary

V3 makes the world physical. Static decor and other walker entities (currently just minions, but the framework treats all mobile entities identically) block movement; walkers discover blockages lazily when they encounter them and re-plan; the player participates in the same collision rules while in first-person mode. Decor that ends up on top of a walker or the player teleports the occupant to the nearest free cell as a safety net for sloppy placement (real prevention during build-mode placement is V4+ work). To stress-test all of this without manual intervention, a few designated "chaos barrels" teleport to random walkable cells whenever any walker arrives at its destination — a reactive feedback loop where successful trips trigger fresh chaos.

The design is deliberately generic: "minion" is the only walker kind we have today, but every collision rule, the occupant tracking, the BFS displacement, and the chaos controller all operate on Walker components and Entity occupancy without discriminating on kind. Future monsters / creatures / visitors will inherit V3's collision behaviour by attaching the same `Walker` (and any chosen behaviour component).

## Architecture

### `grid.occupants` for dynamic blockers

The `grid.occupants` Map (already exists, currently unused in gameplay) becomes the single source of truth for **dynamic** blockers — walkers and the player. Distinct from `grid.blockedCells` (which stays static decor only). The pathfinder continues to consult only `isWalkable`, so paths are routed around walls and decor but not around other walkers — minion-vs-minion (and minion-vs-player) blocking is detected at collision time, not at planning time. This matches the user's preference that walkers don't all repath when a single object lands.

New `Grid` API on top of the existing setOccupant / getOccupant / clearOccupant trio:

- `isAvailable(cx, cz, excludeOccupant)` — true iff `isWalkable(cx, cz)` AND no occupant (or the occupant is the supplied `excludeOccupant`). The unifying query for Walker pre-step checks, decor-placement collision detection, and chaos-target selection.
- `findClosestAvailable(cx, cz, excludeOccupant)` — BFS spiral from `(cx, cz)`, 8-way, returns the first cell satisfying `isAvailable` (or `null` if the grid is exhausted). The unifying displacement logic for the BFS-teleport flow.

### Walker collision detection

Walker registers / clears occupancy as it crosses cells. When committing to move into the next cell (the moment it advances `pathIndex`), it registers itself in `grid.occupants[nextCell]` and clears the previous cell. The "commit early, clear after" timing effectively reserves the next cell so two simultaneous walkers can't both decide to enter it.

Before that commit, Walker queries `grid.isAvailable(nextCell, this.entity)`. If unavailable:

- `completed = true`, transition Animator to `idle`.
- Emit a new `"blocked"` event (alongside the existing `"arrived"`).
- Path remainder retained on the walker for diagnostics; no further movement attempted.

A new `walker.teleportTo(cx, cz)` method handles the "displaced by decor" case: snaps `object3D.position` to the cell's world-coords, clears `currentPath`, resets `pathIndex`, transitions Animator to `idle`, emits a new `"displaced"` event, and updates occupancy registration.

### `WanderBehaviour` repath on blocked / displaced

`WanderBehaviour.onAddedToWorld` already subscribes to `walker.arrived`. V3 adds subscriptions to `walker.blocked` and `walker.displaced` with the same handler (schedule next trip after idle countdown). From WanderBehaviour's perspective, the trip ended is the unifying signal — whether by success, collision, or being shoved aside is the Walker's concern, not its.

### Player presence (first-person mode only)

No player entity. The `FirstPersonCamera` writes a sentinel `PLAYER_MARKER` constant into `grid.occupants` on each cell change while active, and clears it when leaving FP mode (deactivate hook). This way the BFS-teleport logic handles player + walkers uniformly without a fake entity needing lifecycle management. The sentinel is exported from a small new `engine/player-marker.js` module and imported wherever needed (decor placement, FP camera).

The "teleport the player" action sets the FP camera's world position to the free cell's centre and updates the occupancy registration. When the camera is in Builder mode, it has no grid presence — Builder mode is god view and the player is not collidable.

### Decor placement: teleport occupants to free cell

`addBarrel` / `addCrate` (and the chaos teleporter, which uses the same path) check `grid.getOccupant(cx, cz)` before final placement. If an occupant is present:

1. `grid.findClosestAvailable(cx, cz, occupant)` returns a free cell.
2. Teleport the occupant — for a Walker: `walker.teleportTo(...)`; for `PLAYER_MARKER`: move the FP camera + update occupancy.
3. Place the decor.

If BFS exhausts the grid without finding a free cell (room totally packed): `console.warn`, skip placement (keep the occupant where they were). Defensive — shouldn't happen in practice for a 8×10 room with handful of decor.

### Multi-walker spawn

`App.spawnMinion` becomes a loop that spawns N (default 4) minions at distinct walkable cells, each with its own `Walker` + `Animator` + `WanderBehaviour`. Spawn cells avoid each other and avoid existing decor. The selection is a small "find N walkable cells separated by at least 1 cell" helper; if it can't find enough, it warns and spawns fewer.

Minion clips, speed, and asset id stay as constants. Each minion is otherwise independent.

### Chaos barrel teleporter

A new app-level `ChaosController` (lightweight, no entity needed):

- Owns references to the chaos-barrel entities (a small subset of decor — say 3 of them, distinguished from static barrels by being added to the controller's list).
- Subscribes to every spawned walker's `arrived`, `blocked`, and `displaced` events (whichever fires when a trip ends, the controller reacts).
- On any trip-ended event: pick one random chaos barrel, pick a random walkable cell, teleport the barrel via the same decor-placement-on-occupant flow (so if the destination has a walker, that walker gets BFS-displaced).
- Light cooldown (~1.5s default constant) to prevent burst-teleporting when several walkers arrive in the same frame.

The controller is wired in `App` after the minions and chaos barrels are spawned. Stays alive for the lifetime of the world.

## Components

**New / changed:**

- `Walker` — `"blocked"` event, `"displaced"` event, `teleportTo(cx, cz)` method, occupancy registration on cell change, pre-step `isAvailable` check.
- `WanderBehaviour` — subscribes to `walker.blocked` and `walker.displaced` (in addition to `walker.arrived`).
- `Grid` — new `isAvailable(cx, cz, excludeOccupant)` and `findClosestAvailable(cx, cz, excludeOccupant)`.
- `FirstPersonCamera` — registers / clears `PLAYER_MARKER` on cell change; cleared on `deactivate`.
- `App.spawnMinion` — loop that spawns N minions at distinct cells. (Single-line generalisation to `spawnCharacter(kind, opts)` is **not** in V3 scope per user; minions stay the only walker kind.)
- New module: `engine/player-marker.js` exporting `PLAYER_MARKER` sentinel.
- New: `ChaosController` (lightweight class, no entity wrapper) — orchestrates chaos-barrel teleports.

## Data Flow

**A walker's normal trip**

1. WanderBehaviour `update` ticks idle to zero → `kickTrip`.
2. Pathfinder returns a cell list (only static blockers considered).
3. Walker `followPath` snaps to first cell, registers occupancy, starts walking.
4. Each cell crossing: clear old occupancy, register new occupancy, check next target via `isAvailable(nextCell, self)`. If unavailable → emit `"blocked"`.
5. On reaching final cell → emit `"arrived"`. Occupancy stays registered until the next trip starts.

**Decor lands on a walker (or player)**

1. `addBarrel(world, assets, cx, cz)` runs.
2. `grid.getOccupant(cx, cz)` returns the entity or `PLAYER_MARKER`.
3. `grid.findClosestAvailable(cx, cz, occupant)` returns a free cell.
4. Walker: `walker.teleportTo(freeCx, freeCz)` → snap, clear path, emit `"displaced"`, update occupancy.
   Player: move FP camera position, update occupancy.
5. WanderBehaviour reacts to `"displaced"` → schedules next trip.
6. Decor places normally at `(cx, cz)`.

**Chaos barrel teleports**

1. Any walker emits `"arrived"` / `"blocked"` / `"displaced"`.
2. ChaosController checks cooldown — if within 1.5s of last teleport, skip.
3. Picks a random chaos barrel and a random walkable cell.
4. Calls the barrel's "teleport to cell" path (which goes through the decor-placement-on-occupant flow if the new cell has a walker).
5. Updates `grid.blockedCells` (clear old, set new) and the barrel's `object3D` position.
6. Resets cooldown timer.

**FP-mode player presence**

1. FP camera `activate` → register `PLAYER_MARKER` at the camera's current cell.
2. Each frame while active → if cell changed, clear old, register new.
3. FP camera `deactivate` → clear `PLAYER_MARKER` from current cell.
4. (Builder camera lifecycle is unchanged; no occupancy registration.)

## Error Handling

- Walker pre-step check is defensive: any unexpected grid state simply triggers `"blocked"`. No crash, no infinite loop (the trip just stops).
- BFS spiral that exhausts the grid: `console.warn`, return `null`, caller (placement) skips the operation. The occupant stays put.
- Multiple occupants in the same cell shouldn't happen by construction (placement / Walker / camera all check before commit). If it does: `getOccupant` returns the most recently set; the older one gets clobbered. Worth a single `console.warn` at registration time when overwriting an existing occupant.
- ChaosController fires on every trip-end event. Cooldown rate-limits; if cooldown is set too tight, worst case is wasted event handler calls.
- Walker that gets `displaced` while WanderBehaviour is mid-`kickTrip` (rare race): `followPath` validates that `path[0]` matches current cell; if not, treats it as a fresh path-from-current-position. Defensive but cheap.

## Testing Strategy

Unit tests (vitest, node env):

- `grid.test.js` — `isAvailable` truth table; `findClosestAvailable` returns expected cell on small fixtures; BFS exhaustion returns `null`; `excludeOccupant` parameter respected.
- `walker.test.js` — emits `"blocked"` when next cell becomes unavailable mid-path; emits `"displaced"` when `teleportTo` called; occupancy registered on cell change and cleared on departure; pre-step check uses `isAvailable` with `excludeOccupant`.
- `wander-behaviour.test.js` — repaths on `"blocked"` and on `"displaced"` (in addition to existing `"arrived"`).
- `decor.test.js` — `addBarrel` on occupied cell calls `findClosestAvailable` and triggers occupant teleport; if no free cell, warns and skips placement.
- New: `chaos-controller.test.js` — fires teleport on walker arrival; rate-limits to one per cooldown window; picks from the registered chaos barrel set; teleporting onto a walker triggers that walker's displacement.
- Player marker doesn't get its own test file — exercised through the decor placement test (occupant = `PLAYER_MARKER` branch).

Manual browser verify: 4 minions wandering, 3 chaos barrels visibly teleporting around, minions occasionally bonking and re-routing, occasionally getting bumped by a barrel landing on them. Tab to FP mode and walk into a wall (camera should stop at edge, no clip-through) — actually scratch that, walls don't have collision in V3 (only decor and walkers do). What V3 does add for player: standing in a cell, then placing a decor on that cell via dev tooling, should teleport the camera away.

## Open Questions

1. **`"displaced"` vs `"arrived"` event distinction**: chose `"displaced"` for clarity. Different cause, different downstream semantics if needed (e.g. a future "minion notices being shoved" reaction). WanderBehaviour subscribes to both with the same handler; cost is one extra subscription.
2. **FP camera writing directly to `grid.occupants`**: couples a camera class to grid state. Alternative: a hidden `PlayerPresence` entity tied to FP camera lifecycle. Adds indirection but keeps cameras "view-only". Default for V3 is direct write (simpler), revisit if it gets messy.
3. **Multi-minion spawn count**: 4 by default. Tunable constant. More minions = more collision opportunities, but also harder to follow visually. If 4 feels light, easy bump.
4. **Chaos barrel count**: 3 distinct barrels. Could mark them visually (slight tint, or the decor.barrel.chaos asset id) to distinguish from static barrels — V3 may or may not bother; simplest is "the controller knows which entities are chaos, the player learns by watching them move".
5. **Chaos cooldown**: 1.5s is a starting guess. Tunable. If chaos feels too quiet at 4 minions, drop to 0.8s; if too noisy, bump to 3s.
6. **Wall collision for player**: V3 deliberately does NOT add wall collision for the FP camera — walls don't register in `grid.occupants` (they're edge-placed, not cell-placed). The FP camera will continue to clip through walls in V3. Wall collision is a separate concern and lands later.
