# Unofficial Neuralwatt Usage Insights

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A client-side dashboard for analyzing Neuralwatt usage-analytics JSON exports.
Drop in one or more single-model JSON exports from the Neuralwatt Usage Analytics
Portal and the app aggregates them into summary cards, charts, and a sortable log
table — with energy/cost/savings and carbon-footprint projections.

🌐 **Live demo:** <https://theflukeman.github.io/unofficial-neuralwatt-usage-insights/>

> ⚠️ **Unofficial.** This is a third-party companion tool. It is not affiliated with,
> sponsored by, or endorsed by Neuralwatt. All calculations, pricing simulations, and
> comparison models are for educational and comparative purposes only.

## Features

- **Multi-file aggregation** — import multiple single-model JSON exports; combine and
  filter across models and date ranges.
- **Summary stats** — total requests, tokens & cache hit rate, energy cost & realized
  savings, energy consumption (kWh / Joules), and carbon footprint.
- **Charts** (Chart.js via CDN):
  - Cost & Savings Progression
  - Token Cache Performance
  - Cost per Million Tokens vs. Cost per Request
- **Cost modeling** — energy-cost base selection (flat / monthly / annual plans, custom
  `$/kWh`, or JSON-provided cost) plus third-party rate comparison
  (auto-match against OpenRouter live prices or custom `$/Mtok` rates).
- **Granular logs** — sortable, searchable per-cycle table with CSV export of the
  current view.
- **Model comparison** — side-by-side view of loaded models' key metrics with
  best-value highlighting, plus a per-model trend chart toggle.
- **Session persistence** — imported data and filter state survive page reloads
  (`localStorage`, key `neuralwatt_session_v1`); "Clear Session" resets everything.
- **Light / Dark theme** — follows your OS `prefers-color-scheme` on first visit,
  with a manual toggle that locks in your choice. Fully responsive (tables stack
  into cards on small screens).
- **Accessibility** — keyboard-sortable table headers (`role="button"`, Enter/Space),
  `aria-sort` state, and screen-reader announcements for imports, filters, and
  live-data syncs.
- **Privacy** — all parsing and computation happen in the browser. No data is uploaded
  to any server.

## Getting your data

### Method 1: 1-Click Batch Export Bookmarklet (Recommended)

1. Open Neuralwatt Insights and use the **1-Click Batch Export Bookmarklet Generator**.
2. Configure your desired **Time Unit** (Days `days=30` or Hours `hours=72`) and **Timezone**.
3. Drag the **⚡ Batch Export Neuralwatt Data** button to your browser's Bookmarks Bar (or click **Copy Code**).
4. **Click 1:** Click the bookmarklet on any page (or on Neuralwatt) to open/reload the [Neuralwatt Usage Page](https://portal.neuralwatt.com/dashboard/usage) with your chosen parameters (`days`, `hours`, `tz`).
5. **Click 2:** Once the page loads, click the bookmarklet a second time to automatically download JSON exports for all active models!
6. Drag and drop all downloaded JSON files directly into Neuralwatt Insights!

### Method 2: Manual Export

1. Open the [Neuralwatt Usage Analytics Portal](https://portal.neuralwatt.com/dashboard/usage).
2. Pick a date/hour range and a **single model**.
3. **Export as JSON**.
4. Repeat per model as needed.
5. Drop those files into the app for multi-model aggregation.

Only `.json` exports are supported.

## Running

This is a fully static site — no build step, no dependencies to install.

Open `index.html` directly in a browser, or serve the directory for a more
production-like experience:

```bash
# Python (preinstalled in many environments)
python3 -m http.server 8000

# or any static file server, e.g.
# npx serve .
```

Then visit `http://localhost:8000`.

## Project layout

```
index.html   # Markup, CDN includes (Chart.js, Google Fonts)
index.css    # Theming via CSS variables + layout/components
app.js       # All app logic (file parsing, aggregation, rendering, charts)
data/        # Editable pricing tables (neuralwatt-pricing.json, provider-pricing.json)
vendor/      # Vendored Chart.js (offline-capable, with CDN fallback)
lib/         # Dev-only pure-logic mirrors for unit tests (see AGENTS.md)
tests/       # Unit tests (node:test, no runtime deps)
```

> **Note:** `app.js` is a single ~1.5k-line vanilla-JS file. There is no module
> system or bundler. See `AGENTS.md` for conventions when editing it.
>
> The pricing tables in `data/` are fetched at load time; if that fetch fails
> (e.g. opening `index.html` directly via `file://`), the built-in copies in
> `app.js` are used automatically, so behavior is unchanged.

## Tech

- Vanilla JavaScript (no framework, no bundler)
- CSS variables for theming
- [Chart.js 4](https://www.chartjs.org/) — vendored in `vendor/` with a CDN fallback
- Google Fonts: Inter, Outfit, JetBrains Mono

## Development

The runtime is zero-build; the following are **dev-only** tools for contributors
and do not affect the static site:

```bash
npm install      # dev tooling (ESLint only; tests use node:test, no deps)
npm test         # unit tests for lib/ mirrors (escapeHtml, validateUsageData,
                 # getCalculatedCosts, clampFinite, date helpers)
npm run lint     # ESLint over app.js, lib/, tests/
```

`lib/` holds pure mirrors of `app.js` logic so tests can import them without a
DOM. `app.js` is the runtime source of truth — keep the mirrors in sync.

## License

Released under the [MIT License](./LICENSE). See `LICENSE` for the full text.

## Trademarks

"Neuralwatt" and related marks are property of their respective owners. This
project is unofficial and third-party; use of such marks is for identification
purposes only and does not imply endorsement.
