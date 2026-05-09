# Font Sources

Self-hosted woff2s used by the cozy theme. `@font-face` rules live in [`../cozy.css`](../cozy.css).

## EB Garamond

- **Files**: `eb-garamond-latin.woff2`, `eb-garamond-latin-ext.woff2`
- **Weights covered**: 400 (regular), 500 (medium) — the file is a variable font, so a single woff2 covers both weights via the `font-weight: 400 500` range syntax.
- **Author**: Octavio Pardo, Georg Mayr-Duffner — based on Garamond's original 16th-century cuts.
- **Source**: <https://fonts.google.com/specimen/EB+Garamond> (Google Fonts API, woff2 endpoint).
- **Upstream repo**: <https://github.com/octaviopardo/EBGaramond12>
- **License**: SIL Open Font License 1.1.

## Atkinson Hyperlegible

- **Files**: `atkinson-hyperlegible-400-latin.woff2`, `atkinson-hyperlegible-400-latin-ext.woff2`, `atkinson-hyperlegible-700-latin.woff2`, `atkinson-hyperlegible-700-latin-ext.woff2`
- **Weights covered**: 400 (regular), 700 (bold) — static fonts, one file per weight + subset.
- **Author**: Braille Institute of America — designed for low-vision readers.
- **Source**: <https://fonts.google.com/specimen/Atkinson+Hyperlegible> (Google Fonts API, woff2 endpoint).
- **Upstream repo**: <https://github.com/googlefonts/atkinson-hyperlegible>
- **License**: SIL Open Font License 1.1.

## Subsets

Only `latin` and `latin-ext` are included. The Google Fonts API also serves `cyrillic`, `cyrillic-ext`, `greek`, `greek-ext`, and `vietnamese` subsets — re-fetch if the project ever localises beyond the latin script. Re-fetching is straightforward: `curl` the `https://fonts.googleapis.com/css2?...` endpoint with a modern-browser User-Agent header to get the woff2 URLs, then `curl` each woff2 in turn.

## SIL Open Font License 1.1 (excerpt)

Both fonts are distributed under SIL OFL 1.1. In short: free to use, embed, modify, and redistribute, including in commercial and proprietary projects. Reserved Font Names cannot be reused for derivative works. Full license text: <https://openfontlicense.org/>.
