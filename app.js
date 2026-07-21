// DOM ELEMENTS
const uploadContainer = document.getElementById('upload-container');
const dashboardContainer = document.getElementById('dashboard-container');
const periodBadge = document.getElementById('period-badge');
const miniUploadBtn = document.getElementById('mini-upload-btn');
const mainFileInput = document.getElementById('main-file-input');
const miniFileInput = document.getElementById('mini-file-input');
const dropZone = document.getElementById('drop-zone');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const bodyEl = document.body;

// Import error banner (non-blocking replacement for alert() on import)
const importErrorBanner = document.getElementById('import-error-banner');
const importErrorList = importErrorBanner.querySelector('.import-error-list');
const importErrorCloseBtn = importErrorBanner.querySelector('.import-error-close');
let importErrorTimer = null;

function showImportErrors(messages) {
    if (!messages || messages.length === 0) {
        hideImportErrors();
        return;
    }
    importErrorList.innerHTML = messages.map(m => `<li>${m}</li>`).join('');
    importErrorBanner.style.display = 'block';
    // Auto-dismiss after 12 seconds; any new error resets the timer.
    if (importErrorTimer) clearTimeout(importErrorTimer);
    importErrorTimer = setTimeout(hideImportErrors, 12000);
}

function hideImportErrors() {
    importErrorBanner.style.display = 'none';
    importErrorList.innerHTML = '';
    if (importErrorTimer) { clearTimeout(importErrorTimer); importErrorTimer = null; }
}

importErrorCloseBtn.addEventListener('click', hideImportErrors);

// Dynamic Controls
const modelFilterSelect = document.getElementById('model-filter-select');
const startDateFilterInput = document.getElementById('start-date-filter');
const endDateFilterInput = document.getElementById('end-date-filter');
const costCalcModeSelect = document.getElementById('cost-calc-mode');
const customRateContainer = document.getElementById('custom-rate-container');
const customRateInput = document.getElementById('custom-rate-input');
const thirdPartyProviderSelect = document.getElementById('third-party-provider');

// Summary Elements
const valRequests = document.getElementById('val-requests');
const valRequestsSub = document.getElementById('val-requests-sub');
const valTokens = document.getElementById('val-tokens');
const valCachePercent = document.getElementById('val-cache-percent');
const barCacheFill = document.getElementById('bar-cache-fill');
const valTokensSplit = document.getElementById('val-tokens-split');
const valEnergyCost = document.getElementById('val-energy-cost');
const valSavingsAmount = document.getElementById('val-savings-amount');
const valSavingsPct = document.getElementById('val-savings-pct');
const valTokenCostComparison = document.getElementById('val-token-cost-comparison');
const valEnergyKwh = document.getElementById('val-energy-kwh');
const valEnergyJoules = document.getElementById('val-energy-joules');
const valEnergyAccounting = document.getElementById('val-energy-accounting');
const valCarbonG = document.getElementById('val-carbon-g');
const valCarbonIntensity = document.getElementById('val-carbon-intensity');
const valCarbonEquivalent = document.getElementById('val-carbon-equivalent');

// Details lists
const modelPerformanceTbody = document.getElementById('model-performance-tbody');

// Logs Elements
const logSearchInput = document.getElementById('log-search-input');
const btnExportCsvSubset = document.getElementById('btn-export-csv-subset');
const logsTableBody = document.getElementById('logs-table-body');
const logsTableHeaders = document.querySelectorAll('#logs-table th.sortable');
const modelTableHeaders = document.querySelectorAll('#model-performance-table th.sortable');

// APP STATE
let rawData = null;
let loadedFiles = []; // array of { fileName, modelName, data }
let currentSortColumn = 'date';
let currentSortDirection = 'desc'; // 'asc' or 'desc'
let currentSearchQuery = '';
let modelSortColumn = 'requests';
let modelSortDirection = 'desc'; // 'asc' or 'desc'

// Active Filter States
let selectedModel = '';
let filterStartDate = ''; // YYYY-MM-DD
let filterEndDate = ''; // YYYY-MM-DD
let costCalcMode = 'flat-10'; // 'flat-10', 'plan-basic', 'plan-std', 'plan-pro', 'plan-basic-yr', 'plan-std-yr', 'plan-pro-yr', 'json', 'custom'
let customKwhRate = 10.00;
let thirdPartyCompareRate = 'auto-match'; // 'auto-match', 'custom-rates', or OpenRouter ID
let customTpInputRate = 1.00; // $/Million tokens
let customTpCacheRate = 0.50; // $/Million tokens
let customTpOutputRate = 3.00; // $/Million tokens

// Dynamic OpenRouter models list
let openRouterModels = [];

// Calculated outputs
let calculatedTotals = {};
let calculatedTimeline = [];
let calculatedTimelineSorted = [];

// CHART INSTANCES
let costSavingsChart = null;
let cachePerformanceChart = null;
let costEfficiencyChart = null;

// THEME TOGGLER
themeToggleBtn.addEventListener('click', () => {
    if (bodyEl.classList.contains('dark-mode')) {
        bodyEl.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    } else {
        bodyEl.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    }
    if (rawData) {
        renderCharts();
    }
});

// INITIALIZE THEME ON LOAD
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        bodyEl.classList.remove('dark-mode');
    } else {
        bodyEl.classList.add('dark-mode');
    }
}
initTheme();

// FETCH LIVE OPENROUTER MODELS & PRICING
async function fetchOpenRouterModels() {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (!response.ok) throw new Error('API response was not OK');
        const data = await response.json();
        
        if (data && Array.isArray(data.data)) {
            openRouterModels = data.data;
            populateOpenRouterOptions();
        }
    } catch (err) {
        console.error('Failed to load live OpenRouter models:', err);
        // Create an offline notification element inside dropdown
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'OpenRouter Live Models (Offline)';
        const option = document.createElement('option');
        option.disabled = true;
        option.textContent = 'Could not fetch live pricing from OpenRouter';
        optgroup.appendChild(option);
        thirdPartyProviderSelect.appendChild(optgroup);
    }
}

// Populate dropdown list with fetched OpenRouter models
function populateOpenRouterOptions() {
    let optgroup = thirdPartyProviderSelect.querySelector('optgroup[label^="OpenRouter"]');
    if (!optgroup) {
        optgroup = document.createElement('optgroup');
        optgroup.label = 'OpenRouter Live Models';
        thirdPartyProviderSelect.appendChild(optgroup);
    }
    optgroup.innerHTML = '';

    // Filter models that have valid pricing structure
    const validModels = openRouterModels.filter(m => 
        m.pricing && 
        m.pricing.prompt !== undefined && 
        m.pricing.completion !== undefined
    );

    // Sort alphabetically by name
    const sorted = validModels.sort((a, b) => a.name.localeCompare(b.name));

    sorted.forEach(m => {
        const promptPrice = parseFloat(m.pricing.prompt) || 0;
        const completionPrice = parseFloat(m.pricing.completion) || 0;
        
        // Calculate prompt cache rate (NO HEURISTICS: only if input_cache_read is explicitly outputted by OpenRouter)
        let promptCachedPrice = promptPrice;
        if (m.pricing.input_cache_read !== undefined && m.pricing.input_cache_read !== null) {
            promptCachedPrice = parseFloat(m.pricing.input_cache_read) || 0;
        }

        // Convert to price per 1 Million tokens
        const promptM = (promptPrice * TOKENS_PER_MILLION).toFixed(2);
        const cacheM = (promptCachedPrice * TOKENS_PER_MILLION).toFixed(2);
        const compM = (completionPrice * TOKENS_PER_MILLION).toFixed(2);
        
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = `${m.name} (In: $${promptM} | Cache: $${cacheM} | Out: $${compM} / M)`;
        optgroup.appendChild(option);
    });
}

// FILE DROP & SELECTION EVENTS
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFilesSelection(files);
    }
});

mainFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFilesSelection(e.target.files);
    }
});

miniFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFilesSelection(e.target.files);
    }
});

// CONTROLS INTERACTIVE HANDLERS
modelFilterSelect.addEventListener('change', (e) => {
    selectedModel = e.target.value;
    updateCalculationsAndRender();
});

costCalcModeSelect.addEventListener('change', (e) => {
    costCalcMode = e.target.value;
    if (costCalcMode === 'custom') {
        customRateContainer.style.display = 'flex';
    } else {
        customRateContainer.style.display = 'none';
    }
    updateCalculationsAndRender();
});

customRateInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
        customKwhRate = val;
        updateCalculationsAndRender();
    }
});

thirdPartyProviderSelect.addEventListener('change', (e) => {
    thirdPartyCompareRate = e.target.value;
    if (thirdPartyCompareRate === 'custom-rates') {
        document.getElementById('custom-third-party-container').style.display = 'flex';
    } else {
        document.getElementById('custom-third-party-container').style.display = 'none';
    }
    updateCalculationsAndRender();
});

document.getElementById('custom-tp-input').addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
        customTpInputRate = val;
        updateCalculationsAndRender();
    }
});

document.getElementById('custom-tp-cache').addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
        customTpCacheRate = val;
        updateCalculationsAndRender();
    }
});

document.getElementById('custom-tp-output').addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
        customTpOutputRate = val;
        updateCalculationsAndRender();
    }
});

startDateFilterInput.addEventListener('change', (e) => {
    filterStartDate = e.target.value;
    updateCalculationsAndRender();
});

endDateFilterInput.addEventListener('change', (e) => {
    filterEndDate = e.target.value;
    updateCalculationsAndRender();
});

// MULTI-FILE UPLOADER HANDLER (ENFORCES SINGLE-MODEL FILES)
function handleFilesSelection(filesList) {
    const files = Array.from(filesList);
    let errors = [];
    let loadedCount = 0;
    
    let promises = files.map(file => {
        return new Promise((resolve) => {
            if (!file.name.endsWith('.json')) {
                errors.push(`${file.name}: Only JSON format is supported.`);
                return resolve();
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (validateUsageData(data)) {
                        if (!data.by_model || data.by_model.length !== 1) {
                            errors.push(`${file.name}: Must contain data for exactly ONE model. Found ${data.by_model ? data.by_model.length : 0}. Please export single-model files from the portal.`);
                            return resolve();
                        }
                        
                        const modelName = data.by_model[0].model;
                        
                        // Overwrite if same model is re-uploaded
                        loadedFiles = loadedFiles.filter(f => f.modelName !== modelName);
                        
                        // Normalize daily/hourly rows
                        if (!data.daily && data.hourly) {
                            data.daily = data.hourly;
                        }
                        
                        loadedFiles.push({
                            fileName: file.name,
                            modelName: modelName,
                            data: data
                        });
                        loadedCount++;
                    } else {
                        errors.push(`${file.name}: Invalid Neuralwatt usage schema.`);
                    }
                } catch (err) {
                    errors.push(`${file.name}: Failed to parse JSON.`);
                }
                resolve();
            };
            reader.readAsText(file);
        });
    });
    
    Promise.all(promises).then(() => {
        if (errors.length > 0) {
            showImportErrors(errors);
        } else {
            hideImportErrors();
        }
        if (loadedFiles.length > 0) {
            // Display dashboard
            uploadContainer.style.display = 'none';
            dashboardContainer.style.display = 'block';
            miniUploadBtn.style.display = 'block';
            periodBadge.style.display = 'inline-flex';
            
            // Compile combined rawData
            compileMergedData();
            
            // Reset selectors if first load
            if (selectedModel === '') {
                costCalcMode = 'flat-10';
                costCalcModeSelect.value = 'flat-10';
                customRateContainer.style.display = 'none';
                thirdPartyCompareRate = 'auto-match';
                thirdPartyProviderSelect.value = 'auto-match';
            }
            
            updateCalculationsAndRender();
        }
    });
}

// MULTI-MODEL MERGING ENGINE
function compileMergedData() {
    if (loadedFiles.length === 0) {
        rawData = null;
        return;
    }
    
    let minStart = null;
    let maxEnd = null;
    loadedFiles.forEach(f => {
        const start = new Date(f.data.period.start);
        const end = new Date(f.data.period.end);
        if (!minStart || start < minStart) minStart = start;
        if (!maxEnd || end > maxEnd) maxEnd = end;
    });
    
    rawData = {
        period: {
            start: minStart ? minStart.toISOString() : '',
            end: maxEnd ? maxEnd.toISOString() : ''
        },
        totals: {
            requests: 0,
            tokens: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            cached_tokens: 0,
            cost: 0,
            token_cost: 0,
            energy_kwh: 0,
            charged_energy_kwh: 0,
            energy_joules: 0,
            requests_with_energy: 0,
            carbon_g: 0,
            carbon_intensity: 0,
            requests_with_carbon: 0,
            self_hosted_cost: 0,
            third_party_cost: 0,
            third_party_requests: 0
        },
        by_model: [],
        by_tier: [],
        daily: [],
        available_models: [],
        available_keys: [],
        accounting_method: loadedFiles[0].data.accounting_method || 'energy',
        granularity: loadedFiles[0].data.granularity || 'daily'
    };
    
    const uniqueKeysMap = new Map();
    
    loadedFiles.forEach(f => {
        const fd = f.data;
        
        rawData.totals.requests += fd.totals.requests || 0;
        rawData.totals.tokens += fd.totals.tokens || 0;
        rawData.totals.prompt_tokens += fd.totals.prompt_tokens || 0;
        rawData.totals.completion_tokens += fd.totals.completion_tokens || 0;
        rawData.totals.cached_tokens += fd.totals.cached_tokens || 0;
        rawData.totals.cost += fd.totals.cost || 0;
        rawData.totals.token_cost += fd.totals.token_cost || 0;
        rawData.totals.energy_kwh += fd.totals.energy_kwh || 0;
        rawData.totals.charged_energy_kwh += fd.totals.charged_energy_kwh || 0;
        rawData.totals.energy_joules += fd.totals.energy_joules || 0;
        rawData.totals.requests_with_energy += fd.totals.requests_with_energy || 0;
        rawData.totals.carbon_g += fd.totals.carbon_g || 0;
        rawData.totals.requests_with_carbon += fd.totals.requests_with_carbon || 0;
        rawData.totals.self_hosted_cost += fd.totals.self_hosted_cost || 0;
        rawData.totals.third_party_cost += fd.totals.third_party_cost || 0;
        rawData.totals.third_party_requests += fd.totals.third_party_requests || 0;
        
        if (fd.by_model && fd.by_model[0]) {
            const modelInfo = { ...fd.by_model[0] };
            modelInfo.prompt_tokens = fd.totals.prompt_tokens || 0;
            modelInfo.completion_tokens = fd.totals.completion_tokens || 0;
            rawData.by_model.push(modelInfo);
            rawData.available_models.push(fd.by_model[0].model);
        }
        
        if (fd.by_tier) {
            fd.by_tier.forEach(t => {
                let existingTier = rawData.by_tier.find(x => x.tier === t.tier);
                if (existingTier) {
                    existingTier.requests += t.requests || 0;
                    existingTier.tokens += t.tokens || 0;
                    existingTier.cost += t.cost || 0;
                    existingTier.energy_kwh += t.energy_kwh || 0;
                    existingTier.charged_energy_kwh += t.charged_energy_kwh || 0;
                } else {
                    rawData.by_tier.push({ ...t });
                }
            });
        }
        
        if (fd.available_keys) {
            fd.available_keys.forEach(k => {
                uniqueKeysMap.set(k.id, k);
            });
        }
        
        const modelName = f.modelName;
        if (fd.daily) {
            fd.daily.forEach(d => {
                rawData.daily.push({
                    ...d,
                    model: modelName
                });
            });
        }
    });
    
    rawData.available_keys = Array.from(uniqueKeysMap.values());
    
    if (rawData.totals.energy_kwh > 0) {
        rawData.totals.carbon_intensity = rawData.totals.carbon_g / rawData.totals.energy_kwh;
    }
    
    // Derive the displayed range from the actual daily-row labels rather
    // than from period.start/end. Those are UTC instants whose date
    // portion can disagree with the calendar-day labels Neuralwatt
    // assigns (e.g. period.end "2026-07-22T03:59:59" UTC maps to the
    // Jul 21 EDT bucket, and during multi-file merge they get re-parsed
    // and re-serialized via toISOString, shifting them by the local
    // offset). The daily labels are the source of truth, so the badge,
    // pickers, charts, and table all stay consistent in every timezone.
    // YYYY-MM-DD sorts lexicographically == chronologically.
    const dailyDates = rawData.daily.map(d => d.date).filter(Boolean).sort();
    const fallbackStart = rawData.period.start ? rawData.period.start.split('T')[0] : '';
    const fallbackEnd = rawData.period.end ? rawData.period.end.split('T')[0] : '';
    const startStr = dailyDates.length ? dailyDates[0] : fallbackStart;
    const endStr = dailyDates.length ? dailyDates[dailyDates.length - 1] : fallbackEnd;

    periodBadge.textContent = `${formatDateTable(startStr)} - ${formatDateTable(endStr)}`;

    startDateFilterInput.min = startStr;
    startDateFilterInput.max = endStr;
    endDateFilterInput.min = startStr;
    endDateFilterInput.max = endStr;
    
    if (!filterStartDate) {
        startDateFilterInput.value = startStr;
        filterStartDate = startStr;
    }
    if (!filterEndDate) {
        endDateFilterInput.value = endStr;
        filterEndDate = endStr;
    }
    
    const granularity = rawData.granularity || 'daily';
    const label = granularity.charAt(0).toUpperCase() + granularity.slice(1);
    document.getElementById('chart-cost-title').textContent = `Cost & Est. Savings Progression (${label})`;
    document.getElementById('chart-efficiency-title').textContent = `Cost per Million Tokens vs. Cost per Request (${label})`;
    document.getElementById('table-logs-title').textContent = `${label} Granular Logs`;
    document.getElementById('log-search-input').placeholder = `Search by date...`;
    
    populateModelOptions();
    renderImportedModelsList();
}

// RENDER IMPORTED FILES PANEL LIST
function renderImportedModelsList() {
    const listEl = document.getElementById('imported-models-list');
    if (!listEl) return;
    
    listEl.innerHTML = '';
    if (loadedFiles.length === 0) {
        listEl.innerHTML = '<div class="chip-empty text-center py-2" style="font-size:0.75rem; color:var(--text-secondary);">No models loaded.</div>';
        return;
    }
    
    loadedFiles.forEach((f, idx) => {
        const chip = document.createElement('div');
        chip.className = 'imported-model-chip';
        chip.innerHTML = `
            <span><strong>${f.modelName}</strong> <span style="font-size:0.65rem; color:var(--text-secondary);">(${f.fileName})</span></span>
            <button class="btn-remove-model" data-index="${idx}" title="Remove Model">×</button>
        `;
        listEl.appendChild(chip);
    });
    
    listEl.querySelectorAll('.btn-remove-model').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            loadedFiles.splice(index, 1);
            if (loadedFiles.length === 0) {
                // Tear down Chart.js instances before hiding the dashboard,
                // otherwise they leak as orphaned canvases on a hidden view.
                if (costSavingsChart) { costSavingsChart.destroy(); costSavingsChart = null; }
                if (cachePerformanceChart) { cachePerformanceChart.destroy(); cachePerformanceChart = null; }
                if (costEfficiencyChart) { costEfficiencyChart.destroy(); costEfficiencyChart = null; }
                rawData = null;
                uploadContainer.style.display = 'block';
                dashboardContainer.style.display = 'none';
                miniUploadBtn.style.display = 'none';
                periodBadge.style.display = 'none';
            } else {
                compileMergedData();
                updateCalculationsAndRender();
            }
        });
    });
}

// SCHEMA VALIDATOR
function validateUsageData(data) {
    return data && 
           typeof data === 'object' && 
           data.totals !== undefined && 
           data.period !== undefined && 
           (Array.isArray(data.daily) || Array.isArray(data.hourly) || Array.isArray(data.rows));
}

// POPULATE MODELS OPTIONS
function populateModelOptions() {
    modelFilterSelect.innerHTML = '<option value="">All Models</option>';
    const models = (rawData.available_models || []).slice().sort((a, b) => a.localeCompare(b));
    models.forEach(m => {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = m;
        modelFilterSelect.appendChild(option);
    });
}

// FUZZY AUTO-MATCH MODEL TO OPENROUTER REGISTRY
function findOpenRouterMatch(modelName) {
    if (!modelName) return null;
    const cleanName = modelName.toLowerCase();
    
    // 1. Direct exact match
    let match = openRouterModels.find(m => m.id.toLowerCase() === cleanName || m.name.toLowerCase() === cleanName);
    if (match) return match;
    
    // 2. Exact match after stripping provider prefix (e.g. "openai/gpt-4o" matches "gpt-4o")
    match = openRouterModels.find(m => {
        const parts = m.id.toLowerCase().split('/');
        return parts[parts.length - 1] === cleanName;
    });
    if (match) return match;
    
    // 3. Substring match
    match = openRouterModels.find(m => {
        const idTail = m.id.toLowerCase().split('/').pop();
        return idTail.includes(cleanName) || cleanName.includes(idTail);
    });
    if (match) return match;

    // 4. Special cases (e.g. "glm" matches to zhipu GLM models)
    if (cleanName.includes('glm')) {
        const glmMatch = openRouterModels.find(m => m.id.toLowerCase().includes('glm'));
        if (glmMatch) return glmMatch;
    }
    
    return null;
}

// CALCULATIONS & COMPARATIVE PRICING ENGINE

// Energy plan rates ($/kWh). MONTHS_PER_YEAR / BILLABLE_MONTHS expresses the
// "annual = 2 months free" discount shared by the *-yr options.
const ENERGY_PLAN_RATES = {
    'flat-10':       10.00,
    'plan-basic':     8.50,
    'plan-std':       8.00,
    'plan-pro':       7.50,
};
const BILLABLE_MONTHS = 10;
const MONTHS_PER_YEAR  = 12;
const ANNUAL_DISCOUNT  = BILLABLE_MONTHS / MONTHS_PER_YEAR; // 2 months free

// Resolve the live $/kWh rate for the selected mode.
// Returns null for 'json' mode (use the original cost from the export).
function getEnergyKwhRate() {
    if (costCalcMode === 'custom') return customKwhRate;
    const base = ENERGY_PLAN_RATES[costCalcMode];
    if (base !== undefined) {
        return costCalcMode.endsWith('-yr') ? base * ANNUAL_DISCOUNT : base;
    }
    return null; // 'json' or unknown — defer to original cost
}

// Carbon equivalent of charging one smartphone (g CO₂). Source: EPA-style
// approximation (~8.3 Wh per full smartphone charge × grid emissions factor).
const SMARTPHONE_CHARGE_GCO2 = 8.3;

// Per-million-tokens (Mtok) conversion factor. Prices are quoted per token on
// the wire but displayed/input per million tokens.
const TOKENS_PER_MILLION = 1000000;

// Watt-hours per kilowatt-hour (used to render Wh in the logs/CSV).
const WH_PER_KWH = 1000;

function getCalculatedCosts(tokens, cachedTokens, promptTokensTotal, completionTokensTotal, energyKwh, originalCost, originalTokenCost, originalThirdPartyCost, modelName) {
    // 1. Calculate energy-based cost
    let energyCost = originalCost;
    const kwhRate = getEnergyKwhRate();
    if (kwhRate !== null) {
        energyCost = energyKwh * kwhRate;
        if (modelName && modelName.toLowerCase().includes('flex')) {
            energyCost *= 0.65;
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

    // 3. Compute Third-party Comparison Cost
    let compareCost = originalTokenCost;
    let activeRateModelId = thirdPartyCompareRate;

    if (thirdPartyCompareRate === 'auto-match') {
        const match = findOpenRouterMatch(modelName);
        if (match) {
            activeRateModelId = match.id;
        } else {
            activeRateModelId = 'json-token-cost';
        }
    }

    if (activeRateModelId === 'custom-rates') {
        const promptPrice = customTpInputRate / TOKENS_PER_MILLION;
        const promptCachedPrice = customTpCacheRate / TOKENS_PER_MILLION;
        const completionPrice = customTpOutputRate / TOKENS_PER_MILLION;
        
        const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
        const completionCost = completionTokens * completionPrice;
        compareCost = promptCost + completionCost;
    } else if (activeRateModelId === 'json-token-cost') {
        // No heuristics: return standard token cost directly from the JSON
        compareCost = originalTokenCost;
    } else {
        // Must be a dynamically loaded OpenRouter model!
        const orModel = openRouterModels.find(m => m.id === activeRateModelId);
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

    const savings = Math.max(0, compareCost - energyCost);
    const savingsPct = compareCost > 0 ? (savings / compareCost * 100) : 0;

    return {
        energyCost,
        compareCost,
        savings,
        savingsPct
    };
}

// Build date-filtered per-model statistics from rawData.daily.
// Shared by the central calculator and the model breakdown renderer so the
// two cannot drift out of sync. Every daily row carries a `model` field
// (stamped in compileMergedData), so the per-model map fully covers the
// filtered set — base totals are derived by summing its values.
function buildModelStats(startDate, endDate) {
    const modelStats = {};
    rawData.daily.forEach(d => {
        const dDate = parseDateLocal(d.date);
        if (startDate && dDate < startDate) return;
        if (endDate && dDate > endDate) return;

        const modelName = d.model;
        if (!modelName) return;

        if (!modelStats[modelName]) {
            modelStats[modelName] = {
                model: modelName,
                requests: 0,
                tokens: 0,
                cached_tokens: 0,
                cost: 0,
                token_cost: 0,
                energy_kwh: 0,
                energy_joules: 0,
                carbon_g: 0,
                third_party_cost: 0,
                third_party_requests: 0,
                is_third_party: false
            };
            const origModel = rawData.by_model.find(x => x.model === modelName);
            if (origModel) {
                modelStats[modelName].is_third_party = origModel.is_third_party;
            }
        }
        const s = modelStats[modelName];
        s.requests      += d.requests || 0;
        s.tokens        += d.tokens || 0;
        s.cached_tokens += d.cached_tokens || 0;
        s.cost          += d.cost || 0;
        s.token_cost    += d.token_cost || 0;
        s.energy_kwh    += d.energy_kwh || 0;
        s.energy_joules += d.energy_joules || 0;
        s.carbon_g      += d.carbon_g || 0;
        s.third_party_cost      += d.third_party_cost || 0;
        s.third_party_requests   += d.third_party_requests || 0;
    });
    return modelStats;
}

// CENTRAL REACTIVE CALCULATOR
function updateCalculationsAndRender() {
    if (!rawData) return;

    // Parse filter dates
    const startDate = filterStartDate ? new Date(filterStartDate + 'T00:00:00') : null;
    const endDate = filterEndDate ? new Date(filterEndDate + 'T23:59:59') : null;

    // 1. Establish base totals (isolated by model and date range if filtered)
    const modelStats = buildModelStats(startDate, endDate);

    let baseRequests = 0;
    let baseTokens = 0;
    let baseCachedTokens = 0;
    let baseEnergyKwh = 0;
    let baseEnergyJoules = 0;
    let baseCarbonG = 0;
    let baseCost = 0;
    let baseTokenCost = 0;
    let baseThirdPartyCost = 0;
    let baseThirdPartyRequests = 0;

    Object.values(modelStats).forEach(m => {
        if (selectedModel && m.model !== selectedModel) return;
        baseRequests += m.requests;
        baseTokens += m.tokens;
        baseCachedTokens += m.cached_tokens;
        baseEnergyKwh += m.energy_kwh;
        baseEnergyJoules += m.energy_joules;
        baseCarbonG += m.carbon_g;
        baseCost += m.cost;
        baseTokenCost += m.token_cost;
        baseThirdPartyCost += m.third_party_cost;
        baseThirdPartyRequests += m.third_party_requests;
    });

    const baseCarbonIntensity = baseEnergyKwh > 0 ? (baseCarbonG / baseEnergyKwh) : (rawData.totals.carbon_intensity || 0);

    // Completion/prompt ratio mapping (calculated per-model dynamically)
    let basePromptTokens = 0;
    let baseCompletionTokens = 0;
    
    const modelsInStats = Object.values(modelStats);
    modelsInStats.forEach(m => {
        if (selectedModel && m.model !== selectedModel) return;
        
        const origModel = rawData.by_model.find(x => x.model === m.model);
        const ratio = origModel && origModel.tokens > 0 ? (origModel.completion_tokens / origModel.tokens) : 0;
        const modelCompletion = m.tokens * ratio;
        const modelPrompt = m.tokens - modelCompletion;
        
        basePromptTokens += modelPrompt;
        baseCompletionTokens += modelCompletion;
    });

    // Calculate dynamic cost comparisons
    let totalsEnergyCost = 0;
    const totalsKwhRate = getEnergyKwhRate();
    if (totalsKwhRate !== null) {
        Object.values(modelStats).forEach(m => {
            if (selectedModel && m.model !== selectedModel) return;
            let mCost = m.energy_kwh * totalsKwhRate;
            if (m.model && m.model.toLowerCase().includes('flex')) {
                mCost *= 0.65;
            }
            totalsEnergyCost += mCost;
        });
    } else {
        totalsEnergyCost = baseCost;
    }

    let totalCompareCost = 0;
    if (thirdPartyCompareRate === 'auto-match' && !selectedModel) {
        const models = Object.values(modelStats);
        if (models.length > 0) {
            models.forEach(m => {
                const modelCosts = getCalculatedCosts(
                    m.tokens,
                    m.cached_tokens || 0,
                    basePromptTokens,
                    baseCompletionTokens,
                    m.energy_kwh,
                    m.cost,
                    m.token_cost || 0,
                    m.third_party_cost || 0,
                    m.model
                );
                totalCompareCost += modelCosts.compareCost;
            });
        } else {
            totalCompareCost = baseTokenCost;
        }
    } else {
        const totalsCosts = getCalculatedCosts(
            baseTokens,
            baseCachedTokens,
            basePromptTokens,
            baseCompletionTokens,
            baseEnergyKwh,
            baseCost,
            baseTokenCost,
            baseThirdPartyCost,
            selectedModel
        );
        totalCompareCost = totalsCosts.compareCost;
    }

    const totalSavings = Math.max(0, totalCompareCost - totalsEnergyCost);
    const totalSavingsPct = totalCompareCost > 0 ? (totalSavings / totalCompareCost * 100) : 0;

    calculatedTotals = {
        requests: baseRequests,
        third_party_requests: baseThirdPartyRequests,
        tokens: baseTokens,
        prompt_tokens: basePromptTokens,
        completion_tokens: baseCompletionTokens,
        cached_tokens: baseCachedTokens,
        energy_kwh: baseEnergyKwh,
        energy_joules: baseEnergyJoules,
        carbon_g: baseCarbonG,
        carbon_intensity: baseCarbonIntensity,
        cost: totalsEnergyCost,
        token_cost: totalCompareCost,
        savings: totalSavings,
        savingsPct: totalSavingsPct
    };

    // 2. Filter timeline by date range
    let timelineSource = rawData.daily.filter(d => {
        const dDate = parseDateLocal(d.date);
        if (startDate && dDate < startDate) return false;
        if (endDate && dDate > endDate) return false;
        return true;
    });

    // 3. Compute per-row costs BEFORE date-grouping so each row's compare
    //    rate resolves the correct OpenRouter match for its model. Grouping
    //    first would lose the `model` field and fall back to the first
    //    model's rate for every aggregated row.
    calculatedTimeline = timelineSource.map(d => {
        let item = { ...d };

        // Model filtering on timeline
        if (selectedModel) {
            if (item.model) {
                if (item.model !== selectedModel) return null;
            } else {
                // If hourly records lack model field, scale timeline based on model's overall volume share
                const modelObj = rawData.by_model.find(m => m.model === selectedModel);
                if (modelObj && rawData.totals.tokens > 0) {
                    const share = modelObj.tokens / rawData.totals.tokens;
                    item.requests = Math.round(item.requests * share);
                    item.tokens = Math.round(item.tokens * share);
                    item.cached_tokens = Math.round((item.cached_tokens || 0) * share);
                    item.energy_kwh = item.energy_kwh * share;
                    item.energy_joules = (item.energy_joules || 0) * share;
                    item.carbon_g = (item.carbon_g || 0) * share;
                    item.cost = item.cost * share;
                    item.token_cost = item.token_cost * share;
                    item.third_party_cost = (item.third_party_cost || 0) * share;
                }
            }
        }

        // Apply custom costing variables
        const itemModelName = item.model || selectedModel || (rawData.by_model && rawData.by_model[0] ? rawData.by_model[0].model : '');
        const origModel = rawData.by_model.find(x => x.model === itemModelName);
        const refPrompt = origModel ? origModel.prompt_tokens : basePromptTokens;
        const refCompletion = origModel ? origModel.completion_tokens : baseCompletionTokens;
        
        const entryCosts = getCalculatedCosts(
            item.tokens,
            item.cached_tokens || 0,
            refPrompt,
            refCompletion,
            item.energy_kwh || 0,
            item.cost,
            item.token_cost || 0,
            item.third_party_cost || 0,
            itemModelName
        );

        item.cost = entryCosts.energyCost;
        item.token_cost = entryCosts.compareCost;
        item.savings = entryCosts.savings;

        return item;
    }).filter(Boolean);

    // 4. When all models are selected, group the now-costed rows by date so
    //    the charts show a single series. Savings are summed from per-model
    //    values already computed with each model's correct compare rate.
    if (!selectedModel) {
        const grouped = {};
        calculatedTimeline.forEach(d => {
            const dateStr = d.date;
            if (!grouped[dateStr]) {
                grouped[dateStr] = {
                    date: dateStr,
                    requests: 0,
                    tokens: 0,
                    cached_tokens: 0,
                    cost: 0,
                    token_cost: 0,
                    energy_kwh: 0,
                    energy_joules: 0,
                    carbon_g: 0,
                    savings: 0,
                    self_hosted_cost: 0,
                    third_party_cost: 0
                };
            }
            grouped[dateStr].requests += d.requests || 0;
            grouped[dateStr].tokens += d.tokens || 0;
            grouped[dateStr].cached_tokens += d.cached_tokens || 0;
            grouped[dateStr].cost += d.cost || 0;
            grouped[dateStr].token_cost += d.token_cost || 0;
            grouped[dateStr].energy_kwh += d.energy_kwh || 0;
            grouped[dateStr].energy_joules += d.energy_joules || 0;
            grouped[dateStr].carbon_g += d.carbon_g || 0;
            grouped[dateStr].savings += d.savings || 0;
            grouped[dateStr].self_hosted_cost += d.self_hosted_cost || 0;
            grouped[dateStr].third_party_cost += d.third_party_cost || 0;
        });
        calculatedTimeline = Object.values(grouped);
    }

    // Sort timeline ascending for charts
    calculatedTimelineSorted = [...calculatedTimeline].sort((a, b) => parseDateLocal(a.date) - parseDateLocal(b.date));

    // 3. Render Everything with fresh data
    renderSummaryStats();
    renderCharts();
    renderModelBreakdown();
    renderLogsTable();
}

// NUMBER FORMATTING HELPERS
function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

function formatTokens(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return Math.round(num);
}

function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(num);
}

function formatDateShort(dateObj) {
    return dateObj.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Parse a date or datetime string from Neuralwatt exports as LOCAL time.
// Per the ECMAScript spec, date-only ISO strings ("2026-07-21") are read as
// UTC midnight, which shifts the calendar day backward when the browser
// renders in a western timezone (e.g. UTC-4 shows Jul 20). Appending
// "T00:00:00" makes the spec treat it as local midnight, so the displayed
// calendar date matches the export regardless of the viewer's timezone.
// Datetime strings (e.g. hourly "2026-07-21T05:00:00") already parse as
// local when they carry no timezone offset, and are returned unchanged.
function parseDateLocal(dateStr) {
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr + 'T00:00:00');
    }
    return new Date(dateStr);
}

// True when the exported row carries a whole-day (date-only) value rather
// than a timestamp. Used to drop the meaningless "00:00" suffix on daily rows.
function isDateOnly(dateStr) {
    return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function formatDateTable(dateStr) {
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

// RFC 4180 CSV field escaping: wrap in double quotes, escape embedded
// quotes by doubling. Safe even for fields that never contain commas
// today (numbers / ISO dates), so the export stays robust if a date
// string or future field ever contains a comma or quote.
function csvEscape(value) {
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// SUMMARY STATS POPULATION
function renderSummaryStats() {
    const t = calculatedTotals;
    
    // Requests
    valRequests.textContent = formatNumber(t.requests);
    valRequestsSub.textContent = t.third_party_requests > 0 
        ? `${formatNumber(t.third_party_requests)} third-party requests` 
        : '100% self-hosted requests';

    // Tokens
    valTokens.textContent = formatTokens(t.tokens);
    const cacheRate = t.prompt_tokens > 0 ? (t.cached_tokens / t.prompt_tokens * 100) : 0;
    valCachePercent.textContent = cacheRate.toFixed(1) + '%';
    barCacheFill.style.width = cacheRate.toFixed(1) + '%';
    valTokensSplit.textContent = `${formatTokens(t.prompt_tokens)} prompt / ${formatTokens(t.completion_tokens)} completion (${formatTokens(t.cached_tokens)} cached)`;

    // Costs
    valEnergyCost.textContent = formatCurrency(t.cost);
    valSavingsAmount.textContent = `Est. Saved ${formatCurrency(t.savings)}`;
    valSavingsPct.textContent = `${t.savingsPct.toFixed(1)}% Est. Savings`;
    
    let rateLabel = "Compare rate";
    if (thirdPartyCompareRate === 'auto-match') {
        if (selectedModel) {
            const match = findOpenRouterMatch(selectedModel);
            rateLabel = match ? `OpenRouter Auto-Match (${match.name})` : "JSON standard rate";
        } else if (rawData.by_model && rawData.by_model.length === 1) {
            const match = findOpenRouterMatch(rawData.by_model[0].model);
            rateLabel = match ? `OpenRouter Auto-Match (${match.name})` : "JSON standard rate";
        } else {
            rateLabel = "OpenRouter Auto-Match (Multi-Model)";
        }
    } else if (thirdPartyCompareRate === 'custom-rates') {
        rateLabel = "Custom rates ($/Mtok)";
    } else {
        // Fetch from OpenRouter live list
        const orModel = openRouterModels.find(m => m.id === thirdPartyCompareRate);
        if (orModel) {
            rateLabel = `${orModel.name} comparison`;
        }
    }
    valTokenCostComparison.textContent = `${rateLabel}: ${formatCurrency(t.token_cost)}`;

    // Energy
    valEnergyKwh.textContent = `${t.energy_kwh.toFixed(3)} kWh`;
    valEnergyJoules.textContent = `${formatNumber(Math.round(t.energy_joules))} Joules`;
    valEnergyAccounting.textContent = `Accounting: ${rawData.accounting_method || 'energy'}`;

    // Carbon
    valCarbonG.textContent = `${t.carbon_g.toFixed(2)} g CO₂`;
    valCarbonIntensity.textContent = `${t.carbon_intensity.toFixed(1)} g CO₂/kWh`;
    
    const phoneCharges = (t.carbon_g / SMARTPHONE_CHARGE_GCO2).toFixed(1);
    valCarbonEquivalent.textContent = `≈ charging ${phoneCharges} smartphones`;
}

// RENDER CHARTS
function renderCharts() {
    const isDark = bodyEl.classList.contains('dark-mode');
    const textPrimaryColor = isDark ? '#FDFCF7' : '#081A17';
    const textSecondaryColor = isDark ? '#9BAA95' : '#858458';
    const gridColor = isDark ? 'rgba(253, 252, 247, 0.08)' : 'rgba(8, 26, 23, 0.08)';

    // Chart dataset palette mirrors the CSS-variable accents in index.css
    // (resolved here to concrete hexes because Chart.js cannot consume
    // `var(--…)` directly). Keep these in sync with the :root / .dark-mode
    // values for --accent-terracotta / --accent-green / --accent-emerald.
    const chartColors = {
        terracotta: isDark ? '#E86C45' : '#D55934', // --accent-terracotta
        green:      isDark ? '#81c784' : '#2e7d32', // --accent-green
        emerald:    isDark ? '#2dd4bf' : '#0f766e', // --accent-emerald
        secondary:  textSecondaryColor,             // --text-secondary
    };

    if (costSavingsChart) costSavingsChart.destroy();
    if (cachePerformanceChart) cachePerformanceChart.destroy();
    if (costEfficiencyChart) costEfficiencyChart.destroy();

    const dates = calculatedTimelineSorted.map(d => formatDateTable(d.date));

    // Chart 1: Cost & Savings Progression
    const energyCosts = calculatedTimelineSorted.map(d => d.cost);
    const tokenCosts = calculatedTimelineSorted.map(d => d.token_cost);
    const savings = calculatedTimelineSorted.map(d => d.savings);

    const ctx1 = document.getElementById('costSavingsChart').getContext('2d');
    costSavingsChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Calculated Cost (USD)',
                    data: energyCosts,
                    backgroundColor: chartColors.terracotta,
                    borderColor: chartColors.terracotta,
                    borderRadius: 4,
                    order: 2
                },
                {
                    label: 'Compare Rate Cost (USD)',
                    data: tokenCosts,
                    type: 'line',
                    borderColor: chartColors.secondary,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointBackgroundColor: chartColors.secondary,
                    fill: false,
                    order: 1
                },
                {
                    label: 'Estimated Savings (USD)',
                    data: savings,
                    type: 'line',
                    borderColor: chartColors.green,
                    borderWidth: 2,
                    pointBackgroundColor: chartColors.green,
                    backgroundColor: isDark ? 'rgba(129, 199, 132, 0.05)' : 'rgba(46, 125, 50, 0.05)',
                    fill: true,
                    order: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textPrimaryColor, font: { family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textSecondaryColor, font: { family: 'Inter', size: 10 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { 
                        color: textSecondaryColor, 
                        font: { family: 'Inter' },
                        callback: function(value) { return '$' + value.toFixed(2); }
                    }
                }
            }
        }
    });

    // Chart 2: Token Cache Performance
    const totalTokens = calculatedTimelineSorted.map(d => d.tokens);
    const cachedTokens = calculatedTimelineSorted.map(d => d.cached_tokens || 0);
    const hitRates = calculatedTimelineSorted.map(d => d.tokens > 0 ? ((d.cached_tokens || 0) / d.tokens * 100) : 0);

    const ctx2 = document.getElementById('cachePerformanceChart').getContext('2d');
    cachePerformanceChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Uncached Tokens',
                    data: calculatedTimelineSorted.map(d => d.tokens - (d.cached_tokens || 0)),
                    backgroundColor: chartColors.terracotta,
                    stack: 'Stack 0',
                    order: 2
                },
                {
                    label: 'Cached Tokens',
                    data: cachedTokens,
                    backgroundColor: chartColors.green,
                    stack: 'Stack 0',
                    order: 2
                },
                {
                    label: 'Cache Hit %',
                    data: hitRates,
                    type: 'line',
                    borderColor: chartColors.emerald,
                    borderWidth: 2,
                    pointBackgroundColor: chartColors.emerald,
                    yAxisID: 'y1',
                    fill: false,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textPrimaryColor, font: { family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 2) {
                                return `Cache Hit: ${context.raw.toFixed(1)}%`;
                            }
                            return `${context.dataset.label}: ${formatNumber(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textSecondaryColor, font: { family: 'Inter', size: 10 } }
                },
                y: {
                    position: 'left',
                    grid: { color: gridColor },
                    ticks: { 
                        color: textSecondaryColor, 
                        font: { family: 'Inter' },
                        callback: function(value) { return formatTokens(value); }
                    }
                },
                y1: {
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { 
                        color: textSecondaryColor,
                        font: { family: 'Inter' },
                        callback: function(value) { return value + '%'; }
                    },
                    min: 0,
                    max: 100
                }
            }
        }
    });

    // Chart 3: Cost per Million Tokens vs. Cost per Request
    const costPerMillionData = calculatedTimelineSorted.map(d => d.tokens > 0 ? (d.cost / d.tokens) * TOKENS_PER_MILLION : 0);
    const costPerRequestData = calculatedTimelineSorted.map(d => d.requests > 0 ? d.cost / d.requests : 0);

    const ctx3 = document.getElementById('costEfficiencyChart').getContext('2d');
    costEfficiencyChart = new Chart(ctx3, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Cost per Million Tokens (USD)',
                    data: costPerMillionData,
                    borderColor: chartColors.terracotta,
                    borderWidth: 2,
                    pointBackgroundColor: chartColors.terracotta,
                    yAxisID: 'y',
                    fill: false
                },
                {
                    label: 'Cost per Request (USD)',
                    data: costPerRequestData,
                    borderColor: chartColors.emerald,
                    borderWidth: 2,
                    pointBackgroundColor: chartColors.emerald,
                    yAxisID: 'y1',
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textPrimaryColor, font: { family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 0) {
                                return `Cost per Million: ${formatCurrency(context.raw)}`;
                            }
                            return `Cost per Request: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textSecondaryColor, font: { family: 'Inter', size: 10 } }
                },
                y: {
                    position: 'left',
                    grid: { color: gridColor },
                    title: { display: true, text: 'Cost / Million Tokens ($)', color: textPrimaryColor },
                    ticks: { 
                        color: textSecondaryColor, 
                        font: { family: 'Inter' },
                        callback: function(value) { return '$' + value.toFixed(2); }
                    },
                    min: 0
                },
                y1: {
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Cost / Request ($)', color: textPrimaryColor },
                    ticks: { 
                        color: textSecondaryColor, 
                        font: { family: 'Inter' },
                        callback: function(value) { return '$' + value.toFixed(4); }
                    },
                    min: 0
                }
            }
        }
    });
}

// MODEL BREAKDOWN RENDER
function renderModelBreakdown() {
    modelPerformanceTbody.innerHTML = '';
    
    // Date-filtered per-model stats, shared with the central calculator.
    const startDate = filterStartDate ? new Date(filterStartDate + 'T00:00:00') : null;
    const endDate = filterEndDate ? new Date(filterEndDate + 'T23:59:59') : null;
    const modelStats = buildModelStats(startDate, endDate);

    // Map stats to pre-calculated properties for proper column sorting
    let models = Object.values(modelStats).map(m => {
        const origModel = rawData.by_model.find(x => x.model === m.model);
        const ratio = origModel && origModel.tokens > 0 ? (origModel.completion_tokens / origModel.tokens) : 0;
        const modelCompletion = m.tokens * ratio;
        const modelPrompt = m.tokens - modelCompletion;

        const cacheRate = modelPrompt > 0 ? ((m.cached_tokens || 0) / modelPrompt * 100) : 0;
        
        const modelCosts = getCalculatedCosts(
            m.tokens,
            m.cached_tokens || 0,
            calculatedTotals.prompt_tokens,
            calculatedTotals.completion_tokens,
            m.energy_kwh,
            m.cost,
            m.token_cost || 0,
            m.third_party_cost || 0,
            m.model
        );

        return {
            ...m,
            modelPrompt,
            modelCompletion,
            cacheRate,
            energyCost: modelCosts.energyCost,
            compareCost: modelCosts.compareCost,
            savings: modelCosts.savings,
            savingsPct: modelCosts.savingsPct
        };
    });

    if (selectedModel) {
        models = models.filter(m => m.model === selectedModel);
    }

    // Sort models based on chosen column and direction
    models.sort((a, b) => {
        let valA, valB;
        if (modelSortColumn === 'model') {
            valA = a.model;
            valB = b.model;
            return modelSortDirection === 'asc' 
                ? valA.localeCompare(valB) 
                : valB.localeCompare(valA);
        } else if (modelSortColumn === 'cache_rate') {
            valA = a.cacheRate;
            valB = b.cacheRate;
        } else if (modelSortColumn === 'energy_cost') {
            valA = a.energyCost;
            valB = b.energyCost;
        } else if (modelSortColumn === 'savings') {
            valA = a.savings;
            valB = b.savings;
        } else {
            valA = a[modelSortColumn];
            valB = b[modelSortColumn];
        }

        return modelSortDirection === 'asc' 
            ? (valA - valB) 
            : (valB - valA);
    });

    if (models.length === 0) {
        modelPerformanceTbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-secondary">No models listed</td></tr>';
        return;
    }

    models.forEach(m => {
        const modelCompletion = m.modelCompletion;
        const modelPrompt = m.modelPrompt;
        const cacheRate = m.cacheRate;

        // Calculate unit costs
        const costPerRequest = m.requests > 0 ? (m.energyCost / m.requests) : 0;
        const compareCostPerRequest = m.requests > 0 ? (m.compareCost / m.requests) : 0;
        const costPerMtok = m.tokens > 0 ? (m.energyCost / m.tokens * 1000000) : 0;
        const compareCostPerMtok = m.tokens > 0 ? (m.compareCost / m.tokens * 1000000) : 0;

        // Resolve Comparison rates & matched model
        let activeRateModelId = thirdPartyCompareRate;
        if (thirdPartyCompareRate === 'auto-match') {
            const match = findOpenRouterMatch(m.model);
            if (match) {
                activeRateModelId = match.id;
            } else {
                activeRateModelId = 'json-token-cost';
            }
        }

        let compLabel = '';
        let compBreakdown = '';
        const uncachedPrompt = Math.max(0, modelPrompt - (m.cached_tokens || 0));
        const cachedTokens = m.cached_tokens || 0;
        const completionTokens = modelCompletion;

        if (activeRateModelId === 'custom-rates') {
            compLabel = 'Custom Rates';
            compBreakdown = `
                <ul class="comp-breakdown-list">
                    <li>Input: <strong>${formatCurrency(customTpInputRate)}/Mtok</strong></li>
                    <li>Cached In: <strong>${formatCurrency(customTpCacheRate)}/Mtok</strong></li>
                    <li>Output: <strong>${formatCurrency(customTpOutputRate)}/Mtok</strong></li>
                </ul>
            `;
        } else if (activeRateModelId === 'json-token-cost') {
            compLabel = 'JSON Token Cost';
            compBreakdown = `
                <ul class="comp-breakdown-list">
                    <li>Aggregate: <strong>${formatCurrency(m.compareCost)}</strong></li>
                </ul>
            `;
        } else {
            const orModel = openRouterModels.find(x => x.id === activeRateModelId);
            if (orModel) {
                compLabel = `<a href="https://openrouter.ai/${orModel.id}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-terracotta); text-decoration: underline;">${orModel.name}</a>`;
            } else {
                compLabel = activeRateModelId;
            }
            if (orModel && orModel.pricing) {
                const promptPrice = parseFloat(orModel.pricing.prompt) || 0;
                const completionPrice = parseFloat(orModel.pricing.completion) || 0;
                let promptCachedPrice = promptPrice;
                if (orModel.pricing.input_cache_read !== undefined && orModel.pricing.input_cache_read !== null) {
                    promptCachedPrice = parseFloat(orModel.pricing.input_cache_read) || 0;
                }
                const promptPriceM = promptPrice * TOKENS_PER_MILLION;
                const promptCachedPriceM = promptCachedPrice * TOKENS_PER_MILLION;
                const completionPriceM = completionPrice * TOKENS_PER_MILLION;
                compBreakdown = `
                    <ul class="comp-breakdown-list">
                        <li>Input: <strong>${formatCurrency(promptPriceM)}/Mtok</strong></li>
                        <li>Cached In: <strong>${formatCurrency(promptCachedPriceM)}/Mtok</strong></li>
                        <li>Output: <strong>${formatCurrency(completionPriceM)}/Mtok</strong></li>
                    </ul>
                `;
            } else {
                compBreakdown = `
                    <ul class="comp-breakdown-list">
                        <li>Aggregate: <strong>${formatCurrency(m.compareCost)}</strong></li>
                    </ul>
                `;
            }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="model-perf-name">${m.model}</div>
                ${m.is_third_party ? `
                <span class="model-perf-badge badge-warning">
                    third party
                </span>` : ''}
            </td>
            <td>
                <div class="model-perf-details" style="font-weight:600;">
                    ${formatNumber(m.requests)}
                </div>
            </td>
            <td>
                <div class="model-perf-details" style="font-weight:600;">
                    ${formatTokens(m.tokens)}
                </div>
            </td>
            <td>
                <div class="model-perf-details" style="font-weight:600; font-size:0.9rem;">
                    ${cacheRate.toFixed(1)}%
                </div>
            </td>
            <td>
                <div class="model-perf-details">
                    Uncached In: <strong>${formatTokens(uncachedPrompt)}</strong><br>
                    Cached In: <strong>${formatTokens(cachedTokens)}</strong><br>
                    Out: <strong>${formatTokens(completionTokens)}</strong>
                </div>
            </td>
            <td>
                <div class="model-perf-details" style="font-weight:600; font-size:0.9rem;">
                    ${formatCurrency(m.energyCost)}
                </div>
                <div class="model-perf-sub">
                    ${m.energy_kwh.toFixed(3)} kWh
                </div>
            </td>
            <td>
                <div class="model-perf-details">
                    Cost/Req:<br>
                    • Energy: <strong>${formatCurrency(costPerRequest)}</strong><br>
                    • Compare: <strong>${formatCurrency(compareCostPerRequest)}</strong><br>
                    Cost/Mtok:<br>
                    • Energy: <strong>${formatCurrency(costPerMtok)}</strong><br>
                    • Compare: <strong>${formatCurrency(compareCostPerMtok)}</strong>
                </div>
            </td>
            <td>
                <div class="model-perf-details">
                    OpenRouter Match:<br><strong>${compLabel}</strong><br>
                    ${compBreakdown}
                    Total Compare: <strong>${formatCurrency(m.compareCost)}</strong>
                </div>
            </td>
            <td>
                <div class="model-perf-details ${m.savings > 0 ? 'savings-positive' : 'savings-neutral'}">
                    ${formatCurrency(m.savings)}
                </div>
                <div class="model-perf-sub ${m.savings > 0 ? 'savings-positive' : 'savings-neutral'}">
                    (${m.savingsPct.toFixed(1)}%)
                </div>
            </td>
        `;
        modelPerformanceTbody.appendChild(row);
    });
}


// LOGS TABLE RENDER
function renderLogsTable() {
    let rows = calculatedTimeline.map(d => {
        const cacheRate = d.tokens > 0 ? ((d.cached_tokens || 0) / d.tokens * 100) : 0;
        return {
            dateStr: d.date,
            dateObj: parseDateLocal(d.date),
            requests: d.requests,
            tokens: d.tokens,
            cached: d.cached_tokens || 0,
            cache_rate: cacheRate,
            energy_cost: d.cost,
            token_cost: d.token_cost,
            savings: d.savings,
            energy: (d.energy_kwh || 0) * WH_PER_KWH,
            carbon: d.carbon_g || 0,
            carbon_intensity: d.carbon_intensity || rawData.totals.carbon_intensity
        };
    });

    // Apply Search Filter
    if (currentSearchQuery) {
        rows = rows.filter(r => formatDateTable(r.dateStr).toLowerCase().includes(currentSearchQuery.toLowerCase()));
    }

    // Apply Sorting
    rows.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];

        if (currentSortColumn === 'date') {
            valA = a.dateObj;
            valB = b.dateObj;
        }

        if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    logsTableBody.innerHTML = '';
    if (rows.length === 0) {
        logsTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No logs match search criteria</td></tr>`;
        return;
    }

    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-mono">${formatDateTable(r.dateStr)}</td>
            <td>${formatNumber(r.requests)}</td>
            <td>${formatTokens(r.tokens)}</td>
            <td>${formatTokens(r.cached)}</td>
            <td class="font-mono">${r.cache_rate.toFixed(1)}%</td>
            <td class="font-mono">${formatCurrency(r.energy_cost)}</td>
            <td class="font-mono">${formatCurrency(r.token_cost)}</td>
            <td class="font-mono text-emerald" style="font-weight:600;">${formatCurrency(r.savings)}</td>
            <td>${r.energy.toFixed(1)} Wh</td>
            <td>${r.carbon.toFixed(1)} g</td>
        `;
        logsTableBody.appendChild(tr);
    });
}

// LOG SEARCH EVENT
logSearchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderLogsTable();
});

// LOG TABLE COLUMN SORTING
logsTableHeaders.forEach(th => {
    th.addEventListener('click', () => {
        const column = th.getAttribute('data-sort');
        
        logsTableHeaders.forEach(header => {
            if (header !== th) {
                header.classList.remove('sorted-asc', 'sorted-desc');
                header.querySelector('.sort-indicator').textContent = '';
            }
        });

        if (currentSortColumn === column) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = column;
            currentSortDirection = 'desc';
        }

        th.classList.remove('sorted-asc', 'sorted-desc');
        th.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        th.querySelector('.sort-indicator').textContent = currentSortDirection === 'asc' ? ' ↑' : ' ↓';

        renderLogsTable();
    });
});

// MODEL PERFORMANCE TABLE COLUMN SORTING
modelTableHeaders.forEach(th => {
    th.addEventListener('click', () => {
        const column = th.getAttribute('data-sort');
        
        modelTableHeaders.forEach(header => {
            if (header !== th) {
                header.classList.remove('sorted-asc', 'sorted-desc');
                header.querySelector('.sort-indicator').textContent = '';
            }
        });

        if (modelSortColumn === column) {
            modelSortDirection = modelSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            modelSortColumn = column;
            modelSortDirection = 'desc';
        }

        th.classList.remove('sorted-asc', 'sorted-desc');
        th.classList.add(modelSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        th.querySelector('.sort-indicator').textContent = modelSortDirection === 'asc' ? ' ↑' : ' ↓';

        renderModelBreakdown();
    });
});

// CSV SUBSET EXPORT
btnExportCsvSubset.addEventListener('click', () => {
    if (!calculatedTimeline) return;
    
    let rows = calculatedTimeline.map(d => {
        const cacheRate = d.tokens > 0 ? ((d.cached_tokens || 0) / d.tokens * 100) : 0;
        return {
            date: d.date,
            requests: d.requests,
            tokens: d.tokens,
            cached: d.cached_tokens || 0,
            cache_rate: cacheRate,
            energy_cost: d.cost,
            token_cost: d.token_cost,
            savings: d.savings,
            energy_wh: (d.energy_kwh || 0) * WH_PER_KWH,
            carbon_g: d.carbon_g || 0
        };
    });

    if (currentSearchQuery) {
        rows = rows.filter(r => formatDateTable(r.date).toLowerCase().includes(currentSearchQuery.toLowerCase()));
    }

    rows.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];
        if (currentSortColumn === 'date') {
            valA = parseDateLocal(a.date);
            valB = parseDateLocal(b.date);
        }
        if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const headers = ['Time', 'Requests', 'Tokens', 'Cached Tokens', 'Cache Hit Rate %', 'Energy Cost (USD)', 'Standard Cost (USD)', 'Est. Savings (USD)', 'Energy (Wh)', 'Carbon (g CO2)'];
    const csvContent = [
        headers.map(csvEscape).join(','),
        ...rows.map(r => [
            r.date,
            r.requests,
            r.tokens,
            r.cached,
            r.cache_rate.toFixed(2),
            r.energy_cost.toFixed(6),
            r.token_cost.toFixed(6),
            r.savings.toFixed(6),
            r.energy_wh.toFixed(4),
            r.carbon_g.toFixed(4)
        ].map(csvEscape).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `neuralwatt_filtered_usage_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// START BACKGROUND LOAD FOR OPENROUTER
fetchOpenRouterModels();
