# CLAUDE.md — Project Notes & Feedback

Cross-task learnings and explicit user preferences. Refine, reorganise, or
delete entries as needed — the goal is keeping this useful, not preserving
every word.

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

### KayKit Dungeon Remastered uses 4m cells

KayKit's native cell convention is **4 metres**. `floor_tile_large.gltf` is 4×4×0.15m; `wall.gltf` is 4×4×1m (4m wide spanning the full cell edge). The world `Grid` should be constructed with `new Grid(width, depth, 4)` to match. There are smaller half-scale floor variants (`floor_tile_small.gltf` is 2×2m) but no matching small wall tiles, so don't try to scale-down the world — match KayKit's 4m. The Grid class itself defaults to `cellSize = 2` for generic use; cozy-lairs always overrides to 4.

Manifest schema:

```json
{
  "version": 1,
  "assets": [
    { "id": "...", "path": "...", "type": "gltf", "tier": "core" | "world" }
  ]
}
```

Tier `core` is preloaded on boot; `world` is lazy-loaded on first use.

### Three.js vendoring (libs/three/)

Pinned at **r171** (`three@^0.171.0`). When re-vendoring, copy from `node_modules/three/`:

- `build/three.module.js`
- `build/three.core.js` (re-exported by three.module.js — easy to miss)
- `examples/jsm/loaders/GLTFLoader.js`
- `examples/jsm/utils/SkeletonUtils.js`
- `examples/jsm/utils/BufferGeometryUtils.js`

`GLTFLoader.js` line 68 must be patched after copy: `'../utils/BufferGeometryUtils.js'` → `'./BufferGeometryUtils.js'` (we flatten under `libs/three/` instead of preserving the `loaders/utils/` sibling layout).

### Tests

Vitest, configured minimally. Default environment is `node`; per-file opt-in with `// @vitest-environment jsdom` for tests that touch the DOM (`Input`, `SaveService`). Run with `npm test`. Tests mirror the module layout under `tests/`; multi-entity world fixtures live in `tests/data/` as JSON.
