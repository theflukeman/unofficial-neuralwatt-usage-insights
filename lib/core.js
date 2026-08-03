// lib/core.js — DEV-ONLY pure mirrors of app.js logic.
//
// This directory exists solely so unit tests can import pure logic without a
// DOM or module globals. app.js remains the runtime source of truth; these
// functions are DUPLICATED (not imported by app.js) per the sanctioned
// carve-out documented in AGENTS.md. Keep both copies in sync when changing
// behavior — the tests here pin the contracts.

export const TOKENS_PER_MILLION = 1000000;

// ---------------------------------------------------------------------------
// clampFinite — mirror of app.js
// Returns `fallback` for NaN / Infinity / non-numbers, and (when nonNegative)
// for negative values. Replaces the `|| 0` pattern which cannot catch
// NaN/undefined/null/Infinity consistently.
// ---------------------------------------------------------------------------
export function clampFinite(value, fallback = 0, nonNegative = false) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    if (nonNegative && value < 0) return fallback;
    return value;
}

// ---------------------------------------------------------------------------
// validateUsageData — mirror of app.js
// Structural / field-level validation for a Neuralwatt usage export.
// Returns { valid: boolean, errors: string[] }. The single-model invariant
// (by_model absent OR exactly ONE entry) is intentionally NOT enforced here —
// that gate lives in handleFilesSelection so a clear user-facing message is
// shown. This function focuses on shape: object type, totals types, non-empty
// array fields, and per-entry model/date field presence.
// ---------------------------------------------------------------------------
export function validateUsageData(data) {
    const errors = [];
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        errors.push('Invalid Neuralwatt usage JSON format.');
        return { valid: false, errors };
    }

    // totals: object when present
    if (data.totals !== undefined) {
        if (typeof data.totals !== 'object' || data.totals === null || Array.isArray(data.totals)) {
            errors.push('Field "totals" must be an object.');
        } else {
            if ('requests' in data.totals && typeof data.totals.requests !== 'number') {
                errors.push('Field "totals.requests" must be a number.');
            }
            if ('tokens' in data.totals && typeof data.totals.tokens !== 'number') {
                errors.push('Field "totals.tokens" must be a number.');
            }
        }
    }

    // Require at least one non-empty timeseries array.
    const arrayFields = ['daily', 'hourly', 'rows', 'by_model', 'usage'];
    let arrayFound = false;
    for (const f of arrayFields) {
        if (data[f] !== undefined) {
            if (!Array.isArray(data[f])) {
                errors.push(`Field "${f}" must be an array.`);
            } else if (data[f].length === 0) {
                errors.push(`Field "${f}" is an empty array; no timeseries data present.`);
            } else {
                arrayFound = true;
            }
        }
    }

    // by_model entries must each have a model string field.
    if (Array.isArray(data.by_model) && data.by_model.length > 0) {
        data.by_model.forEach((entry, i) => {
            if (typeof entry !== 'object' || entry === null || typeof entry.model !== 'string') {
                errors.push(`by_model[${i}] must have a string "model" field.`);
            }
        });
    }

    // daily/hourly rows must each carry a date and numeric tokens/requests.
    ['daily', 'hourly'].forEach(f => {
        if (Array.isArray(data[f]) && data[f].length > 0) {
            data[f].forEach((entry, i) => {
                if (typeof entry !== 'object' || entry === null) {
                    errors.push(`${f}[${i}] must be an object.`);
                    return;
                }
                if (entry.date === undefined || entry.date === null) {
                    errors.push(`${f}[${i}] missing "date" field.`);
                }
                if ('tokens' in entry && typeof entry.tokens !== 'number') {
                    errors.push(`${f}[${i}].tokens must be a number.`);
                }
                if ('requests' in entry && typeof entry.requests !== 'number') {
                    errors.push(`${f}[${i}].requests must be a number.`);
                }
            });
        }
    });

    // Require a recognized top-level marker OR a non-empty array.
    const hasMarker = data.totals !== undefined || data.by_model !== undefined || data.period !== undefined;
    if (!hasMarker && !arrayFound) {
        errors.push('Unrecognized JSON: not a Neuralwatt usage export (no totals/by_model/period and no timeseries array).');
    } else if (!arrayFound && errors.length === 0) {
        errors.push('No timeseries data found (daily, hourly, rows, by_model, or usage).');
    }

    return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Date helpers — mirrors of app.js
// ---------------------------------------------------------------------------
export function parseDateLocal(dateStr) {
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr + 'T00:00:00');
    }
    return new Date(dateStr);
}

export function isDateOnly(dateStr) {
    return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

export function formatDateTable(dateStr) {
    const d = parseDateLocal(dateStr);
    if (isDateOnly(dateStr)) {
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
    }
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// ---------------------------------------------------------------------------
// escapeHtml — mirror of app.js
// Escapes the five significant HTML characters before inserting any
// user-controlled / external string into innerHTML.
// ---------------------------------------------------------------------------
export const ESCAPE_HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => ESCAPE_HTML_MAP[ch]);
}

// ---------------------------------------------------------------------------
// getCalculatedCosts — pure mirror of app.js
// The app.js version reads module globals (kwh rate, compare-rate mode,
// custom rates, pricing registries). This pure version takes all of those
// as an explicit `opts` object so tests are deterministic.
//
// opts:
//   kwhRate           resolved $/kWh (null → keep originalCost)
//   flexDiscount      multiplier applied to energy cost for "flex" models (app.js uses 0.65)
//   compareRateId     resolved comparison mode:
//                     'custom-rates' | 'neuralwatt-pricing' | 'provider-pricing'
//                     | 'json-token-cost' | THIRD_PARTY_PROVIDER_RATES key | OpenRouter model id
//   customRates       { prompt, cache, output } in $/Mtok (custom-rates mode)
//   neuralwattPricing { prompt, cache, completion } in $/Mtok or null
//   providerPricing   { prompt, cache, completion } in $/Mtok or null
//   thirdPartyRates   { id: { label, match, prompt, cache, completion } } map
//   openRouterModels  [{ id, pricing: { prompt, completion, input_cache_read } }]
//   tokensPerMillion  1000000
// ---------------------------------------------------------------------------
export function getCalculatedCosts(
    tokens,
    cachedTokens,
    promptTokensTotal,
    completionTokensTotal,
    energyKwh,
    originalCost,
    originalTokenCost,
    originalThirdPartyCost,
    modelName,
    opts
) {
    const {
        kwhRate = null,
        flexDiscount = 0.65,
        compareRateId = 'json-token-cost',
        customRates = null,
        neuralwattPricing = null,
        providerPricing = null,
        thirdPartyRates = {},
        openRouterModels = [],
        tokensPerMillion = TOKENS_PER_MILLION
    } = opts || {};

    // 1. Calculate energy-based cost
    let energyCost = originalCost;
    if (kwhRate !== null) {
        energyCost = energyKwh * kwhRate;
        if (modelName && modelName.toLowerCase().includes('flex')) {
            energyCost *= flexDiscount;
        }
    }

    // 2. Estimate prompt/completion split for individual slices (fallback if not provided in row)
    let promptTokens = tokens;
    let completionTokens = 0;
    if (tokens > 0 && promptTokensTotal > 0) {
        const ratio = completionTokensTotal / (promptTokensTotal + completionTokensTotal);
        completionTokens = tokens * ratio;
        promptTokens = tokens - completionTokens;
    }
    const uncachedPrompt = Math.max(0, promptTokens - cachedTokens);

    // 3. Compute Token Comparison Cost
    let compareCost = originalTokenCost;

    if (compareRateId === 'custom-rates') {
        const promptPrice = (customRates && customRates.prompt || 0) / tokensPerMillion;
        const promptCachedPrice = (customRates && customRates.cache || 0) / tokensPerMillion;
        const completionPrice = (customRates && customRates.output || 0) / tokensPerMillion;

        const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
        const completionCost = completionTokens * completionPrice;
        compareCost = promptCost + completionCost;
    } else if (compareRateId === 'neuralwatt-pricing') {
        if (neuralwattPricing) {
            const promptPrice = neuralwattPricing.prompt / tokensPerMillion;
            const promptCachedPrice = neuralwattPricing.cache / tokensPerMillion;
            const completionPrice = neuralwattPricing.completion / tokensPerMillion;

            const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
            const completionCost = completionTokens * completionPrice;
            compareCost = promptCost + completionCost;
        } else {
            compareCost = originalTokenCost;
        }
    } else if (compareRateId === 'provider-pricing') {
        if (providerPricing) {
            const promptPrice = providerPricing.prompt / tokensPerMillion;
            const promptCachedPrice = providerPricing.cache / tokensPerMillion;
            const completionPrice = providerPricing.completion / tokensPerMillion;

            const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
            const completionCost = completionTokens * completionPrice;
            compareCost = promptCost + completionCost;
        } else {
            compareCost = originalTokenCost;
        }
    } else if (compareRateId === 'json-token-cost') {
        // No heuristics: return standard token cost directly from the JSON
        compareCost = originalTokenCost;
    } else if (thirdPartyRates[compareRateId]) {
        const tpRate = thirdPartyRates[compareRateId];
        // Apply only if the model name fuzzy-matches the rate's target model
        if (modelName && modelName.toLowerCase().includes(tpRate.match)) {
            const promptPrice = tpRate.prompt / tokensPerMillion;
            const promptCachedPrice = tpRate.cache / tokensPerMillion;
            const completionPrice = tpRate.completion / tokensPerMillion;

            const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
            const completionCost = completionTokens * completionPrice;
            compareCost = promptCost + completionCost;
        } else {
            compareCost = originalTokenCost;
        }
    } else {
        // Must be a dynamically loaded OpenRouter model!
        const orModel = openRouterModels.find(m => m.id === compareRateId);
        if (orModel && orModel.pricing) {
            const promptPrice = parseFloat(orModel.pricing.prompt) || 0;
            const completionPrice = parseFloat(orModel.pricing.completion) || 0;

            // NO HEURISTICS: Use input_cache_read if outputted by OpenRouter, otherwise promptPrice
            let promptCachedPrice = promptPrice;
            if (orModel.pricing.input_cache_read !== undefined && orModel.pricing.input_cache_read !== null) {
                promptCachedPrice = parseFloat(orModel.pricing.input_cache_read) || 0;
            }

            const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
            const completionCost = completionTokens * completionPrice;
            compareCost = promptCost + completionCost;
        }
    }

    const savings = compareCost - energyCost;
    const savingsPct = compareCost > 0 ? (savings / compareCost * 100) : 0;

    return {
        energyCost,
        compareCost,
        savings,
        savingsPct
    };
}

// ---------------------------------------------------------------------------
// validateEnergyBenchmarksPayload — mirror of app.js
// Structural validation for the repo-hosted energy benchmarks mirror
// (data/energy-benchmarks.json, produced by scripts/sync-energy-benchmarks.mjs).
// Returns true only when the payload can be safely pushed into
// NEURALWATT_ENERGY_BENCHMARKS. Keep this and the app.js copy in sync.
// ---------------------------------------------------------------------------
export function validateEnergyBenchmarksPayload(payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
    if (payload.schemaVersion !== undefined && payload.schemaVersion !== 1) return false;
    if (!Array.isArray(payload.benchmarks) || payload.benchmarks.length === 0) return false;
    return payload.benchmarks.every(b =>
        b !== null && typeof b === 'object' &&
        typeof b.model === 'string' &&
        Array.isArray(b.bands) && b.bands.length > 0 &&
        b.bands.every(band => band !== null && typeof band === 'object' && typeof band.band === 'string')
    );
}
