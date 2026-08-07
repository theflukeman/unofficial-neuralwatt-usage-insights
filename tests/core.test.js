// tests/core.test.js — unit tests for the dev-only pure mirrors in lib/core.js.
// Run with `npm test` (node --test tests/). No DOM, no dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    clampFinite,
    validateUsageData,
    escapeHtml,
    parseDateLocal,
    isDateOnly,
    formatDateTable,
    estimateTokenSplit,
    getCalculatedCosts,
    validateEnergyBenchmarksPayload
} from '../lib/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = (name) => join(here, '..', 'sample-exports', name);
const readSample = (name) => JSON.parse(readFileSync(samplePath(name), 'utf8'));

// ---------------------------------------------------------------------------
// escapeHtml (Phase 1.1 contract)
// ---------------------------------------------------------------------------
test('escapeHtml escapes all five significant characters', () => {
    assert.equal(escapeHtml('<img src=x onerror=alert(1)>'),
        '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(escapeHtml('a & b < c > d "e" \'f\''),
        'a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;');
});

test('escapeHtml handles null/undefined and non-strings', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(42), '42');
    assert.equal(escapeHtml(0), '0');
});

test('escapeHtml leaves plain text unchanged', () => {
    assert.equal(escapeHtml('deepseek-v4-flash-0731-canary'), 'deepseek-v4-flash-0731-canary');
});

// ---------------------------------------------------------------------------
// clampFinite (Phase 1.2 contract)
// ---------------------------------------------------------------------------
test('clampFinite returns value for finite numbers', () => {
    assert.equal(clampFinite(5), 5);
    assert.equal(clampFinite(0), 0);
    assert.equal(clampFinite(-3.5), -3.5);
    assert.equal(clampFinite(1e10), 1e10);
});

test('clampFinite falls back for NaN/Infinity/null/undefined/strings', () => {
    assert.equal(clampFinite(NaN), 0);
    assert.equal(clampFinite(Infinity), 0);
    assert.equal(clampFinite(-Infinity), 0);
    assert.equal(clampFinite(null), 0);
    assert.equal(clampFinite(undefined), 0);
    assert.equal(clampFinite('12'), 0); // string is not a number
    assert.equal(clampFinite('12', 7), 7);
});

test('clampFinite nonNegative mode rejects negatives', () => {
    assert.equal(clampFinite(-1, 0, true), 0);
    assert.equal(clampFinite(0, 0, true), 0);
    assert.equal(clampFinite(3, 0, true), 3);
});

// ---------------------------------------------------------------------------
// validateUsageData (Phase 1.2 contract)
// ---------------------------------------------------------------------------
test('validateUsageData accepts a real Neuralwatt sample export', () => {
    const data = readSample('neuralwatt-export-deepseek-v4-flash-0731-canary-30d.json');
    const result = validateUsageData(data);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
});

test('validateUsageData accepts all shipped sample exports', () => {
    const names = [
        'neuralwatt-export-qwen3.6-35b-30d.json',
        'neuralwatt-export-qwen3.5-397b-30d.json',
        'neuralwatt-export-kimi-k2.7-code-flex-30d.json',
        'neuralwatt-export-kimi-k2.7-code-30d.json',
        'neuralwatt-export-glm-5.2-short-flex-30d.json',
        'neuralwatt-export-glm-5.2-short-fast-30d.json',
        'neuralwatt-export-glm-5.2-short-30d.json',
        'neuralwatt-export-glm-5.2-30d.json',
        'neuralwatt-export-deepseek-v4-flash-0731-canary-30d.json'
    ];
    names.forEach(name => {
        const result = validateUsageData(readSample(name));
        assert.equal(result.valid, true, `${name}: ${JSON.stringify(result.errors)}`);
    });
});

test('validateUsageData rejects non-object roots (arrays, strings, null)', () => {
    assert.equal(validateUsageData(null).valid, false);
    assert.equal(validateUsageData([]).valid, false);
    assert.equal(validateUsageData('nope').valid, false);
    assert.equal(validateUsageData(42).valid, false);
    const arr = validateUsageData([]);
    assert.match(arr.errors[0], /Invalid Neuralwatt usage JSON format/i);
});

test('validateUsageData rejects string totals.requests', () => {
    // AC.2 fixture: {"totals":{"requests":"x"},"daily":[]}
    const result = validateUsageData({ totals: { requests: 'x' }, daily: [] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('totals.requests') && e.includes('number')),
        `expected field-level totals.requests error, got: ${JSON.stringify(result.errors)}`);
    assert.ok(result.errors.some(e => e.includes('empty array')),
        `expected empty-array error for daily, got: ${JSON.stringify(result.errors)}`);
});

test('validateUsageData rejects multi-model by_model at the structural level? No — that is the handleFilesSelection gate', () => {
    // The single-model invariant is intentionally NOT enforced here; it lives
    // in handleFilesSelection. Structurally, by_model entries with string
    // model fields are valid (AC.2 relies on the gate, not this function).
    const result = validateUsageData({ by_model: [{ model: 'a' }, { model: 'b' }], totals: {}, daily: [] });
    // by_model entries are fine, but daily is an empty array → invalid with
    // the empty-array message (which is what makes the file reject).
    assert.equal(result.valid, false);
});

test('validateUsageData rejects by_model entries without a string model field', () => {
    const result = validateUsageData({ by_model: [{ requests: 1 }], totals: {}, daily: [] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('by_model[0]') && e.includes('model')));
});

test('validateUsageData flags missing date on daily rows', () => {
    const result = validateUsageData({ totals: {}, daily: [{ requests: 1, tokens: 2 }] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('daily[0]') && e.includes('date')));
});

test('validateUsageData rejects unrecognized JSON with no markers', () => {
    const result = validateUsageData({ foo: 'bar' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Unrecognized JSON')));
});

test('validateUsageData rejects rows-only exports (engine cannot consume them)', () => {
    // The merge engine only reads daily/hourly; a file that relies on `rows`
    // must fail loudly instead of importing with an empty timeline.
    const result = validateUsageData({ totals: {}, by_model: [{ model: 'x' }], rows: [{ date: '2026-07-01', requests: 1 }] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('rows') && e.includes('not supported')),
        `expected unsupported-rows error, got: ${JSON.stringify(result.errors)}`);
});

test('validateUsageData rejects usage-only exports with a clear message', () => {
    const result = validateUsageData({ totals: {}, by_model: [{ model: 'x' }], usage: [{ date: '2026-07-01', tokens: 5 }] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('usage') && e.includes('not supported')));
});

test('validateUsageData tolerates rows/usage when daily rows are present', () => {
    const result = validateUsageData({
        totals: { requests: 1 },
        daily: [{ date: '2026-07-01', requests: 1, tokens: 5 }],
        rows: [{ date: '2026-07-01', requests: 1 }]
    });
    assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('validateUsageData accepts hourly-only exports', () => {
    const result = validateUsageData({
        totals: { requests: 1 },
        by_model: [{ model: 'x' }],
        hourly: [{ date: '2026-07-01T05:00:00', requests: 1, tokens: 5 }]
    });
    assert.equal(result.valid, true, JSON.stringify(result.errors));
});

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
test('parseDateLocal parses date-only strings as local midnight', () => {
    const d = parseDateLocal('2026-07-31');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 6); // 0-based: July
    assert.equal(d.getDate(), 31);
    assert.equal(d.getHours(), 0);
});

test('isDateOnly detects date-only strings', () => {
    assert.equal(isDateOnly('2026-07-31'), true);
    assert.equal(isDateOnly('2026-07-31T12:00:00'), false);
    assert.equal(isDateOnly('not-a-date'), false);
});

test('formatDateTable renders short month + day for date-only', () => {
    // Locale-dependent; assert the shape contains the month abbreviation.
    const out = formatDateTable('2026-07-31');
    assert.match(out, /Jul/i);
    assert.match(out, /31/);
});

// ---------------------------------------------------------------------------
// estimateTokenSplit (Phase 4.4 contract: shared split estimation)
// ---------------------------------------------------------------------------
test('estimateTokenSplit applies the aggregate completion ratio', () => {
    const s = estimateTokenSplit(1000, 800, 200);
    assert.equal(s.promptTokens, 800);
    assert.equal(s.completionTokens, 200);
});

test('estimateTokenSplit handles zero tokens and zero totals', () => {
    assert.deepEqual(estimateTokenSplit(0, 800, 200), { promptTokens: 0, completionTokens: 0 });
    assert.deepEqual(estimateTokenSplit(1000, 0, 0), { promptTokens: 1000, completionTokens: 0 });
});

// ---------------------------------------------------------------------------
// getCalculatedCosts (Phase 4 contract: explicit rate inputs)
// ---------------------------------------------------------------------------
test('getCalculatedCosts keeps original cost when kwhRate is null (json mode)', () => {
    const r = getCalculatedCosts(
        188512426, 184418048, 187885184, 627242,
        0.274634424, 2.74634424, 5.285287, 0,
        'deepseek-v4-flash-0731-canary',
        { kwhRate: null, compareRateId: 'json-token-cost' }
    );
    assert.equal(r.energyCost, 2.74634424);
    assert.equal(r.compareCost, 5.285287);
});

test('getCalculatedCosts applies kwhRate to energy cost', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0.1, 99, 5, 0,
        'some-model',
        { kwhRate: 10, compareRateId: 'json-token-cost' }
    );
    assert.ok(Math.abs(r.energyCost - 1.0) < 1e-9);
});

test('getCalculatedCosts applies flex discount for flex models', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0.1, 99, 5, 0,
        'kimi-k2.7-code-flex',
        { kwhRate: 10, flexDiscount: 0.65, compareRateId: 'json-token-cost' }
    );
    assert.ok(Math.abs(r.energyCost - 0.65) < 1e-9);
});

test('getCalculatedCosts computes compare cost from custom rates ($/Mtok)', () => {
    // tokens=1000, cached=500, promptTotal=800, completionTotal=200 → ratio 0.2
    // prompt=800, completion=200, uncachedPrompt=300
    // custom rates: prompt $1/M, cache $0.5/M, output $3/M
    // cost = 300*1e-6 + 500*0.5e-6 + 200*3e-6 = 0.0003 + 0.00025 + 0.0006 = 0.00115
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 0, 0, 0,
        'some-model',
        {
            kwhRate: null,
            compareRateId: 'custom-rates',
            customRates: { prompt: 1, cache: 0.5, output: 3 }
        }
    );
    assert.ok(Math.abs(r.compareCost - 0.00115) < 1e-12);
});

test('getCalculatedCosts computes compare cost from Neuralwatt pricing', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 0, 0, 0,
        'glm-5.2',
        {
            kwhRate: null,
            compareRateId: 'neuralwatt-pricing',
            neuralwattPricing: { prompt: 1.45, cache: 0.145, completion: 4.50 }
        }
    );
    // uncachedPrompt=300, cached=500, completion=200
    // = 300*1.45e-6 + 500*0.145e-6 + 200*4.5e-6 = 0.000435 + 0.0000725 + 0.0009 = 0.0014075
    assert.ok(Math.abs(r.compareCost - 0.0014075) < 1e-12);
});

test('getCalculatedCosts computes savings and savingsPct', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0.1, 1.0, 5.0, 0,
        'some-model',
        { kwhRate: 10, compareRateId: 'json-token-cost' }
    );
    // energyCost = 0.1 * 10 = 1.0 ; compareCost = 5.0 ; savings = 4.0
    assert.ok(Math.abs(r.energyCost - 1.0) < 1e-9);
    assert.ok(Math.abs(r.savings - 4.0) < 1e-9);
    assert.ok(Math.abs(r.savingsPct - 80.0) < 1e-9);
});

test('getCalculatedCosts falls back to originalTokenCost when no pricing match', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 7.5, 7.5, 0,
        'unknown-model',
        { kwhRate: null, compareRateId: 'neuralwatt-pricing', neuralwattPricing: null }
    );
    assert.equal(r.compareCost, 7.5);
});

test('getCalculatedCosts matches OpenRouter model by id', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 0, 0, 0,
        'deepseek-v4-flash',
        {
            kwhRate: null,
            compareRateId: 'or-model-id',
            openRouterModels: [{
                id: 'or-model-id',
                pricing: { prompt: 0.000001, completion: 0.000002, input_cache_read: 0.0000002 }
            }]
        }
    );
    // uncachedPrompt=300, cached=500, completion=200
    // = 300*1e-6 + 500*0.2e-6 + 200*2e-6 = 0.0003 + 0.0001 + 0.0004 = 0.0008
    assert.ok(Math.abs(r.compareCost - 0.0008) < 1e-12);
});

test('getCalculatedCosts computes compare cost from provider pricing', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 0, 0, 0,
        'gpt-5',
        {
            kwhRate: null,
            compareRateId: 'provider-pricing',
            providerPricing: { prompt: 1.25, cache: 0.20, completion: 10.00 }
        }
    );
    // uncachedPrompt=300, cached=500, completion=200
    // = 300*1.25e-6 + 500*0.20e-6 + 200*10e-6 = 0.000375 + 0.0001 + 0.002 = 0.002475
    assert.ok(Math.abs(r.compareCost - 0.002475) < 1e-12);
});

test('getCalculatedCosts falls back to originalTokenCost when provider pricing missing', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 9.25, 9.25, 0,
        'unknown-model',
        { kwhRate: null, compareRateId: 'provider-pricing', providerPricing: null }
    );
    assert.equal(r.compareCost, 9.25);
});

test('getCalculatedCosts applies third-party rate only on fuzzy model match', () => {
    const thirdPartyRates = {
        'gpt-5': { label: 'GPT-5', match: 'gpt-5', prompt: 1.25, cache: 0.20, completion: 10.00 }
    };
    // Matching model: uncachedPrompt=300, cached=500, completion=200
    // = 300*1.25e-6 + 500*0.20e-6 + 200*10e-6 = 0.002475
    const matched = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 0, 0, 0,
        'openai-gpt-5-chat',
        { kwhRate: null, compareRateId: 'gpt-5', thirdPartyRates }
    );
    assert.ok(Math.abs(matched.compareCost - 0.002475) < 1e-12);

    // Non-matching model: rate not applied, originalTokenCost kept.
    const unmatched = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 4.0, 4.0, 0,
        'unrelated-model',
        { kwhRate: null, compareRateId: 'gpt-5', thirdPartyRates }
    );
    assert.equal(unmatched.compareCost, 4.0);
});

test('getCalculatedCosts OpenRouter uses promptPrice when input_cache_read absent', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 0, 0, 0,
        'some-model',
        {
            kwhRate: null,
            compareRateId: 'or-no-cache',
            openRouterModels: [{ id: 'or-no-cache', pricing: { prompt: 0.000001, completion: 0.000002 } }]
        }
    );
    // promptCachedPrice falls back to promptPrice: 500*1e-6
    // = 300*1e-6 + 500*1e-6 + 200*2e-6 = 0.0003 + 0.0005 + 0.0004 = 0.0012
    assert.ok(Math.abs(r.compareCost - 0.0012) < 1e-12);
});

test('getCalculatedCosts OpenRouter unmatched id keeps originalTokenCost', () => {
    const r = getCalculatedCosts(
        1000, 500, 800, 200,
        0, 6.5, 6.5, 0,
        'some-model',
        { kwhRate: null, compareRateId: 'missing-or-id', openRouterModels: [] }
    );
    assert.equal(r.compareCost, 6.5);
});

test('getCalculatedCosts savingsPct is 0 when compareCost is 0', () => {
    const r = getCalculatedCosts(
        0, 0, 0, 0,
        0, 0, 0, 0,
        'some-model',
        { kwhRate: null, compareRateId: 'json-token-cost' }
    );
    assert.equal(r.energyCost, 0);
    assert.equal(r.compareCost, 0);
    assert.equal(r.savings, 0);
    assert.equal(r.savingsPct, 0);
});

// ---------------------------------------------------------------------------
// validateEnergyBenchmarksPayload (energy mirror payload contract)
// ---------------------------------------------------------------------------
test('validateEnergyBenchmarksPayload accepts a well-formed mirror payload', () => {
    const payload = {
        schemaVersion: 1,
        fetchedAt: '2026-08-03T12:00:00.000Z',
        benchmarks: [
            {
                model: 'DeepSeek V4 Flash',
                id: 'deepseek-v4-flash',
                aliases: ['deepseek-v4-flash', 'deepseek v4 flash'],
                bands: [
                    { band: '0–256', display: '29.21 mWh', mwh: 29.21, req_pct: 1.9, cache_hit_pct: 0 },
                    { band: '256k–1M', display: '701.53 mWh', mwh: 701.53, req_pct: 6.4, cache_hit_pct: 97 }
                ]
            }
        ]
    };
    assert.equal(validateEnergyBenchmarksPayload(payload), true);
});

test('validateEnergyBenchmarksPayload rejects empty / missing benchmarks', () => {
    assert.equal(validateEnergyBenchmarksPayload(null), false);
    assert.equal(validateEnergyBenchmarksPayload({ benchmarks: [] }), false);
    assert.equal(validateEnergyBenchmarksPayload({}), false);
    assert.equal(validateEnergyBenchmarksPayload({ benchmarks: 'nope' }), false);
});

test('validateEnergyBenchmarksPayload rejects entries with bad shape', () => {
    assert.equal(validateEnergyBenchmarksPayload({ benchmarks: [{}] }), false);
    assert.equal(
        validateEnergyBenchmarksPayload({ benchmarks: [{ model: 'X', bands: [] }] }),
        false
    );
    assert.equal(
        validateEnergyBenchmarksPayload({ benchmarks: [{ model: 42, bands: [{ band: '0–256' }] }] }),
        false
    );
    assert.equal(
        validateEnergyBenchmarksPayload({ benchmarks: [{ model: 'X', bands: [{ display: '1 mWh' }] }] }),
        false
    );
});

// ---------------------------------------------------------------------------
// Energy benchmark sync parser (scripts/sync-energy-benchmarks.mjs)
// ---------------------------------------------------------------------------
import {
    parseEnergyBenchmarksHtml,
    parseBandCell,
    decodeHtmlEntities
} from '../scripts/sync-energy-benchmarks.mjs';

test('decodeHtmlEntities decodes common HTML entities', () => {
    assert.equal(decodeHtmlEntities('&mdash; &ndash; &middot; &amp; &lt; &gt; &quot; &#39;'),
        '— – · & < > " \'');
    assert.equal(decodeHtmlEntities('&#169;'), '©');
});

test('parseBandCell extracts value, req share, and cache-hit rate', () => {
    const cell = `<td class="px-3 py-3 align-top text-right">
        <div class="num text-nw-terracotta whitespace-nowrap cursor-help"
             title="Average over real traffic &mdash; assumes neither a cache hit nor a miss. Measured at a 29% average cache-hit rate in this size band.">20.83 mWh</div>
        <div class="text-[10px] num text-nw-moss/70 dark:text-nw-envy/70 mt-1">7.0% of reqs</div>
    </td>`;
    const band = parseBandCell(cell, '256–1k');
    assert.equal(band.band, '256–1k');
    assert.equal(band.display, '20.83 mWh');
    assert.equal(band.mwh, 20.83);
    assert.equal(band.req_pct, 7.0);
    assert.equal(band.cache_hit_pct, 29);
});

test('parseBandCell converts Wh to mWh and handles empty cells', () => {
    const whCell = `<td><div class="num" title="Measured at a 50% average cache-hit rate in this size band.">1.80 Wh</div><div class="num">47.6% of reqs</div></td>`;
    const whBand = parseBandCell(whCell, '64k–256k');
    assert.equal(whBand.mwh, 1800);
    assert.equal(whBand.display, '1.80 Wh');
    assert.equal(whBand.cache_hit_pct, 50);

    const emptyCell = `<td><div class="text-[11px] text-nw-moss/50" title="Gathering data &mdash; too few measured requests in this size band.">&mdash;</div></td>`;
    const emptyBand = parseBandCell(emptyCell, '256k–1M');
    assert.equal(emptyBand.display, '—');
    assert.equal(emptyBand.mwh, null);
    assert.equal(emptyBand.req_pct, 0);
    assert.equal(emptyBand.cache_hit_pct, null);
});

test('parseBandCell throws on unparseable cell text (markup drift guard)', () => {
    assert.throws(
        () => parseBandCell('<td><div class="num">??energy??</div></td>', '0–256', 'Test Model'),
        /Unparseable energy value "\?\?energy\?\?" .*Test Model/
    );
});

test('parseEnergyBenchmarksHtml parses a synthetic band-grid page', () => {
    const bandCells = [
        '<td><div class="num" title="Measured at a 0% average cache-hit rate in this size band.">29.21 mWh</div><div class="num">1.9% of reqs</div></td>',
        '<td><div class="num" title="Measured at a 29% average cache-hit rate in this size band.">20.83 mWh</div><div class="num">7.0% of reqs</div></td>',
        '<td><div class="num" title="Measured at a 21% average cache-hit rate in this size band.">35.53 mWh</div><div class="num">16.5% of reqs</div></td>',
        '<td><div class="num" title="Measured at a 46% average cache-hit rate in this size band.">139.48 mWh</div><div class="num">12.2% of reqs</div></td>',
        '<td><div class="num" title="Measured at a 85% average cache-hit rate in this size band.">185.11 mWh</div><div class="num">24.8% of reqs</div></td>',
        '<td><div class="num" title="Measured at a 94% average cache-hit rate in this size band.">378.92 mWh</div><div class="num">31.2% of reqs</div></td>',
        '<td><div class="num" title="Measured at a 97% average cache-hit rate in this size band.">701.53 mWh</div><div class="num">6.4% of reqs</div></td>'
    ];
    const html = `<html><body>
        <table><tr><th>Model</th><th>Right now</th></tr>
            <tr><td>DeepSeek V4 Flash 16k–64k &middot; 85% cache</td><td>&mdash;</td></tr>
        </table>
        <table>
            <tr><th>Model</th><th>0–256</th><th>256–1k</th><th>1k–4k</th><th>4k–16k</th><th>16k–64k</th><th>64k–256k</th><th>256k–1M</th></tr>
            <tr><td><div class="num">DeepSeek V4 Flash</div></td>${bandCells.join('')}</tr>
            <tr><td><div class="num">GLM-5.2</div></td>${Array(7).fill('<td><div class="num" title="Gathering data">&mdash;</div></td>').join('')}</tr>
        </table>
    </body></html>`;

    const benchmarks = parseEnergyBenchmarksHtml(html);
    assert.equal(benchmarks.length, 2, 'rows with only "—" cells are legitimate empty bands');
    assert.equal(benchmarks[0].model, 'DeepSeek V4 Flash');
    assert.equal(benchmarks[0].id, 'deepseek-v4-flash');
    assert.deepEqual(benchmarks[0].aliases, ['deepseek-v4-flash', 'deepseek v4 flash']);
    assert.equal(benchmarks[0].bands.length, 7);
    assert.equal(benchmarks[0].bands[0].mwh, 29.21);
    assert.equal(benchmarks[0].bands[6].mwh, 701.53);
    assert.equal(benchmarks[1].model, 'GLM-5.2');
    assert.ok(benchmarks[1].bands.every(b => b.mwh === null && b.display === '—'));
});

test('parseEnergyBenchmarksHtml throws on unparseable cell values (markup drift guard)', () => {
    const html = `<html><body><table>
        <tr><th>Model</th><th>0–256</th><th>256–1k</th><th>1k–4k</th><th>4k–16k</th><th>16k–64k</th><th>64k–256k</th><th>256k–1M</th></tr>
        <tr><td><div class="num">DeepSeek V4 Flash</div></td><td>???</td><td>b</td><td>c</td><td>d</td><td>e</td><td>f</td><td>g</td></tr>
    </table></body></html>`;
    assert.throws(() => parseEnergyBenchmarksHtml(html), /Unparseable energy value "\?\?\?"/);
});

test('parseEnergyBenchmarksHtml throws when the band grid is missing', () => {
    assert.throws(() => parseEnergyBenchmarksHtml('<html><body><table><tr><td>x</td></tr></table></body></html>'),
        /band-grid table/);
    assert.throws(() => parseEnergyBenchmarksHtml(''), /empty content/);
});
