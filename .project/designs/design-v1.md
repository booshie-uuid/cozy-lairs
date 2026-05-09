# Design — Cozy Lairs V1
Date: 2026-05-09

## Summary

V1 lifts the foundation from a hardcoded patrol demo toward a believably inhabited lair. A wandering AI replaces the hand-coded patrol path: the minion picks random walkable destinations, A*'s a path through clustered obstacles, plays Idle/Walk clips from the KayKit rig, and idles briefly between trips. Decorations (barrels, crates) become first-class grid-placed entities whose cells block pathfinding — motivating the pathfinder both visually and architecturally. The room footprint widens slightly to give the pathfinder meaningful space to navigate. A first aesthetic pass replaces the generic dark-blue HUD with a "dark grimoire with cozy marginalia" look — evil overlord's planning notebook, with cute doodles in the margins. Developer surfaces (dev console, fatal overlay, FPS chip) stay deliberately neutral. The AI architecture leaves room for goal-driven behaviours in V2+ — wandering is one swappable strategy slotted into a `Behaviour` hook, not the AI core.

## Architecture

### Pathfinding

A new `Pathfinder` module under `scripts/modules/engine/pathfinding/` exposes `findPath(grid, start, end)` returning a `[{cx, cz}, ...]` path or `null` if unreachable. Implementation: 8-way A* with octile heuristic, written from scratch — fits the project's vanilla-JS ethos and the surface is small enough that adding a dependency would be net-negative.

Diagonal moves cost √2; orthogonal moves cost 1. Corner-cutting between two blocking cells is rejected so the minion can't squeeze diagonally through gaps the player would expect to be solid.

The module is consumed via namespace import (`import * as Pathfinder from "..."`) per the project's utility-module convention.

### Walkability lives on the Grid

`Grid` gains two internal Sets — `floorCells` (cells with a floor entity) and `blockedCells` (cells with a blocker on top) — plus a derived `isWalkable(cx, cz)` query (in bounds AND in floorCells AND NOT in blockedCells) and a `walkableCells()` enumerator returning every passable cell.

Both Sets are populated by placement components in their `onAddedToWorld` / `onRemovedFromWorld` hooks. The room builder's floor tiles register; decor with `blocks: true` registers as blockers. Pathfinding asks the Grid; the Grid is the single source of truth.

### AI: WanderBehaviour + Walker (split)

Walker loses its patrol awareness and becomes a generic "follow this path" loop. New API:

- `walker.followPath(path)` — accepts an array of cell objects, walks to each in turn.
- emits `arrived` (Walker extends `Emitter`) when the path completes — sibling components subscribe via `walker.on("arrived", ...)`.

A new `WanderBehaviour` component drives the Walker. On `arrived` (and on first attach), it picks a random walkable cell, calls `Pathfinder.findPath(...)`, hands the path to Walker, and gates the next trip behind a brief idle delay (~0.5–1.5s random).

Future goal-driven AI slots into the same hook: `GoToBedBehaviour`, `WorkAtAnvilBehaviour`, etc. would be sibling components replacing `WanderBehaviour`. Walker stays naive about *why* it's walking.

### Animator component

Wraps `THREE.AnimationMixer`. Constructed with a clip map (`{idle: "Idle", walk: "Walk", ...}`) sourced from the GLTF's `animations` array (already loaded by AssetManager into the asset bundle).

Public API:

- `crossfade(stateName, durationMs = 200)` — fades from current state to the named state.
- `update(dt)` — advances the mixer's internal time.

Polled, not event-driven. Walker calls `animator.crossfade("walk")` on path start and `crossfade("idle")` on `arrived`; lookup via `entity.getComponent(Animator)`. If Animator is missing on the entity, Walker silently skips the call (matches V0's graceful degrade where the minion still slides without rig animation).

The clip map is built lazily on `onAddedToWorld` from the entity's loaded asset bundle's `animations` array. Missing clips log a `console.warn` listing requested-vs-available and fall through.

### Decorations

"Decoration" is an asset category, not a placement type. The KayKit pack contains at least two distinct classes V1 needs to leave room for:

- **Floor decor** (barrels, crates, tables) — placed on grid cells via `GridPlacement`. May block movement when `blocks: true`.
- **Wall decor** (banners, torches, sconces) — placed on wall edges via the existing `EdgePlacement`. Never block movement (they hang off walls; the wall already blocks the edge).

V1 implements only floor decor. `decor.barrel` and `decor.crate` enter the manifest as core-tier assets. Each produces an entity with `Renderable` + `GridPlacement(cx, cz, rotationStep, { blocks: true })`. `GridPlacement` gains a new `blocks` option (default false). When true, `onAddedToWorld` calls `grid.setBlocked(cx, cz)`; `onRemovedFromWorld` clears it.

Hand-authored cluster placement happens in `App.buildWorld()` via small explicit helpers (e.g. `addBarrel(world, assets, cx, cz)`). No generic `scatterDecor` wrapper — V1's decor count is tiny, and a generic helper would either lock to grid placement (bad for V2+) or have to handle both placement shapes from day one (overshoot).

Wall decor in V2+ uses the same `Renderable` plus new manifest entries paired with `EdgePlacement`. No infrastructure rework needed — `EdgePlacement` already supports the perimeter walls; the only new pieces are manifest entries and placement helpers.

### Aesthetic pass

**In scope** (player-facing HUD, restyled):

- HUD camera-mode chip
- HUD save-status display (newly visible — currently observable but unbound to the DOM)
- Loading overlay (full-screen)
- Toast tray
- Min-viewport overlay

**Out of scope** (deliberately neutral):

- Dev console (per CLAUDE.md — it's a developer tool)
- FPS chip
- Fatal overlay

**Direction**: dark grimoire base + cozy marginalia. "Evil overlord's planning notebook with cute doodles in the margins."

**Palette**:

- Base: deep aubergine `#2a1a3a`
- Accent: candle gold `#f0c674`
- Surface: parchment cream `#f4ead5` (high-contrast text inserts)
- Warning: ember red `#bf616a`
- Success: soft sage `#a3be8c`

**Typography**:

- Headings: humanist serif (e.g. EB Garamond), self-hosted woff2.
- Body: humanist sans (e.g. Atkinson Hyperlegible), self-hosted woff2.
- Both freely licensed; both with broad ASCII coverage.
- `font-display: swap` so a slow font load never blocks first paint (system fallback during load).

**Decorative motifs**:

- SVG corner flourishes on panel frames.
- Divider rules with central candle / star / bat dingbat.
- A hand-drawn marginal sketch on the loading overlay (a tiny minion silhouette beside a candle).

**Panel chrome**:

- Rounded corners.
- Double-line gold border (thin outer, 1px inner spacer).
- Faint paper-grain background pattern at low opacity.

**File structure**: a new theme stylesheet (`styles/cozy.css`, or `styles/themes/cozy/` if assets multiply) holds the palette/typography/borders. Existing `styles/main.css` keeps structural rules and the neutral dev-console / fatal styling. `index.html` adds a `<link>` to `cozy.css` after `main.css` so the cozy rules cascade-override.

## Components (V1 additions)

### `engine/pathfinding/pathfinder.js`

```
findPath(grid, start, end) → [{cx, cz}, ...] | null
```

Pure free function. 8-way A*, octile heuristic. Rejects diagonal moves between two blocking cells. Re-exported through `engine/pathfinding/index.js` for namespace imports.

### `world/components/wander-behaviour.js`

```
class WanderBehaviour
    constructor({ idleMin = 0.5, idleMax = 1.5, retryLimit = 3 } = {})
    onAddedToWorld(world)        // subscribes to sibling Walker's "arrived"
    update(dt)                   // ticks the idle countdown, kicks new trips
    onRemovedFromWorld(world)    // unsubscribes
```

Reads sibling components via `entity.getComponent(Walker)`. Picks targets from `world.grid.walkableCells()` excluding the current cell.

### `world/components/animator.js`

```
class Animator
    constructor({ clipMap })     // { idle: "ClipName", walk: "ClipName", ... }
    onAddedToWorld(world)        // builds the THREE.AnimationMixer
    crossfade(stateName, durationMs = 200)
    update(dt)
```

Lives under `world/components/` since it's a per-entity component, even though it wraps a Three.js engine primitive.

### `world/components/walker.js` (refactor)

Loses ping-pong. New surface:

```
class Walker extends Emitter
    constructor({ speed = 1.5 } = {})
    followPath(path)             // path is [{cx, cz}, ...] in grid coords
    update(dt)
    // events: "arrived"
```

The constructor no longer takes waypoints. `followPath(path)` accepts grid cells; Walker translates each to world coords via `world.grid.cellToWorld(...)` lazily as it advances. Empty paths emit `arrived` immediately.

### `world/grid.js` (extension)

New methods:

```
grid.markFloor(cx, cz)
grid.unmarkFloor(cx, cz)
grid.setBlocked(cx, cz)
grid.clearBlocked(cx, cz)
grid.isWalkable(cx, cz)
grid.walkableCells()             // iterable of {cx, cz}
```

Tracks `floorCells: Set<cellKey>` and `blockedCells: Set<cellKey>` internally. Existing `occupants` Map stays for future per-cell entity lookup.

### `world/components/grid-placement.js` (extension)

`GridPlacement(cx, cz, rotationStep, { walkable, blocks })`. Both flags default false to preserve existing behaviour. When `walkable: true`, `onAddedToWorld` calls `grid.markFloor(...)`; when `blocks: true`, `grid.setBlocked(...)`. Both clear on `onRemovedFromWorld`.

Floor tiles use `walkable: true`; barrels/crates use `blocks: true`. The minion uses neither (it transitions through cells, not occupying them at rest).

### `world/builders/empty-room.js` (size update)

No code change — the builder is parameterised. The `App.js` `ROOM` constant grows. Possibly the `Grid` size grows alongside (currently 10×10).

### `app.js` (room + decor placement)

- `ROOM = { x0: 1, z0: 1, width: 8, depth: 10 }` (slightly bigger).
- `Grid` constructed with appropriate size to fit (10×12 or similar).
- New `addBarrel(world, assets, cx, cz)` and `addCrate(...)` helpers.
- A `DECOR_LAYOUT` array of `{kind, cx, cz}` entries — 1–2 clusters, 4–6 obstacles total.
- The minion gets `Walker` + `Animator` + `WanderBehaviour` instead of the patrol Walker.

### Manifest (new entries)

```json
{ "id": "decor.barrel", "path": "...", "type": "gltf", "tier": "core" },
{ "id": "decor.crate",  "path": "...", "type": "gltf", "tier": "core" }
```

Both core-tier so they preload alongside walls/floors.

### Aesthetic theme files

- `styles/cozy.css` — palette, typography, panel chrome for the in-scope HUD.
- `styles/fonts/` — self-hosted woff2 files.
- `styles/icons/` (or inline SVG in HTML) — corner ornaments, dividers, dingbats, loading-overlay sketch.

## Data Flow

### Boot sequence (V1 additions)

1. AssetManager `preloadCore()` now includes `decor.barrel` and `decor.crate`.
2. `App.buildWorld()` calls `buildEmptyRoom(world, assets, ROOM)` (room footprint slightly larger), then `addBarrel(...)` / `addCrate(...)` calls for each entry in `DECOR_LAYOUT`. Floor placements register via `grid.markFloor`; decor placements register via `grid.setBlocked`.
3. `App.spawnMinion()` (renamed from `spawnPatrollingMinion`) creates the minion with `Renderable` + `Walker` + `Animator` + `WanderBehaviour`. No initial path passed; `WanderBehaviour` kicks the loop on first update.

### Per-frame loop

`GameLoop.fixedUpdate(dt)` → `world.update(dt)` walks entities. Each entity's components run their `update(dt)`:

- `Walker.update(dt)` — moves toward next path waypoint. Emits `arrived` to subscribers when path complete.
- `WanderBehaviour.update(dt)` — handles idle countdown.
- `Animator.update(dt)` — advances the mixer.

Camera and renderer continue as before.

### Wandering trip

1. Walker emits `arrived`.
2. WanderBehaviour ticks an idle countdown.
3. When zero, picks a random cell from `world.grid.walkableCells()`, excluding the current cell.
4. `Pathfinder.findPath(...)`. If `null`, retries with a new target up to `retryLimit` times, else extends the idle.
5. `walker.followPath(path)`. Walker calls `animator.crossfade("walk")`.

### Animation pipeline

Walker fires `crossfade("walk")` on path start. Animator's clip map maps `"walk"` to the right GLTF clip; `THREE.AnimationAction.fadeIn(durationMs / 1000)` ramps the new clip in over the cross-fade duration; the previous action `fadeOut`s. Mixer's `update(dt)` blends them. On arrival, `crossfade("idle")` flips the same machinery.

### Decor placement on boot

Each `addBarrel(world, assets, cx, cz)` (and siblings):

1. Validates `cx, cz` against `grid.floorCells.has(cellKey(cx, cz))` — warns + returns if not on a floor.
2. Creates `Entity.fromKind("decor.barrel", assets)`.
3. Adds `GridPlacement(cx, cz, 0, { blocks: true })`.
4. `world.addEntity(entity)` runs the placement's `onAddedToWorld`, which calls `grid.setBlocked(cx, cz)`.

Once all decor is placed, when WanderBehaviour later calls `grid.walkableCells()`, the blocked cells are excluded.

## Error Handling

- **Pathfinder returns null** — WanderBehaviour retries with a different random target up to 3 times, then extends the idle interval and tries next tick. No UI surface; unreachable cells in a well-connected room are rare and self-recovering.
- **Animator clip missing** — clip-map construction logs `console.warn` listing requested-vs-actual clip names; skips the missing entries. Walker still moves; the minion slides without rig animation (matches V0 graceful degrade).
- **Decor manifest entry references missing GLB** — falls through the existing `AssetLoadError` path. Renderable's magenta-wireframe placeholder renders so the obstacle is visible; the cell still blocks correctly.
- **Decor placed on a non-floor cell** — `addBarrel` (and siblings) validate the target cell against `grid.floorCells` pre-block; warn + skip if invalid. Avoids decor floating outside the room.
- **Aesthetic font fails to load** — system fallback stack ensures text remains readable. `font-display: swap` prevents blocking first paint.
- **Walker called with empty path** — no-op. Already at destination; emits `arrived` immediately so WanderBehaviour can pick a new target.

Existing error paths (manifest fetch failure, save failure, fatal in `App.start()`, runtime error toasts) are unchanged.

## Testing Strategy

### What's new

- **Pathfinder** (~6–8 tests, pure function): open-grid path, route around single block, route around cluster, no path on impossible setup, no diagonal corner-cutting between two blockers, octile cost correctness.
- **Grid walkability** (~4–5 tests): `setBlocked` / `clearBlocked` round-trip, `markFloor` / `unmarkFloor` round-trip, `isWalkable` requires floor + no block, `walkableCells()` returns the right Set.
- **WanderBehaviour** (~3–4 tests, stub Walker + stub Pathfinder): picks a new target on `arrived`, idle countdown gates path acquisition, gives up gracefully when `findPath` returns null repeatedly.
- **Animator** (~3–4 tests, stub mixer): clip-map construction from GLTF-bundle fixture, `crossfade(state)` triggers the right `fadeIn` / `fadeOut` calls, `update(dt)` advances the mixer.
- **`GridPlacement` blocks/walkable flags** (~2–3 tests): adding/removing entity registers/clears the right Set, default flags don't touch either Set.

### What changes

Walker tests need rewriting — ping-pong / multi-waypoint behaviour is gone. About 4 of the existing 10 Walker tests change shape; the rest (waypoint validation, etc.) carry over to the new `followPath(...)` shape.

### What we still don't test

- Three.js rendering output — visual aesthetic verified by browser-verify.
- Animation timing — cross-fade duration is "feel"-tuned, not asserted.
- Font loading — system fallback covers the failure mode.

## Open Questions

- **Multiple minions** — V1 stays at one. Adding multiple introduces collision-avoidance questions; defer to V2.
- **KayKit clip names** — exact clip names depend on the export. A one-time `console.log` of the GLTF's `animations` array on first load confirms; document the resolved names in CLAUDE.md once known.
- **Wall-decor anchoring (V2+ design)** — when wall decor lands, do torches/sconces want a discrete edge anchor like walls (cell + side), or a freely-positionable `WallMounted` (slides along the wall plane)? V1 doesn't decide; flagged for V2 design.
- **Dev console contrast** — dev console stays neutral, but it's onscreen alongside the cozy HUD. If contrast feels jarring on browser-verify, the panel chrome could pick up the cozy palette without changing the monospace event/stat content. Decide on browser verify.
- **Decor cluster layout** — exact cell coordinates picked during implementation; design only commits to "1–2 clusters, 4–6 obstacles."
- **Grid size** — currently 10×10. With room footprint 8×10, the grid likely needs to grow to 10×12 or similar to give the room margin. Decide during implementation.
