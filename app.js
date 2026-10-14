// app.js — Terra Incognita SEO Intelligence Platform Controller
// Manages application state, API communication, 3D terrain binding, and editorial report generation.

const STORAGE_KEY = 'terra_incognita_history_v2';

const appState = {
  history: [],
  currentResult: null,
  darkMode: false,
  mountainViewer: null
};

// ---------------------------------------------------------------------------
// Persistence (localStorage with memory fallback)
// ---------------------------------------------------------------------------
function loadStoredHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      appState.history = JSON.parse(raw);
    }
  } catch {
    appState.history = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.history.slice(0, 20)));
  } catch {
    // quota exceeded or sandbox blocked
  }
}

// ---------------------------------------------------------------------------
// Tab Switching
// ---------------------------------------------------------------------------
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-pill').forEach(el => el.classList.remove('active'));

  const target = document.getElementById('tab-' + tabName);
  if (target) {
    target.classList.remove('hidden');
  }

  const pill = document.querySelector(`[data-tab="${tabName}"]`);
  if (pill) {
    pill.classList.add('active');
  }
}
window.switchTab = switchTab;

// ---------------------------------------------------------------------------
// Theme Toggle
// ---------------------------------------------------------------------------
function initTheme() {
  try {
    const saved = localStorage.getItem('terra_theme');
    if (saved === 'dark' || (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      appState.darkMode = true;
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      appState.darkMode = false;
    }
  } catch {
    // fallback
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');

  if (isDark) {
    html.classList.remove('dark');
    html.classList.add('light');
    appState.darkMode = false;
    try { localStorage.setItem('terra_theme', 'light'); } catch {}
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    appState.darkMode = true;
    try { localStorage.setItem('terra_theme', 'dark'); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Error Modal Handlers
// ---------------------------------------------------------------------------
function showErrorModal(message, domain) {
  const modal = document.getElementById('error-modal');
  const msgEl = document.getElementById('error-message');
  const domainEl = document.getElementById('error-domain');

  if (msgEl) msgEl.textContent = message || 'An unexpected survey disruption occurred.';
  if (domainEl) domainEl.textContent = domain ? `Target: ${domain}` : '';
  if (modal) modal.classList.remove('hidden');
}

function closeErrorModal() {
  const modal = document.getElementById('error-modal');
  if (modal) modal.classList.add('hidden');
}

function retryWithCorrection() {
  closeErrorModal();
  const input = document.getElementById('url-input');
  if (input) input.focus();
}

function tryExample(domain) {
  const input = document.getElementById('url-input');
  if (input) input.value = domain;
  closeErrorModal();
  const launchBtn = document.getElementById('launch-btn');
  if (launchBtn) launchBtn.click();
}
window.showErrorModal = showErrorModal;
window.closeErrorModal = closeErrorModal;
window.retryWithCorrection = retryWithCorrection;
window.tryExample = tryExample;

// ---------------------------------------------------------------------------
// Analysis Execution & Telemetry Binding
// ---------------------------------------------------------------------------
async function analyzeDomain(targetUrl) {
  const overlay = document.getElementById('mountain-scanning-overlay');
  const phaseTitle = document.getElementById('scanning-phase-title');
  const phaseDetail = document.getElementById('scanning-phase-detail');

  if (overlay) overlay.classList.remove('hidden');

  const updateScanPhase = (title, detail) => {
    if (phaseTitle) phaseTitle.textContent = title;
    if (phaseDetail) phaseDetail.textContent = detail;
  };

  try {
    updateScanPhase('Resolving Coordinates…', 'Verifying DNS resolution & transport security');

    // Run parallel analysis and preview fetch
    const [analyzeRes, previewRes] = await Promise.all([
      fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      }),
      fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      }).catch(() => null)
    ]);

    updateScanPhase('Sculpting 3D Strata…', 'Processing DOM hierarchy, word density, and crawler directives');

    const data = await analyzeRes.json().catch(() => ({}));

    if (!analyzeRes.ok || data.success === false) {
      throw new Error(data.message || data.error || `Server status ${analyzeRes.status}`);
    }

    let previewUrl = null;
    if (previewRes && previewRes.ok) {
      const pData = await previewRes.json().catch(() => ({}));
      if (pData.url) previewUrl = pData.url;
    }

    const fullResult = {
      ...data,
      previewUrl
    };

    appState.currentResult = fullResult;

    // Update 3D Mountain Terrain
    if (appState.mountainViewer) {
      appState.mountainViewer.updateData(fullResult);
    }

    // Populate UI
    renderSurveyResults(fullResult);

    // Save to history
    addToHistory(fullResult);

  } catch (err) {
    console.error('Survey error:', err);
    showErrorModal(err.message, targetUrl);
  } finally {
    if (overlay) overlay.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Render Results onto Dashboard
// ---------------------------------------------------------------------------
function renderSurveyResults(data) {
  const scores = data.scores || { total: 0, onPage: 0, technical: 0, content: 0, links: 0 };

  // Active domain title
  const activeDomainEl = document.getElementById('active-domain-display');
  if (activeDomainEl) {
    try {
      const u = new URL(data.url);
      activeDomainEl.textContent = `— ${u.hostname}`;
    } catch {
      activeDomainEl.textContent = `— ${data.url}`;
    }
  }

  // Score deck
  const totalEl = document.getElementById('score-total');
  const gradeEl = document.getElementById('score-grade');
  if (totalEl) totalEl.textContent = scores.total;

  if (gradeEl) {
    if (scores.total >= 90) gradeEl.textContent = 'Alpine Peak (Outstanding)';
    else if (scores.total >= 75) gradeEl.textContent = 'Subalpine Ridge (Healthy)';
    else if (scores.total >= 50) gradeEl.textContent = 'Plateau Terrace (Moderate)';
    else gradeEl.textContent = 'Eroded Valley (Deficit)';
  }

  // Category scores and progress bars
  const setScore = (id, barId, val, max) => {
    const el = document.getElementById(id);
    const bar = document.getElementById(barId);
    if (el) el.textContent = val;
    if (bar) bar.style.width = `${Math.min(100, (val / max) * 100)}%`;
  };

  setScore('score-onpage', 'bar-onpage', scores.onPage, 40);
  setScore('score-technical', 'bar-technical', scores.technical, 30);
  setScore('score-content', 'bar-content', scores.content, 20);
  setScore('score-links', 'bar-links', scores.links, 10);

  // Satellite preview
  const previewImg = document.getElementById('web-preview-img');
  const placeholder = document.getElementById('web-preview-placeholder');
  const visitLink = document.getElementById('preview-visit-link');

  if (visitLink) visitLink.href = data.url;

  if (previewImg && data.previewUrl) {
    previewImg.src = data.previewUrl;
    previewImg.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
  } else if (previewImg) {
    previewImg.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
  }

  // Keywords
  const kwList = document.getElementById('keywords-list');
  const kwCount = document.getElementById('keyword-count-display');
  if (kwList) {
    kwList.innerHTML = '';
    const keywords = data.topKeywords || [];
    if (kwCount) kwCount.textContent = `${keywords.length} TOKENS`;

    if (keywords.length === 0) {
      kwList.innerHTML = '<div class="text-stone-400 py-4 text-center">No prominent keywords identified.</div>';
    } else {
      keywords.forEach(([word, count]) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between py-1 border-b border-stone-200/50 dark:border-stone-800/50';
        item.innerHTML = `
          <span class="text-stone-800 dark:text-stone-200 font-medium">${escapeHtml(word)}</span>
          <span class="px-1.5 py-0.5 rounded bg-stone-200/70 dark:bg-stone-800 text-[11px] text-stone-600 dark:text-stone-400 font-mono">${count}×</span>
        `;
        kwList.appendChild(item);
      });
    }
  }

  // Technical Strata
  const setTech = (id, value, isPassed) => {
    const el = document.getElementById(id);
    if (!el) return;
    const badge = isPassed
      ? `<span class="text-forest-600 dark:text-forest-400">✓ ${escapeHtml(value)}</span>`
      : `<span class="text-amber-600 dark:text-amber-400">▲ ${escapeHtml(value)}</span>`;
    el.innerHTML = badge;
  };

  setTech('tech-https', data.url.startsWith('https://') ? 'HTTPS Secure' : 'Insecure HTTP', data.url.startsWith('https://'));
  setTech('tech-viewport', data.hasViewport ? 'Configured' : 'Missing Viewport', data.hasViewport);
  setTech('tech-robots', data.robots?.disallowsAll ? 'Crawl Blocked' : (data.robots?.found ? 'Permitted (robots.txt)' : 'Default Crawl (No robots.txt)'), !data.robots?.disallowsAll);
  setTech('tech-canonical', data.canonical ? 'Declared' : 'Not Declared', !!data.canonical);
  setTech('tech-headings', `H1: ${data.h1Count} // H2: ${data.h2Count}`, data.h1Count === 1);
  setTech('tech-images', `${data.imagesWithoutAlt} missing alt tags (${data.imageCount} total)`, data.imagesWithoutAlt === 0);

  // Content Topography
  const titleText = document.getElementById('meta-title-text');
  const titleLength = document.getElementById('meta-title-length');
  if (titleText) titleText.textContent = data.title;
  if (titleLength) titleLength.textContent = `${data.title === 'Missing' ? 0 : data.title.length} characters (optimal 30-60)`;

  const descText = document.getElementById('meta-desc-text');
  const descLength = document.getElementById('meta-desc-length');
  if (descText) descText.textContent = data.metaDesc;
  if (descLength) descLength.textContent = `${data.metaDesc === 'Missing' ? 0 : data.metaDesc.length} characters (optimal 120-160)`;

  const wordCountEl = document.getElementById('content-word-count');
  if (wordCountEl) wordCountEl.textContent = data.wordCount;

  const linkCountEl = document.getElementById('content-link-count');
  if (linkCountEl) linkCountEl.textContent = data.linkCount;

  const ogBox = document.getElementById('og-preview-box');
  if (ogBox) {
    if (data.ogTitle || data.ogDesc || data.ogImage) {
      ogBox.innerHTML = `
        <div class="font-medium text-stone-900 dark:text-stone-100">${escapeHtml(data.ogTitle || 'No og:title')}</div>
        <div class="text-[11px] text-stone-500 mt-1">${escapeHtml(data.ogDesc || 'No og:description')}</div>
      `;
    } else {
      ogBox.textContent = 'No Open Graph tags detected in document header.';
    }
  }

  // Actionable Plan & Code Fixes
  renderActionablePlan(data.issues || []);
}

// ---------------------------------------------------------------------------
// Render Actionable Recommendations
// ---------------------------------------------------------------------------
function renderActionablePlan(issues) {
  const container = document.getElementById('recommendations-container');
  const countBadge = document.getElementById('findings-count-badge');
  if (!container) return;

  container.innerHTML = '';
  if (countBadge) countBadge.textContent = `${issues.length} audit facets`;

  if (issues.length === 0) {
    container.innerHTML = '<div class="text-stone-400 py-8 text-center font-mono text-xs">No audit findings recorded.</div>';
    return;
  }

  // Sort: Critical issues first, then improvements, then passed
  const order = { 'Critical': 0, 'Improvement': 1, 'Passed': 2 };
  const sorted = [...issues].sort((a, b) => {
    const oa = a.passed ? 2 : (order[a.severity] ?? 1);
    const ob = b.passed ? 2 : (order[b.severity] ?? 1);
    return oa - ob;
  });

  sorted.forEach(issue => {
    const card = document.createElement('div');
    card.id = `rec-${issue.id}`;
    card.className = 'p-4 rounded-xl stone-card transition-all duration-300';

    let statusPill = '';
    if (issue.passed) {
      statusPill = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-forest-100 dark:bg-forest-950/60 text-forest-800 dark:text-forest-300 border border-forest-300 dark:border-forest-800">● Optimal</span>`;
    } else if (issue.severity === 'Critical') {
      statusPill = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800">▲ Critical Deficit</span>`;
    } else {
      statusPill = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">▲ Improvement</span>`;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between gap-4 mb-2">
        <div>
          <div class="text-[10px] font-mono text-stone-400 uppercase tracking-wider">${issue.category} // ${issue.terrainRegion || 'TERRAIN'}</div>
          <h4 class="font-serif font-bold text-base text-stone-900 dark:text-stone-100">${escapeHtml(issue.name)}</h4>
        </div>
        <div>${statusPill}</div>
      </div>
      <p class="text-xs text-stone-600 dark:text-stone-300 mb-3">${escapeHtml(issue.status || issue.passedStatus)}</p>
      <div class="p-3 rounded-lg bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs font-mono text-stone-700 dark:text-stone-300">
        <strong class="text-stone-900 dark:text-stone-100">Prescription:</strong> ${escapeHtml(issue.fix)}
      </div>
    `;

    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// History Archive
// ---------------------------------------------------------------------------
function addToHistory(result) {
  if (!result || !result.url) return;

  // Filter existing URL
  appState.history = appState.history.filter(item => item.url !== result.url);

  appState.history.unshift({
    url: result.url,
    totalScore: result.scores?.total || 0,
    timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  });

  saveHistory();
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('history-container');
  if (!container) return;

  container.innerHTML = '';
  if (appState.history.length === 0) {
    container.innerHTML = '<div class="text-center py-8 font-mono text-xs text-stone-500">No prior surveys recorded in this workspace.</div>';
    return;
  }

  appState.history.forEach(item => {
    const row = document.createElement('div');
    row.className = 'p-3 rounded-xl stone-card flex items-center justify-between gap-4 hover:border-copper-500 transition-colors';
    row.innerHTML = `
      <div class="flex items-center gap-3 truncate">
        <div class="w-9 h-9 rounded-lg bg-stone-200 dark:bg-stone-800 flex items-center justify-center font-serif font-bold text-sm">
          ${item.totalScore}
        </div>
        <div class="truncate">
          <div class="font-serif font-bold text-sm text-stone-900 dark:text-stone-100 truncate">${escapeHtml(item.url)}</div>
          <div class="font-mono text-[10px] text-stone-500">${item.timestamp}</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="history-reload-btn px-2.5 py-1 rounded bg-copper-50 dark:bg-copper-950/40 text-copper-700 dark:text-copper-300 border border-copper-300 dark:border-copper-800 text-xs font-mono hover:bg-copper-100 transition-colors" data-url="${escapeHtml(item.url)}">
          Survey
        </button>
        <button class="history-delete-btn p-1 text-stone-400 hover:text-red-500 transition-colors text-xs" data-url="${escapeHtml(item.url)}">
          ✕
        </button>
      </div>
    `;

    row.querySelector('.history-reload-btn').addEventListener('click', () => {
      const input = document.getElementById('url-input');
      if (input) input.value = item.url;
      const launchBtn = document.getElementById('launch-btn');
      if (launchBtn) launchBtn.click();
    });

    row.querySelector('.history-delete-btn').addEventListener('click', () => {
      appState.history = appState.history.filter(h => h.url !== item.url);
      saveHistory();
      renderHistory();
    });

    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// PDF Report Generator (Editorial Terra Incognita Layout)
// ---------------------------------------------------------------------------
function downloadReport() {
  if (!appState.currentResult) {
    alert('Please run a survey on a website before generating a report.');
    return;
  }

  if (typeof window.jspdf === 'undefined') {
    alert('PDF export engine is currently loading. Please retry in a moment.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const result = appState.currentResult;
  const scores = result.scores || { total: 0, onPage: 0, technical: 0, content: 0, links: 0 };

  // Palette constants
  const cCharcoal = [28, 27, 24];
  const cCopper = [45, 99, 94];
  const cStone = [110, 105, 93];

  let y = 20;

  // Header Masthead
  doc.setFillColor(244, 241, 234);
  doc.rect(0, 0, 210, 36, 'F');

  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...cCharcoal);
  doc.text('TERRA INCOGNITA // GEOLOGICAL SEO SURVEY', 20, y);

  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...cStone);
  doc.text(`SURVEY TARGET: ${result.url}  |  DATE: ${new Date().toLocaleDateString()}`, 20, y + 8);

  y = 48;

  // Executive Score Box
  doc.setFillColor(250, 248, 244);
  doc.setDrawColor(216, 211, 199);
  doc.roundedRect(20, y, 170, 34, 2, 2, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...cCharcoal);
  doc.text(`${scores.total} / 100`, 28, y + 18);

  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...cCopper);
  doc.text('SUMMIT ELEVATION SCORE', 28, y + 26);

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...cStone);
  doc.text(`OnPage: ${scores.onPage}/40`, 110, y + 12);
  doc.text(`Technical: ${scores.technical}/30`, 110, y + 19);
  doc.text(`Content: ${scores.content}/20`, 150, y + 12);
  doc.text(`Links: ${scores.links}/10`, 150, y + 19);

  y += 44;

  // Key Metrics Table
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...cCharcoal);
  doc.text('1. TOPOGRAPHIC STRATA TELEMETRY', 20, y);
  y += 8;

  const metrics = [
    `Title Tag: "${result.title}" (${result.title === 'Missing' ? 0 : result.title.length} chars)`,
    `Meta Description: "${result.metaDesc}" (${result.metaDesc === 'Missing' ? 0 : result.metaDesc.length} chars)`,
    `Headings: H1: ${result.h1Count} tag(s)  |  H2: ${result.h2Count} section(s)`,
    `Page Word Depth: ${result.wordCount} words  |  Total Links: ${result.linkCount}`,
    `Mobile Viewport: ${result.hasViewport ? 'Present' : 'Missing'}  |  Robots.txt: ${result.robots?.found ? 'Found' : 'Not Found'}`
  ];

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...cCharcoal);
  metrics.forEach(m => {
    doc.text(`• ${m}`, 24, y);
    y += 6;
  });

  y += 6;

  // Architectural Issues & Fixes
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...cCharcoal);
  doc.text('2. ACTIONABLE ARCHITECTURAL PRESCRIPTIONS', 20, y);
  y += 8;

  const issues = result.issues || [];
  const deficits = issues.filter(i => !i.passed);

  if (deficits.length === 0) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(46, 91, 66);
    doc.text('✓ All audited structural facets meet optimal terrain parameters.', 24, y);
    y += 8;
  } else {
    deficits.forEach(d => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(d.severity === 'Critical' ? 143 : 184, 45, 45);
      doc.text(`[${d.severity || 'DEFICIT'}] ${d.name}`, 24, y);
      y += 5;

      doc.setFont('times', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...cCharcoal);
      doc.text(`Diagnosis: ${d.status || d.passedStatus}`, 26, y);
      y += 5;

      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...cCopper);
      doc.text(`Fix: ${d.fix}`, 26, y);
      y += 7;
    });
  }

  // Footer
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...cStone);
  doc.text('Generated via Terra Incognita Topographic SEO Intelligence Engine', 20, 290);

  const cleanDomain = result.url.replace(/^https?:\/\//i, '').replace(/[^a-zA-Z0-9]/g, '-');
  doc.save(`terra-incognita-survey-${cleanDomain}.pdf`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Initialization & Event Binding
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadStoredHistory();
  renderHistory();

  // Initialize 3D Mountain
  if (window.TerraMountain && window.TerraMountain.MountainViewer) {
    appState.mountainViewer = new window.TerraMountain.MountainViewer('mountain-canvas-container');
  }

  // Theme toggle button
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // PDF Download button
  const reportBtn = document.getElementById('download-report-btn');
  if (reportBtn) reportBtn.addEventListener('click', downloadReport);

  // Camera presets
  const presetSummit = document.getElementById('camera-preset-summit');
  if (presetSummit) presetSummit.addEventListener('click', () => appState.mountainViewer?.setPreset('summit'));

  const presetRidge = document.getElementById('camera-preset-ridge');
  if (presetRidge) presetRidge.addEventListener('click', () => appState.mountainViewer?.setPreset('ridge'));

  const presetOrtho = document.getElementById('camera-preset-ortho');
  if (presetOrtho) presetOrtho.addEventListener('click', () => appState.mountainViewer?.setPreset('ortho'));

  const resetBtn = document.getElementById('terrain-reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => appState.mountainViewer?.resetView());

  // Launch button
  const launchBtn = document.getElementById('launch-btn');
  const urlInput = document.getElementById('url-input');

  if (launchBtn && urlInput) {
    launchBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) {
        alert('Please enter a target domain or URL to survey.');
        urlInput.focus();
        return;
      }
      analyzeDomain(url);
    });

    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        launchBtn.click();
      }
    });
  }

  // Clear history button
  const clearHistBtn = document.getElementById('clear-history-btn');
  if (clearHistBtn) {
    clearHistBtn.addEventListener('click', () => {
      if (confirm('Clear all surveyed domains from archive?')) {
        appState.history = [];
        saveHistory();
        renderHistory();
      }
    });
  }
});
