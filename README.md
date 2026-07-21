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
- **Light / Dark theme** toggle (defaults to dark). Fully responsive.
- **Privacy** — all parsing and computation happen in the browser. No data is uploaded
  to any server.

## Getting your data

1. Open the [Neuralwatt Usage Analytics Portal](https://portal.neuralwatt.com/dashboard/usage).
2. Pick a date range and a **single model**.
3. **Export as JSON**.
4. Repeat per model.
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
```

> **Note:** `app.js` is a single ~1.5k-line vanilla-JS file. There is no module
> system or bundler. See `AGENTS.md` for conventions when editing it.

## Tech

- Vanilla JavaScript (no framework, no bundler)
- CSS variables for theming
- [Chart.js 4](https://www.chartjs.org/) (via CDN)
- Google Fonts: Inter, Outfit, JetBrains Mono

## License

Released under the [MIT License](./LICENSE). See `LICENSE` for the full text.

## Trademarks

"Neuralwatt" and related marks are property of their respective owners. This
project is unofficial and third-party; use of such marks is for identification
purposes only and does not imply endorsement.
