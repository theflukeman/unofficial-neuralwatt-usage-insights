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
    getCalculatedCosts
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
            neuralwattPricing: { prompt: 1.45, cache: 0.36, completion: 4.50 }
        }
    );
    // uncachedPrompt=300, cached=500, completion=200
    // = 300*1.45e-6 + 500*0.36e-6 + 200*4.5e-6 = 0.000435 + 0.00018 + 0.0009 = 0.001515
    assert.ok(Math.abs(r.compareCost - 0.001515) < 1e-12);
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
