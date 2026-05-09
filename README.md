# Cozy Lairs

A cozy lair-builder game inspired by classics like *Dungeon Master*, but with more of a "cute evil / cozy villain" aesthetic. You're not raiding a dungeon — you're building one, decorating it, and enjoying the "slice of life" drama as you watch your minions live and work together to make the lair thrive.

## Status

Foundational prototype only. V0 focused on building a walkable empty room demo as a way to validate the supporting infrastructure around it. Real lair-building UX (placing walls, doors, and decor; minion AI; build-mode tools) will come in subsequent versions.

The technical design for V0 can be found in [.project/designs/design-v0.md](.project/designs/design-v0.md). The implementation plan for V0 in [.project/plans/plan-v0.md](.project/plans/plan-v0.md).

## Running

The page is plain ES modules with an import map — no build step. You need a static server because browsers block `file://` ES module loads and `fetch` for the asset manifest.

From the project root:

```sh
npx serve .
```

Then open the printed URL (typically `http://localhost:3000`).

`?debug=1` on the URL auto-opens the dev console on boot.

## Tests

```sh
npm install
npm test
```

Vitest, configured minimally. Default environment is `node`; tests that need DOM (Input, SaveService) opt in per file with `// @vitest-environment jsdom`.

## Assets

This project uses the **KayKit Dungeon Remastered** asset pack by **Kay Lousberg**. These assets were distributed under the gracious terms of CC0, so are included in this repository, however you are strongly encourage to support the create and are **required** to validate that the licensing terms have not changed:

Visit <https://kaylousberg.itch.io/kaykit-dungeon-remastered> and to purchase the the pack (pay-what-you-want).

### Please support Kay Lousberg

Kay puts extraordinary care into the KayKit packs, and a lot of what makes Cozy Lairs feel charming is owed to that work. If you use the pack — for this project, a fork, or your own work — please pay above the suggested price and follow Kay's work at <https://www.kaylousberg.com>. Independent creators like Kay are why hobby game development is accessible at all.

Full attribution and license terms are in [LICENSE.md](./LICENSE.md).

## Demo controls

| Action | Key / mouse |
| --- | --- |
| Toggle Builder ⇄ First-Person camera | `Tab` |
| Builder: orbit | Right-click drag |
| Builder: pan | Left-click drag (cursor stays anchored to the floor) |
| Builder: zoom | Mouse wheel |
| Builder / FP: walk | `W` `A` `S` `D` |
| First-Person: mouse-look | Right-click hold |
| Save | `Ctrl + S` |
| Toggle dev console | `` ` `` (backtick) |
| Auto-open dev console on boot | `?debug=1` URL param |

The first `Ctrl+S` opens a file picker; subsequent saves write silently to the same handle. A `localStorage` autosave runs every 30 seconds as a recovery net.

## Project layout

```
scripts/
├── app.js                       — App singleton, bootstrap, scene wiring
└── modules/
    ├── engine/                  — generic plumbing (Renderer, Input, SaveService, ...)
    │   ├── cameras/             — BuilderCamera, FirstPersonCamera, controller base
    │   └── dev/                 — DevConsole, view-model, time formatters
    ├── world/                   — domain (World, Grid, Entity, components, builders)
    │   ├── components/          — Renderable, GridPlacement, Walker, ...
    │   └── builders/            — empty-room.js (and future builders)
    └── ui/                      — KO view-models, bindings, toast queue
libs/                            — Third Party libraries
libs/three/                      — Three.js r171 + addons
assets/                          — manifest.json plus the KayKit pack (not committed)
styles/main.css                  — HUD, loading overlay, dev console, fatal overlay
tests/                           — Vitest, mirrors module layout
.project/                        — design, plan, reviews
.claude/                         — project conventions and skill definitions
```

## License

Cozy Lairs source, designs, and plans: **CC BY-SA 4.0**.
KayKit assets: separate, not covered by this project's license — see [LICENSE.md](./LICENSE.md).
Some skills under `.claude/skills/` are adapted from [claudekit](https://github.com/duthaho/claudekit/) (MIT).

*Third Party libraries installed via Node (such as vitest) or included under `libs/` are not covered by this projects license.*
