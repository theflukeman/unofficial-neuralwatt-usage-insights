#!/usr/bin/env node
// scripts/sync-energy-benchmarks.mjs
//
// DEV-ONLY + GitHub Actions script — NOT part of the static site runtime.
//
// Fetches the Neuralwatt energy-pricing page (server-side, so no CORS), parses
// the published band grid ("Average energy per request, by model and request
// size"), and writes data/energy-benchmarks.json in exactly the shape the
// app's NEURALWATT_ENERGY_BENCHMARKS expects (mWh per request per prompt-size
// band, req distribution %, cache-hit %).
//
// The GitHub Actions workflow (.github/workflows/sync-energy-benchmarks.yml)
// runs this on a schedule and commits any changes — that repo-hosted JSON is
// the app's PRIMARY energy-telemetry source, which sidesteps the portal's
// missing CORS headers (direct browser fetches are blocked in Firefox, etc.).
//
// Zero dependencies (Node >= 18; uses global fetch). Run locally with:
//   node scripts/sync-energy-benchmarks.mjs
//
// Env overrides:
//   ENERGY_PRICING_URL              source page
//   ENERGY_BENCHMARKS_OUT           output path (repo-relative)
//   ENERGY_BENCHMARKS_MIN_MODELS    sanity floor for parsed models (default 5)
//
// The pure parse helpers below are exported so tests/core.test.js can pin the
// contract without network access.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const BAND_HEADERS = ['0–256', '256–1k', '1k–4k', '4k–16k', '16k–64k', '64k–256k', '256k–1M'];

const DEFAULT_SOURCE_URL = 'https://portal.neuralwatt.com/energy-pricing';
const DEFAULT_OUT_PATH = 'data/energy-benchmarks.json';
const DEFAULT_MIN_MODELS = 5;
const REQUEST_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const HTML_ENTITIES = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&middot;': '·'
};

export function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(parseInt(code, 10)))
        .replace(/&[a-z]+;/gi, m => HTML_ENTITIES[m.toLowerCase()] || m);
}

function stripTags(str) {
    return String(str).replace(/<[^>]*>/g, '');
}

function collapseWhitespace(str) {
    return decodeHtmlEntities(str).replace(/\s+/g, ' ').trim();
}

function extractBlocks(html, tag) {
    const blocks = [];
    const re = new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, 'gi');
    let m;
    while ((m = re.exec(html)) !== null) blocks.push(m[0]);
    return blocks;
}

const extractTables = (html) => extractBlocks(html, 'table');
const extractRows = (tableHtml) => extractBlocks(tableHtml, 'tr');
const extractCells = (rowHtml) => extractBlocks(rowHtml, 'td');

// First <div class="...num..."> inside a cell (the energy value), if any.
// Mirrors the app's `cell.querySelector('.num') || cell` fallback.
function extractNumDiv(cellHtml) {
    const re = /<div[^>]*class="[^"]*\bnum\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
    const m = re.exec(cellHtml);
    return m ? { text: m[1], html: m[0] } : null;
}

function extractTitleAttr(divHtml) {
    const m = /title="([^"]*)"/i.exec(divHtml || '');
    return m ? decodeHtmlEntities(m[1]) : '';
}

// ---------------------------------------------------------------------------
// Parsing (pure — unit-tested in tests/core.test.js)
// ---------------------------------------------------------------------------

// Parse a single band cell into the app's band-entry shape. Throws when the
// cell text is neither a parseable energy value nor a "—" placeholder — the
// portal markup has changed and we must fail loudly instead of committing
// garbage.
export function parseBandCell(cellHtml, bandLabel, modelName = '') {
    const numDiv = extractNumDiv(cellHtml);
    const valueHtml = numDiv ? numDiv.html : cellHtml;
    const rawText = numDiv ? numDiv.text : stripTags(cellHtml);
    const cleanText = decodeHtmlEntities(rawText).replace('~', '').trim();

    let display = '—';
    let mwh = null;
    const match = cleanText.match(/(\d+(?:\.\d+)?)\s*(mWh|Wh)/i);
    if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2];
        display = cleanText;
        mwh = unit.toLowerCase() === 'wh' ? val * 1000 : val;
    } else if (cleanText && cleanText !== '—' && cleanText !== '–') {
        const where = modelName ? ` for model "${modelName}" in band "${bandLabel}"` : ` in band "${bandLabel}"`;
        throw new Error(`Unparseable energy value "${cleanText}"${where}. Portal markup may have changed.`);
    }

    const titleAttr = extractTitleAttr(valueHtml);
    const cacheMatch = titleAttr.match(/(\d+)%\s*average cache-hit rate/i);
    const cache_hit_pct = cacheMatch ? parseInt(cacheMatch[1], 10) : null;

    const cellText = collapseWhitespace(cellHtml);
    const pctMatch = cellText.match(/(\d+(?:\.\d+)?)%\s*of reqs/i);
    const req_pct = pctMatch ? parseFloat(pctMatch[1]) : 0;

    return { band: bandLabel, display, mwh, req_pct, cache_hit_pct };
}

// Parse the full page HTML into the app's NEURALWATT_ENERGY_BENCHMARKS shape.
// Throws on structural surprises so the sync pipeline fails loudly instead of
// committing garbage.
export function parseEnergyBenchmarksHtml(html) {
    if (typeof html !== 'string' || !html.trim()) {
        throw new Error('Energy pricing page returned empty content.');
    }

    const tables = extractTables(html);
    const gridTable = tables.find(t => {
        const txt = stripTags(t).replace(/\s+/g, ' ');
        return txt.includes('0–256') && txt.includes('256–1k') && txt.includes('256k–1M');
    });
    if (!gridTable) {
        throw new Error('Could not find the band-grid table (expected headers 0–256 … 256k–1M). Portal markup may have changed.');
    }

    const benchmarks = [];
    for (const rowHtml of extractRows(gridTable)) {
        const cells = extractCells(rowHtml);
        if (cells.length === 0) continue; // header row uses <th>
        if (cells.length !== BAND_HEADERS.length + 1) {
            throw new Error(`Unexpected band-grid row with ${cells.length} cells (expected ${BAND_HEADERS.length + 1}). Portal markup may have changed.`);
        }

        const modelName = collapseWhitespace(stripTags(cells[0]));
        if (!modelName || modelName.toLowerCase() === 'model') continue;

        const bands = cells.slice(1).map((cell, i) => parseBandCell(cell, BAND_HEADERS[i], modelName));

        const modelId = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        benchmarks.push({
            model: modelName,
            id: modelId,
            aliases: [modelId, modelName.toLowerCase()],
            bands
        });
    }

    if (benchmarks.length === 0) {
        throw new Error('No model rows parsed from the band grid.');
    }
    return benchmarks;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export function buildPayload(benchmarks, sourceUrl) {
    return {
        schemaVersion: 1,
        source: sourceUrl,
        fetchedAt: new Date().toISOString(),
        generator: 'scripts/sync-energy-benchmarks.mjs',
        note: "Unofficial mirror of Neuralwatt's published energy benchmarks (average energy per request by model and prompt-size band, trailing 7 days). Generated by scripts/sync-energy-benchmarks.mjs and refreshed by the GitHub Actions workflow. Not affiliated with or endorsed by Neuralwatt.",
        benchmarks
    };
}

function stringify(payload) {
    return JSON.stringify(payload, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
    const sourceUrl = process.env.ENERGY_PRICING_URL || DEFAULT_SOURCE_URL;
    const outPath = process.env.ENERGY_BENCHMARKS_OUT || DEFAULT_OUT_PATH;
    const minModels = parseInt(process.env.ENERGY_BENCHMARKS_MIN_MODELS || String(DEFAULT_MIN_MODELS), 10) || DEFAULT_MIN_MODELS;

    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const outFile = path.resolve(repoRoot, outPath);

    console.log(`Fetching ${sourceUrl} ...`);
    const res = await fetch(sourceUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; unofficial-neuralwatt-usage-insights-sync/1.0)',
            'Accept': 'text/html,application/xhtml+xml'
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) {
        throw new Error(`Fetch failed: HTTP ${res.status} ${res.statusText}`);
    }
    const html = await res.text();

    const benchmarks = parseEnergyBenchmarksHtml(html);
    if (benchmarks.length < minModels) {
        throw new Error(`Only ${benchmarks.length} models parsed (sanity floor is ${minModels}). Aborting to avoid committing a partial mirror.`);
    }

    const payload = buildPayload(benchmarks, sourceUrl);
    const next = stringify(payload);

    let previous = null;
    try {
        previous = await readFile(outFile, 'utf8');
    } catch {
        // first run — file does not exist yet
    }

    if (previous === next) {
        console.log(`No changes — ${outPath} already up to date (${benchmarks.length} models).`);
        return;
    }

    await writeFile(outFile, next);
    console.log(`Wrote ${outPath} (${benchmarks.length} models, fetched ${payload.fetchedAt}).`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    main().catch(err => {
        console.error(`[sync-energy-benchmarks] ${err.message}`);
        console.error('The portal is a third-party site we don\'t control — if its markup changed, please report it at https://github.com/theflukeman/unofficial-neuralwatt-usage-insights/issues');
        process.exit(1);
    });
}
