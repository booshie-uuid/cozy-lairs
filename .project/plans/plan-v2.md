# Plan: Cozy Lairs V2 — Witchy Arcade Aesthetic

## Context

V1's cozy-grimoire theme (hand-drawn corner flourishes, diamond dividers, candle-with-minion sketch, gold-on-aubergine palette) shipped functionally but didn't land aesthetically — it relied on hand-drawn ornaments that are slow to evolve and didn't read as "cool". V2 replaces it with a chunky modern arcade UI: dark purple ground, hex-green neon accent, "medium chunky" panel chrome built from CSS primitives only. The Three.js canvas background sinks to match the UI background hue so the world and the chrome read as one piece. Same in-scope surfaces as V1 (HUD chips, loading overlay, toast tray, min-viewport overlay); developer surfaces (dev console, fatal overlay, FPS chip) stay neutral.

Full design: [.project/designs/design-v2.md](../designs/design-v2.md).

V2 is a single-focus aesthetic redesign — no behavioural changes, no new components, no new tests. Tasks are sequenced so the visual surface lands first (pre-stage fonts → chrome rewrite → canvas sink), and cleanup of the obsolete V1 assets happens last. That way manual verification has the new aesthetic to compare against while the deletable assets still exist as fallback.

`VERSION` in `scripts/app.js` is bumped as the *first* code change of each task per the project's versioning convention. Plan-v2 uses the `V2_N_0` format throughout; the value advertised after task N completes is `V2.N.0`.

---

## Task 1: Pre-stage Lilita One self-hosted

### Objective

Download the Lilita One woff2 files into `styles/fonts/` and update `SOURCE.md`. No CSS or HTML changes — purely additive prep so Task 2's `cozy.css` rewrite can reference Lilita One immediately without a chicken-and-egg moment where the CSS points at nonexistent files.

### Expected Outcomes

- `styles/fonts/lilita-one-latin.woff2` and `styles/fonts/lilita-one-latin-ext.woff2` exist and are the actual woff2 files served by the Google Fonts API (not redirects, not TTFs).
- `styles/fonts/SOURCE.md` has a Lilita One section (author, source URL, license).
- No `cozy.css`, `index.html`, or `app.js` changes in this task. Browser still renders the V1 aesthetic.
- Tests still pass (243/243 — no behavioural code touched).

### Risks / Constraints

- Lilita One ships only as 400 weight, no italic. The `@font-face` (added in Task 2) must declare `font-weight: 400`.
- `curl` of the Google Fonts CSS API must use a modern-browser User-Agent — without it the server returns TTF URLs instead of woff2. Same approach used for EB Garamond + Atkinson Hyperlegible in V1's font self-host.

### Steps

- [*] Bump `VERSION` to `V2_1_0` in `scripts/app.js`.
- [*] `curl` the Google Fonts CSS for `family=Lilita+One:wght@400&display=swap` with a Chrome User-Agent header. Capture the woff2 URLs from the returned `@font-face` blocks.
- [*] `curl` the latin woff2 URL into `styles/fonts/lilita-one-latin.woff2`.
- [*] `curl` the latin-ext woff2 URL into `styles/fonts/lilita-one-latin-ext.woff2`.
- [*] Update `styles/fonts/SOURCE.md`: add a Lilita One section (author Juan Montoreano, source <https://fonts.google.com/specimen/Lilita+One>, license SIL OFL 1.1).
- [*] Run `npm test`.
- [*] Verify: tests pass; `ls styles/fonts/lilita-one-*.woff2` shows two files with non-trivial sizes (~10–30 KB each); no browser-side change yet.

### Decisions

<!-- Filled in during execution. -->

---

## Task 2: Rewrite `cozy.css` with V2 palette, chrome, and typography

### Objective

Full rewrite of `styles/cozy.css` in place. New `:root` palette tokens, `@font-face` rules for Lilita One and the existing Atkinson Hyperlegible, `@font-face` rules for EB Garamond removed, the "medium chunky" chrome formula applied to every in-scope surface. After this task, refreshing the browser shows the V2 aesthetic — even though the V1 minion SVG and `.cozy-divider` markup still exist in `index.html` (cleanup in Task 4).

### Expected Outcomes

- `styles/cozy.css` uses only V2 palette tokens (`--cozy-purple`, `--cozy-purple-soft`, `--cozy-purple-deep`, `--cozy-neon`, `--cozy-neon-dim`, `--cozy-text`, `--cozy-text-dim`, `--cozy-danger`). All V1 tokens (`--cozy-aubergine`, `--cozy-candle-gold`, `--cozy-parchment`, `--cozy-ember`, `--cozy-sage`, etc.) are gone.
- `@font-face` rules for Lilita One present; `@font-face` rules for EB Garamond removed; Atkinson Hyperlegible rules preserved.
- `#camera-mode-chip` and `#save-status-chip` use the chunky pill recipe (`border-radius: 999px`, neon-dim border, panel-soft surface, top-edge highlight, chunky drop shadow).
- `#loading-overlay` background matches `--cozy-purple`. `.loading-overlay-title` is Lilita One, `--cozy-neon`, with a soft glow text-shadow. Progress bar uses the chunky recipe with neon-green fill.
- `.toast` uses the chunky recipe; `is-info` / `is-warning` / `is-error` border-left tints map to `--cozy-neon-dim` / `--cozy-neon` / `--cozy-danger`.
- `#min-viewport-overlay`'s inner panel uses the chunky recipe; heading in Lilita One, body in Atkinson.
- The `.toast::before` / `.toast::after` corner-flourish pseudo-elements are removed. The `.cozy-divider` rule is removed.
- Dev console / fatal overlay / FPS chip selectors are not touched — they stay neutral per the scope rule.

### Risks / Constraints

- The minion-with-candle inline `<svg>` and `.cozy-divider` divs still exist in `index.html` after this task. Without their styles, the SVG renders unstyled (small, default colour) and the divs render as 0-height flex items. Fine until Task 4 deletes them.
- The corner-flourish pseudo-elements being removed means `.toast::before` / `::after` go away. If any other rule (in `main.css` or elsewhere) relies on those pseudo-elements, it would break — but neither does, verified during V1 implementation.
- Don't introduce new behaviour or selectors outside the in-scope list. Resist the temptation to "polish" the dev console along the way.

### Steps

- [*] Bump `VERSION` to `V2_2_0`.
- [*] Rewrite `styles/cozy.css` from scratch:
    - [*] `@font-face` rules for Lilita One latin + latin-ext (font-weight 400, font-display: swap, unicode-range copied from the Google Fonts CSS).
    - [*] `@font-face` rules for Atkinson Hyperlegible 400 + 700 latin + latin-ext (preserved from V1).
    - [*] Remove `@font-face` rules for EB Garamond entirely.
    - [*] `:root` block with V2 palette tokens.
    - [*] Define a reusable chunky chrome formula via comments / convention (see design doc).
    - [*] Apply chrome to `#camera-mode-chip` and `#save-status-chip` with `border-radius: 999px`.
    - [*] Apply chrome to `#loading-overlay` (background) and `.loading-overlay-inner` (panel).
    - [*] Style `.loading-overlay-title` in Lilita One, neon, with soft glow.
    - [*] Style `.loading-overlay-progress` and `.loading-overlay-bar` for neon-green fill on dark track.
    - [*] Style `.loading-overlay-status` and `.loading-overlay-percent` in Atkinson + dim text.
    - [*] Apply chrome to `.toast` with severity-tint border-lefts.
    - [*] Apply chrome to `.min-viewport-inner` with Lilita One heading + Atkinson body.
- [*] Verify in browser: refresh and inspect each in-scope surface against the design's component breakdown. Force a save failure (dev console quick action) to verify the error toast variant. Resize below 1024×640 to verify the min-viewport overlay.

### Decisions

- Hid stale V1 markup (`.loading-overlay-sketch` SVG and `.cozy-divider` divs) via `display: none` in `cozy.css` rather than letting them render unstyled. The plan said "fine until Task 4 deletes them" but the inline SVG without explicit sizing renders at the user-agent default (300×150) — would have dominated the loading overlay. Display:none is cleaner and lets Task 4 stay focused on physical deletion.
- Toast severity = full-perimeter border colour change (`border-color: var(--cozy-danger)`) rather than border-left-only as the design suggested. Strong visual cue without a width-shift between severity variants. Plan's `border-left-color` approach would have been more subtle but harder to spot at a glance.
- Loading overlay treats its full width as the splash background (no inner panel chrome wrapping the content). The progress bar gets its own chunky pill chrome instead. Reads as "splash screen" rather than "windowed app" — appropriate for a one-shot loading state.
- HUD chips (camera-mode + save-status) share a single CSS rule since they have identical chrome. Save-status adds positioning + size on top.
- Loading title text-shadow doubles up: a wide neon blur (24 px) for the glow + a sharp 4 px deep-purple offset for chunky depth. Both at once gives the title both "magic glow" and "embossed" feel.

---

## Task 3: Sink canvas background to UI background

### Objective

Set the Three.js scene's clear color to match `--cozy-purple` so the world and the chrome share the same hue. Shift the HemisphereLight ground tint to `--cozy-purple-soft` so cast lighting / ambient bounce stay coherent with the new bg.

### Expected Outcomes

- `scripts/app.js` sets `scene.background = new THREE.Color(0x1a0e2e)` in `App.buildWorld`.
- The `SCENE_AMBIENT_GROUND` constant changes from `0x303040` to `0x2c1a47`.
- Browser: in builder mode and first-person mode, the visible regions of the canvas not covered by the room are dark purple (matching the HUD chrome's bg colour). No jarring colour seam at the room's perimeter.
- KayKit's stone-and-wood floor still reads correctly under the shifted ambient (not noticeably purple-tinted).

### Risks / Constraints

- If the floor ends up reading too purple under the new ambient, walk the ground tint back toward neutral (e.g. `0x2a2030`) and capture the chosen value in `Decisions`.
- The `Renderer` class may set its own clear color separately from `scene.background`. Verify that setting `scene.background` is sufficient — if not, also set `renderer.setClearColor(...)`.
- First-person mode renders a different camera path; the canvas bg should be visible behind the room's open walls / ceiling. Check both modes during browser-verify.

### Steps

- [*] Bump `VERSION` to `V2_3_0`.
- [*] In `scripts/app.js` `App.buildWorld()`, after `this.world = new World(...)`, add `this.world.scene.background = new THREE.Color(0x1a0e2e);`.
- [*] Update the `SCENE_AMBIENT_GROUND` constant from `0x303040` to `0x2c1a47`.
- [*] If `Renderer` overrides clear color, update or remove that override so the scene's background shows through.
- [*] Run `npm test`.
- [*] Verify in browser: in builder mode, the area outside the room reads purple. Tab to first-person mode, walk to a corner where you can see past the wall, confirm the bg is purple. Confirm the floor still reads as KayKit stone (not visibly purple-tinted).

### Decisions

- Added a new `SCENE_BACKGROUND = 0x1a0e2e` constant alongside the existing ambient/sun colour constants rather than inlining the hex in `buildWorld`. Matches the project's "no magic numbers in body code" convention.
- Did **not** touch `Renderer`'s `CLEAR_COLOR` constant. Once `scene.background` is set, Three.js uses it in preference to the renderer's clearColor, and `gameLoop.start()` runs after `buildWorld()` so no render ever happens before `scene.background` is assigned. Leaving Renderer's default value alone reduces churn.

---

## Task 4: Cleanup — delete V1 aesthetic assets

### Objective

Remove all V1-aesthetic remnants from disk and from `index.html` now that the V2 chrome carries the look without them. Keeps the repo tidy and prevents accidental regressions where someone re-styles a deleted ornament.

### Expected Outcomes

- `styles/icons/` directory deleted entirely (`corner.svg`, `divider.svg`, `SOURCE.md`).
- `styles/fonts/eb-garamond-latin.woff2` and `styles/fonts/eb-garamond-latin-ext.woff2` deleted.
- `styles/fonts/SOURCE.md` no longer has an EB Garamond section.
- The inline `<svg class="loading-overlay-sketch">` block is removed from `index.html`'s `#loading-overlay-inner`.
- Both `<div class="cozy-divider">` instances in `index.html` are removed.
- Browser: aesthetic unchanged from end of Task 3 (the deleted assets weren't being styled or referenced after Task 2 anyway).
- Dev tools network tab shows no 404s on refresh.

### Risks / Constraints

- Verify that `cozy.css` (post-Task 2) doesn't reference any of the deleted classes / files (`./icons/corner.svg`, `./icons/divider.svg`, `.cozy-divider`, `eb-garamond-*.woff2`, EB Garamond `@font-face`). Task 2 should have removed them — confirm with `grep` before deleting.
- Don't touch any KO `data-bind` attributes in the surrounding markup when removing the SVG / divider divs.
- `index.html` line counts shift — make sure the loading overlay's structure still flows naturally without the sketch above the title.

### Steps

- [*] Bump `VERSION` to `V2_4_0`.
- [*] `grep -r "icons/corner\|icons/divider\|cozy-divider\|eb-garamond\|EB Garamond" styles/ scripts/ index.html` and confirm the only hits are inside files about to be modified or deleted.
- [*] Delete `styles/icons/corner.svg`, `styles/icons/divider.svg`, `styles/icons/SOURCE.md`.
- [*] Delete the now-empty `styles/icons/` directory.
- [*] Delete `styles/fonts/eb-garamond-latin.woff2` and `styles/fonts/eb-garamond-latin-ext.woff2`.
- [*] Edit `styles/fonts/SOURCE.md`: remove the EB Garamond section, add a Lilita One section if Task 1's update only stubbed it.
- [*] Edit `index.html`: remove the inline `<svg class="loading-overlay-sketch">…</svg>` block from `#loading-overlay-inner`.
- [*] Edit `index.html`: remove both `<div class="cozy-divider"></div>` instances (one in the loading overlay between title and status; one in the min-viewport overlay between heading and instruction).
- [*] Run `npm test`.
- [*] Verify in browser: refresh, dev tools network tab shows no 404s. Loading overlay still reads cleanly without the sketch. Min-viewport overlay (resize below 1024×640) still reads cleanly without the divider.

### Decisions

- Also removed the interim `.loading-overlay-sketch, .cozy-divider { display: none; }` rule from `cozy.css` after deleting the corresponding markup. Without elements to match, the rule was dead weight; cleaning it keeps `cozy.css` tight.
- `styles/fonts/SOURCE.md`'s closing license paragraph rephrased from "Both fonts" to "All bundled fonts" since there are now three fonts (Lilita One + Atkinson 400 + 700).

---

## Task 5: Rewrite CLAUDE.md "Cozy theme" section

### Objective

Update the project conventions doc to describe the V2 aesthetic in place of V1. The "Cozy theme — what's where, and what's off-limits" section becomes the single source of truth for future contributors (or future-Claude) on the new palette, chrome formula, and typography.

### Expected Outcomes

- `.claude/CLAUDE.md`'s "Cozy theme — what's where, and what's off-limits" section describes V2: the V2 palette tokens, the chunky chrome formula recipe, Lilita One + Atkinson Hyperlegible typography (no EB Garamond), no `icons/` references, no `.cozy-divider`, no minion-with-candle sketch.
- The in-scope / out-of-scope rule list is preserved (it hasn't changed).
- Other CLAUDE.md sections are untouched.

### Risks / Constraints

- Be careful not to delete or edit the surrounding sections (KayKit, Three.js vendoring, Tests, etc.) — they're stable and unrelated.
- Keep the section focused on the *what* and *where*. Don't re-litigate design decisions; the design doc has those.

### Steps

- [*] Bump `VERSION` to `V2_5_0`.
- [*] Rewrite the "Cozy theme — what's where, and what's off-limits" section in `.claude/CLAUDE.md`:
    - [*] Intro paragraph: cozy.css loaded after main.css; same scope rule (in / out).
    - [*] In-scope selector list (unchanged from V1).
    - [*] Out-of-scope selector list (unchanged from V1).
    - [*] V2 palette listing (`--cozy-purple`, `--cozy-purple-soft`, `--cozy-purple-deep`, `--cozy-neon`, `--cozy-neon-dim`, `--cozy-text`, `--cozy-text-dim`, `--cozy-danger`).
    - [*] Chrome formula recipe (border-radius / border / background / box-shadow combo).
    - [*] Typography: Lilita One for headings (self-hosted in `styles/fonts/`), Atkinson Hyperlegible for body. SIL OFL 1.1 for both.
    - [*] Remove all references to `icons/`, `corner.svg`, `divider.svg`, `.cozy-divider`, the minion-with-candle sketch, EB Garamond.
- [*] Verify the rendered Markdown looks clean (preview in IDE if possible).

### Decisions

- The palette listing in CLAUDE.md was expanded into a bullet list (rather than the V1 inline-prose format) because the V2 palette has structural relationships worth surfacing — the canvas/scene background and HemisphereLight ground tint both come from the palette tokens, and the chrome recipe stacks three layers of box-shadow that need clear naming. Bullets make those connections scan-able.
- Captured the full chrome recipe inline in CLAUDE.md (`border-radius`, `border`, `background`, `box-shadow` block). Single source of truth for "how to build a new V2 panel" — anyone (future-Claude or human) adding a new in-scope surface can copy-paste it.

---

### Notable Deviations from Design

- None of significance. Two small adjustments captured in Task 2 + Task 4 decisions: (1) toast severity uses full-perimeter border-colour rather than border-left only for stronger visual distinction, (2) the V1 `.loading-overlay-sketch` SVG markup was hidden via `display: none` in `cozy.css` during Task 2 then deleted in Task 4 (rather than letting it render unstyled between tasks).

---

### Issues and Adjustments

- **Follow-up: add test surfaces for visual review.** User flagged during Task 2 sign-off that evaluating the chrome formula in isolation is hard because the existing in-scope surfaces are all small (HUD chips) or short-lived (loading overlay, min-viewport overlay). A V3 task could add a hidden "test panel" page or a dev-console-toggleable sandbox showing each chrome variant (chip, pill button, panel header, divider, error/warning/info toasts) in one view so the design can be evaluated and iterated on without forcing real failure cases (e.g. throwing save errors to see the error toast).
    - **Resolved (ad hoc):** built `styles/gui-sandbox.html` — static HTML page that loads `main.css` + `cozy.css` and renders every chrome variant in one view (palette swatches, type specimens, HUD chips, all toast severities, loading-style + min-viewport-style panels, plus exploratory rules for buttons / resource chips / banner / modal / list panel / form input). Open at `http://localhost:3000/styles/gui-sandbox.html`. Exploratory rules live in the page's `<style>` block and only graduate into `cozy.css` when their corresponding surface lands in the live game. Plan-v2 itself stays at "implementation done"; final sign-off pending evaluation against the sandbox.
