// DOM ELEMENTS
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

// Screen-reader live announcer (populated via textContent at state changes).
const srAnnouncer = document.getElementById('sr-announcer');

function showImportErrors(messages) {
    if (!messages || messages.length === 0) {
        hideImportErrors();
        return;
    }
    // Messages may include user-controlled filenames; escape before injection.
    importErrorList.innerHTML = messages.map(m => `<li>${escapeHtml(m)}</li>`).join('');
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
const valTokensPrompt = document.getElementById('val-tokens-prompt');
const valTokensCached = document.getElementById('val-tokens-cached');
const valTokensCompletion = document.getElementById('val-tokens-completion');
const valCachePercent = document.getElementById('val-cache-percent');
const barCacheFill = document.getElementById('bar-cache-fill');
const valTokensSplit = document.getElementById('val-tokens-split');
const valEnergyCost = document.getElementById('val-energy-cost');
const valEnergyCostSource = document.getElementById('val-energy-cost-source');
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

// Energy Insights Elements
const valEnergyWeightedAvg = document.getElementById('val-energy-weighted-avg');
const valEnergyWeightedSub = document.getElementById('val-energy-weighted-sub');
const valUserReqSize = document.getElementById('val-user-req-size');
const valUserReqBand = document.getElementById('val-user-req-band');
const valUserMwhReq = document.getElementById('val-user-mwh-req');
const valUserMwhVsBenchmark = document.getElementById('val-user-mwh-vs-benchmark');
const valMostEfficientModel = document.getElementById('val-most-efficient-model');
const valMostEfficientMwh = document.getElementById('val-most-efficient-mwh');
const energyBenchmarkTbody = document.getElementById('energy-benchmark-tbody');
const energyBenchmarkTableHeaders = document.querySelectorAll('#energy-benchmark-table th.sortable');

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

// Energy Insights State
let energyTableSortColumn = 'model';
let energyTableSortDirection = 'asc';
let energyInsightsChart = null;

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

// Official Neuralwatt token pricing ($/Mtok) from portal.neuralwatt.com/pricing#all-models
// Cache rates are 10% of the prompt price (Neuralwatt updated 2026-08);
// DeepSeek V4 Flash is the exception at 20% (0.028 / 0.14 in the posted rates).
// Phase 3.6: `let` so loadExternalPricingTables() can overwrite these with the
// contents of data/neuralwatt-pricing.json. The built-in copy is the fallback
// when the external file cannot be fetched (file:// or offline).
let NEURALWATT_MODEL_PRICING = {
    'glm-5.2':            { prompt: 1.45, cache: 0.145, completion: 4.50 },
    'glm-5.2-fast':       { prompt: 1.45, cache: 0.145, completion: 4.50 },
    'glm-5.2-short':      { prompt: 1.45, cache: 0.145, completion: 4.50 },
    'glm-5.2-short-fast': { prompt: 1.45, cache: 0.145, completion: 4.50 },
    'glm-5.2-short-flex': { prompt: 1.45, cache: 0.145, completion: 4.50 },
    'gemma-4-31b':        { prompt: 0.144, cache: 0.0144, completion: 0.42 },
    'glm-5.2-flex':       { prompt: 1.45, cache: 0.145, completion: 4.50 },
    'glm-5.2-short-fast-flex': { prompt: 1.45, cache: 0.145, completion: 4.50 },
    'kimi-k2.6':          { prompt: 0.69, cache: 0.069, completion: 3.22 },
    'kimi-k2.6-fast':     { prompt: 0.69, cache: 0.069, completion: 3.22 },
    'kimi-k2.7-code':      { prompt: 0.95, cache: 0.095, completion: 4.00 },
    'kimi-k2.7-code-fast': { prompt: 0.95, cache: 0.095, completion: 4.00 },
    'kimi-k2.7-code-flex': { prompt: 0.95, cache: 0.095, completion: 4.00 },
    'kimi-k3':            { prompt: 3.00, cache: 0.30, completion: 15.00 },
    'kimi-k3-fast':       { prompt: 3.00, cache: 0.30, completion: 15.00 },
    'deepseek-v4-flash':  { prompt: 0.14, cache: 0.028, completion: 0.28 },
    'qwen3.5-397b':       { prompt: 0.69, cache: 0.069, completion: 4.14 },
    'qwen3.5-397b-fast':  { prompt: 0.69, cache: 0.069, completion: 4.14 },
    'qwen3.6-35b':        { prompt: 0.29, cache: 0.029, completion: 1.15 },
    'qwen3.6-35b-fast':   { prompt: 0.29, cache: 0.029, completion: 1.15 }
};

// Official model provider token pricing ($/Mtok) from developer documentation (e.g. docs.z.ai)
// Phase 3.6: `let` so loadExternalPricingTables() can overwrite these with the
// contents of data/provider-pricing.json. The built-in copy is the fallback
// when the external file cannot be fetched (file:// or offline).
let PROVIDER_MODEL_PRICING = {
    'glm-5.2':            { provider: 'Z.ai (ZhipuAI)', prompt: 1.40, cache: 0.26, completion: 4.40 },
    'glm-5.2-fast':       { provider: 'Z.ai (ZhipuAI)', prompt: 1.40, cache: 0.26, completion: 4.40 },
    'glm-5.2-short':      { provider: 'Z.ai (ZhipuAI)', prompt: 1.40, cache: 0.26, completion: 4.40 },
    'glm-5.2-short-fast': { provider: 'Z.ai (ZhipuAI)', prompt: 1.40, cache: 0.26, completion: 4.40 },
    'glm-5.2-short-flex': { provider: 'Z.ai (ZhipuAI)', prompt: 1.40, cache: 0.26, completion: 4.40 },
    'gemma-4-31b':        { provider: 'Google / NVIDIA', prompt: 0.14, cache: 0.04, completion: 0.42 },
    'kimi-k2.6':          { provider: 'Moonshot AI', prompt: 0.95, cache: 0.16, completion: 4.00 },
    'kimi-k2.6-fast':     { provider: 'Moonshot AI', prompt: 0.95, cache: 0.16, completion: 4.00 },
    'kimi-k2.7-code':      { provider: 'Moonshot AI', prompt: 0.95, cache: 0.16, completion: 4.00 },
    'kimi-k2.7-code-flex': { provider: 'Moonshot AI', prompt: 0.95, cache: 0.16, completion: 4.00 },
    'qwen3.5-397b':       { provider: 'Alibaba Cloud (Qwen)', prompt: 0.60, cache: 0.15, completion: 3.60 },
    'qwen3.5-397b-fast':  { provider: 'Alibaba Cloud (Qwen)', prompt: 0.60, cache: 0.15, completion: 3.60 },
    'qwen3.6-35b':        { provider: 'Alibaba Cloud (Qwen)', prompt: 0.29, cache: 0.07, completion: 1.15 },
    'qwen3.6-35b-fast':   { provider: 'Alibaba Cloud (Qwen)', prompt: 0.29, cache: 0.07, completion: 1.15 },
    'deepseek-v4-flash':  { provider: 'DeepSeek', prompt: 0.14, cache: 0.0028, completion: 0.28 }
};

// Additional third-party hosting providers for DeepSeek V4 Flash.
// Fixed $/Mtok rates; applied to any model whose name fuzzy-matches
// 'deepseek-v4-flash'. Used when the user selects these from the
// "Token Compare Rate" dropdown.
const THIRD_PARTY_PROVIDER_RATES = {
    'deepinfra': {
        label: 'DeepInfra',
        match: 'deepseek-v4-flash',
        prompt: 0.09, cache: 0.018, completion: 0.18
    },
    'novita': {
        label: 'Novita AI',
        match: 'deepseek-v4-flash',
        prompt: 0.14, cache: 0.028, completion: 0.28
    }
};

// Live Neuralwatt portal energy consumption telemetry (mWh / req & % of reqs by prompt size band)
// Pulled live from portal.neuralwatt.com/energy-pricing ("Average energy per request, by model and request size")
let NEURALWATT_ENERGY_BENCHMARKS = [];
let liveEnergyPricingLoaded = false;
let liveEnergyPricingFetching = false;
let liveEnergyPricingError = null;

// Dynamic OpenRouter models list
let openRouterModels = [];

// Calculated outputs
let calculatedTotals = {};
let calculatedTimeline = [];
let calculatedTimelineSorted = [];
let calculatedLogRows = []; // per-model (ungrouped) costed rows for the logs table / CSV
let perModelTimeline = []; // per-model (ungrouped) costed rows for chart toggle
let breakdownByModel = false; // "Breakdown by Model" chart toggle state

// CHART INSTANCES
let costSavingsChart = null;
let cachePerformanceChart = null;
let costEfficiencyChart = null;

// THEME TOGGLER
// Phase 3.2: an explicit toggle choice sets localStorage 'theme'; afterwards
// OS prefers-color-scheme changes are ignored (initTheme's matchMedia
// listener is detached here via stopFollowingSystemTheme()).
let themeMediaQuery = null;
let themeMediaListener = null;

themeToggleBtn.addEventListener('click', () => {
    if (bodyEl.classList.contains('dark-mode')) {
        bodyEl.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    } else {
        bodyEl.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    }
    stopFollowingSystemTheme();
    if (rawData) {
        renderCharts();
        renderEnergyInsights();
    }
});

// INITIALIZE THEME ON LOAD
// Phase 3.2: on first visit (no saved preference) follow the OS
// prefers-color-scheme setting and keep listening for OS changes until
// the user explicitly picks a theme via the toggle (which sets
// localStorage 'theme', after which OS changes are ignored).
function applyTheme(theme) {
    if (theme === 'light') {
        bodyEl.classList.remove('dark-mode');
    } else {
        bodyEl.classList.add('dark-mode');
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
        applyTheme(savedTheme);
        return;
    }
    // No explicit preference yet — follow the OS.
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
    if (window.matchMedia) {
        themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        themeMediaListener = (e) => {
            // Only react to OS changes while the user hasn't set a preference.
            if (!localStorage.getItem('theme')) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        };
        if (themeMediaQuery.addEventListener) {
            themeMediaQuery.addEventListener('change', themeMediaListener);
        } else if (themeMediaQuery.addListener) {
            themeMediaQuery.addListener(themeMediaListener);
        }
    }
}

// Detach the OS-theme listener once the user picks an explicit theme.
// Idempotent; safe when matchMedia is unavailable or no listener exists.
function stopFollowingSystemTheme() {
    if (themeMediaQuery && themeMediaListener) {
        if (themeMediaQuery.removeEventListener) {
            themeMediaQuery.removeEventListener('change', themeMediaListener);
        } else if (themeMediaQuery.removeListener) {
            themeMediaQuery.removeListener(themeMediaListener);
        }
        themeMediaQuery = null;
        themeMediaListener = null;
    }
}
initTheme();

// Sync the visible control inputs to the current JS state variables. Used
// after a session restore so the DOM reflects the persisted filter state.
function syncControlsFromState() {
    if (modelFilterSelect) modelFilterSelect.value = selectedModel || '';
    if (startDateFilterInput) startDateFilterInput.value = filterStartDate || '';
    if (endDateFilterInput) endDateFilterInput.value = filterEndDate || '';
    if (costCalcModeSelect) {
        costCalcModeSelect.value = costCalcMode || 'flat-10';
        customRateContainer.style.display = (costCalcMode === 'custom') ? 'flex' : 'none';
    }
    if (customRateInput) customRateInput.value = customKwhRate;
    if (thirdPartyProviderSelect) {
        thirdPartyProviderSelect.value = thirdPartyCompareRate || 'auto-match';
        const ctp = document.getElementById('custom-third-party-container');
        if (ctp) ctp.style.display = (thirdPartyCompareRate === 'custom-rates') ? 'flex' : 'none';
    }
    if (document.getElementById('custom-tp-input')) document.getElementById('custom-tp-input').value = customTpInputRate;
    if (document.getElementById('custom-tp-cache')) document.getElementById('custom-tp-cache').value = customTpCacheRate;
    if (document.getElementById('custom-tp-output')) document.getElementById('custom-tp-output').value = customTpOutputRate;
}

// Restore a persisted session (if any) before first render.
(function initApp() {
    if (restoreSession()) {
        // Rebuild options/inputs to reflect the restored models + filter state.
        populateModelOptions();
        syncControlsFromState();
        compileMergedData();
        updateCalculationsAndRender();
    }
})();

// BOOKMARKLET GENERATOR LOGIC
function buildBookmarkletScript(timeUnit, timeVal, timezone) {
    const unit = timeUnit === 'hours' ? 'hours' : 'days';
    let val = parseInt(timeVal, 10) || (unit === 'hours' ? 72 : 30);
    if (unit === 'hours' && val > 72) val = 72;
    const tz = (timezone || 'America/New_York').trim();

    // NOTE: The generated script below runs on portal.neuralwatt.com, a
    // foreign origin where this app's index.css is NOT loaded. The inline
    // hex colors (#1a1d24, #fff, #d55934, #ff6b6b) below are therefore a
    // justified exemption from the "no hardcoded hex in JS-rendered HTML"
    // rule (AC.5): our CSS variables (--accent-terracotta, etc.) are
    // undefined on that page, so var() references would render blank.
    // This mirrors the Chart.js config exemption — concrete colors are
    // required where var(--…) cannot resolve. Do not "fix" by replacing
    // these with var() references.
    // Same foreign-origin exemption applies to the banner messages below:
    // msg (including model names read from the foreign page) is interpolated
    // into banner.innerHTML UNESCAPED deliberately, because escapeHtml is not
    // available inside the generated script. Downloads use
    // encodeURIComponent'd model ids.
    const script = `(async function(){
        const unit="${unit}";
        const val="${val}";
        const tz="${tz}";
        const targetUrl="https://portal.neuralwatt.com/dashboard/usage?"+unit+"="+encodeURIComponent(val)+"&tz="+encodeURIComponent(tz);
        const href=window.location.href;
        const hasParams=href.includes(unit+"="+val) && href.includes("tz=");
        const isOnUsage=href.includes("portal.neuralwatt.com/dashboard/usage");

        if(!isOnUsage){
            alert("⚡ Step 1 of 2: Opening Neuralwatt Usage Page in a new tab...\\n\\nOnce loaded, click this bookmarklet one more time to start downloading!");
            window.open(targetUrl,"_blank");
            return;
        }

        if(!hasParams){
            alert("⚡ Step 1 of 2: Reloading Neuralwatt Usage Page with your selected parameters ("+val+" "+unit+", "+tz+")...\\n\\nClick this bookmarklet one more time once reloaded to download!");
            window.location.href=targetUrl;
            return;
        }

        let banner=document.getElementById("nw-exporter-banner");
        if(!banner){
            banner=document.createElement("div");
            banner.id="nw-exporter-banner";
            banner.style.cssText="position:fixed;top:20px;right:20px;z-index:999999;background:#1a1d24;color:#fff;border:2px solid #d55934;padding:16px 20px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:sans-serif;font-size:14px;max-width:380px;line-height:1.4;";
            document.body.appendChild(banner);
        }
        const update=(msg,err=false)=>{
            banner.innerHTML=\`<div style="display:flex;align-items:center;gap:8px;font-weight:bold;color:\${err?'#ff6b6b':'#d55934'};margin-bottom:6px;">⚡ Neuralwatt Batch Exporter</div><div>\${msg}</div>\`;
        };

        update("Step 2/2: Reading active model options from loaded page...");
        await new Promise(r=>setTimeout(r,600));

        let models=[];
        const sel=document.querySelector('select[x-model="selectedModel"]') || document.querySelector('select');
        if(sel){
            Array.from(sel.options).forEach(opt=>{
                const v=(opt.value||"").trim();
                if(v && v!=="all" && v!=="All Models"){
                    models.push(v);
                }
            });
        }

        if(!models.length){
            document.querySelectorAll("select option").forEach(opt=>{
                const v=(opt.value||"").trim();
                if(v && v!=="all" && v!=="All Models"){
                    models.push(v);
                }
            });
        }

        if(!models.length){
            models=["glm-5.2","glm-5.2-short","glm-5.2-short-fast","glm-5.2-short-flex","kimi-k2.7-code","kimi-k2.7-code-flex","qwen3.5-397b","qwen3.6-35b","gemma-4-31b"];
        }

        models=Array.from(new Set(models));

        update(\`Step 2/2: Found \${models.length} active model(s). Exporting...\`);
        let done=0;
        for(let i=0;i<models.length;i++){
            const m=models[i];
            update(\`Exporting (\${i+1}/\${models.length}): <strong>\${m}</strong>...\`);
            const url=\`https://portal.neuralwatt.com/dashboard/api/usage/export?\${unit}=\${encodeURIComponent(val)}&tz=\${encodeURIComponent(tz)}&format=json&model=\${encodeURIComponent(m)}\`;
            try{
                const r=await fetch(url,{credentials:"include"});
                if(r.ok){
                    const blob=await r.blob();
                    const a=document.createElement("a");
                    a.href=URL.createObjectURL(blob);
                    a.download=\`neuralwatt-export-\${m}-\${val}\${unit.charAt(0)}.json\`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(a.href);
                    done++;
                }
            }catch(err){console.error(\`Failed \${m}\`,err);}
            await new Promise(res=>setTimeout(res,400));
        }
        update(\`✅ Done! Exported \${done}/\${models.length} Neuralwatt JSON file(s). Drop them into Neuralwatt Insights!\`);
        setTimeout(()=>{if(banner)banner.remove();},8000);
    })();`;

    return 'javascript:' + encodeURIComponent(script.replace(/\s+/g, ' ').trim());
}

function detectUserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    } catch (e) {
        return 'America/New_York';
    }
}

function initBookmarkletGenerator() {
    const timeUnitSelect = document.getElementById('bm-time-unit');
    const timeValInput = document.getElementById('bm-time-val');
    const timeValLabel = document.getElementById('bm-time-val-label');
    const timezoneInput = document.getElementById('bm-timezone');
    const bookmarkletLink = document.getElementById('bookmarklet-link');
    const copyBtn = document.getElementById('copy-bookmarklet-btn');
    const copyText = document.getElementById('copy-bookmarklet-text');

    if (!timeUnitSelect || !bookmarkletLink) return;

    if (timezoneInput && !timezoneInput.value) {
        timezoneInput.value = detectUserTimezone();
    }

    function updateBookmarklet() {
        const unit = timeUnitSelect.value;
        let val = parseInt(timeValInput.value, 10);
        if (isNaN(val) || val < 1) val = unit === 'hours' ? 72 : 30;

        if (unit === 'hours') {
            if (val > 72) {
                val = 72;
                if (timeValInput) timeValInput.value = '72';
            }
            if (timeValInput) timeValInput.setAttribute('max', '72');
            if (timeValLabel) timeValLabel.textContent = 'Duration (Hours)';
        } else {
            if (timeValInput) timeValInput.setAttribute('max', '365');
            if (timeValLabel) timeValLabel.textContent = 'Duration (Days)';
        }

        const tz = timezoneInput ? (timezoneInput.value || 'America/New_York') : 'America/New_York';
        const spanSuffix = unit === 'hours' ? `${val}h` : `${val}d`;
        bookmarkletLink.textContent = `⚡ Batch Export Neuralwatt Data (${spanSuffix})`;

        const code = buildBookmarkletScript(unit, val, tz);
        bookmarkletLink.setAttribute('href', code);
    }

    timeUnitSelect.addEventListener('change', () => {
        if (timeUnitSelect.value === 'hours' && timeValInput.value === '30') {
            timeValInput.value = '72';
        } else if (timeUnitSelect.value === 'days' && timeValInput.value === '72') {
            timeValInput.value = '30';
        }
        updateBookmarklet();
    });

    if (timeValInput) timeValInput.addEventListener('input', updateBookmarklet);
    if (timezoneInput) timezoneInput.addEventListener('input', updateBookmarklet);

    if (copyBtn && copyText) {
        copyBtn.addEventListener('click', () => {
            const code = bookmarkletLink.getAttribute('href');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(code).then(() => {
                    copyText.textContent = 'Copied!';
                    setTimeout(() => {
                        copyText.textContent = 'Copy Code';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy bookmarklet', err);
                });
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = code;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                copyText.textContent = 'Copied!';
                setTimeout(() => {
                    copyText.textContent = 'Copy Code';
                }, 2000);
            }
        });
    }

    updateBookmarklet();
}

initBookmarkletGenerator();

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

    // Re-sync the dropdown selection now that live options exist. On a fresh
    // load with a restored session, syncControlsFromState() ran before the
    // OpenRouter fetch finished, so an OpenRouter-model rate was stored in
    // state but could not be selected in the DOM — the visible dropdown and
    // the actual calculation would diverge. A stale ID (model no longer
    // listed) falls back to auto-match rather than silently keeping a rate
    // that can no longer resolve.
    if (thirdPartyCompareRate && thirdPartyCompareRate !== 'auto-match') {
        const optionExists = Array.from(thirdPartyProviderSelect.options).some(o => o.value === thirdPartyCompareRate);
        if (optionExists) {
            thirdPartyProviderSelect.value = thirdPartyCompareRate;
        } else {
            thirdPartyCompareRate = 'auto-match';
            thirdPartyProviderSelect.value = 'auto-match';
            if (rawData) updateCalculationsAndRender();
        }
    }
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
        mainFileInput.value = '';
    }
});

miniFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFilesSelection(e.target.files);
        miniFileInput.value = '';
    }
});

// CONTROLS INTERACTIVE HANDLERS
modelFilterSelect.addEventListener('change', (e) => {
    selectedModel = e.target.value;
    updateCalculationsAndRender();
    if (srAnnouncer) {
        srAnnouncer.textContent = selectedModel
            ? `Filter applied: model ${selectedModel} selected.`
            : 'Filter applied: showing all models.';
    }
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
    if (srAnnouncer) {
        srAnnouncer.textContent = `Filter applied: start date ${filterStartDate || 'unset'}.`;
    }
});

endDateFilterInput.addEventListener('change', (e) => {
    filterEndDate = e.target.value;
    // Manual date change reverts the Quick Range control to "Custom".
    const qr = document.getElementById('quick-range-select');
    if (qr) qr.value = 'custom';
    updateCalculationsAndRender();
    if (srAnnouncer) {
        srAnnouncer.textContent = `Filter applied: end date ${filterEndDate || 'unset'}.`;
    }
});

// QUICK RANGE PRESETS — relative to the latest date in the data.
// "periods" (not days) because data may be hourly granularity.
const quickRangeSelect = document.getElementById('quick-range-select');
if (quickRangeSelect) {
    quickRangeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') return; // manual control

        const dates = (rawData && rawData.daily ? rawData.daily.map(d => d.date) : []);
        if (dates.length === 0) return;
        // Distinct sorted ascending dates.
        const uniqueDates = Array.from(new Set(dates)).sort();
        const latest = uniqueDates[uniqueDates.length - 1];
        const earliest = uniqueDates[0];

        if (val === 'full') {
            filterStartDate = earliest;
            filterEndDate = latest;
        } else {
            const n = parseInt(val, 10);
            const startIdx = Math.max(0, uniqueDates.length - n);
            filterStartDate = uniqueDates[startIdx];
            filterEndDate = latest;
        }

        if (startDateFilterInput) startDateFilterInput.value = filterStartDate;
        if (endDateFilterInput) endDateFilterInput.value = filterEndDate;
        updateCalculationsAndRender();
        if (srAnnouncer) {
            const label = val === 'full'
                ? 'Full range'
                : `Last ${val} periods`;
            srAnnouncer.textContent = `Filter applied: quick range ${label}.`;
        }
    });
}

// CLEAR SESSION — purge persisted session + reset to empty state.
const clearSessionBtn = document.getElementById('clear-session-btn');
if (clearSessionBtn) {
    clearSessionBtn.addEventListener('click', () => {
        clearSession();
        loadedFiles = [];
        rawData = null;
        selectedModel = '';
        filterStartDate = '';
        filterEndDate = '';
        costCalcMode = 'flat-10';
        thirdPartyCompareRate = 'auto-match';
        breakdownByModel = false;
        selectedComparisonModels.clear();
        if (costSavingsChart) { costSavingsChart.destroy(); costSavingsChart = null; }
        if (cachePerformanceChart) { cachePerformanceChart.destroy(); cachePerformanceChart = null; }
        if (costEfficiencyChart) { costEfficiencyChart.destroy(); costEfficiencyChart = null; }
        if (energyInsightsChart) { energyInsightsChart.destroy(); energyInsightsChart = null; }
        updateCalculationsAndRender();
        if (srAnnouncer) srAnnouncer.textContent = 'Data cleared.';
    });
}

// ENERGY INSIGHTS CONTROLS LISTENERS

const btnRefreshEnergy = document.getElementById('btn-refresh-energy');
if (btnRefreshEnergy) {
    btnRefreshEnergy.addEventListener('click', () => {
        fetchLiveEnergyPricing();
    });
}

const btnFetchTop = document.getElementById('btn-fetch-live-energy-top');
if (btnFetchTop) {
    btnFetchTop.addEventListener('click', () => {
        fetchLiveEnergyPricing();
    });
}

if (energyBenchmarkTableHeaders) {
    const handleEnergyTableSort = (th) => {
        const column = th.getAttribute('data-sort');
        energyBenchmarkTableHeaders.forEach(header => {
            if (header !== th) {
                header.classList.remove('sorted-asc', 'sorted-desc');
                const indicator = header.querySelector('.sort-indicator');
                if (indicator) indicator.textContent = '';
            }
        });

        if (energyTableSortColumn === column) {
            energyTableSortDirection = energyTableSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            energyTableSortColumn = column;
            energyTableSortDirection = 'asc';
        }

        th.classList.remove('sorted-asc', 'sorted-desc');
        th.classList.add(energyTableSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        const indicator = th.querySelector('.sort-indicator');
        if (indicator) indicator.textContent = energyTableSortDirection === 'asc' ? ' ↑' : ' ↓';

        updateSortAria(th, energyBenchmarkTableHeaders, energyTableSortDirection);
        renderEnergyInsights();
    };
    energyBenchmarkTableHeaders.forEach(th => {
        makeSortableHeader(th, () => handleEnergyTableSort(th));
    });
}


// MULTI-FILE UPLOADER HANDLER (ENFORCES SINGLE-MODEL FILES)
function handleFilesSelection(filesList) {
    const files = Array.from(filesList);
    let errors = [];
    
    let promises = files.map(file => {
        return new Promise((resolve) => {
            if (!file.name.toLowerCase().endsWith('.json')) {
                errors.push(`${file.name}: Only JSON format is supported.`);
                return resolve();
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    // Handle empty files (0 bytes) with a specific message.
                    if (file.size === 0) {
                        errors.push(`${file.name}: Empty file (0 bytes). Nothing to import.`);
                        return resolve();
                    }
                    const data = JSON.parse(e.target.result);
                    const v = validateUsageData(data);
                    if (v.valid) {
                        if (!data.by_model || data.by_model.length !== 1) {
                            errors.push(`${file.name}: Must contain data for exactly ONE model. Found ${data.by_model ? data.by_model.length : 0}. Please export single-model files from the portal.`);
                            return resolve();
                        }

                        const modelName = data.by_model[0].model;

                        // Overwrite if same model is re-uploaded (by modelName)
                        loadedFiles = loadedFiles.filter(f => f.modelName !== modelName);
                        // Also dedup by fileName: re-importing a renamed copy
                        // of the same export should overwrite, not duplicate.
                        loadedFiles = loadedFiles.filter(f => f.fileName !== file.name);

                        // Normalize daily/hourly rows
                        if (!data.daily && data.hourly) {
                            data.daily = data.hourly;
                        }

                        loadedFiles.push({
                            fileName: file.name,
                            modelName: modelName,
                            data: data
                        });
                    } else {
                        errors.push(`${file.name}: ${v.errors.join(' ')}`);
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
            // Wrap the post-merge phase so a runtime error in aggregation or
            // rendering — e.g. from data that passes the validator but breaks
            // a calculation — surfaces in the error banner instead of failing
            // silently inside the promise handler.
            try {
                compileMergedData();

                if (!liveEnergyPricingLoaded && !liveEnergyPricingFetching) {
                    fetchLiveEnergyPricing();
                }

                updateCalculationsAndRender();

                // Announce import success for screen readers.
                if (srAnnouncer) {
                    const totalReqs = calculatedTotals.requests || 0;
                    srAnnouncer.textContent = `Data loaded: ${loadedFiles.length} model${loadedFiles.length > 1 ? 's' : ''}, ${formatNumber(totalReqs)} requests`;
                }
            } catch (mergeErr) {
                console.error('Post-merge error:', mergeErr);
                showImportErrors([`Error processing imported data: ${escapeHtml(mergeErr && mergeErr.message ? mergeErr.message : String(mergeErr))}`]);
            }
        }
    });
}

// MULTI-MODEL MERGING ENGINE
function compileMergedData() {
    if (loadedFiles.length === 0) {
        rawData = null;
        return;
    }
    // Guard against partial state: drop entries with null/missing data.
    const validFiles = loadedFiles.filter(f => f && f.data);
    if (validFiles.length === 0) {
        rawData = null;
        return;
    }
    let minStart = null;
    let maxEnd = null;
    validFiles.forEach(f => {
        if (f.data && f.data.period) {
            if (f.data.period.start) {
                const start = new Date(f.data.period.start);
                if (!isNaN(start.getTime()) && (!minStart || start < minStart)) minStart = start;
            }
            if (f.data.period.end) {
                const end = new Date(f.data.period.end);
                if (!isNaN(end.getTime()) && (!maxEnd || end > maxEnd)) maxEnd = end;
            }
        }
    });
    
    const firstData = (validFiles[0] && validFiles[0].data) || {};
    rawData = {
        period: {
            start: (minStart && !isNaN(minStart.getTime())) ? minStart.toISOString() : new Date().toISOString(),
            end: (maxEnd && !isNaN(maxEnd.getTime())) ? maxEnd.toISOString() : new Date().toISOString()
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
        accounting_method: firstData.accounting_method || 'energy',
        // Derive granularity from the actual row shape when the export omits
        // the field, so an hourly-only export is not mislabeled "Daily".
        granularity: firstData.granularity ||
            ((Array.isArray(firstData.hourly) && firstData.hourly.length > 0) ? 'hourly' : 'daily')
    };
    
    const uniqueKeysMap = new Map();
    
    validFiles.forEach(f => {
        const fd = f.data || {};
        const totals = fd.totals || {};

        // clampFinite guards against null/NaN/Infinity that `|| 0` misses
        // (e.g. cached_tokens may be null in some exports). All counts are
        // non-negative.
        const T = rawData.totals;
        T.requests += clampFinite(totals.requests, 0, true);
        T.tokens += clampFinite(totals.tokens, 0, true);
        T.prompt_tokens += clampFinite(totals.prompt_tokens, 0, true);
        T.completion_tokens += clampFinite(totals.completion_tokens, 0, true);
        T.cached_tokens += clampFinite(totals.cached_tokens, 0, true);
        T.cost += clampFinite(totals.cost, 0, true);
        T.token_cost += clampFinite(totals.token_cost, 0, true);
        T.energy_kwh += clampFinite(totals.energy_kwh, 0, true);
        T.charged_energy_kwh += clampFinite(totals.charged_energy_kwh, 0, true);
        T.energy_joules += clampFinite(totals.energy_joules, 0, true);
        T.requests_with_energy += clampFinite(totals.requests_with_energy, 0, true);
        T.carbon_g += clampFinite(totals.carbon_g, 0, true);
        T.requests_with_carbon += clampFinite(totals.requests_with_carbon, 0, true);
        T.self_hosted_cost += clampFinite(totals.self_hosted_cost, 0, true);
        T.third_party_cost += clampFinite(totals.third_party_cost, 0, true);
        T.third_party_requests += clampFinite(totals.third_party_requests, 0, true);
        
        if (Array.isArray(fd.by_model) && fd.by_model.length > 0) {
            fd.by_model.forEach(m => {
                const modelInfo = { ...m };
                modelInfo.prompt_tokens = modelInfo.prompt_tokens || totals.prompt_tokens || 0;
                modelInfo.completion_tokens = modelInfo.completion_tokens || totals.completion_tokens || 0;
                rawData.by_model.push(modelInfo);
                if (!rawData.available_models.includes(m.model)) {
                    rawData.available_models.push(m.model);
                }
            });
        } else {
            const modelName = f.modelName || 'Unknown Model';
            rawData.by_model.push({
                model: modelName,
                requests: totals.requests || 0,
                tokens: totals.tokens || 0,
                prompt_tokens: totals.prompt_tokens || 0,
                completion_tokens: totals.completion_tokens || 0,
                cost: totals.cost || 0
            });
            if (!rawData.available_models.includes(modelName)) {
                rawData.available_models.push(modelName);
            }
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
        // Hourly exports may omit the `daily` key entirely, and restored
        // sessions bypass the handleFilesSelection daily=hourly
        // normalization — consume whichever row array the export carries.
        // An empty-but-present `daily: []` must not shadow a non-empty
        // `hourly` array (empty arrays are truthy).
        const rowArray = (Array.isArray(fd.daily) && fd.daily.length > 0) ? fd.daily
            : ((Array.isArray(fd.hourly) && fd.hourly.length > 0) ? fd.hourly : []);
        rowArray.forEach(d => {
            rawData.daily.push({
                ...d,
                model: modelName
            });
        });
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
    const chartCostTitle = document.getElementById('chart-cost-title');
    if (chartCostTitle) chartCostTitle.textContent = `Cost & Est. Savings Progression (${label})`;
    const chartEfficiencyTitle = document.getElementById('chart-efficiency-title');
    if (chartEfficiencyTitle) chartEfficiencyTitle.textContent = `Cost per Million Tokens vs. Cost per Request (${label})`;
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
            <span><strong>${escapeHtml(f.modelName)}</strong> <span style="font-size:0.65rem; color:var(--text-secondary);">(${escapeHtml(f.fileName)})</span></span>
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
                updateCalculationsAndRender();
            } else {
                compileMergedData();
                updateCalculationsAndRender();
            }
        });
    });
}

// SCHEMA VALIDATOR
// Optionally clamp counts (requests/tokens) to non-negative values. Pass
// `false` for fields that may legitimately be signed (e.g. cost deltas).
function clampFinite(value, fallback, nonNegative) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    if (nonNegative && value < 0) return fallback;
    return value;
}

// Structural / field-level validation for a Neuralwatt usage export.
// Returns { valid: boolean, errors: string[] }. The single-model invariant
// (by_model must be absent OR contain exactly ONE entry) is intentionally
// NOT enforced here — that gate lives in handleFilesSelection so a clear,
// user-facing "exactly ONE model" message is shown. validateUsageData
// focuses on shape: object type, totals types, non-empty array fields,
// and per-entry model/date field presence.
function validateUsageData(data) {
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

    // Require at least one non-empty timeseries array the merge engine can
    // actually consume (daily / hourly / by_model). 'rows' and 'usage' are
    // known export shapes the engine does not read — a file relying on them
    // must fail loudly here instead of importing with an empty timeline.
    const arrayFields = ['daily', 'hourly', 'by_model'];
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

    // Unsupported timeseries shapes: only reject when the export relies on
    // them (i.e. no usable daily/hourly rows), so a redundant extra field on
    // an otherwise valid export does not fail the import.
    const hasUsableRows = (Array.isArray(data.daily) && data.daily.length > 0) ||
        (Array.isArray(data.hourly) && data.hourly.length > 0);
    ['rows', 'usage'].forEach(f => {
        if (data[f] === undefined || hasUsableRows) return;
        if (!Array.isArray(data[f])) {
            errors.push(`Field "${f}" must be an array.`);
        } else if (data[f].length === 0) {
            errors.push(`Field "${f}" is an empty array; no timeseries data present.`);
        } else {
            errors.push(`Field "${f}" is not supported by this tool — expected "daily" or "hourly" rows.`);
        }
    });

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
        errors.push('No timeseries data found (daily, hourly, or by_model).');
    }

    return { valid: errors.length === 0, errors };
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

// DYNAMICALLY FETCH LIVE NEURALWATT POSTED PRICING (WITH BUILT-IN FALLBACK)
async function fetchNeuralwattPricing() {
    try {
        const response = await fetch('https://api.neuralwatt.com/v1/models');
        if (!response.ok) throw new Error('API response was not OK');
        const data = await response.json();
        if (data && Array.isArray(data.data)) {
            data.data.forEach(item => {
                if (item.id && item.metadata && item.metadata.pricing) {
                    const p = item.metadata.pricing;
                    const prompt = parseFloat(p.input_per_million) || 0;
                    const completion = parseFloat(p.output_per_million) || 0;
                    // Fallback when the API omits the cache field: Neuralwatt's
                    // cache price is 10% of the prompt price (updated 2026-08);
                    // DeepSeek V4 Flash is the exception at 20% (0.028 / 0.14).
                    let cache = prompt * 0.10;
                    if (item.id && item.id.toLowerCase().includes('deepseek-v4-flash')) {
                        cache = prompt * 0.20;
                    }
                    if (p.cached_input_per_million !== undefined && p.cached_input_per_million !== null) {
                        cache = parseFloat(p.cached_input_per_million) || 0;
                    }
                    NEURALWATT_MODEL_PRICING[item.id.toLowerCase()] = {
                        prompt,
                        cache,
                        completion
                    };
                }
            });
            // Live pricing fetched OK — hide the fallback badge.
            const pricingStatus = document.getElementById('neuralwatt-pricing-status');
            if (pricingStatus) pricingStatus.style.display = 'none';
            if (rawData) {
                updateCalculationsAndRender();
            }
        }
    } catch (err) {
        console.log('Neuralwatt live API pricing fetch skipped/offline, using built-in posted registry:', err);
        // Phase 3.5 — surface the fallback to built-in rate tables so the
        // failure is not silent. Non-blocking badge with a tooltip.
        const pricingStatus = document.getElementById('neuralwatt-pricing-status');
        if (pricingStatus) pricingStatus.style.display = 'inline-flex';
    }
}

// Phase 3.6 — load external pricing tables (data/*.json) at init, keeping the
// built-in copies as fallback defaults. If the fetch fails (file:// CORS,
// offline, 404) the built-in tables remain unchanged — no behavior change.
async function loadExternalPricingTables() {
    const tryFetch = async (url) => {
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) return null;
            const payload = await res.json();
            return (payload && typeof payload === 'object' && payload.pricing) ? payload.pricing : null;
        } catch (err) {
            return null;
        }
    };

    const neuralwatt = await tryFetch('data/neuralwatt-pricing.json');
    if (neuralwatt && typeof neuralwatt === 'object') {
        NEURALWATT_MODEL_PRICING = { ...NEURALWATT_MODEL_PRICING, ...neuralwatt };
    }

    const provider = await tryFetch('data/provider-pricing.json');
    if (provider && typeof provider === 'object') {
        PROVIDER_MODEL_PRICING = { ...PROVIDER_MODEL_PRICING, ...provider };
    }

    // New external entries may enable new fuzzy matches — recompute if data is loaded.
    if (rawData) {
        updateCalculationsAndRender();
    }
}

// FUZZY MATCH MODEL TO NEURALWATT POSTED PRICING REGISTRY
function findNeuralwattPricing(modelName) {
    if (!modelName) return null;
    const clean = modelName.toLowerCase().trim();
    if (NEURALWATT_MODEL_PRICING[clean]) return NEURALWATT_MODEL_PRICING[clean];
    for (const key in NEURALWATT_MODEL_PRICING) {
        if (clean === key || clean.startsWith(key) || key.startsWith(clean)) {
            return NEURALWATT_MODEL_PRICING[key];
        }
    }
    return null;
}

// FUZZY MATCH MODEL TO OFFICIAL MODEL PROVIDER PRICING REGISTRY
function findProviderPricing(modelName) {
    if (!modelName) return null;
    const clean = modelName.toLowerCase().trim();
    if (PROVIDER_MODEL_PRICING[clean]) return PROVIDER_MODEL_PRICING[clean];
    for (const key in PROVIDER_MODEL_PRICING) {
        if (clean === key || clean.startsWith(key) || key.startsWith(clean)) {
            return PROVIDER_MODEL_PRICING[key];
        }
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
    const baseKey = costCalcMode.replace(/-yr$/, '');
    const base = ENERGY_PLAN_RATES[baseKey];
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

// Estimate the prompt/completion split of a token slice by applying the
// period's aggregate completion ratio (the exports only carry the split at
// the totals level; day-level splits are estimated per the methodology note).
// Shared by the timeline costing, cache-rate renderers, and energy insights.
function estimateTokenSplit(tokens, promptTokensTotal, completionTokensTotal) {
    let promptTokens = tokens;
    let completionTokens = 0;
    if (tokens > 0 && promptTokensTotal > 0) {
        const ratio = completionTokensTotal / (promptTokensTotal + completionTokensTotal);
        completionTokens = tokens * ratio;
        promptTokens = tokens - completionTokens;
    }
    return { promptTokens, completionTokens };
}

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
    const split = estimateTokenSplit(tokens, promptTokensTotal, completionTokensTotal);
    let promptTokens = split.promptTokens;
    let completionTokens = split.completionTokens;
    const uncachedPrompt = Math.max(0, promptTokens - cachedTokens);

    // 3. Compute Token Comparison Cost
    let compareCost = originalTokenCost;
    let activeRateModelId = thirdPartyCompareRate;

    if (thirdPartyCompareRate === 'auto-match' || thirdPartyCompareRate === 'auto-match-openrouter') {
        const match = findOpenRouterMatch(modelName);
        if (match) {
            activeRateModelId = match.id;
        } else {
            activeRateModelId = 'json-token-cost';
        }
    } else if (thirdPartyCompareRate === 'auto-match-neuralwatt') {
        activeRateModelId = 'neuralwatt-pricing';
    } else if (thirdPartyCompareRate === 'auto-match-provider') {
        activeRateModelId = 'provider-pricing';
    } else if (THIRD_PARTY_PROVIDER_RATES[thirdPartyCompareRate]) {
        activeRateModelId = thirdPartyCompareRate;
    }

    if (activeRateModelId === 'custom-rates') {
        const promptPrice = customTpInputRate / TOKENS_PER_MILLION;
        const promptCachedPrice = customTpCacheRate / TOKENS_PER_MILLION;
        const completionPrice = customTpOutputRate / TOKENS_PER_MILLION;
        
        const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
        const completionCost = completionTokens * completionPrice;
        compareCost = promptCost + completionCost;
    } else if (activeRateModelId === 'neuralwatt-pricing') {
        const nwPricing = findNeuralwattPricing(modelName);
        if (nwPricing) {
            const promptPrice = nwPricing.prompt / TOKENS_PER_MILLION;
            const promptCachedPrice = nwPricing.cache / TOKENS_PER_MILLION;
            const completionPrice = nwPricing.completion / TOKENS_PER_MILLION;
            
            const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
            const completionCost = completionTokens * completionPrice;
            compareCost = promptCost + completionCost;
        } else {
            compareCost = originalTokenCost;
        }
    } else if (activeRateModelId === 'provider-pricing') {
        const provPricing = findProviderPricing(modelName);
        if (provPricing) {
            const promptPrice = provPricing.prompt / TOKENS_PER_MILLION;
            const promptCachedPrice = provPricing.cache / TOKENS_PER_MILLION;
            const completionPrice = provPricing.completion / TOKENS_PER_MILLION;
            
            const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
            const completionCost = completionTokens * completionPrice;
            compareCost = promptCost + completionCost;
        } else {
            compareCost = originalTokenCost;
        }
    } else if (activeRateModelId === 'json-token-cost') {
        // No heuristics: return standard token cost directly from the JSON
        compareCost = originalTokenCost;
    } else if (THIRD_PARTY_PROVIDER_RATES[activeRateModelId]) {
        const tpRate = THIRD_PARTY_PROVIDER_RATES[activeRateModelId];
        // Apply only if the model name fuzzy-matches the rate's target model
        if (modelName && modelName.toLowerCase().includes(tpRate.match)) {
            const promptPrice = tpRate.prompt / TOKENS_PER_MILLION;
            const promptCachedPrice = tpRate.cache / TOKENS_PER_MILLION;
            const completionPrice = tpRate.completion / TOKENS_PER_MILLION;

            const promptCost = (uncachedPrompt * promptPrice) + (cachedTokens * promptCachedPrice);
            const completionCost = completionTokens * completionPrice;
            compareCost = promptCost + completionCost;
        } else {
            compareCost = originalTokenCost;
        }
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

    const savings = compareCost - energyCost;
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
    const noJsonCard = document.getElementById('no-json-import-card');
    const jsonLoadedWrapper = document.getElementById('json-loaded-content-wrapper');

    if (!rawData || loadedFiles.length === 0) {
        if (noJsonCard) noJsonCard.style.display = 'block';
        if (jsonLoadedWrapper) jsonLoadedWrapper.style.display = 'none';
        if (miniUploadBtn) miniUploadBtn.style.display = 'none';
        if (periodBadge) {
            periodBadge.style.display = 'inline-flex';
            periodBadge.textContent = 'Live Energy Telemetry View (No JSON Loaded)';
        }
        renderEnergyInsights();
        return;
    }

    if (noJsonCard) noJsonCard.style.display = 'none';
    if (jsonLoadedWrapper) jsonLoadedWrapper.style.display = 'block';
    if (miniUploadBtn) miniUploadBtn.style.display = 'block';
    if (periodBadge) periodBadge.style.display = 'inline-flex';

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
    // With "All Models" selected, always resolve the compare rate per model.
    // Name-matched provider rates (DeepInfra/Novita) and flex discounts only
    // apply when the real model name reaches getCalculatedCosts; aggregating
    // with modelName='' silently falls back to the JSON token cost for every
    // rate mode, so the summary card would ignore the dropdown selection.
    if (!selectedModel) {
        const models = Object.values(modelStats);
        if (models.length > 0) {
            models.forEach(m => {
                // Use each model's own prompt/completion totals so the
                // summary compare cost is estimated with the same per-model
                // ratio as the timeline, breakdown, and comparison. Passing
                // the aggregate totals here made the summary card disagree
                // with the sum of the per-model rows for multi-model imports
                // with differing completion ratios.
                const origModel = rawData.by_model.find(x => x.model === m.model);
                const refPrompt = origModel ? origModel.prompt_tokens : basePromptTokens;
                const refCompletion = origModel ? origModel.completion_tokens : baseCompletionTokens;
                const modelCosts = getCalculatedCosts(
                    m.tokens,
                    m.cached_tokens || 0,
                    refPrompt,
                    refCompletion,
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

    const totalSavings = totalCompareCost - totalsEnergyCost;
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
    // Keep `costedTimeline` (per-model, ungrouped) available so the per-model
    // chart toggle can render one series per model without affecting the
    // aggregate views (cards, breakdown table, logs).
    const costedTimeline = timelineSource.map(d => {
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

        // Stamp the estimated prompt/completion split on the row so the cache
        // hit rate (cached / input tokens) and the cache chart use the same
        // input-token denominator everywhere it is rendered.
        const rowSplit = estimateTokenSplit(item.tokens || 0, refPrompt, refCompletion);
        item.prompt_tokens = rowSplit.promptTokens;
        item.completion_tokens = rowSplit.completionTokens;

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
        costedTimeline.forEach(d => {
            const dateStr = d.date;
            if (!grouped[dateStr]) {
                grouped[dateStr] = {
                    date: dateStr,
                    requests: 0,
                    tokens: 0,
                    prompt_tokens: 0,
                    completion_tokens: 0,
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
            grouped[dateStr].prompt_tokens += d.prompt_tokens || 0;
            grouped[dateStr].completion_tokens += d.completion_tokens || 0;
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
    } else {
        // Single-model filter: the costed rows already reflect just that model.
        calculatedTimeline = costedTimeline;
    }

    // Per-model (ungrouped) timeline for the "Breakdown by Model" chart toggle.
    perModelTimeline = costedTimeline;

    // Granular logs / CSV use the per-model rows rather than the date-grouped
    // aggregate: grouping drops the `model` field, which would leave the Model
    // column blank and make multi-model CSV exports indistinguishable by model.
    calculatedLogRows = costedTimeline;

    // Sort timeline ascending for charts
    calculatedTimelineSorted = [...calculatedTimeline].sort((a, b) => parseDateLocal(a.date) - parseDateLocal(b.date));

    // 3. Render Everything with fresh data
    renderSummaryStats();
    renderCharts();
    renderModelBreakdown();
    renderEnergyInsights();
    renderLogsTable();
    renderComparison();
    syncBreakdownToggle();

    // Persist the loaded session so a page reload restores the dashboard.
    saveSession();
}

// ===========================================================================
// SESSION PERSISTENCE (localStorage)
// Stores parsed export data + filter state under a versioned key so a reload
// restores the dashboard without re-importing. The raw File objects cannot be
// serialized, so we persist `data` + `modelName` + `fileName` and rebuild
// `loadedFiles` on restore. Quota/availability errors are caught and ignored
// (private mode, quota exceeded, storage disabled) — persistence is best-
// effort and must never block the dashboard.
// ===========================================================================
const SESSION_KEY = 'neuralwatt_session_v1';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function saveSession() {
    if (loadedFiles.length === 0) return;
    try {
        const payload = {
            version: 1,
            savedAt: Date.now(),
            files: loadedFiles.map(f => ({
                fileName: f.fileName,
                modelName: f.modelName,
                data: f.data
            })),
            filter: {
                selectedModel,
                filterStartDate,
                filterEndDate,
                costCalcMode,
                customKwhRate,
                thirdPartyCompareRate,
                customTpInputRate,
                customTpCacheRate,
                customTpOutputRate
            }
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (e) {
        // Quota exceeded / storage unavailable — non-fatal.
        console.warn('Could not persist session to localStorage:', e);
    }
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
}

function restoreSession() {
    let raw;
    try {
        raw = localStorage.getItem(SESSION_KEY);
    } catch (e) {
        return false;
    }
    if (!raw) return false;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        // Corrupt data — clear it and start empty.
        clearSession();
        return false;
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.files) || parsed.files.length === 0) {
        clearSession();
        return false;
    }
    // Session age check (avoid restoring very stale data).
    // Missing/non-numeric savedAt is treated as expired (never restore forever).
    if (typeof parsed.savedAt !== 'number' || (Date.now() - parsed.savedAt > SESSION_TTL_MS)) {
        clearSession();
        return false;
    }
    // Rebuild loadedFiles (synthetic filenames for restored entries).
    loadedFiles = [];
    for (const f of parsed.files) {
        if (!f || !f.data || typeof f.data !== 'object') continue;
        const fileName = f.fileName || `restored: ${f.modelName}`;
        // Basic structural re-validation to avoid feeding garbage to the engine.
        const v = validateUsageData(f.data);
        if (!v.valid) {
            console.warn(`Skipping restored file "${fileName}": ${v.errors.join(' ')}`);
            continue;
        }
        loadedFiles.push({ fileName, modelName: f.modelName || (f.data.by_model && f.data.by_model[0] && f.data.by_model[0].model), data: f.data });
    }
    if (loadedFiles.length === 0) {
        clearSession();
        return false;
    }
    // Restore filter state.
    const flt = parsed.filter || {};
    selectedModel = flt.selectedModel !== undefined ? flt.selectedModel : '';
    filterStartDate = flt.filterStartDate !== undefined ? flt.filterStartDate : '';
    filterEndDate = flt.filterEndDate !== undefined ? flt.filterEndDate : '';
    costCalcMode = flt.costCalcMode !== undefined ? flt.costCalcMode : 'flat-10';
    customKwhRate = typeof flt.customKwhRate === 'number' ? flt.customKwhRate : 10.00;
    thirdPartyCompareRate = flt.thirdPartyCompareRate !== undefined ? flt.thirdPartyCompareRate : 'auto-match';
    customTpInputRate = typeof flt.customTpInputRate === 'number' ? flt.customTpInputRate : 1.00;
    customTpCacheRate = typeof flt.customTpCacheRate === 'number' ? flt.customTpCacheRate : 0.50;
    customTpOutputRate = typeof flt.customTpOutputRate === 'number' ? flt.customTpOutputRate : 3.00;
    return true;
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

function formatCurrency(num, decimals = 2) {
    const maxDecimals = (decimals === 2 && Math.abs(num) > 0 && Math.abs(num) < 0.01) ? 4 : decimals;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: maxDecimals }).format(num);
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

// HTML escaping helper. Imported JSON is rendered into the DOM via
// innerHTML in several places (Model Breakdown, Imported Files list,
// Energy Insights, import error banner). Model names and filenames are
// user-controlled: a crafted export with `model: "<img src=x onerror=…>"`
// would otherwise execute arbitrary script. Escape the five significant
// HTML characters before inserting any user-controlled / external string
// into innerHTML. Numbers produced by the format* helpers are already
// safe (they come from Number/Math), but model names, filenames, and error
// messages containing filenames must be escaped.
const ESCAPE_HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => ESCAPE_HTML_MAP[ch]);
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
    if (valRequestsSub) {
        // Only report third-party requests when the export actually reports
        // them; zero/null must not be presented as "100% self-hosted".
        valRequestsSub.textContent = t.third_party_requests > 0
            ? `${formatNumber(t.third_party_requests)} third-party requests`
            : '';
    }

    // Tokens
    valTokens.textContent = formatTokens(t.tokens);
    if (valTokensPrompt) valTokensPrompt.textContent = formatTokens(t.prompt_tokens);
    if (valTokensCached) valTokensCached.textContent = formatTokens(t.cached_tokens);
    if (valTokensCompletion) valTokensCompletion.textContent = formatTokens(t.completion_tokens);
    
    const cacheRate = t.prompt_tokens > 0 ? (t.cached_tokens / t.prompt_tokens * 100) : 0;
    valCachePercent.textContent = cacheRate.toFixed(1) + '%';
    barCacheFill.style.width = cacheRate.toFixed(1) + '%';
    if (valTokensSplit) {
        valTokensSplit.textContent = `${formatTokens(t.prompt_tokens)} prompt / ${formatTokens(t.completion_tokens)} completion (${formatTokens(t.cached_tokens)} cached)`;
    }

    // Costs
    valEnergyCost.textContent = formatCurrency(t.cost);
    const isNegativeSavings = t.savings < 0;
    valSavingsAmount.textContent = `${isNegativeSavings ? 'Est. Over' : 'Est. Saved'} ${formatCurrency(Math.abs(t.savings))}`;
    valSavingsPct.textContent = `${Math.abs(t.savingsPct).toFixed(1)}%`;
    valSavingsAmount.classList.toggle('savings-negative', isNegativeSavings);
    valSavingsPct.classList.toggle('savings-badge-negative', isNegativeSavings);

    // Label the energy-cost base so the headline number is never mistaken
    // for the billed amount: the dashboard simulates cost from the selected
    // $/kWh rate (flat / plan / custom) and only 'json' mode shows the
    // export's own cost figure. Flex models get a 65% energy discount.
    if (valEnergyCostSource) {
        const kwhRate = getEnergyKwhRate();
        const planLabels = {
            'flat-10': 'Flat $10.00/kWh',
            'plan-basic': 'Basic Plan $8.50/kWh',
            'plan-std': 'Standard Plan $8.00/kWh',
            'plan-pro': 'Pro Plan $7.50/kWh',
            'plan-basic-yr': 'Basic Annual ~$7.08/kWh',
            'plan-std-yr': 'Standard Annual ~$6.67/kWh',
            'plan-pro-yr': 'Pro Annual $6.25/kWh'
        };
        let sourceLabel = '';
        if (costCalcMode === 'json') {
            sourceLabel = 'Actual cost from export';
        } else if (costCalcMode === 'custom') {
            sourceLabel = `Simulated @ $${customKwhRate.toFixed(2)}/kWh (custom)`;
        } else if (kwhRate !== null && planLabels[costCalcMode]) {
            sourceLabel = `Simulated @ $${kwhRate.toFixed(2)}/kWh (${planLabels[costCalcMode]})`;
        }
        if (sourceLabel.startsWith('Simulated') && (rawData.available_models || []).some(m => m.toLowerCase().includes('flex'))) {
            sourceLabel += ' · flex models ×0.65';
        }
        valEnergyCostSource.textContent = sourceLabel;
    }
    
    let rateLabel = "Token compare rate";
    if (thirdPartyCompareRate === 'auto-match' || thirdPartyCompareRate === 'auto-match-openrouter') {
        if (selectedModel) {
            const match = findOpenRouterMatch(selectedModel);
            rateLabel = match ? `OpenRouter Auto-Match (${match.name})` : "JSON standard rate";
        } else if (rawData.by_model && rawData.by_model.length === 1) {
            const match = findOpenRouterMatch(rawData.by_model[0].model);
            rateLabel = match ? `OpenRouter Auto-Match (${match.name})` : "JSON standard rate";
        } else {
            rateLabel = "OpenRouter Auto-Match (Multi-Model)";
        }
    } else if (thirdPartyCompareRate === 'auto-match-neuralwatt') {
        rateLabel = "Neuralwatt Official Pricing";
    } else if (thirdPartyCompareRate === 'auto-match-provider') {
        rateLabel = "Official Provider Pricing";
    } else if (THIRD_PARTY_PROVIDER_RATES[thirdPartyCompareRate]) {
        rateLabel = `${THIRD_PARTY_PROVIDER_RATES[thirdPartyCompareRate].label} (DeepSeek V4 Flash)`;
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
    // Guard: Chart.js CDN may be unavailable (offline, blocked). Show a
    // styled placeholder via textContent (never innerHTML) so no script
    // injection risk, and bail out before touching the Chart constructor.
    if (typeof Chart === 'undefined') {
        document.querySelectorAll('.charts-grid .chart-container').forEach(el => {
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.minHeight = '200px';
            const msg = document.createElement('div');
            msg.className = 'chart-unavailable-placeholder';
            msg.textContent = 'Charts unavailable — Chart.js CDN could not be loaded (check network connection).';
            el.innerHTML = '';
            el.appendChild(msg);
        });
        return;
    }

    const isDark = bodyEl.classList.contains('dark-mode');
    // Chart axis/text colors resolved to concrete hexes (Chart.js cannot
    // consume `var(--…)`). Keep in sync with :root / .dark-mode values for
    // the matching --text-primary / --text-secondary variables.
    const textPrimaryColor = isDark ? '#FDFCF7' : '#081A17';   // --text-primary / --text-on-dark
    const textSecondaryColor = isDark ? '#9BAA95' : '#858458'; // --text-secondary
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

    // "Breakdown by Model" toggle: when on and multiple models loaded
    // (and no single-model filter), render one series per model instead of
    // the aggregate line. Uses the per-model (ungrouped) timeline so each
    // model's costs stay split by date.
    const showPerModel = breakdownByModel && !selectedModel &&
        loadedFiles.length > 1 && perModelTimeline.length > 0;

    let costChartDatasets;
    let costChartLabels = dates;

    if (showPerModel) {
        // Distinct models in insertion order.
        const models = [];
        perModelTimeline.forEach(d => {
            const m = d.model || 'unknown';
            if (!models.includes(m)) models.push(m);
        });
        // Build a color per model, cycling the accent palette then extra hues.
        const palettes = [
            chartColors.terracotta, chartColors.green, chartColors.emerald,
            isDark ? '#64b5f6' : '#1976d2', // --accent-blue
            isDark ? '#ffb74d' : '#e65100', // --accent-orange
            '#9575cd', '#4db6ac', '#f06292', '#a1887f', '#7986cb'
        ];
        const colorFor = (i) => palettes[i % palettes.length];

        // Sort each model's rows by date, matching the shared label axis.
        const sortedPm = [...perModelTimeline].sort((a, b) => parseDateLocal(a.date) - parseDateLocal(b.date));
        costChartDatasets = models.map((m, idx) => {
            const byDate = {};
            sortedPm.forEach(d => {
                if ((d.model || 'unknown') !== m) return;
                byDate[d.date] = (byDate[d.date] || 0) + (d.cost || 0);
            });
            const series = costChartLabels.map(dt => byDate[dt] !== undefined ? byDate[dt] : null);
            const color = colorFor(idx);
            return {
                label: m,
                data: series,
                backgroundColor: color,
                borderColor: color,
                borderRadius: 4,
                order: 2
            };
        });
    } else {
        costChartDatasets = [
            {
                label: 'Calculated Cost (USD)',
                data: energyCosts,
                backgroundColor: chartColors.terracotta,
                borderColor: chartColors.terracotta,
                borderRadius: 4,
                order: 2
            },
            {
                label: 'Token Comp. Cost (USD)',
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
        ];
    }

    const ctx1 = document.getElementById('costSavingsChart').getContext('2d');
    costSavingsChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: costChartLabels,
            datasets: costChartDatasets
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
    // Cache hit rate = cached / input (prompt) tokens — the same denominator
    // used by the summary card and model breakdown. The stacked bars show
    // the input-token split (uncached input + cached input); output tokens
    // are not part of the cache story and no longer get folded into the
    // "uncached" bar.
    const cachedTokens = calculatedTimelineSorted.map(d => d.cached_tokens || 0);
    const promptTokens = calculatedTimelineSorted.map(d => d.prompt_tokens || d.tokens || 0);
    const uncachedPromptTokens = promptTokens.map((p, i) => Math.max(0, p - (cachedTokens[i] || 0)));
    const hitRates = promptTokens.map((p, i) => p > 0 ? Math.min(100, (cachedTokens[i] || 0) / p * 100) : 0);

    const ctx2 = document.getElementById('cachePerformanceChart').getContext('2d');
    cachePerformanceChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Uncached Input Tokens',
                    data: uncachedPromptTokens,
                    backgroundColor: chartColors.terracotta,
                    stack: 'Stack 0',
                    order: 2
                },
                {
                    label: 'Cached Input Tokens',
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
        
        // Pass the model's own prompt/completion totals so the compare cost
        // is estimated with the same per-model ratio used for the displayed
        // token split. Previously the aggregate (all-models) totals were
        // passed here, which skewed each model's compare cost and savings
        // whenever completion ratios differed across models.
        const modelCosts = getCalculatedCosts(
            m.tokens,
            m.cached_tokens || 0,
            modelPrompt,
            modelCompletion,
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
        modelPerformanceTbody.innerHTML = '<tr><td colspan="9" data-label="Models" class="text-center py-4 text-secondary">No models listed</td></tr>';
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
        if (thirdPartyCompareRate === 'auto-match' || thirdPartyCompareRate === 'auto-match-openrouter') {
            const match = findOpenRouterMatch(m.model);
            if (match) {
                activeRateModelId = match.id;
            } else {
                activeRateModelId = 'json-token-cost';
            }
        } else if (thirdPartyCompareRate === 'auto-match-neuralwatt') {
            activeRateModelId = 'neuralwatt-pricing';
        } else if (thirdPartyCompareRate === 'auto-match-provider') {
            activeRateModelId = 'provider-pricing';
        } else if (THIRD_PARTY_PROVIDER_RATES[thirdPartyCompareRate]) {
            activeRateModelId = thirdPartyCompareRate;
        }

        let compHeading = 'OpenRouter Match:';
        let compLabel = '';
        let compBreakdown = '';
        const uncachedPrompt = Math.max(0, modelPrompt - (m.cached_tokens || 0));
        const cachedTokens = m.cached_tokens || 0;
        const completionTokens = modelCompletion;

        function formatRatesBreakdown(inRate, cacheRate, outRate) {
            const inFormatted = formatCurrency(inRate);
            const cacheFormatted = formatCurrency(cacheRate).replace('$', '');
            const outFormatted = formatCurrency(outRate).replace('$', '');
            return `In/Cache/Out <strong>${inFormatted}/${cacheFormatted}/${outFormatted}</strong><br>`;
        }

        if (activeRateModelId === 'custom-rates') {
            compHeading = 'Custom Rates:';
            compLabel = 'Custom Rates';
            compBreakdown = formatRatesBreakdown(customTpInputRate, customTpCacheRate, customTpOutputRate);
        } else if (activeRateModelId === 'neuralwatt-pricing') {
            compHeading = 'Neuralwatt Match:';
            const nwP = findNeuralwattPricing(m.model);
            compLabel = 'Neuralwatt Official';
            compBreakdown = nwP ? formatRatesBreakdown(nwP.prompt, nwP.cache, nwP.completion) : '';
        } else if (activeRateModelId === 'provider-pricing') {
            compHeading = 'Official Provider Match:';
            const prP = findProviderPricing(m.model);
            compLabel = prP && prP.provider ? prP.provider : 'Official Provider';
            compBreakdown = prP ? formatRatesBreakdown(prP.prompt, prP.cache, prP.completion) : '';
        } else if (THIRD_PARTY_PROVIDER_RATES[activeRateModelId]) {
            const tpRate = THIRD_PARTY_PROVIDER_RATES[activeRateModelId];
            compHeading = `${tpRate.label}:`;
            compLabel = `${tpRate.label} (DeepSeek V4 Flash)`;
            compBreakdown = formatRatesBreakdown(tpRate.prompt, tpRate.cache, tpRate.completion);
        } else if (activeRateModelId === 'json-token-cost') {
            compHeading = 'JSON Token Rate:';
            compLabel = 'JSON Token Cost';
            compBreakdown = '';
        } else {
            if (thirdPartyCompareRate === 'auto-match' || thirdPartyCompareRate === 'auto-match-openrouter') {
                compHeading = 'OpenRouter Match:';
            } else {
                compHeading = 'Selected Model:';
            }
            const orModel = openRouterModels.find(x => x.id === activeRateModelId);
            if (orModel) {
                compLabel = `<a href="https://openrouter.ai/${escapeHtml(orModel.id)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-terracotta); text-decoration: underline;">${escapeHtml(orModel.name)}</a>`;
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
                compBreakdown = formatRatesBreakdown(promptPriceM, promptCachedPriceM, completionPriceM);
            } else {
                compBreakdown = '';
            }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="Model">
                <div class="model-perf-name">${escapeHtml(m.model)}</div>
                ${m.is_third_party ? `
                <span class="model-perf-badge badge-warning">
                    third party
                </span>` : ''}
            </td>
            <td data-label="Requests">
                <div class="model-perf-details" style="font-weight:600;">
                    ${formatNumber(m.requests)}
                </div>
            </td>
            <td data-label="Tokens">
                <div class="model-perf-details" style="font-weight:600;">
                    ${formatTokens(m.tokens)}
                </div>
            </td>
            <td data-label="Cache Rate">
                <div class="model-perf-details" style="font-weight:600; font-size:0.9rem;">
                    ${cacheRate.toFixed(1)}%
                </div>
            </td>
            <td data-label="Token Breakdown">
                <div class="model-perf-details">
                    Uncached In: <strong>${formatTokens(uncachedPrompt)}</strong><br>
                    Cached In: <strong>${formatTokens(cachedTokens)}</strong><br>
                    Out: <strong>${formatTokens(completionTokens)}</strong>
                </div>
            </td>
            <td data-label="Energy Cost">
                <div class="model-perf-details" style="font-weight:600; font-size:0.9rem;">
                    ${formatCurrency(m.energyCost)}
                </div>
                <div class="model-perf-sub">
                    ${m.energy_kwh.toFixed(3)} kWh
                </div>
            </td>
            <td data-label="Unit Costs">
                <div class="model-perf-details">
                    Cost/Req:<br>
                    • <strong>${formatCurrency(costPerRequest, 4)}</strong> Energy<br>
                    • <strong>${formatCurrency(compareCostPerRequest, 4)}</strong> Token Comp.<br>
                    Cost/Mtok:<br>
                    • <strong>${formatCurrency(costPerMtok, 4)}</strong> Energy<br>
                    • <strong>${formatCurrency(compareCostPerMtok, 4)}</strong> Token Comp.
                </div>
            </td>
            <td data-label="Token Comp. Details">
                <div class="model-perf-details">
                    ${compHeading}<br><strong>${compLabel}</strong><br>
                    ${compBreakdown}
                    Total Token Comp.: <strong>${formatCurrency(m.compareCost)}</strong>
                </div>
            </td>
            <td data-label="Est. Savings">
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

// MODEL COMPARISON VIEW
// Side-by-side metrics for the loaded models (full date range), with the
// best value in each row highlighted. Honors per-model selection checkboxes.
let selectedComparisonModels = new Set();

function renderComparison() {
    const section = document.getElementById('comparison-section');
    const thead = document.getElementById('model-comparison-thead');
    const tbody = document.getElementById('model-comparison-tbody');
    const togglesEl = document.getElementById('comparison-model-toggles');
    if (!section || !thead || !tbody || !togglesEl) return;

    // Only show when 2+ models are loaded.
    if (loadedFiles.length < 2) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    // Full-range per-model stats for an apples-to-apples comparison.
    const allStats = buildModelStats(null, null);
    const allModels = Object.values(allStats).map(m => m.model).sort((a, b) => a.localeCompare(b));

    // Seed selection set with all models on first render.
    if (selectedComparisonModels.size === 0) {
        allModels.forEach(m => selectedComparisonModels.add(m));
    }
    // Drop any models no longer present (e.g. after a model was removed).
    selectedComparisonModels.forEach(m => { if (!allModels.includes(m)) selectedComparisonModels.delete(m); });
    // Ensure at least one selected; default back to all if selection cleared.
    if (selectedComparisonModels.size === 0) {
        allModels.forEach(m => selectedComparisonModels.add(m));
    }

    // Render model selection checkboxes.
    togglesEl.innerHTML = '';
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'comparison-toggle-label';
    toggleLabel.innerHTML = 'Compare:';
    togglesEl.appendChild(toggleLabel);
    allModels.forEach(m => {
        const lbl = document.createElement('label');
        lbl.className = 'comparison-toggle-chip';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedComparisonModels.has(m);
        cb.addEventListener('change', () => {
            if (cb.checked) selectedComparisonModels.add(m);
            else selectedComparisonModels.delete(m);
            renderComparison();
        });
        lbl.appendChild(cb);
        const span = document.createElement('span');
        span.textContent = m;
        lbl.appendChild(span);
        togglesEl.appendChild(lbl);
    });

    const models = allModels.filter(m => selectedComparisonModels.has(m));
    if (models.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td style="padding:1rem; color: var(--text-secondary);">Select at least one model to compare.</td></tr>';
        return;
    }

    // Build metric rows.
    const metricRows = [
        { key: 'requests', label: 'Requests', fmt: v => formatNumber(v), dir: 'high' },
        { key: 'tokens', label: 'Total tokens', fmt: v => formatTokens(v), dir: 'high' },
        { key: 'cacheRate', label: 'Cache hit rate', fmt: v => v.toFixed(1) + '%', dir: 'high' },
        { key: 'energyCost', label: 'Energy cost', fmt: v => formatCurrency(v), dir: 'low' },
        { key: 'costPerRequest', label: 'Cost per request', fmt: v => formatCurrency(v, 4), dir: 'low' },
        { key: 'costPerMtok', label: 'Cost per Mtok', fmt: v => formatCurrency(v, 4), dir: 'low' },
        { key: 'energyPerRequestMwh', label: 'Energy per request (mWh)', fmt: v => v.toFixed(2), dir: 'low' },
        { key: 'savings', label: 'Est. savings', fmt: v => formatCurrency(v), dir: 'high' }
    ];

    const valuesByModel = {};
    models.forEach(model => {
        const s = allStats[model];
        // Cache hit rate uses the input-token denominator, matching the
        // summary card / model breakdown (per-model completion ratio).
        const origModel = rawData.by_model.find(x => x.model === model);
        const split = estimateTokenSplit(s.tokens || 0, origModel ? origModel.prompt_tokens : 0, origModel ? origModel.completion_tokens : 0);
        const cacheRate = split.promptTokens > 0 ? ((s.cached_tokens || 0) / split.promptTokens * 100) : 0;

        // Cost rows honor the selected Energy Cost Base and Token Compare
        // Rate, matching the summary cards / breakdown / charts. Previously
        // the raw JSON cost/token_cost were shown, so the comparison table
        // disagreed with every other panel as soon as a rate mode or plan
        // was selected (and its 'Cost per request' used the token cost).
        const modelCosts = getCalculatedCosts(
            s.tokens,
            s.cached_tokens || 0,
            split.promptTokens,
            split.completionTokens,
            s.energy_kwh,
            s.cost,
            s.token_cost || 0,
            s.third_party_cost || 0,
            model
        );
        const costPerRequest = s.requests > 0 ? (modelCosts.energyCost / s.requests) : 0;
        const costPerMtok = s.tokens > 0 ? (modelCosts.energyCost / s.tokens * 1e6) : 0;
        const energyPerRequestMwh = s.requests > 0 ? (s.energy_kwh * 1e6 / s.requests) : 0;
        valuesByModel[model] = {
            model,
            requests: s.requests,
            tokens: s.tokens,
            cacheRate,
            energyCost: modelCosts.energyCost,
            costPerRequest,
            costPerMtok,
            energyPerRequestMwh,
            savings: modelCosts.savings
        };
    });

    // Header row: Metric | Model A | Model B | ...
    thead.innerHTML = '';
    const hr = document.createElement('tr');
    hr.innerHTML = '<th class="sortable" style="text-align:left;">Metric</th>' +
        models.map(m => `<th class="comparison-model-col">${escapeHtml(m)}</th>`).join('');
    thead.appendChild(hr);

    tbody.innerHTML = '';
    metricRows.forEach(row => {
        // Determine best value (highlight).
        let bestVal = null;
        models.forEach(m => {
            const val = valuesByModel[m][row.key];
            if (bestVal === null) bestVal = val;
            else if (row.dir === 'high' ? val > bestVal : val < bestVal) bestVal = val;
        });
        const tr = document.createElement('tr');
        let html = `<td class="metric-name-cell">${escapeHtml(row.label)}</td>`;
        models.forEach(m => {
            const val = valuesByModel[m][row.key];
            const isBest = (val === bestVal) && models.length > 1;
            const cls = isBest ? 'comparison-best-cell' : '';
            html += `<td class="${cls}">${escapeHtml(row.fmt(val))}</td>`;
        });
        tr.innerHTML = html;
        tbody.appendChild(tr);
    });
}


// Multi-field log search predicate shared by the logs table renderer and the
// CSV subset export (Phase 2.2 contract: model / requests / tokens / energy
// cost / token cost — case-insensitive substring on the formatted values).
function matchesLogSearch(row, query) {
    const q = query.toLowerCase();
    return (
        formatDateTable(row.dateStr || row.date).toLowerCase().includes(q) ||
        (row.model && row.model.toLowerCase().includes(q)) ||
        formatNumber(row.requests).toLowerCase().includes(q) ||
        formatTokens(row.tokens).toLowerCase().includes(q) ||
        formatCurrency(row.energy_cost).toLowerCase().includes(q) ||
        formatCurrency(row.token_cost).toLowerCase().includes(q)
    );
}

// LOGS TABLE RENDER
function renderLogsTable() {
    let rows = calculatedLogRows.map(d => {
        const cacheRate = (d.prompt_tokens || 0) > 0 ? ((d.cached_tokens || 0) / d.prompt_tokens * 100) : 0;
        return {
            dateStr: d.date,
            dateObj: parseDateLocal(d.date),
            model: d.model || '',
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

    // Track pre-search total for screen-reader "showing X of Y" announcements.
    const preSearchTotal = rows.length;
    lastLogPreSearchTotal = preSearchTotal;
    // Apply Search Filter across multiple fields (case-insensitive substring).
    if (currentSearchQuery) {
        rows = rows.filter(r => matchesLogSearch(r, currentSearchQuery));
    }
    lastLogShownCount = rows.length;

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
        lastLogShownCount = 0;
        logsTableBody.innerHTML = `<tr><td colspan="11" data-label="Logs" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No logs match search criteria</td></tr>`;
        return;
    }

    // Show the Model column only when multiple models are loaded. Rows are
    // per-model-per-date (calculatedLogRows), so the column is populated;
    // with a single model it would be repetitive.
    const showModelCol = loadedFiles.length > 1;
    document.querySelectorAll('#logs-table .log-model-col').forEach(el => {
        el.style.display = showModelCol ? '' : 'none';
    });

    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-mono" data-label="Time">${formatDateTable(r.date)}</td>
            <td class="log-model-col" data-label="Model" style="display: ${showModelCol ? '' : 'none'};">${escapeHtml(r.model)}</td>
            <td data-label="Requests">${formatNumber(r.requests)}</td>
            <td data-label="Tokens">${formatTokens(r.tokens)}</td>
            <td data-label="Cached Tokens">${formatTokens(r.cached)}</td>
            <td class="font-mono" data-label="Cache Hit Rate">${r.cache_rate.toFixed(1)}%</td>
            <td class="font-mono" data-label="Energy Cost">${formatCurrency(r.energy_cost)}</td>
            <td class="font-mono" data-label="Token Cost">${formatCurrency(r.token_cost)}</td>
            <td class="font-mono ${r.savings < 0 ? 'text-terracotta' : 'text-emerald'}" data-label="Est. Savings" style="font-weight:600;">${formatCurrency(r.savings)}</td>
            <td data-label="Energy (Wh)">${r.energy.toFixed(1)} Wh</td>
            <td data-label="Carbon (g)">${r.carbon.toFixed(1)} g</td>
        `;
        logsTableBody.appendChild(tr);
    });
}

// LOG SEARCH EVENT
let lastLogPreSearchTotal = 0; // for sr-announcer "showing X of Y" messages
let lastLogShownCount = 0;
logSearchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderLogsTable();
    if (srAnnouncer) {
        srAnnouncer.textContent = `Filter applied: showing ${lastLogShownCount} of ${lastLogPreSearchTotal} records`;
    }
});

// BREAKDOWN-BY-MODEL CHART TOGGLE
const breakdownToggle = document.getElementById('breakdown-by-model-toggle');
const breakdownToggleRow = document.getElementById('breakdown-toggle-row');
if (breakdownToggle) {
    breakdownToggle.addEventListener('change', (e) => {
        breakdownByModel = e.target.checked;
        // When a single model is selected the toggle is meaningless (chart
        // already shows that model) — force it off.
        if (selectedModel) breakdownByModel = false;
        updateCalculationsAndRender();
        if (srAnnouncer) {
            srAnnouncer.textContent = breakdownByModel
                ? 'Chart breakdown by model enabled.'
                : 'Chart breakdown by model disabled.';
        }
    });
}

// Show the per-model toggle only when more than one model is loaded and no
// single-model filter is active. Otherwise hide it and disable breakdown.
function syncBreakdownToggle() {
    if (!breakdownToggleRow) return;
    if (loadedFiles.length > 1 && !selectedModel) {
        breakdownToggleRow.style.display = '';
        if (breakdownToggle) breakdownToggle.checked = breakdownByModel;
    } else {
        breakdownToggleRow.style.display = 'none';
        breakdownByModel = false;
        if (breakdownToggle) breakdownToggle.checked = false;
    }
}

// Phase 3.1 — ARIA + keyboard support for sortable table headers.
// All three sortable tables (logs, model performance, energy benchmark)
// share these helpers: they make each <th> focusable, activate sorting
// with Enter/Space, and keep aria-sort / aria-label in sync with the
// current sort state.
function getSortColumnLabel(th) {
    const clone = th.cloneNode(true);
    const indicator = clone.querySelector('.sort-indicator');
    if (indicator) indicator.remove();
    return (clone.textContent || '').trim();
}

function updateSortAria(th, headers, direction) {
    headers.forEach(header => {
        header.setAttribute('aria-sort', header === th ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
    });
    const label = getSortColumnLabel(th);
    th.setAttribute('aria-label', `${label}, sorted ${direction === 'asc' ? 'ascending' : 'descending'}`);
}

function makeSortableHeader(th, onSort) {
    th.setAttribute('role', 'button');
    th.tabIndex = 0;
    // Initialize aria-sort / aria-label from the initial sorted-asc/sorted-desc
    // classes in the markup so the ARIA state matches the visible sort on load.
    let initialDirection = 'none';
    if (th.classList.contains('sorted-asc')) initialDirection = 'ascending';
    else if (th.classList.contains('sorted-desc')) initialDirection = 'descending';
    th.setAttribute('aria-sort', initialDirection);
    const label = getSortColumnLabel(th);
    if (initialDirection !== 'none') {
        th.setAttribute('aria-label', `${label}, sorted ${initialDirection}`);
    } else {
        // Unsorted headers still get a descriptive label ("Sort by X").
        th.setAttribute('aria-label', `Sort by ${label}`);
    }
    th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSort();
        }
    });
    // Click activation lives here too so keydown and click can never
    // double-fire the sort (single handler source of truth).
    th.addEventListener('click', onSort);
}

// LOG TABLE COLUMN SORTING
function handleLogsTableSort(th) {
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

    updateSortAria(th, logsTableHeaders, currentSortDirection);
    renderLogsTable();
}

logsTableHeaders.forEach(th => {
    makeSortableHeader(th, () => handleLogsTableSort(th));
});

// MODEL PERFORMANCE TABLE COLUMN SORTING
function handleModelTableSort(th) {
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

    updateSortAria(th, modelTableHeaders, modelSortDirection);
    renderModelBreakdown();
}

modelTableHeaders.forEach(th => {
    makeSortableHeader(th, () => handleModelTableSort(th));
});

// CSV SUBSET EXPORT
btnExportCsvSubset.addEventListener('click', () => {
    if (!calculatedLogRows) return;
    
    let rows = calculatedLogRows.map(d => {
        const cacheRate = (d.prompt_tokens || 0) > 0 ? ((d.cached_tokens || 0) / d.prompt_tokens * 100) : 0;
        return {
            date: d.date,
            model: d.model || '',
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
        rows = rows.filter(r => matchesLogSearch(r, currentSearchQuery));
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

    const headers = ['Time', 'Model', 'Requests', 'Tokens', 'Cached Tokens', 'Cache Hit Rate %', 'Energy Cost (USD)', 'Standard Cost (USD)', 'Est. Savings (USD)', 'Energy (Wh)', 'Carbon (g CO2)'];
    const csvContent = [
        headers.map(csvEscape).join(','),
        ...rows.map(r => [
            r.date,
            r.model,
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

// UNOFFICIAL ENERGY INSIGHTS CALCULATION & RENDERING ENGINE
function getPromptBandLabel(avgPromptTokens) {
    if (avgPromptTokens < 256) return '0–256';
    if (avgPromptTokens < 1024) return '256–1k';
    if (avgPromptTokens < 4096) return '1k–4k';
    if (avgPromptTokens < 16384) return '4k–16k';
    if (avgPromptTokens < 65536) return '16k–64k';
    if (avgPromptTokens < 262144) return '64k–256k';
    return '256k–1M';
}

function getEnergyBenchmarkForModel(modelName) {
    if (!modelName) return null;
    const lower = modelName.toLowerCase();
    return NEURALWATT_ENERGY_BENCHMARKS.find(b => {
        if (b.model.toLowerCase() === lower || b.id.toLowerCase() === lower) return true;
        return b.aliases && b.aliases.some(a => lower.includes(a.toLowerCase()) || a.toLowerCase().includes(lower));
    }) || null;
}

function calculateWeightedEnergyForModel(entry, mode = 'telemetry') {
    if (!entry || !entry.bands) return 0;
    
    let totalWeightedMwh = 0;
    let totalWeight = 0;

    if (mode === 'equal') {
        entry.bands.forEach(b => {
            if (b.mwh === null) return;
            totalWeightedMwh += b.mwh;
            totalWeight += 1;
        });
    } else {
        // Telemetry mode: weight by req_pct
        entry.bands.forEach(b => {
            if (b.mwh === null || b.req_pct === 0) return;
            totalWeightedMwh += b.mwh * (b.req_pct / 100);
            totalWeight += (b.req_pct / 100);
        });
    }

    return totalWeight > 0 ? (totalWeightedMwh / totalWeight) : 0;
}

function renderEnergyInsights() {
    if (!energyBenchmarkTbody) return;

    // Initial Idle State before fetch
    if (!liveEnergyPricingLoaded && !liveEnergyPricingFetching && !liveEnergyPricingError) {
        energyBenchmarkTbody.innerHTML = `<tr><td colspan="9" data-label="Live Energy" style="text-align: center; padding: 2.5rem; color: var(--text-secondary);">
            <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text-primary);">⚡ Live Energy Telemetry Ready</div>
            <div style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--text-secondary);">Import a JSON export above or click below to fetch live energy telemetry from portal.neuralwatt.com.</div>
            <button type="button" class="btn btn-primary btn-sm" id="btn-fetch-live-energy">⚡ Fetch Live Energy Telemetry</button>
        </td></tr>`;
        const btnFetch = document.getElementById('btn-fetch-live-energy');
        if (btnFetch) {
            btnFetch.addEventListener('click', () => {
                fetchLiveEnergyPricing();
            });
        }
        valEnergyWeightedAvg.textContent = '- mWh';
        valEnergyWeightedSub.textContent = 'Manual sync or file import required';
        valMostEfficientModel.textContent = '-';
        valMostEfficientMwh.textContent = '-';
        if (energyInsightsChart) {
            energyInsightsChart.destroy();
            energyInsightsChart = null;
        }
        return;
    }

    // Handle Loading State
    if (liveEnergyPricingFetching && !liveEnergyPricingLoaded) {
        energyBenchmarkTbody.innerHTML = `<tr><td colspan="9" data-label="Live Energy" style="text-align: center; padding: 2.5rem; color: var(--text-secondary);">⚡ Fetching live energy telemetry from portal.neuralwatt.com...</td></tr>`;
        valEnergyWeightedAvg.textContent = '- mWh';
        valEnergyWeightedSub.textContent = 'Syncing live telemetry...';
        valMostEfficientModel.textContent = '-';
        valMostEfficientMwh.textContent = '-';
        if (energyInsightsChart) {
            energyInsightsChart.destroy();
            energyInsightsChart = null;
        }
        return;
    }

    // Handle Fetch Failure / Error State
    if (liveEnergyPricingError || !liveEnergyPricingLoaded || NEURALWATT_ENERGY_BENCHMARKS.length === 0) {
        energyBenchmarkTbody.innerHTML = `<tr><td colspan="9" data-label="Live Energy" style="text-align: center; padding: 2.5rem; color: var(--accent-terracotta); font-weight: 500;">
            <div style="margin-bottom: 0.75rem;">⚠️ Live energy pricing telemetry could not be loaded.</div>
            <div style="margin-bottom: 1rem; font-weight: 400; color: var(--text-secondary);">The source is a third-party site we don't control — its format may have changed. If this keeps happening, please <a href="https://github.com/theflukeman/unofficial-neuralwatt-usage-insights/issues" target="_blank" rel="noopener noreferrer" style="color: var(--accent-terracotta);">open an issue on GitHub</a>.</div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-retry-live-energy">↻ Retry Fetching Live Telemetry</button>
        </td></tr>`;
        const btnRetry = document.getElementById('btn-retry-live-energy');
        if (btnRetry) {
            btnRetry.addEventListener('click', () => {
                fetchLiveEnergyPricing();
            });
        }
        valEnergyWeightedAvg.textContent = '- mWh';
        valEnergyWeightedSub.textContent = 'Live telemetry unavailable';
        valMostEfficientModel.textContent = '-';
        valMostEfficientMwh.textContent = '-';
        if (energyInsightsChart) {
            energyInsightsChart.destroy();
            energyInsightsChart = null;
        }
        return;
    }

    // 1. Determine User Request Profile & Band if rawData available
    // Honors the active model + date-range filters so the profile matches
    // the rest of the dashboard (previously it used the full-period,
    // all-model rawData.totals regardless of the filters applied above).
    let userAvgPromptTokens = 0;
    let userBand = '-';
    let userActualMwhPerReq = null;
    let activeModelEntry = null;
    let profileModelsBlend = []; // { model, reqs } for the blended benchmark

    if (rawData && rawData.daily && rawData.daily.length > 0) {
        const startDate = filterStartDate ? new Date(filterStartDate + 'T00:00:00') : null;
        const endDate = filterEndDate ? new Date(filterEndDate + 'T23:59:59') : null;
        const filteredStats = buildModelStats(startDate, endDate);
        const profileModels = []; // { model, reqs } for the blended benchmark
        let reqs = 0;
        let promptTokens = 0;
        let energyKwh = 0;
        Object.values(filteredStats).forEach(m => {
            if (selectedModel && m.model !== selectedModel) return;
            reqs += m.requests;
            energyKwh += m.energy_kwh;
            profileModels.push({ model: m.model, reqs: m.requests });
            const origModel = rawData.by_model.find(x => x.model === m.model);
            const split = estimateTokenSplit(m.tokens || 0, origModel ? origModel.prompt_tokens : 0, origModel ? origModel.completion_tokens : 0);
            promptTokens += split.promptTokens;
        });
        if (reqs > 0) {
            userAvgPromptTokens = Math.round(promptTokens / reqs);
            userBand = getPromptBandLabel(userAvgPromptTokens);
            userActualMwhPerReq = ((energyKwh * 1000000) / reqs);
        }
        profileModelsBlend = profileModels;
    }

    if (selectedModel) {
        activeModelEntry = getEnergyBenchmarkForModel(selectedModel);
    } else if (rawData && rawData.available_models && rawData.available_models.length > 0) {
        activeModelEntry = getEnergyBenchmarkForModel(rawData.available_models[0]);
    }

    // 2. Compute Benchmark Models Data with Weighted Energy
    const benchmarkData = NEURALWATT_ENERGY_BENCHMARKS.map(item => {
        const weightedMwh = calculateWeightedEnergyForModel(item, 'telemetry');
        
        let dominantBand = '—';
        let maxPct = 0;
        item.bands.forEach(b => {
            if (b.req_pct > maxPct) {
                maxPct = b.req_pct;
                dominantBand = b.band;
            }
        });

        return {
            ...item,
            weightedMwh: weightedMwh,
            dominantBand: dominantBand,
            maxPct: maxPct
        };
    });

    // 3. Find Most Efficient Model
    // Only entries with real (positive) weighted data qualify — a model whose
    // bands are all null / zero-request must not be reported as "most
    // efficient" at 0.0 mWh (previously the first entry was the seed, so an
    // empty first row was never replaced).
    let mostEfficient = null;
    benchmarkData.forEach(b => {
        if (b.weightedMwh > 0 && (mostEfficient === null || b.weightedMwh < mostEfficient.weightedMwh)) {
            mostEfficient = b;
        }
    });

    // 4. Update Stat Summary Cards
    const targetModelForStat = activeModelEntry ? benchmarkData.find(b => b.id === activeModelEntry.id) : benchmarkData[0];
    const statWeightedValue = targetModelForStat ? targetModelForStat.weightedMwh : 0;

    valEnergyWeightedAvg.textContent = `${statWeightedValue.toFixed(1)} mWh`;
    valEnergyWeightedSub.textContent = targetModelForStat 
        ? `${targetModelForStat.model} telemetry weighted` 
        : 'Telemetry weighted baseline';

    valUserReqSize.textContent = userAvgPromptTokens > 0 ? `${formatTokens(userAvgPromptTokens)} prompt tokens` : 'No JSON data';
    valUserReqBand.textContent = userBand !== '-' ? `Typical band: ${userBand}` : 'Upload export to position';

    if (userActualMwhPerReq !== null) {
        valUserMwhReq.textContent = `${userActualMwhPerReq.toFixed(1)} mWh`;

        // Reference for the % comparison: when the profile spans one model
        // (single-model filter or a single loaded model) compare against that
        // model's telemetry average; when it spans several models, compare
        // against the request-share-weighted blend of each loaded model's
        // benchmark average instead of a single (first) model's.
        let refMwh = null;
        let refLabel = '';
        if (selectedModel || profileModelsBlend.length <= 1) {
            const refEntry = activeModelEntry
                ? benchmarkData.find(b => b.id === activeModelEntry.id || b.model === activeModelEntry.model)
                : targetModelForStat;
            if (refEntry && refEntry.weightedMwh > 0) {
                refMwh = refEntry.weightedMwh;
                refLabel = refEntry.model;
            }
        } else {
            let total = 0;
            let sum = 0;
            profileModelsBlend.forEach(pm => {
                const b = getEnergyBenchmarkForModel(pm.model);
                const entry = b ? benchmarkData.find(x => x.id === b.id || x.model === b.model) : null;
                if (entry && entry.weightedMwh > 0) {
                    sum += entry.weightedMwh * pm.reqs;
                    total += pm.reqs;
                }
            });
            if (total > 0) {
                refMwh = sum / total;
                refLabel = 'blended benchmark';
            }
        }

        if (refMwh !== null && refMwh > 0) {
            const diffPct = ((userActualMwhPerReq - refMwh) / refMwh) * 100;
            const diffSign = diffPct >= 0 ? '+' : '';
            valUserMwhVsBenchmark.textContent = `${diffSign}${diffPct.toFixed(1)}% vs ${refLabel} avg`;
        } else {
            valUserMwhVsBenchmark.textContent = 'Actual measured from JSON export';
        }
    } else {
        valUserMwhReq.textContent = '- mWh';
        valUserMwhVsBenchmark.textContent = 'Import single-model file to calculate';
    }

    valMostEfficientModel.textContent = mostEfficient ? mostEfficient.model : '-';
    valMostEfficientMwh.textContent = mostEfficient ? `${mostEfficient.weightedMwh.toFixed(1)} mWh / request` : '-';

    // 5. Apply Table Sorting
    const sortedData = [...benchmarkData].sort((a, b) => {
        let valA, valB;
        if (energyTableSortColumn === 'model') {
            valA = a.model.toLowerCase();
            valB = b.model.toLowerCase();
        } else if (energyTableSortColumn === 'weighted') {
            valA = a.weightedMwh;
            valB = b.weightedMwh;
        } else {
            // Band sort
            const bandA = a.bands.find(x => x.band === energyTableSortColumn);
            const bandB = b.bands.find(x => x.band === energyTableSortColumn);
            valA = (bandA && bandA.mwh !== null) ? bandA.mwh : Infinity;
            valB = (bandB && bandB.mwh !== null) ? bandB.mwh : Infinity;
        }

        if (valA < valB) return energyTableSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return energyTableSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // 6. Render Table Rows
    energyBenchmarkTbody.innerHTML = '';
    sortedData.forEach(item => {
        const tr = document.createElement('tr');
        const isActive = activeModelEntry && (item.id === activeModelEntry.id || item.model === activeModelEntry.model);
        if (isActive) {
            tr.classList.add('active-model-row');
        }

        let cellsHtml = `
            <td class="font-mono" data-label="Model" style="white-space: nowrap;">
                ${isActive ? '<span class="terracotta-dot">★ </span>' : ''}<strong>${escapeHtml(item.model)}</strong>
            </td>
            <td class="weighted-col-cell font-mono text-terracotta" data-label="Weighted Energy/Req" style="white-space: nowrap;">
                ${item.weightedMwh.toFixed(1)} mWh
                <div class="energy-cell-sub">Top band: ${item.dominantBand} (${item.maxPct}%)</div>
            </td>
        `;

        item.bands.forEach(b => {
            if (b.mwh === null) {
                cellsHtml += `<td data-label="${escapeHtml(b.band)}" style="text-align: right; color: var(--text-secondary); opacity: 0.5;" title="Too few measured requests in this size band">—</td>`;
            } else {
                const titleTooltip = `Average energy over real traffic. Measured at a ${b.cache_hit_pct !== null ? b.cache_hit_pct + '%' : '0%'} avg cache-hit rate in this size band. ${b.req_pct}% of total telemetry requests.`;
                cellsHtml += `
                    <td data-label="${escapeHtml(b.band)}" style="text-align: right;" title="${escapeHtml(titleTooltip)}">
                        <div class="energy-cell-primary">${escapeHtml(b.display)}</div>
                        <div class="energy-cell-sub">${b.req_pct}% reqs</div>
                    </td>
                `;
            }
        });

        tr.innerHTML = cellsHtml;
        energyBenchmarkTbody.appendChild(tr);
    });

    // 7. Populate Landing Page Live Telemetry Table (if on landing view)
    const landingTbody = document.getElementById('landing-energy-benchmark-tbody');
    if (landingTbody) {
        landingTbody.innerHTML = '';
        sortedData.forEach(item => {
            const tr = document.createElement('tr');
            let cellsHtml = `
                <td class="font-mono" style="white-space: nowrap;"><strong>${escapeHtml(item.model)}</strong></td>
                <td class="weighted-col-cell font-mono text-terracotta" style="white-space: nowrap;">${item.weightedMwh.toFixed(1)} mWh</td>
            `;
            item.bands.forEach(b => {
                cellsHtml += `<td style="text-align: right;">${b.mwh === null ? '—' : escapeHtml(b.display)}</td>`;
            });
            tr.innerHTML = cellsHtml;
            landingTbody.appendChild(tr);
        });
    }

    // 8. Render Chart
    renderEnergyInsightsChart(sortedData, activeModelEntry);
}

function renderEnergyInsightsChart(data, activeModelEntry) {
    const canvas = document.getElementById('energyInsightsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (energyInsightsChart) {
        energyInsightsChart.destroy();
        energyInsightsChart = null;
    }

    // Guard: Chart.js CDN unavailable. Show a styled placeholder inside the
    // chart's container instead of returning silently. Use textContent.
    if (typeof Chart === 'undefined') {
        const container = canvas.parentElement;
        if (container) {
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.minHeight = '200px';
            const msg = document.createElement('div');
            msg.className = 'chart-unavailable-placeholder';
            msg.textContent = 'Charts unavailable — Chart.js CDN could not be loaded (check network connection).';
            container.innerHTML = '';
            container.appendChild(msg);
        }
        return;
    }

    const isDarkMode = bodyEl.classList.contains('dark-mode');
    // Chart.js colors resolved to concrete hexes (Chart.js cannot consume
    // `var(--…)`). Keep in sync with :root / .dark-mode values for the
    // corresponding --accent-* / --text-secondary variables.
    const textColor = isDarkMode ? '#9BAA95' : '#858458';      // --text-secondary
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    const primaryBarColor = isDarkMode ? '#2dd4bf' : '#0f766e'; // --accent-emerald
    const activeBarColor = isDarkMode ? '#E86C45' : '#D55934'; // --accent-terracotta

    const labels = data.map(d => d.model);
    const chartValues = data.map(d => parseFloat(d.weightedMwh.toFixed(1)));
    const backgroundColors = data.map(d => {
        const isActive = activeModelEntry && (d.id === activeModelEntry.id || d.model === activeModelEntry.model);
        return isActive ? activeBarColor : primaryBarColor;
    });

    energyInsightsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weighted Energy (mWh / request)',
                data: chartValues,
                backgroundColor: backgroundColors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textColor, font: { family: 'Inter', size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw} mWh`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, font: { family: 'Inter', size: 11 }, maxRotation: 45 },
                    grid: { color: gridColor }
                },
                y: {
                    ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 11 }, callback: v => v + ' mWh' },
                    grid: { color: gridColor },
                    beginAtZero: true
                }
            }
        }
    });
}

// LIVE ENERGY BENCHMARK DATA — loaded from the repo-hosted mirror first
// (data/energy-benchmarks.json, refreshed by the GitHub Actions workflow),
// then from the portal website directly (which has no CORS headers), with a
// localStorage cache (20-min TTL) so file:// and offline loads still work.
const ENERGY_MIRROR_URL = 'data/energy-benchmarks.json';
const ENERGY_CACHE_KEY = 'neuralwatt_energy_benchmarks_cache';
const ENERGY_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// Load energy benchmarks from localStorage cache. Returns true if cache was
// fresh (within TTL) and benchmarks were restored. Also renders the energy
// insights panel and updates the status badge when successful.
function loadEnergyCache() {
    try {
        const cached = localStorage.getItem(ENERGY_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.benchmarks) && parsed.timestamp && (Date.now() - parsed.timestamp < ENERGY_CACHE_TTL_MS)) {
                NEURALWATT_ENERGY_BENCHMARKS.length = 0;
                NEURALWATT_ENERGY_BENCHMARKS.push(...parsed.benchmarks);
                liveEnergyPricingLoaded = true;
                liveEnergyPricingFetching = false;
                liveEnergyPricingError = null;
                const energyStatusBadge = document.getElementById('energy-status-badge');
                if (energyStatusBadge) {
                    energyStatusBadge.className = 'legend-chip live-sync-chip';
                    const cacheTime = new Date(parsed.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    energyStatusBadge.innerHTML = `<span class="live-dot">●</span> Live Sync (cached · updated ${cacheTime})`;
                }
                renderEnergyInsights();
                return true;
            }
        }
    } catch (cacheErr) {
        // localStorage may be unavailable (private mode, quota); fall through
    }
    return false;
}

// Show cached energy data immediately on page load, before any JSON import
loadEnergyCache();

// Structural check for the repo-hosted energy mirror payload. Keep in sync
// with lib/core.js (validateEnergyBenchmarksPayload).
function validateEnergyBenchmarksPayload(payload) {
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

// Shared badge updater for the Energy Insights panel.
const updateEnergyBadge = (status, timeStr = '', source = 'portal.neuralwatt.com') => {
    const energyStatusBadge = document.getElementById('energy-status-badge');
    if (!energyStatusBadge) return;
    if (status === 'syncing') {
        energyStatusBadge.className = 'legend-chip live-sync-chip';
        energyStatusBadge.innerHTML = `<span class="live-dot">●</span> Syncing live portal telemetry...`;
    } else if (status === 'live') {
        energyStatusBadge.className = 'legend-chip live-sync-chip';
        energyStatusBadge.innerHTML = `<span class="live-dot">●</span> Live Sync (${escapeHtml(source)}) ${timeStr ? '· updated ' + escapeHtml(timeStr) : ''}`;
    } else {
        energyStatusBadge.className = 'legend-chip offline-fallback-chip';
        energyStatusBadge.innerHTML = `<span class="offline-dot">✕</span> Failed to load live data (No fallback)`;
    }
};

// PRIMARY live-data source: the repo-hosted mirror (data/energy-benchmarks.json).
// It is refreshed server-side by the GitHub Actions workflow
// (.github/workflows/sync-energy-benchmarks.yml), so the browser never has to
// talk to portal.neuralwatt.com directly (which sends no CORS headers — direct
// fetches are blocked in Firefox and others). Also refreshes the localStorage
// cache so file:// and offline loads keep working.
async function loadEnergyMirror() {
    try {
        const res = await fetch(ENERGY_MIRROR_URL, { cache: 'no-cache' });
        if (!res.ok) return false;
        const payload = await res.json();
        if (!validateEnergyBenchmarksPayload(payload)) {
            console.error('Energy benchmark mirror failed validation — the portal markup may have changed. Please report it at https://github.com/theflukeman/unofficial-neuralwatt-usage-insights/issues');
            return false;
        }
        const fetchedTime = payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        NEURALWATT_ENERGY_BENCHMARKS.length = 0;
        NEURALWATT_ENERGY_BENCHMARKS.push(...payload.benchmarks);
        liveEnergyPricingLoaded = true;
        liveEnergyPricingFetching = false;
        liveEnergyPricingError = null;
        try {
            localStorage.setItem(ENERGY_CACHE_KEY, JSON.stringify({
                benchmarks: payload.benchmarks,
                timestamp: Date.now()
            }));
        } catch (cacheErr) {
            // localStorage write may fail (quota, private mode); non-fatal
        }
        updateEnergyBadge('live', fetchedTime, 'repo mirror');
        renderEnergyInsights();
        if (srAnnouncer) srAnnouncer.textContent = 'Live energy data: synced from repo mirror.';
        return true;
    } catch (err) {
        console.error('Failed to load energy benchmark mirror:', err);
        return false;
    }
}

async function fetchLiveEnergyPricing() {
    // Check browser cache first — avoids redundant network fetches within TTL
    if (loadEnergyCache()) return;

    // Then the same-origin repo mirror (no CORS). The direct portal fetch below
    // remains a fallback for older hosted copies / manual refreshes.
    if (await loadEnergyMirror()) return;

    liveEnergyPricingFetching = true;
    liveEnergyPricingLoaded = false;
    liveEnergyPricingError = null;
    updateEnergyBadge('syncing');
    renderEnergyInsights();

    const parseEnergyHtml = (html) => {
        try {
            if (!html || typeof html !== 'string') return false;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // The portal page has TWO tables: a 6-column status board and the
            // band grid. Only the grid carries the prompt-size band headers —
            // select it explicitly so markup changes to the status board can't
            // silently break parsing.
            const tables = doc.querySelectorAll('table');
            let table = null;
            for (const t of tables) {
                const txt = t.textContent || '';
                if (txt.includes('0–256') && txt.includes('256–1k') && txt.includes('256k–1M')) {
                    table = t;
                    break;
                }
            }
            if (!table) return false;

            const rows = table.querySelectorAll('tr');
            if (!rows || rows.length < 2) return false;

            const updatedBenchmarks = [];
            const bandHeaders = ['0–256', '256–1k', '1k–4k', '4k–16k', '16k–64k', '64k–256k', '256k–1M'];

            rows.forEach(row => {
                const tds = row.querySelectorAll('td');
                if (!tds || tds.length < 8) return;

                const modelName = tds[0].textContent.trim();
                if (!modelName || modelName.toLowerCase() === 'model') return;

                const bands = [];
                for (let idx = 1; idx <= 7; idx++) {
                    const cell = tds[idx];
                    const bandLabel = bandHeaders[idx - 1] || '';
                    
                    let display = '—';
                    let mwh = null;
                    let req_pct = 0;
                    let cache_hit_pct = null;

                    if (cell) {
                        const cellText = cell.textContent.trim();
                        const energyDiv = cell.querySelector('.num') || cell;
                        if (energyDiv) {
                            const rawText = energyDiv.textContent.trim();
                            if (rawText && !rawText.startsWith('—')) {
                                const cleanText = rawText.replace('~', '').trim();
                                display = cleanText;
                                const match = cleanText.match(/(\d+(?:\.\d+)?)\s*(mWh|Wh)/i);
                                if (match) {
                                    const val = parseFloat(match[1]);
                                    const unit = match[2];
                                    mwh = unit.toLowerCase() === 'wh' ? val * 1000 : val;
                                } else {
                                    // Portal markup changed and this cell is no
                                    // longer parseable — fail loudly instead of
                                    // showing a bogus "—".
                                    throw new Error(`Unparseable energy value "${cleanText}" in band "${bandLabel}" for model "${modelName}". Portal markup may have changed.`);
                                }
                            }
                            const titleAttr = energyDiv.getAttribute('title') || cell.getAttribute('title') || '';
                            const cacheMatch = titleAttr.match(/(\d+)%\s*average cache-hit rate/i);
                            if (cacheMatch) {
                                cache_hit_pct = parseInt(cacheMatch[1], 10);
                            }
                        }

                        const pctMatch = cellText.match(/(\d+(?:\.\d+)?)%\s*of reqs/i);
                        if (pctMatch) {
                            req_pct = parseFloat(pctMatch[1]);
                        }
                    }

                    bands.push({
                        band: bandLabel,
                        display: display,
                        mwh: mwh,
                        req_pct: req_pct,
                        cache_hit_pct: cache_hit_pct
                    });
                }

                const modelId = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                updatedBenchmarks.push({
                    model: modelName,
                    id: modelId,
                    aliases: [modelId, modelName.toLowerCase()],
                    bands: bands
                });
            });

            if (updatedBenchmarks.length > 0) {
                NEURALWATT_ENERGY_BENCHMARKS.length = 0;
                NEURALWATT_ENERGY_BENCHMARKS.push(...updatedBenchmarks);
                return true;
            }
        } catch (err) {
            console.error('Error parsing live energy pricing HTML:', err);
        }
        return false;
    };

    const fetchTargets = [
        async () => {
            const res = await fetch('https://portal.neuralwatt.com/energy-pricing', { cache: 'no-cache' });
            if (!res.ok) throw new Error('Direct fetch failed');
            return await res.text();
        },
        async () => {
            const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://portal.neuralwatt.com/energy-pricing'), { cache: 'no-cache' });
            if (!res.ok) throw new Error('AllOrigins JSON fetch failed');
            const data = await res.json();
            return data && data.contents ? data.contents : null;
        },
        async () => {
            const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://portal.neuralwatt.com/energy-pricing'), { cache: 'no-cache' });
            if (!res.ok) throw new Error('AllOrigins raw fetch failed');
            return await res.text();
        },
        async () => {
            const res = await fetch('https://corsproxy.io/?' + encodeURIComponent('https://portal.neuralwatt.com/energy-pricing'), { cache: 'no-cache' });
            if (!res.ok) throw new Error('CorsProxy fetch failed');
            return await res.text();
        }
    ];

    for (const getHtml of fetchTargets) {
        try {
            const htmlText = await getHtml();
            if (htmlText && (htmlText.includes('Average energy per request') || htmlText.includes('0–256'))) {
                const success = parseEnergyHtml(htmlText);
                if (success) {
                    liveEnergyPricingLoaded = true;
                    liveEnergyPricingFetching = false;
                    // Cache the parsed benchmarks for next load
                    try {
                        localStorage.setItem(ENERGY_CACHE_KEY, JSON.stringify({
                            benchmarks: NEURALWATT_ENERGY_BENCHMARKS,
                            timestamp: Date.now()
                        }));
                    } catch (cacheErr) {
                        // localStorage write may fail (quota, private mode); non-fatal
                    }
                    updateEnergyBadge('live', new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'portal.neuralwatt.com');
                    renderEnergyInsights();
                    if (srAnnouncer) srAnnouncer.textContent = 'Live energy data: synced.';
                    return;
                }
            }
        } catch (e) {
            // Try next fetch target
        }
    }

    liveEnergyPricingLoaded = false;
    liveEnergyPricingFetching = false;
    liveEnergyPricingError = 'Failed to fetch live telemetry';
    NEURALWATT_ENERGY_BENCHMARKS.length = 0;
    updateEnergyBadge('error');
    renderEnergyInsights();
    if (srAnnouncer) srAnnouncer.textContent = 'Live energy data: failed. Using built-in fallback benchmarks.';
}

// START BACKGROUND LOAD FOR OPENROUTER AND NEURALWATT POSTED RATES
fetchOpenRouterModels();
// Load the repo-hosted pricing mirror first, then overlay the live
// Neuralwatt API on top so the freshest source (the API) always wins
// deterministically. Previously both fired concurrently and merged into
// NEURALWATT_MODEL_PRICING with a nondeterministic last-writer-wins.
loadExternalPricingTables().then(() => {
    fetchNeuralwattPricing();
});
