# CLAUDE.md — Project Notes & Feedback

Cross-task learnings and explicit user preferences. Refine, reorganise, or
delete entries as needed — the goal is keeping this useful, not preserving
every word. Aim to keep file less than 300 lines without losing critical
information.

---

## Workflow

### Plans and Designs

ALWAYS work from the current design and current plan specified by `./project/project.md` in the working directory.

NEVER work from a design or plan that does not match the paths specified by `./project/project.md` in the working directory.

### Sign-off and version bumping

User confirmation of the form "looks good", "proceed", "ship it", "ok to go", "looks ok let's move on" all count as task sign-off. On sign-off:

1. Tick the trailing `Verify in browser` step in the current plan task (`- [ ]` → `- [*]`).
2. Bump `Current Version` in `./project/project.md` (task component +1).
3. Proceed to the next task.

Inside `scripts/app.js`, the `VERSION` constant uses the format `V{plan}_{task}_{release}` and is bumped as the *first* code change of each new task — by the time you start a task, app.js should already advertise the version that task will end at.

- **plan**: matches the v-number of the current `plan-vN.md` file. Only changes when a new plan file is created.
- **task**: increments by 1 each time a task within the current plan is completed. Resets to 0 when `plan` increments.
- **release**: NEVER bumped by hand or automation in this skill. Reserved for a build script we will introduce later. Resets to 0 when `task` increments.

### No manual line breaks in markdown

Markdown is rendered — wrapping is the renderer's job. Don't hard-wrap paragraphs at ~80 columns. Code blocks and tables are exempt.

### Design / plan acceptance ritual

The `brainstorm` and `create-plan` skills both write to `new-design.md` / `new-plan.md` (skill convention). The user signals acceptance by **renaming** to `design-vN.md` / `plan-vN.md` and updating `.project/project.md` to point at the renamed file. Don't pre-empt this — leave the `new-X.md` filename in place after generating; the rename is the user's explicit "I've reviewed it" signal.

### Code-review remediation does NOT bump VERSION

`VERSION` bumps only on plan-task completion (per the rule above). A code-review remediation pass that fixes findings without advancing a plan task leaves `VERSION` alone. Same for any other out-of-band cleanup. If the user wants a release-component bump for the remediation, they'll ask explicitly.

### Long-term intent lives in user memory, not code

Future-version intentions the user has stated (cost system, tech-tree, minion-driven construction, dual catalogue surface, free Y-rotation, move-player tool) are captured in `~/.claude/projects/.../memory/project_v4_future_intent.md`. Cross-reference there when an architectural choice would otherwise box out a stated future direction. Don't restate the contents in CLAUDE.md — the memory file is canonical.

---

## Coding conventions

### App singleton owns top-level orchestration

`scripts/app.js` defines a small `App` class, instantiates a single instance, exposes it on `window.App`, and runs `app.start()` from the bootstrap. The view-model and any cross-cutting control logic (lifecycle, top-level coordination) live as fields/methods on that singleton.

### Bootstrap entry points use a DOM-ready guard

Wrap the bootstrap call in an explicit DOM-ready check even when the script tag is `type="module"`. Reads more clearly than relying on module-defer semantics and never breaks if the script tag placement changes.

### Naming — never use `vm` / `VM` for view-models

Spell out `viewModel` (instances) and `AppViewModel` (class). The abbreviation collides with "virtual machine" and is unhelpful here.

### Naming — no `_` prefix on class members

Class fields and methods are plain camelCase — no `_` prefix to indicate "private intent". The members aren't actually private; the `_` is decoration that adds visual noise without enforcing anything. The `this.` qualifier already provides scoping. If real privacy ever matters, escalate to `#field` syntax — don't reach for `_`. Same rule applies to module-level helpers and static fields (`Emitter.devSink`, not `Emitter._devSink`).

### Vertical alignment of `=` is for revealing patterns, not decoration

Pad spaces before `=` / `{` only when 3+ consecutive lines have the same shape and aligning shows the rhythm. The four `THREE.MathUtils.lerp(this.X, this.targetX, DAMPING)` calls in `BuilderCamera.frameUpdate` are a good example — same call, same shape, alignment reveals the structure at a glance. Heterogeneous field initialisations and constants of different "families" don't get padding — the eye has to scan further to find what the `=` belongs to, which defeats the point.

### KO custom binding handlers live in `bindings.js`

All `ko.bindingHandlers.*` registrations live in `scripts/modules/ui/bindings.js`. Other UI modules import `bindings.js` for its side effect once, before `ko.applyBindings`. KO is loaded as a UMD via classic `<script>` and accessed in modules with `const ko = window.ko;` aliased at the top of the file.

### Shared error classes in their own module

Engine errors live in `scripts/modules/engine/errors.js`. The `engine/index.js` façade re-exports them so external consumers don't import submodule paths directly. Submodules import from `errors.js` directly to avoid circular cycles through the façade.

### Eventing — direct subscription, no global bus

Cross-module notification uses the `Emitter` base class (`engine/emitter.js`). Subscribers attach directly to the producer (`world.on("entityAdded", ...)`); there is no global event bus. **Events are past-tense facts** (`entityAdded`, `saved`, `gridChanged`); commands ("place this wall") are method calls, never events. If a real cross-cutting fan-out problem appears, escalate to a topic-scoped mini-emitter (`WorldEvents`, `BuildEvents`) — never a generic global bus.

The `Emitter.devSink` static is a one-way mirror used by the dev console for instrumentation. It is NOT a back-door bus — gameplay code cannot subscribe to it.

### Entity / Component pattern

`Entity` owns one `THREE.Object3D` plus a `Map<ComponentClass, Component>`. Components are keyed by their constructor (`entity.getComponent(GridPlacement)`) so missing imports error loudly at the call site.

Component lifecycle hooks (all optional):

- `attach(entity)` — runs in `entity.addComponent()`; entity ref now available.
- `onAddedToWorld(world)` — runs in `world.addEntity()`; world ref available.
- `onRemovedFromWorld(world)` — runs in `world.removeEntity()`.
- `update(dt)` — runs from `entity.update()`.
- `toJSON()` — returns plain serialisable data.

Components that need world context (e.g. `GridPlacement` reading `world.grid.cellSize`) apply themselves via `onAddedToWorld`, not `attach`.

### Imports — namespace for utility modules

Per `.claude/rules/javascript/coding-style.md`: utility / multi-export modules use `import * as Namespace`. Currently in effect for `errors.js`, `world-serializer.js`, and the `engine/index.js` façade. Single-class modules (Renderer, GameLoop, Input, AssetManager, etc.) keep named imports because `Renderer.Renderer` doubling adds nothing.

### Visual aesthetic — cute evil / cozy villain

NOT terminal/IDE chrome. Don't use `//` prefixes, `>` chevrons, monospace primaries, terminal-green palettes, or other code-aesthetic motifs as visual identity. Real visual identity (palette, typography, decorative motifs) is its own dedicated design pass after the foundation lands; until then keep placeholders neutral. The dev console is the one place monospace + neutral dark are appropriate — it's a developer tool, not part of the game's identity.

### V4 authoring grammar

In Builder camera mode, the right-edge `AuthoringPanel` (`scripts/modules/ui/authoring-panel.js`) is bound to a tabbed `<aside id="authoring-panel">`. Three tabs: Build (paint/erase floor, erase block + terrain.block catalogue), Decor (erase decor + decor.floor/decor.wall catalogue), Minions (erase minion + character catalogue).

Dispatch flow:

```
Panel tile click  →  panel.selectedToolId(toolId)
                   →  App.setTool(toolId)  →  App.buildToolFromId  →  Tool subclass
                   →  BuilderInputAdapter.setTool(tool)
                   →  tool.activate(editor, scene) adds ghost to scene

Pointer move      →  Input emits pointermove(x, y, target, ...)
                   →  BuilderInputAdapter.onPointerMove  (skips if target ≠ canvas)
                   →  screenToCell or screenToWallEdge
                   →  tool.onCellHover / tool.onWallEdgeHover  →  tint ghost via editor.canX

Pointer down      →  BuilderInputAdapter.onPointerDown  (skips if target ≠ canvas)
                   →  tool.onCellClick("left")  →  editor.placeX / paintFloor / etc.

Right-click       →  Click-vs-drag distinguished by movement threshold (4px).
                   →  Click: setTool(NoopTool) + onCancel callback clears panel.selectedToolId.
                   →  Drag: BuilderCamera handles orbit; tool stays armed.

Q/E               →  tool.rotate("ccw" | "cw")  →  rotationStep += ±1 (mod 4)
```

Tool IDs use `tab:slug[:kind]` format (e.g. `build:paint`, `decor:place:decor.barrel`, `build:block:place:block.gravel`). Each tool sets `this.targetType` to `"cell"` / `"wallEdge"` / `"none"`; the adapter dispatches accordingly.

`WorldEditor` is the only writer of authored content. Every mutation method returns `true`/`false`; predicate methods (`canX`) mirror the gates so ghost tinting is consistent with the actual outcome. Active-attempt refusals emit a toast; hover refusals just tint red.

While a tool is active, `BuilderCamera.setPanEnabled(false)` disables left-click pan so the click doesn't double as a camera drag. WASD-pan and right-click orbit still work.

`Input` passes `event.target` through pointer events. `BuilderCamera` and `BuilderInputAdapter` both ignore events whose `target` isn't the canvas — clicks on the panel chrome don't engage the camera or the tool dispatcher.

### Derived entities are not persisted

The save snapshot carries authoritative entities only — anything regenerated from other state on load is excluded via the `SAVE_SKIP_KINDS` constant in `scripts/app.js`. Currently that's `PLAYER_KIND` and the three `wall.stone.*` kinds (straight / half / corner). The skip-list is applied in both directions: `WorldSerializer.toJSON` skips them on save, and `App.applyAutosaveSnapshot` passes the same list to `fromJSONv2` so legacy snapshots that still carry the derived kinds are filtered on load.

**If WallTracer (or any future tracer) gains additional auto-produced kinds, each new kind MUST be added to `SAVE_SKIP_KINDS`.** Persisting tracer output causes a duplication bug at load: `fromJSONv2` fires `entityAdded` for each floor, the tracer reacts by building its full set of walls + corners from current topology, and then the snapshot's own walls + corners are added on top. Wall index entries collapse correctly (array push) but the corner map overwrites — one corner per vertex gets orphaned in the world and stays there. Symptom is "corner-touching edges don't update properly after reload." See plan-v5 Issues and Adjustments for the full debug history.

The same rule applies to any future kind whose state can be fully reconstructed from the rest of the world (cost-system pre-requisite indicators, lighting volumes derived from torch placement, etc.) — derive on load, don't persist.

### Builder camera multi-button safety

`BuilderCamera` tracks the held drag button via `event.buttons` bitmask, not just by matching `event.button` on pointerup. If a pointerup is missed (pointer capture, pointercancel, browser oddities), the next pointermove/pointerup self-heals when the bitmask shows the drag button is no longer held.

### V4+ long-term intent

Future-version intentions live in `~/.claude/projects/.../memory/project_v4_future_intent.md`: cost system, tech-tree, minion-driven construction (rooms dug out of `terrain.block` cells), dual catalogue surface (panel + bottom toolbar), free Y-rotation, move-player tool. V4 architecture accommodates them without requiring schema migrations — particularly the `meta` bag and the `WorldEditor` mutation surface.

### Dev console

Slide-in debug panel on the right edge of the viewport. Toggle with `` ` `` (backtick) or auto-open via the `?debug=1` URL param. The toggle ignores the keypress when an `INPUT` / `TEXTAREA` / `contenteditable` is focused, so typing backticks in the regex filters doesn't slam the panel shut.

Two pieces of state, kept apart:

- **Capture** lives on `DevConsole` (`engine/dev/dev-console.js`) — fixed-size ring buffer, payload stringification with `[ClassName]` replacer, re-entrancy guard.
- **Display** lives on `DevConsoleViewModel` (`engine/dev/dev-console-view-model.js`) — KO observables for the events list, stats, filters, `nowMs` for relative-time formatting.

A `setInterval(100ms)` flush copies the buffer snapshot into the observables only when dirty. Stats poll happens on the same timer. High-frequency events (`pointermove` by default) are dropped at capture time unless the "Noisy" checkbox is on.

The capture sink installs into `Emitter.devSink`. Gameplay code cannot subscribe through that channel — it is a one-way mirror for instrumentation only.

---

## Project layout

### Asset folders

KayKit packs live under `assets/kaykit/<pack-slug>/models/{gltf,textures}/`. The `models/` intermediary is part of how Kay packages — do not flatten it. The asset manifest at `assets/manifest.json` is the only place file paths appear; gameplay code refers to assets by flat dot-id (`floor.stone.basic`).

### World axes — +X is east, +Z is north

The world's compass orientation is encoded in `buildEmptyRoom`: walls placed at `cz = z0` are the "south" side, walls at `cz = z0 + depth - 1` are the "north" side. So `+X` runs east, `+Z` runs north (and `-Z` is south, `-X` is west). When laying out decor, patrol cells, or anything else with a directional name, use this convention. There is no in-world compass HUD yet — when the user asks "which way is north?" the answer is "increasing Z" (until/unless we add a compass widget).

### Cozy theme — what's where, and what's off-limits

The "witchy arcade" visual identity lives in `styles/cozy.css`, loaded **after** `main.css` in `index.html`. `main.css` keeps the V0 neutral dark theme; `cozy.css` only restyles the surfaces in the V2 aesthetic scope. The split lets dev surfaces stay neutral by default — important for instrumentation legibility.

In scope (restyled by `cozy.css`):

- `#camera-mode-chip`, `#save-status-chip` (HUD chips)
- `#hud-actions` and its child buttons (`#save-button`, `#load-button`, future `#reset-button`)
- `#loading-overlay` and its descendants
- `#toast-tray` and `.toast` variants (`.is-info`, `.is-warning`, `.is-error`)
- `#min-viewport-overlay` and its descendants
- `#confirm-modal` and its descendants (generic two-button confirmation modal — Load and Reset both consume it)

Out of scope (stays neutral, do **not** restyle in `cozy.css`):

- `#dev-console` and its descendants
- `#fatal-overlay` and its descendants
- `#fps-chip`

Palette (CSS custom properties in `:root`):

- `--cozy-purple` `#1a0e2e` — page bg + Three.js scene background (set in `app.js`'s `SCENE_BACKGROUND` const, so the world and the chrome share one hue).
- `--cozy-purple-soft` `#2c1a47` — panel surface; also used as the HemisphereLight ground tint (`SCENE_AMBIENT_GROUND`) for ambient cohesion.
- `--cozy-purple-deep` `#0f0620` — chunky drop-shadow colour.
- `--cozy-neon` `#5af0a0`, `--cozy-neon-dim` `#3eaa70` — accent / progress / "Saved" status borders.
- `--cozy-text` `#f0eaff`, `--cozy-text-dim` `#9c8db5` — primary and muted text.
- `--cozy-danger` `#ff4565` — error border / save-failed state.

Reach for these instead of inlining hex codes.

Chrome formula — every in-scope panel uses this exact recipe:

```css
border-radius:    12px;    /* 999px for chips/pills */
border:           2px solid var(--cozy-neon-dim);
background:       var(--cozy-purple-soft);
box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),    /* top-edge highlight */
    0 5px 0 var(--cozy-purple-deep),             /* chunky offset shadow */
    0 8px 18px rgba(0, 0, 0, 0.4);               /* soft ambient drop */
```

Active / highlighted state swaps `--cozy-neon-dim` for `--cozy-neon` on the border. Toast severity uses full-perimeter `border-color` (info = neon-dim, warning = neon, error = danger). That's the entire interaction vocabulary V2 offers — anything more elaborate (banner ribbons, gradient buttons) is explicitly out of scope until a future redesign.

Typography: heading = `Lilita One` (chunky rounded display, with `Trebuchet MS` / system-ui fallbacks), body = `Atkinson Hyperlegible` (with system-ui fallbacks). Self-hosted woff2s under `styles/fonts/` (six files: Lilita One 400 latin + latin-ext; Atkinson Hyperlegible 400 and 700, each latin + latin-ext). `@font-face` rules with `font-display: swap` live at the top of `cozy.css`. Source / license note in `styles/fonts/SOURCE.md`. All fonts are SIL OFL 1.1.

No decorative SVG ornaments — V2 carries the personality through chrome alone. If a future theme needs ornamental SVGs, source them from a CC0/CC-BY library (Game-icons.net is fine) and document under a `styles/icons/SOURCE.md` per-asset table.

### KayKit characters and animations are separate

KayKit ships character meshes and animation clips in **separate** GLBs that bind to a shared rig. A character GLB (e.g. `Skeleton_Minion.glb`) has the SkinnedMesh and skeleton but **no** embedded `AnimationClip`s — `gltf.animations` is empty. The clips live in dedicated rig libraries:

- `assets/kaykit/skeletons/animations/gltf/Rig_Medium/` — base rig clips that ship with the Skeletons pack: `Rig_Medium_General.glb`, `Rig_Medium_MovementBasic.glb`.
- `assets/kaykit/character-animations/animations/gltf/Rig_Medium/` — the **character-animations** extension pack adds: `CombatMelee`, `CombatRanged`, `MovementAdvanced`, `Simulation`, `Special`, `Tools` (and `Rig_Large` equivalents for the larger characters). Same rig, so clips drop in alongside the base set.

Manifest entries in `assets/manifest.json` use ids like `animations.rig-medium.general`. `App.spawnMinion` combines the per-character clip array with each rig library's clips and hands the merged array to the `Animator` component. Bone names are preserved by `SkeletonUtils.clone`, so the original `AnimationClip` tracks resolve against the cloned skeleton.

Rig_Medium clip names follow `<State>_<Variant>` — usually `_A` and `_B`, sometimes `_C`. Common states observed on the Skeleton_Minion: `Idle_A`, `Idle_B`, `Walking_A/B/C`, `Running_A/B`, `Hit_A/B`, `Death_A/B`, `Jump_Start/Land/Idle/Full_Short/Full_Long`, `Spawn_Air/Ground`, `Interact`, `PickUp`, `Throw`, `Use_Item`. There is no plain `Idle` or `Walk` — always pick a variant. The current `MINION_CLIPS` map in `app.js` uses `Idle_A` and `Walking_A`.

### KayKit Dungeon Remastered uses 4m cells

KayKit's native cell convention is **4 metres**. `floor_tile_large.gltf` is 4×4×0.15m; `wall.gltf` is 4×4×1m (4m wide spanning the full cell edge). The world `Grid` should be constructed with `new Grid(width, depth, 4)` to match. There are smaller half-scale floor variants (`floor_tile_small.gltf` is 2×2m) but no matching small wall tiles, so don't try to scale-down the world — match KayKit's 4m. The Grid class itself defaults to `cellSize = 2` for generic use; cozy-lairs always overrides to 4.

Manifest schema:

```json
{
  "version": 1,
  "assets": [
    {
      "id":          "...",
      "path":        "...",
      "type":        "gltf",
      "tier":        "core" | "world",

      "kind":        "decor.floor" | "decor.wall" | "character" | "terrain.block" | null,
      "displayName": "...",
      "meta":        { "scale": 2, "yOffset": 1.9, "...": "..." }
    }
  ]
}
```

Tier `core` is preloaded on boot; `world` is lazy-loaded on first use. Annotated entries (those with a non-null `kind`) appear in the AuthoringPanel catalogue and are rendered as thumbnails by `IconRenderer` at boot. `displayName` is the tile label. `meta` is preserved verbatim by `AssetManager` and exposed via `assets.getMeta(id)` — V4 reads two keys from it via `Renderable.reattach`:

- `meta.scale` — uniform scalar applied to the mounted mesh's local scale. Used when KayKit's native cube size (e.g. block-bits is `2m`) doesn't match the grid cell (`4m`).
- `meta.yOffset` — added to the mounted mesh's local Y. Used when a GLTF's origin is at mid-height rather than the floor.
- `meta.zOffset` — added to the mounted mesh's local Z. For wall decor placed via `EdgePlacement`, local +Z is the room-facing direction (rotation handles all 4 sides), so this acts as "depth out from the wall". Used when the asset's origin is at the wall's centre line rather than its room-side face.

Future versions will read additional `meta` fields (cost, requiresUnlock, category) without a schema migration.

### Three.js vendoring (libs/three/)

Pinned at **r171** (`three@^0.171.0`). When re-vendoring, copy from `node_modules/three/`:

- `build/three.module.js`
- `build/three.core.js` (re-exported by three.module.js — easy to miss)
- `examples/jsm/loaders/GLTFLoader.js`
- `examples/jsm/utils/SkeletonUtils.js`
- `examples/jsm/utils/BufferGeometryUtils.js`

`GLTFLoader.js` line 68 must be patched after copy: `'../utils/BufferGeometryUtils.js'` → `'./BufferGeometryUtils.js'` (we flatten under `libs/three/` instead of preserving the `loaders/utils/` sibling layout).

### LZ-string vendoring (libs/lz-string/)

Pinned at **1.5.0** (`lz-string@1.5.0` in devDependencies, pinned exactly). Copy `node_modules/lz-string/libs/lz-string.min.js` to `libs/lz-string/lz-string.min.js`. Loaded as a classic UMD `<script>` in `index.html` before the bootstrap module; modules access it via `const LZString = window.LZString;` aliased at the top of the file (same pattern as KO). The codec layer uses `compressToUTF16` / `decompressFromUTF16` for `localStorage` (densest mode) and `compressToBase64` / `decompressFromBase64` for file saves (wrapped in `{ "v": 2, "lz": "<base64>" }` so the file stays valid JSON).

### Tests

Vitest, configured minimally. Default environment is `node`; per-file opt-in with `// @vitest-environment jsdom` for tests that touch the DOM (`Input`, `SaveService`). Run with `npm test`. Tests mirror the module layout under `tests/`; multi-entity world fixtures live in `tests/data/` as JSON.
