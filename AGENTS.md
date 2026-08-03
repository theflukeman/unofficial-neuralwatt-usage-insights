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
  for all colors; do not hardcode hex values in JS-rendered HTML. Chart.js dataset
  colors are exempt (they feed the Chart.js API, not HTML) but must carry a comment
  linking each hex to its `--accent-*` variable.
- **XSS rule:** any `innerHTML`/template-literal rendering of user-controlled data
  (model names, filenames, error messages, fetched telemetry) MUST go through the
  `escapeHtml()` helper. Never interpolate a user-controlled value into `innerHTML`
  unescaped. Prefer `textContent` for plain messages.
- Sortable table headers must be keyboard-accessible. Use the shared helpers
  `makeSortableHeader()` / `updateSortAria()` (app.js) — they add `role="button"`,
  `tabindex="0"`, `aria-sort`, `aria-label`, and Enter/Space activation.
- Dynamic state changes announced to screen readers go through the `#sr-announcer`
  element (`aria-live="polite"`, class `sr-only`) via `textContent`, never `innerHTML`.

## External data files

- Pricing tables live in `data/neuralwatt-pricing.json` and
  `data/provider-pricing.json` and are fetched at init by
  `loadExternalPricingTables()`. The built-in copies in `app.js`
  (`NEURALWATT_MODEL_PRICING`, `PROVIDER_MODEL_PRICING`) are fallback defaults —
  keep them in sync when updating the JSON files. The fetch failing (file://,
  offline) silently keeps the built-ins; do not turn that into an error.
- Live-session persistence uses the versioned `localStorage` key
  `neuralwatt_session_v1` (parsed JSON + filter state). Stale/corrupt payloads are
  silently cleared. Do not rename the key without a migration plan.

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

The static site has no test suite of its own at runtime, but Phase 4 added a
**dev-only** test/lint harness (does not affect the zero-build site):

- `npm install` — install dev tooling (ESLint only; tests use `node:test`, no deps)
- `npm test` — runs `tests/core.test.js` against the pure mirrors in `lib/`
  (escapeHtml, clampFinite, validateUsageData, date helpers, getCalculatedCosts)
- `npm run lint` — ESLint over `app.js`, `lib/`, `tests/`

`lib/` is a **sanctioned dev-only carve-out** from the single-file rule: the
functions there are duplicated pure mirrors of `app.js` logic for unit-test
import only. `app.js` remains the runtime source of truth — keep the copies in
sync when changing behavior.

To verify the site manually:

1. Serve the directory: `python3 -m http.server 8000`
2. Load it in a browser and import a known-good JSON export.
3. Confirm: summary cards populate, all three charts render, logs table is sortable
   and searchable, CSV export works, model filter and date-range filter apply,
   theme toggle flips light/dark.

Chart.js is loaded from the committed `vendor/chart.umd.min.js` copy with a CDN
fallback, so charts render offline too (the old CDN-only behavior is gone).

## Files that must never be committed

`.env` (and any `*.env`/`*.local`) may contain live secrets — API keys, tokens,
database credentials. It is gitignored. See `.gitignore`. Never copy secrets into
source files, the README, or commit messages.

## Unofficial status

This tool is explicitly **unofficial** and third-party. Preserve the disclaimer in the
UI and README when editing. Do not imply Neuralwatt endorsement.
