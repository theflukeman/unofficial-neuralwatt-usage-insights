# AGENTS.md — Guidance for AI agents working in this repo

## Project at a glance

Static, client-side dashboard for analyzing Neuralwatt usage JSON exports.

- **Stack:** Vanilla JS, plain HTML, CSS variables, Chart.js (CDN). No framework,
  no bundler, no package manager, no build step.
- **Entrypoint:** `index.html` — loads `index.css` and `app.js`, plus Chart.js and
  Google Fonts from CDN.
- **All app logic lives in `app.js`** (~1.5k lines): file parsing, multi-file
  aggregation, cost/energy/carbon calculations, rendering, charts, table, CSV export,
  theme toggle.
- **No backend.** All parsing and computation run in the browser. Never introduce
  network upload of user data.

## Editing conventions

- `app.js` is a single non-modular file. Preserve the existing top-to-bottom ordering
  (init → data load → aggregation → helpers → rendering). Add new functions adjacent
  to related ones rather than at the end.
- DOM IDs referenced from JS must match `index.html` exactly. When touching markup,
  grep `app.js` for the element id before renaming/removing.
- Global functions are called from inline `index.html` event handlers only via the
  `DOMContentLoaded` init block — keep new event wiring inside `app.js`, not inline.
- Charts use Chart.js 4 UMD from CDN (`window.Chart`). Do not assume an `import`;
  guard with `typeof Chart !== 'undefined'` if you add conditional rendering.
- Theme state is a `dark-mode` class on `<body>`. Use CSS variables (`var(--...)`)
  for all colors; do not hardcode hex values in JS-rendered HTML.

## Data model (assumptions to preserve)

- Each import is a **single-model** JSON export. Multiple files are combined and kept
  distinguishable in the "Imported Model Files" list and the model filter.
- Cost methodology note in the UI is authoritative: prompt/completion token splits per
  segment are *estimated* by applying the cycle's aggregate token ratio to each
  segment's totals, then subtracting known cache volumes for uncached inputs. Preserve
  this when refactoring `getCalculatedCosts` / aggregation.
- Third-party comparison can either auto-match against live OpenRouter prices or use
  user-supplied custom $/Mtok rates. Keep both paths functional.

## Running / verifying changes

There is no test suite. To verify:

1. Serve the directory: `python3 -m http.server 8000`
2. Load it in a browser and import a known-good JSON export.
3. Confirm: summary cards populate, all three charts render, logs table is sortable
   and searchable, CSV export works, model filter and date-range filter apply,
   theme toggle flips light/dark.

CDN Chart.js requires internet access in the browser. If offline, charts will not
render — that is expected.

## Files that must never be committed

`.env` (and any `*.env`/`*.local`) may contain live secrets — API keys, tokens,
database credentials. It is gitignored. See `.gitignore`. Never copy secrets into
source files, the README, or commit messages.

## Unofficial status

This tool is explicitly **unofficial** and third-party. Preserve the disclaimer in the
UI and README when editing. Do not imply Neuralwatt endorsement.
