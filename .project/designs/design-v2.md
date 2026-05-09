# Design — Cozy Lairs V2 — Witchy Arcade Aesthetic
Date: 2026-05-10

## Summary

Replace the V1 cozy-grimoire theme (hand-drawn corner flourishes, diamond dividers, candle-with-minion sketch, gold-on-aubergine palette) with a chunky modern arcade UI: dark purple ground, hex-green neon accent, "medium chunky" panel chrome built entirely from CSS primitives. Goals are a tight palette, no artist dependency, easy to maintain, easy to extend in V3+. The Three.js canvas background sinks to match the UI background hue so the world and the chrome read as one piece rather than two adjacent surfaces in different colour families. Same in-scope surfaces as V1 (HUD chips, loading overlay, toast tray, min-viewport overlay); developer surfaces (dev console, fatal overlay, FPS chip) stay neutral. No behavioural changes — V2 is a pure aesthetic pass on top of V1's gameplay foundation.

## Architecture

### Theme replacement, not addition

`styles/cozy.css` is fully rewritten in place. File path stays so `index.html`'s `<link>` and the project's "cozy theme" mental model both survive — only the contents change. The hand-drawn assets are deleted: `styles/icons/corner.svg`, `styles/icons/divider.svg`, `styles/icons/SOURCE.md`, the `<svg>` minion-with-candle inlined in `index.html`'s `#loading-overlay-inner`, and both `<div class="cozy-divider">` instances. The chunky CSS chrome carries the personality without illustrative help — no SVG corners, no dingbats, no doodles.

The "Cozy theme" section of `.claude/CLAUDE.md` is rewritten in place to describe the new palette and chrome formula, replacing the references to the now-deleted icons folder.

### Palette

A single `:root` block in cozy.css owns the palette as CSS custom properties:

```
--cozy-purple         #1a0e2e   page bg / canvas clear color
--cozy-purple-soft    #2c1a47   panel surface
--cozy-purple-deep    #0f0620   drop-shadow color
--cozy-neon           #5af0a0   primary accent / progress / "saved"
--cozy-neon-dim       #3eaa70   subtler accent / info-tone borders
--cozy-text           #f0eaff   primary text (pale lavender)
--cozy-text-dim       #9c8db5   muted text
--cozy-danger         #ff4565   error / save-failed
```

The old palette names (`--cozy-aubergine`, `--cozy-candle-gold`, `--cozy-parchment`, `--cozy-ember`, `--cozy-sage`) are removed wholesale. Any remaining cozy.css rules that referenced them are rewritten to use the new tokens.

### Chrome formula — "Medium chunky"

Every in-scope panel uses the same recipe. Same recipe everywhere = no cascading-style-creep when V3 adds new surfaces:

```css
border-radius:    12px;    /* 999px for chips / pills */
border:           2px solid var(--cozy-neon-dim);
background:       var(--cozy-purple-soft);
box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),   /* top-edge highlight */
    0 5px 0 var(--cozy-purple-deep),            /* chunky offset shadow */
    0 8px 18px rgba(0, 0, 0, 0.4);              /* soft ambient drop */
```

Active / highlighted state swaps `--cozy-neon-dim` for `--cozy-neon` on the border. That's the entire interaction vocabulary the V2 chrome offers — anything more elaborate (banner ribbons, gradient buttons) is explicitly out of scope.

### Typography

EB Garamond (serif, illuminated-manuscript voice) is replaced by **Lilita One** — a chunky rounded display sans, SIL OFL 1.1, available on Google Fonts. Used for game-flavoured headings (the `COZY LAIRS` splash, the min-viewport overlay's `<h2>`). Atkinson Hyperlegible stays as the body / chip font; it's already self-hosted, already legible against the new palette, and already shouldering all the small-text duty.

Lilita One self-hosts alongside the existing fonts under `styles/fonts/` (latin + latin-ext woff2s), same `@font-face` pattern as existing fonts. The two `eb-garamond-*.woff2` files and their `@font-face` rules are deleted.

### Canvas background sink

`scripts/app.js`:

- `scene.background = new THREE.Color(0x1a0e2e)` (matches `--cozy-purple`) — replaces the implicit black/transparent background.
- `SCENE_AMBIENT_GROUND` constant shifts from `0x303040` (cold grey) toward `0x2c1a47` (`--cozy-purple-soft`) — the HemisphereLight's ground tint, so cast lighting / ambient bounce don't fight the new bg. KayKit's stone-and-wood floors still read correctly under that ambient (verified visually during browser-verify; if they read too purple, walk back toward `0x2a2030`).

The neon-green accent does **not** appear in the lighting setup — it's chrome-only, not world-lighting. Keeps gameplay legibility decoupled from theme.

## Components

### HUD chips (`#camera-mode-chip`, `#save-status-chip`)

Pill-shaped (`border-radius: 999px`), neon-dim border, `--cozy-purple-soft` surface, `--cozy-text` (pale lavender) text. Atkinson Hyperlegible. The chunky drop shadow sits underneath both.

### Loading overlay

`#loading-overlay` background = `--cozy-purple` (matches the canvas — feels like the world is the background of the loading screen). `COZY LAIRS` title in Lilita One, `--cozy-neon` colour, with a subtle `text-shadow: 0 0 20px rgba(90, 240, 160, 0.35)` glow. The progress bar uses the chunky-panel recipe at `border-radius: 999px`, with a `--cozy-neon` fill on a `--cozy-purple-deep` inner track. Status text and percent in `--cozy-text-dim` Atkinson.

### Toasts

Chunky pill-radius panels using the chrome recipe. Border-left tint distinguishes severity:

- `is-info`    → `border-left-color: var(--cozy-neon-dim)` (subtle)
- `is-warning` → `border-left-color: var(--cozy-neon)` (brighter)
- `is-error`   → `border-left-color: var(--cozy-danger)` (red)

The corner-flourish pseudo-elements (`.toast::before` / `.toast::after`) are removed entirely.

### Min-viewport overlay

Chunky panel containing the centered heading + instruction. No corner pseudo-elements, no diamond divider — both go away. Heading in Lilita One on `--cozy-neon`, body in Atkinson on `--cozy-text-dim`.

## Data Flow

V2 is a visual / theming pass, not a behavioural change. No new components, no new module boundaries, no new entity-component lifecycle hooks, no new tests. The only behavioural-adjacent code change is in `scripts/app.js` where `scene.background` and the ambient ground tint are wired to constants matching the new palette.

`index.html` loses three pieces of markup:

- The inline `<svg>` minion-with-candle inside `#loading-overlay-inner`.
- The two `<div class="cozy-divider">` separators (one in the loading overlay, one in the min-viewport overlay).
- No new bindings — KO bindings unchanged.

## Error Handling

N/A. Pure visual / CSS / Three.js scene-config change. No new error surfaces, no new validation, no new failure modes.

## Testing Strategy

- All 243 existing unit tests should continue to pass — none of them assert visual style or scene-clear-color values.
- No new unit tests are warranted; the changes don't introduce testable behaviour.
- Manual browser verification covers the surface area:
  - Hard refresh: load overlay reads in new aesthetic; `COZY LAIRS` in Lilita One, neon-green with glow; progress bar fills with neon green.
  - HUD chips read as pill-shaped panels with neon-dim borders and pale-lavender text.
  - Canvas background matches the UI background at room edges (no jarring colour seam).
  - Tab to first-person: world feels coherent with chrome (no fighting hues).
  - Force a save failure via dev console quick action: error toast styled with the danger-red border-left.
  - Resize below 1024×640: min-viewport overlay restyle, no leftover ornaments.
  - Dev console / fatal overlay / FPS chip: visually unchanged from V1.

## Open Questions

1. **Lighting pass-through**: V2 only shifts the HemisphereLight ground colour. If the room interior reads "too cool" or "too purple" after the bg sinks, follow up in V3 with a fuller lighting tune (warm accent fill light, etc.). Out of scope for V2.
2. **Save-status colour cue**: the chip currently shows pale lavender for any state. A V3 enhancement could bind `--cozy-neon` for "Saved" / `--cozy-danger` for "Save failed" / `--cozy-text-dim` for "Autosaved". Easy KO `css` binding — left for later.
3. **Lilita One specifically**: if it doesn't feel right when seen in browser, candidates in the same chunky-rounded family include Fredoka, Bagel Fat One, and Lalezar. Swap is one font-file replacement + one CSS reference.
4. **Banner-ribbon headers** (the `YOU LOST` shape from the reference screenshot): explicitly out of scope. If wanted later, `clip-path` adds it to a single `.cozy-banner` class without disturbing the rest of the chrome.
