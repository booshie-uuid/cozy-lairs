# Handover — Cumulative State Through V4 (2026-05-12)

A starter brief for the next Claude Code session. Read this before doing anything substantive. Treat the references below as authoritative — this file is a snapshot in time and will rot.

---

## Project orientation

**Cozy Lairs** is a browser-based 3D lair-builder game. Three.js (r171, vendored) + Knockout.js (UMD) + Vitest. No build step — the page is served as static HTML. Aesthetic is "cozy villain" / witchy arcade, NOT terminal/IDE chrome. KayKit Dungeon Remastered is the primary asset pack (4m cell convention); block-bits and character-animations packs are also wired in.

Currently at **V4.10.0**. **385 tests passing** across 27 files.

---

## Version history at a glance

- **V0** — Engine bones. `Renderer`, `Input`, `GameLoop`, `AssetManager`, `World`, `Grid`, `Entity`, component pattern. Save/load via `WorldSerializer` + `SaveService` (localStorage). Hardcoded empty room for testing.
- **V1** — Character animation + wander behaviour + basic floor decor (`DecorBuilder` builders for barrel/crate). KayKit Skeleton_Minion + Rig_Medium animation libraries. Cozy CSS theme + chunky chrome formula introduced (cozy.css).
- **V2** — Design/plan refresh + minor cleanup. Re-anchored the visual identity (cozy purple palette, Lilita One + Atkinson Hyperlegible fonts, six self-hosted woff2s, chunky drop-shadow chrome).
- **V3** — Player avatar (Mannequin), collision system. Walker boundary-crossing model with smooth withdrawal, occupant-aware Pathfinder, `ChaosController` stress-test harness, player-marker grid presence, `FirstPersonCamera` with player displacement plumbing.
- **V3.8** — Code review remediation pass + player+collision wiring. No version bump (remediation pass).
- **V4** — Build Mode MVP. Interactive authoring of rooms / decor / minions via the right-side `AuthoringPanel`. WallTracer auto-traces walls (corner-aware). WorldEditor is the sole mutation entry point. Terrain blocks (gravel, dirt) added mid-task as the foundation for a future minion-dig flow. V3 auto-spawn + `ChaosController` removed; new worlds open with a 6×6 starter room and the player avatar only.

---

## Where to look (always, in this order)

1. **`.project/project.md`** — points at the current design and plan files. **Always** work from what this file says. Currently `design-v4.md` + `plan-v4.md`.
2. **`.claude/CLAUDE.md`** — checked into the repo. Coding conventions, project layout, palette, V4 authoring grammar, manifest schema. Auto-loaded on session start.
3. **`.claude/rules/coding-style.md`** + **`.claude/rules/javascript/coding-style.md`** — formatting + naming. **Read the Comments section** carefully; it captures user-specific preferences.
4. **`.project/plans/plan-vN.md`** (N = 0..4) — per-version decision registers. Plan-v4 is current and richest.
5. **`.project/designs/design-vN.md`** — architectural specs each version was built against.
6. **`.project/reviews/`** — V0 review (early) and V3 review (post-collision-work).
7. **`~/.claude/projects/d--Workspace-Projects-cozy-lairs/memory/`** — auto-loaded user memory. `MEMORY.md` is the index.

---

## Architectural surfaces

### Engine (V0)

- **`Renderer`** — wraps `THREE.WebGLRenderer` + scene + active camera. Owns the canvas inside `#canvas-wrapper`. Reactive aspect via ResizeObserver.
- **`GameLoop`** — fixed-step `onFixedUpdate` + interpolated `onFrameUpdate`. Tick rate stats fed into the dev console.
- **`Input`** — single source of truth for keyboard + pointer + wheel. Emits `{x, y, button, buttons, target, ...}`. Window-attached, so consumers must filter by `event.target` when they only care about canvas events.
- **`AssetManager`** — manifest-driven, dot-id keyed (`floor.stone.basic` etc.). Tier `core` preloaded; `world` lazy. Skinned-mesh clones via `SkeletonUtils.clone`. Manifest entries gain optional `kind` / `displayName` / `meta` (V4 additions); `meta.scale` / `meta.yOffset` / `meta.zOffset` are read by `Renderable.reattach`.
- **`SaveService`** — localStorage autosave, manual `Ctrl+S`, quota-aware. `WorldSerializer.toJSON` / `fromJSON` round-trips entities by `kind` + component data.
- **`Emitter`** — base class for direct-subscription eventing. **No global event bus.** Events are past-tense facts (`entityAdded`, `saved`).
- **`DevConsole`** — slide-in panel, backtick toggle, `?debug=1` URL param. Capture lives on the console itself; display is a separate KO view-model. `Emitter.devSink` is the instrumentation back-channel (gameplay code can't subscribe).

### World + components

- **`World`** — owns `THREE.Scene`, `Grid`, entity registry. Emits `entityAdded` / `entityRemoved` synchronously. `playerDisplaceHandler` is the wired callback for decor placement on the player cell.
- **`Grid`** — `width × depth × cellSize`. Tracks `floorCells`, `blockedCells`, `occupants`. `cellSize` is 4m (KayKit convention).
- **`Entity`** — one `THREE.Object3D` + a `Map<ComponentClass, Component>`. Component lifecycle hooks: `attach`, `onAddedToWorld`, `onRemovedFromWorld`, `update`, `toJSON`.
- **Components**: `Transform`, `Renderable` (auto-added by `Entity.fromKind`), `GridPlacement` (cell-aligned, optional `walkable` / `blocks` flags), `EdgePlacement` (wall edges, 4 sides, optional `lengthOffset` / `originOffset`), `CornerPlacement` (4-orientation corner pieces at grid vertices), `Walker` (cell-based path follower, boundary-crossing collision, withdraw-on-block smoothing), `WanderBehaviour` (random walkable cell targeting, self-rescue), `Animator` (wraps `THREE.AnimationMixer`, clip-map state machine).

### Cameras

- **`BuilderCamera`** — orbit/pan/zoom. Left-drag pan, right-drag orbit, wheel zoom, WASD pan. Damping. Pan can be disabled while a tool is active. Uses `event.buttons` bitmask for multi-button safety.
- **`FirstPersonCamera`** — pointer-lock, mouselook, WASD walk. Cell-by-cell `PLAYER_MARKER` tracking. Collision resolved by `App.resolvePlayerCollision` (per-axis bbox vs non-floor cells + circle-depenetration vs decor).

### Builder layer (V4)

- **`WorldEditor`** — sole writer of authored content. 7 action methods (`paintFloor`, `eraseFloor`, `placeDecor`, `placeWallDecor`, `removeDecor`, `spawnMinion`, `removeMinion`) + matching `canX` predicates. `placeBlock` / `removeBlock` for `terrain.block` kinds. Toasts on user-attempted refusals; hover refusals just tint the ghost red.
- **`WallTracer`** — subscribes to `entityAdded` / `entityRemoved`. Reconciles walls + corner pieces against floor topology. Edge presence determined by "exactly one side is floor". Corner placed at any vertex where 2 perpendicular walls meet (L-junction). Half-walls used on cell sides whose perimeter wall ends at a corner. Cascade-removes wall decor when a wall genuinely disappears.
- **`IconRenderer`** — offscreen `THREE.WebGLRenderer`, 96×96 PNG per kind-annotated manifest entry. Text fallback on failure (also the jsdom path).
- **Tools** (`scripts/modules/builder/tools/`) — `Tool` base + concrete `FloorPaintTool` / `FloorEraseTool` / `DecorPlaceTool` / `DecorEraseTool` / `WallDecorPlaceTool` / `MinionSpawnTool` / `MinionEraseTool` / `BlockPlaceTool` / `BlockEraseTool` + `NoopTool`. Each sets `targetType` ("cell" | "wallEdge" | "none"). Ghost mesh + green/red/amber tinting.
- **`BuilderInputAdapter`** — pointer/key events → cell or wall-edge → active tool. Right-click cancel (click-vs-drag distinguished by 4px). Escape also cancels. `event.target === canvas` gate prevents UI clicks from engaging the tool dispatcher. Wall-edge resolution is hybrid: wall-mesh raycast (precise) → floor-plane nearest-edge fallback (for alcove edges with no wall mesh, blocked by corner-piece raycast to prevent ray-tunneling).
- **`AuthoringPanel`** — KO view-model + tabbed `<aside>` markup in `index.html`. `selectedToolId` is the wire — `App.setTool` builds the tool from the ID, hands it to the adapter, and toggles `BuilderCamera.setPanEnabled` to avoid click-vs-drag conflict.

---

## User-specific behavior

Captured in memory and `coding-style.md`. The big ones:

- **Comments**: never write narrative/rationale comments. Surface facts the code can't express (quirks, API limits, algorithm refs). Design reasoning belongs in plan Decisions, not source.
- **Logical paragraphs**: blank lines separate ROLE shifts (read inputs → init state → compute → apply output), not syntax runs. Walk function bodies as prose before submitting.
- **Sign-off ritual**: "looks good" / "proceed" / "ship it" → tick the trailing `Verify in browser` step in the current plan task, bump `Current Version` in `project.md` (task component +1), proceed.
- **`VERSION` constant** in `scripts/app.js` uses `V{plan}_{task}_{release}` format. Bumped as the **first** code change of each new task.
- **Design / plan acceptance**: skills write `new-design.md` / `new-plan.md`. User signals acceptance by renaming to `design-vN.md` / `plan-vN.md` and updating `project.md`. **Don't pre-empt the rename** — the rename is the user's "I've reviewed it" signal.
- **No `_` prefix** on class members. No `vm` abbreviation for view-models.
- **Align `=` only for rhythmic patterns** (3+ consecutive lines, same shape).
- **No global event bus** — use `Emitter`, subscribe directly to producers.
- **One question at a time** during brainstorming. Prefer multiple-choice with a recommendation.
- **Terse responses, no trailing summaries.** User reads diffs themselves.

---

## V4+ long-term user intent

Captured in memory: `project_v4_future_intent.md`. V4 architecture left room for, but did not implement:

- **Cost / tech-tree restrictions** — manifest `meta` bag will gain `cost` / `requiresUnlock` etc.
- **Inventoried removal** — some decor returns to inventory; others destroyed. `meta.inventoryOnRemove` flag.
- **Minion-driven construction** — floor paint is currently god-mode-immediate; future versions queue painted cells as work orders for minions. Particularly relevant for `terrain.block` (rooms dug OUT of blocks).
- **Dual catalogue surface** — side panel + bottom toolbar with assignable shortcut slots.
- **Free Y-rotation with nudging** — V4 uses 90° snap; future adds nudging and free Y rotation.
- **Move-player tool** — V4 has no way to reposition the player avatar in Build mode. `MovePlayerTool` would call `world.playerDisplaceHandler({cx, cz})` (V3.8 plumbing exists).

`WorldEditor` mutation surface and manifest `meta` bag are the two extension points; neither should need a schema migration for the above.

---

## Known polish gaps

Recorded in `plan-v4.md` → Issues and Adjustments:

- **WallTracer T-/+-junction polish** — vertices with 3+ walls skip the corner piece (no native KayKit geometry). Acceptable for V4; user noted "we'll have to keep corners in mind".
- **Minion mesh visually clips with interior corner pieces** — cell-based collision doesn't see corner-piece arms extending into adjacent floor cells.
- **Block / wall geometry overlap** — `terrain.block` placed adjacent to existing walls shows minor visual overlap (block extends 0.02m into wall volume even after scale correction). User accepted this; it'll be largely irrelevant once the minion-dig flow replaces manual block placement.

---

## Recent close-out additions (not in CLAUDE.md or any plan)

- **`.project/stats.js`** — Node utility. Walks the repo (skipping `node_modules` / `libs` / `.claude` / `.git`), counts ELOC + comment words by language for `.js` / `.html` / `.css`, and word counts by category for `.md` files under `.project/`. Writes `.project/stats.json`. Run: `node .project/stats.js`.
- **`.project/stats.html`** — visualises `stats.json` (stacked bars + tables + percentages). `file://` fetch may be blocked; serve via `python -m http.server` or `npx http-server` if needed.
- **`.project/handovers/handover-v4.md`** — this file.

---

## Run / test cheatsheet

| Task | Command |
| --- | --- |
| Run all tests once | `npm test` |
| Watch tests | `npm run test:watch` |
| Run a single test file | `npx vitest run tests/path/to/file.test.js` |
| Regenerate project stats | `node .project/stats.js` |
| Coverage (not installed) | `npm install -D @vitest/coverage-v8` then `npx vitest run --coverage` |

App runs by opening `index.html` from a static server (any will do). No build step.

---

## Suggested next-session opener

If the user opens with "let's start V5" (or any phrasing suggesting forward planning):

1. Read `.project/project.md` to confirm what it points at.
2. Read `~/.claude/projects/.../memory/project_v4_future_intent.md` to refresh on stated future direction.
3. Use the `brainstorm` skill — long-term intent gives several candidate themes (minion-driven dig, cost/tech-tree, move-player tool, free-Y rotation). Don't pick for them; brainstorm to find their actual next priority.
4. After design is accepted (renamed to `design-vN.md`), use `create-plan`.
5. Then `execute-plan`.

If the user opens with a bug / tweak / small task, just dive in. V4 is shipping-stable.

---

## Anti-patterns to avoid

- **Don't restate decisions in code comments.** Put the *why* in the plan's Decisions register (if a plan is active), or git log otherwise.
- **Don't write file-header narratives** explaining what a module does. Class name + method signatures speak for themselves.
- **Don't pad alignments** across heterogeneous declarations. Only when 3+ same-shape lines reveal a rhythm.
- **Don't bump VERSION on remediation / out-of-band cleanup.** Only on plan-task sign-off.
- **Don't proactively run `ultrareview`.** It's user-triggered and billed.
- **Don't pre-emptively rename `new-X.md` → `X-vN.md`.** The user's rename is the acceptance signal.
- **Don't pack roles together.** A run of `let` / `const` is one paragraph only if the variables play the same role; otherwise blank-line break.
