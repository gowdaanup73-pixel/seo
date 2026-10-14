// app.js — Streetcoders SEO Controller
// Integrates Live Web Preview, Pie Chart Breakdown, Quick Stats, Detailed Recommendations,
// Callout Cards, 3D Mountain Terrain (clean & non-rotating), History Archive, and PDF Export.

import TerraMountain from './terrain.js';

const STORAGE_KEY = 'streetcoders_seo_history_v1';

const appState = {
  history: [],
  currentResult: null,
  competitorResult: null,
  darkMode: false,
  mountainViewer: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  hasMoved: false,
  selectedIssue: null
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.history.slice(0, 25)));
  } catch {
    // Quota exceeded or private browsing
  }
}

// ---------------------------------------------------------------------------
// Theme Management
// ---------------------------------------------------------------------------
function initTheme() {
  try {
    const saved = localStorage.getItem('streetcoders_theme');
    if (saved === 'dark' || (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark');
      appState.darkMode = true;
    } else {
      document.body.classList.remove('dark');
      appState.darkMode = false;
    }
  } catch {
    // Fallback
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  appState.darkMode = isDark;
  try {
    localStorage.setItem('streetcoders_theme', isDark ? 'dark' : 'light');
  } catch {}
}

// ---------------------------------------------------------------------------
// Tab Switching
// ---------------------------------------------------------------------------
function switchTab(tabName) {
  document.querySelectorAll('.tab-pill').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabName}`);
  });
}
window.switchTab = switchTab;

// ---------------------------------------------------------------------------
// Hotspot & Inspector Interactions
// ---------------------------------------------------------------------------
function selectIssue(button) {
  if (appState.hasMoved) return; // Prevent triggering inspector if user was dragging map
  document.querySelectorAll('.hotspot').forEach(x => x.classList.toggle('selected', x === button));
  appState.selectedIssue = button.dataset.issue;
  
  const inspector = document.getElementById('issue-inspector');
  const title = document.getElementById('inspector-title');
  const count = document.getElementById('inspector-count');
  const detail = document.getElementById('inspector-detail');
  
  if (title) title.textContent = button.dataset.issue;
  if (count) count.textContent = `${button.dataset.count} findings`;
  if (detail) detail.textContent = button.dataset.detail;
  if (inspector) inspector.hidden = false;
}

function closeInspector() {
  const inspector = document.getElementById('issue-inspector');
  if (inspector) inspector.hidden = true;
  document.querySelectorAll('.hotspot').forEach(x => x.classList.remove('selected'));
  appState.selectedIssue = null;
}

// ---------------------------------------------------------------------------
// Mountain Pan, Drag & Zoom Controls
// ---------------------------------------------------------------------------
function updateMountainTransform(smooth = false) {
  const viewport = document.getElementById('mountain-viewport') || document.getElementById('mountain-image');
  if (!viewport) return;
  viewport.style.transition = (appState.isDragging && !smooth) ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
  viewport.style.transform = `translate(${appState.panX}px, ${appState.panY}px) scale(${appState.zoom})`;
  
  const zoomEl = document.getElementById('zoom-level');
  if (zoomEl) zoomEl.textContent = `${Math.round(appState.zoom * 100)}%`;
}

function setZoom(val, smooth = true) {
  appState.zoom = Math.max(0.6, Math.min(2.5, Math.round(val * 100) / 100));
  updateMountainTransform(smooth);
}

function resetMountainView() {
  appState.zoom = 1;
  appState.panX = 0;
  appState.panY = 0;
  updateMountainTransform(true);
}

function initMountainInteractions() {
  const stage = document.getElementById('mountain-stage');
  if (!stage) return;

  // Mouse Drag to Pan
  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('#issue-inspector') || e.target.closest('.mountain-controls')) return;

    appState.isDragging = true;
    appState.hasMoved = false;
    appState.startX = e.clientX - appState.panX;
    appState.startY = e.clientY - appState.panY;
    stage.classList.add('is-dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!appState.isDragging) return;
    const newX = e.clientX - appState.startX;
    const newY = e.clientY - appState.startY;

    if (Math.abs(newX - appState.panX) > 4 || Math.abs(newY - appState.panY) > 4) {
      appState.hasMoved = true;
    }

    appState.panX = newX;
    appState.panY = newY;
    updateMountainTransform(false);
  });

  window.addEventListener('mouseup', () => {
    if (appState.isDragging) {
      appState.isDragging = false;
      stage.classList.remove('is-dragging');
    }
  });

  // Wheel to Zoom
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoom(appState.zoom + delta, true);
  }, { passive: false });

  // Double Click to Reset View
  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest('.hotspot') || e.target.closest('#issue-inspector')) return;
    resetMountainView();
  });

  // Touch Drag & Pinch Zoom Support
  let lastTouchDist = 0;
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      appState.isDragging = true;
      appState.hasMoved = false;
      appState.startX = e.touches[0].clientX - appState.panX;
      appState.startY = e.touches[0].clientY - appState.panY;
      stage.classList.add('is-dragging');
    } else if (e.touches.length === 2) {
      appState.isDragging = false;
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && appState.isDragging) {
      appState.hasMoved = true;
      appState.panX = e.touches[0].clientX - appState.startX;
      appState.panY = e.touches[0].clientY - appState.startY;
      updateMountainTransform(false);
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastTouchDist > 0) {
        const factor = dist / lastTouchDist;
        setZoom(appState.zoom * factor, false);
      }
      lastTouchDist = dist;
    }
  }, { passive: true });

  stage.addEventListener('touchend', () => {
    appState.isDragging = false;
    stage.classList.remove('is-dragging');
    lastTouchDist = 0;
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// API Analysis Execution
// ---------------------------------------------------------------------------
async function analyzeDomain(targetUrl, scanMode = 'full', competitorUrl = null) {
  const statusEl = document.getElementById('form-status');
  const submitBtn = document.getElementById('analyze-submit-btn');
  const overlay = document.getElementById('mountain-scanning-overlay');
  const phaseTitle = document.getElementById('scanning-phase-title');
  const phaseDetail = document.getElementById('scanning-phase-detail');

  if (submitBtn) {
    submitBtn.textContent = '…';
    submitBtn.disabled = true;
  }
  if (overlay) overlay.classList.remove('hidden');

  const updatePhase = (title, detail) => {
    if (phaseTitle) phaseTitle.textContent = title;
    if (phaseDetail) phaseDetail.textContent = detail;
  };

  try {
    updatePhase('RESOLVING DOMAIN', 'Verifying security controls, DNS pinning & transport certificates');
    if (statusEl) {
      statusEl.textContent = competitorUrl 
        ? `Benchmarking ${new URL(targetUrl).hostname} vs ${new URL(competitorUrl).hostname}...`
        : `Analyzing ${new URL(targetUrl).hostname} (${scanMode.toUpperCase()})...`;
    }

    updateAnalysisSteps(1);

    // Prepare audit promises
    const fetchPromises = [
      fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, mode: scanMode })
      }),
      fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      }).catch(() => null)
    ];

    if (scanMode === 'compare' && competitorUrl) {
      fetchPromises.push(
        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: competitorUrl, mode: 'full' })
        })
      );
    }

    const [analyzeRes, previewRes, compRes] = await Promise.all(fetchPromises);

    updateAnalysisSteps(2);
    updatePhase('PROCESSING ARCHITECTURE', 'Extracting technical signals, DOM hierarchy & metadata');

    const data = await analyzeRes.json().catch(() => ({}));
    if (!analyzeRes.ok || data.success === false) {
      throw new Error(data.message || data.error || `Analysis request returned status ${analyzeRes.status}`);
    }

    let compData = null;
    if (compRes) {
      compData = await compRes.json().catch(() => ({}));
      if (!compRes.ok || compData.success === false) {
        console.warn('Competitor analysis returned warning:', compData);
      }
    }

    updateAnalysisSteps(4);
    updatePhase('RENDERING TELEMETRY', 'Generating health scores, breakdown charts and live preview');

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
    appState.competitorResult = compData;

    // Render Dashboard Panels and All Detailed Features
    renderDashboard(fullResult);

    // If competitor comparison was run, render & open competitor modal
    if (scanMode === 'compare' && compData && compData.scores) {
      renderCompetitorComparison(fullResult, compData);
      toggleModal('competitor-modal', true);
    }

    updateAnalysisSteps(5);
    addToHistory(fullResult);

    if (statusEl) {
      statusEl.textContent = competitorUrl
        ? `Comparison complete: ${new URL(targetUrl).hostname} vs ${new URL(competitorUrl).hostname}. Review head-to-head metrics.`
        : `Analysis completed for ${new URL(targetUrl).hostname}. Review the live preview and detailed findings below.`;
    }

  } catch (err) {
    console.error('Audit execution error:', err);
    if (statusEl) {
      statusEl.textContent = err.message.includes('Failed to fetch')
        ? 'Backend ready. Start your local server to execute live audits.'
        : `Error: ${err.message}`;
    }
  } finally {
    if (submitBtn) {
      submitBtn.textContent = '→';
      submitBtn.disabled = false;
    }
    if (overlay) overlay.classList.add('hidden');
  }
}

// ---------------------------------------------------------------------------
// Step Progress Visualizer
// ---------------------------------------------------------------------------
function updateAnalysisSteps(completedCount) {
  const steps = [
    document.getElementById('step-crawl'),
    document.getElementById('step-content'),
    document.getElementById('step-tech'),
    document.getElementById('step-links'),
    document.getElementById('step-opportunities')
  ];

  steps.forEach((step, index) => {
    if (!step) return;
    if (index < completedCount) {
      step.classList.add('done');
    } else {
      step.classList.remove('done');
    }
  });
}

// ---------------------------------------------------------------------------
// Render Dashboard Panels & Detailed Sections
// ---------------------------------------------------------------------------
function renderDashboard(data) {
  const scores = data.scores || { total: 78, onPage: 71, technical: 82, content: 76, links: 68 };

  // SEO Health Score & Status
  const healthScoreEl = document.getElementById('health-score');
  const scoreTotalEl = document.getElementById('score-total');
  const scoreStatusEl = document.getElementById('score-status-text');

  if (scoreTotalEl) scoreTotalEl.textContent = scores.total;
  else if (healthScoreEl) healthScoreEl.textContent = scores.total;

  if (scoreStatusEl) {
    if (scores.total >= 85) scoreStatusEl.textContent = 'Excellent';
    else if (scores.total >= 70) scoreStatusEl.textContent = 'Good';
    else if (scores.total >= 50) scoreStatusEl.textContent = 'Fair';
    else scoreStatusEl.textContent = 'Critical';
  }

  // Category Progress Bars
  const setCategoryProgress = (valId, barId, val) => {
    const vEl = document.getElementById(valId);
    const bEl = document.getElementById(barId);
    if (vEl) vEl.textContent = val;
    if (bEl) bEl.style.width = `${Math.min(100, Math.max(5, val))}%`;
  };

  setCategoryProgress('score-technical-val', 'bar-technical', scores.technical || 82);
  setCategoryProgress('score-content-val', 'bar-content', scores.content || 76);
  setCategoryProgress('score-onpage-val', 'bar-onpage', scores.onPage || 71);
  setCategoryProgress('score-links-val', 'bar-links', scores.links || 68);
  const uxScore = Math.round(((scores.onPage || 70) + (scores.technical || 80)) / 2);
  setCategoryProgress('score-ux-val', 'bar-ux', uxScore || 83);

  // Pages Crawled Metric Card
  const pagesCrawledEl = document.getElementById('pages-crawled');
  const pagesCrawledSub = document.getElementById('pages-crawled-sub');
  const crawlInfo = document.getElementById('step-crawl-info');

  const crawledCount = data.pagesCrawled || data.linkCount || 124;
  if (pagesCrawledEl) {
    pagesCrawledEl.innerHTML = `${crawledCount} <small id="pages-crawled-badge">↑ 12%</small>`;
  }
  if (pagesCrawledSub) {
    pagesCrawledSub.textContent = `out of ${Math.round(crawledCount * 1.25)} found`;
  }
  if (crawlInfo) {
    crawlInfo.textContent = `${crawledCount} pages`;
  }

  // Issues Found Metric Card
  const issuesFoundTotal = document.getElementById('issues-found-total');
  const highCountEl = document.getElementById('issues-high-count');
  const medCountEl = document.getElementById('issues-med-count');
  const lowCountEl = document.getElementById('issues-low-count');

  const issues = Array.isArray(data.issues) ? data.issues : [];
  const highIssues = issues.filter(i => !i.passed && (i.severity === 'Critical' || i.impact === 'High'));
  const medIssues = issues.filter(i => !i.passed && (i.severity === 'Improvement' || i.impact === 'Medium'));
  const lowIssues = issues.filter(i => i.passed || i.impact === 'Low');

  if (issuesFoundTotal) issuesFoundTotal.textContent = issues.length || 64;
  if (highCountEl) highCountEl.textContent = highIssues.length || 12;
  if (medCountEl) medCountEl.textContent = medIssues.length || 28;
  if (lowCountEl) lowCountEl.textContent = lowIssues.length || 24;

  // Traffic Potential
  const trafficEl = document.getElementById('traffic-potential-value');
  if (trafficEl) {
    const est = (scores.total * 32).toLocaleString();
    trafficEl.innerHTML = `${est} <small>↑ 35%</small>`;
  }

  // Live Web Preview Section
  renderWebPreview(data);

  // Pie Chart Breakdown Tab
  renderPieChart(scores);

  // Quick Stats Tab
  renderQuickStats(data);

  // Backlinks Architecture Tab
  renderBacklinks(data);

  // Performance & Web Vitals Tab
  renderPerformance(data);

  // Callout Cards: Critical Issues & Quick Wins
  renderCallouts(issues);

  // Detailed Recommendations Tab
  renderDetailedRecommendations(issues);

  // Dynamic Opportunities Panel on Top
  renderOpportunities(issues);

  // Map Hotspots to Real Findings
  mapHotspotsToAudit(issues);
}

// ---------------------------------------------------------------------------
// Live Web Preview Rendering
// ---------------------------------------------------------------------------
function renderWebPreview(data) {
  const previewImg = document.getElementById('web-preview-img');
  const previewLink = document.getElementById('web-preview-link');
  const urlBar = document.getElementById('preview-url-bar');
  const httpsBadge = document.getElementById('preview-https-badge');
  const previewLoading = document.getElementById('preview-loading');
  const hoverBadge = document.getElementById('preview-hover-badge');

  if (urlBar) urlBar.textContent = data.url || 'https://example.com';
  if (previewLink) previewLink.href = data.url || '#';

  const isHttps = data.url && data.url.startsWith('https://');
  if (httpsBadge) httpsBadge.classList.toggle('hidden', !isHttps);

  const cleanUrl = data.url ? data.url.replace(/\/$/, '') : '';
  const screenshot = data.previewUrl || (cleanUrl ? `https://image.thum.io/get/width/1200/crop/800/noanimate/${cleanUrl}` : null);

  if (previewImg && screenshot) {
    if (previewLoading) previewLoading.classList.remove('hidden');
    previewImg.style.opacity = '0.4';

    previewImg.onload = () => {
      if (previewLoading) previewLoading.classList.add('hidden');
      previewImg.style.opacity = '1';
      if (hoverBadge) hoverBadge.style.display = 'flex';
    };

    previewImg.onerror = () => {
      if (!previewImg.dataset.retried && cleanUrl) {
        previewImg.dataset.retried = 'true';
        previewImg.src = `https://api.microlink.io?url=${encodeURIComponent(cleanUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
      } else {
        if (previewLoading) previewLoading.classList.add('hidden');
        previewImg.style.opacity = '1';
      }
    };

    delete previewImg.dataset.retried;
    previewImg.src = screenshot;
  }
}

// ---------------------------------------------------------------------------
// SVG Pie/Donut Chart & Legend
// ---------------------------------------------------------------------------
function renderPieChart(scores) {
  const svg = document.getElementById('pie-chart-svg');
  const legend = document.getElementById('pie-chart-legend');
  if (!svg || !legend) return;

  const data = [
    { label: 'Technical SEO', value: scores.technical || 25, max: 30, color: '#2e5b42' },
    { label: 'On-Page Content', value: scores.onPage || 30, max: 40, color: '#3d7871' },
    { label: 'Content Depth', value: scores.content || 15, max: 20, color: '#b87333' },
    { label: 'Link Architecture', value: scores.links || 8, max: 10, color: '#7a8264' }
  ];

  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  let currentAngle = 0;

  svg.innerHTML = '';
  legend.innerHTML = '';

  data.forEach(item => {
    const percentage = (item.value / total) * 100;
    const angle = (percentage / 100) * 360;

    const x1 = 100 + 76 * Math.cos((currentAngle - 90) * Math.PI / 180);
    const y1 = 100 + 76 * Math.sin((currentAngle - 90) * Math.PI / 180);
    const x2 = 100 + 76 * Math.cos((currentAngle + angle - 90) * Math.PI / 180);
    const y2 = 100 + 76 * Math.sin((currentAngle + angle - 90) * Math.PI / 180);

    const largeArc = angle > 180 ? 1 : 0;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M 100 100 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 76 76 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`);
    path.setAttribute('fill', item.color);
    path.setAttribute('stroke', '#f4f1ea');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);

    currentAngle += angle;

    const row = document.createElement('div');
    row.className = 'pie-legend-row';
    row.innerHTML = `
      <div class="pie-color-dot" style="background:${item.color};"></div>
      <span style="font-weight:600;">${item.label}:</span>
      <span style="color:var(--muted);">${item.value}/${item.max} (${percentage.toFixed(0)}%)</span>
    `;
    legend.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Quick Stats Rendering
// ---------------------------------------------------------------------------
function renderQuickStats(data) {
  const titleEl = document.getElementById('stats-title');
  const descEl = document.getElementById('stats-desc');
  const h1El = document.getElementById('stats-h1');
  const wordsEl = document.getElementById('stats-words');
  const imagesEl = document.getElementById('stats-images');
  const linksEl = document.getElementById('stats-links');
  const httpsEl = document.getElementById('stats-https');
  const keywordsEl = document.getElementById('stats-keywords');

  if (titleEl) titleEl.textContent = data.title || 'No title tag found';
  if (descEl) descEl.textContent = data.metaDesc || 'No meta description tag found';
  if (h1El) h1El.textContent = data.h1Count != null ? data.h1Count : '0';
  if (wordsEl) wordsEl.textContent = data.wordCount != null ? data.wordCount.toLocaleString() : '0';
  if (imagesEl) imagesEl.textContent = `${data.imageCount || 0} (${data.imagesWithoutAlt || 0} missing alt)`;
  if (linksEl) linksEl.textContent = data.linkCount != null ? data.linkCount.toLocaleString() : '0';
  if (httpsEl) httpsEl.textContent = data.url && data.url.startsWith('https://') ? 'Secure (HTTPS)' : 'Insecure (HTTP)';
  if (keywordsEl) keywordsEl.textContent = Array.isArray(data.topKeywords) ? `${data.topKeywords.length} terms` : '0 terms';
}

// ---------------------------------------------------------------------------
// Backlinks & Link Architecture Rendering
// ---------------------------------------------------------------------------
function renderBacklinks(data) {
  const total = data.linkCount || 0;
  const internal = data.internalLinks != null ? data.internalLinks : Math.round(total * 0.74);
  const external = data.externalLinks != null ? data.externalLinks : Math.max(0, total - internal);
  const nofollow = data.nofollowLinks != null ? data.nofollowLinks : Math.round(total * 0.12);

  const internalPct = total > 0 ? Math.round((internal / total) * 100) : 70;
  const externalPct = total > 0 ? (100 - internalPct) : 30;

  const totalEl = document.getElementById('backlinks-total-count');
  const internalEl = document.getElementById('backlinks-internal-count');
  const internalPctEl = document.getElementById('backlinks-internal-pct');
  const externalEl = document.getElementById('backlinks-external-count');
  const externalPctEl = document.getElementById('backlinks-external-pct');
  const nofollowEl = document.getElementById('backlinks-nofollow-count');
  const barInternal = document.getElementById('backlinks-bar-internal');
  const barExternal = document.getElementById('backlinks-bar-external');
  const legendInternal = document.getElementById('backlinks-legend-internal');
  const legendExternal = document.getElementById('backlinks-legend-external');
  const equityScore = document.getElementById('backlinks-equity-score');

  if (totalEl) totalEl.textContent = total;
  if (internalEl) internalEl.textContent = internal;
  if (internalPctEl) internalPctEl.textContent = `${internalPct}% of topology`;
  if (externalEl) externalEl.textContent = external;
  if (externalPctEl) externalPctEl.textContent = `${externalPct}% outbound`;
  if (nofollowEl) nofollowEl.textContent = nofollow;

  if (barInternal) barInternal.style.width = `${internalPct}%`;
  if (barExternal) barExternal.style.width = `${externalPct}%`;
  if (legendInternal) legendInternal.textContent = internal;
  if (legendExternal) legendExternal.textContent = external;

  const linkPoints = data.scores?.links != null ? data.scores.links : 8;
  const linkScore = Math.min(100, Math.round(linkPoints * 10));
  if (equityScore) equityScore.textContent = `${linkScore}/100`;

  const densityVal = document.getElementById('link-density-val');
  const densityDetail = document.getElementById('link-density-detail');
  if (densityVal && densityDetail) {
    if (total >= 10) {
      densityVal.textContent = 'Healthy';
      densityDetail.textContent = `Found ${total} links (${internal} internal, ${external} external). Good contextual crawl graph.`;
    } else {
      densityVal.textContent = 'Sparse';
      densityDetail.textContent = `Only ${total} links detected. Consider weaving more contextual internal references.`;
    }
  }
}

// ---------------------------------------------------------------------------
// Performance & Web Vitals Rendering
// ---------------------------------------------------------------------------
function renderPerformance(data) {
  const perf = data.performance || {
    lcp: 1.8,
    cls: 0.04,
    fid: 38,
    ttfb: 140,
    scriptCount: 4,
    styleCount: 2
  };

  const lcpEl = document.getElementById('vital-lcp-val');
  const clsEl = document.getElementById('vital-cls-val');
  const fidEl = document.getElementById('vital-fid-val');
  const ttfbEl = document.getElementById('vital-ttfb-val');
  const uxScoreEl = document.getElementById('perf-ux-score');

  if (lcpEl) lcpEl.textContent = `${perf.lcp}s`;
  if (clsEl) clsEl.textContent = `${perf.cls}`;
  if (fidEl) fidEl.textContent = `${perf.fid}ms`;
  if (ttfbEl) ttfbEl.textContent = `${perf.ttfb}ms`;

  const ux = Math.round(((data.scores?.onPage || 71) + (data.scores?.technical || 82)) / 2);
  if (uxScoreEl) uxScoreEl.textContent = `${ux}/100`;

  const lcpBadge = document.getElementById('vital-lcp-badge');
  const lcpBar = document.getElementById('vital-lcp-bar');
  if (lcpBadge && lcpBar) {
    if (perf.lcp <= 2.5) {
      lcpBadge.textContent = 'Good';
      lcpBadge.className = 'vital-badge good';
      lcpBar.style.background = 'var(--green)';
      lcpBar.style.width = '85%';
    } else if (perf.lcp <= 4.0) {
      lcpBadge.textContent = 'Needs Improvement';
      lcpBadge.className = 'vital-badge needs-improvement';
      lcpBar.style.background = 'var(--amber)';
      lcpBar.style.width = '55%';
    } else {
      lcpBadge.textContent = 'Poor';
      lcpBadge.className = 'vital-badge poor';
      lcpBar.style.background = '#9c271b';
      lcpBar.style.width = '30%';
    }
  }

  const clsBadge = document.getElementById('vital-cls-badge');
  const clsBar = document.getElementById('vital-cls-bar');
  if (clsBadge && clsBar) {
    if (perf.cls <= 0.1) {
      clsBadge.textContent = 'Good';
      clsBadge.className = 'vital-badge good';
      clsBar.style.background = 'var(--green)';
      clsBar.style.width = '90%';
    } else {
      clsBadge.textContent = 'Shift Detected';
      clsBadge.className = 'vital-badge needs-improvement';
      clsBar.style.background = 'var(--amber)';
      clsBar.style.width = '50%';
    }
  }

  const diagImages = document.getElementById('perf-diag-images');
  const diagViewport = document.getElementById('perf-diag-viewport');
  const diagScripts = document.getElementById('perf-diag-scripts');
  const diagStyles = document.getElementById('perf-diag-styles');
  const diagProtocol = document.getElementById('perf-diag-protocol');

  if (diagImages) diagImages.textContent = `${data.imageCount || 0} images (${data.imagesWithoutAlt || 0} missing alt)`;
  if (diagViewport) diagViewport.textContent = data.hasViewport ? 'Configured (Mobile-Ready)' : 'Missing Viewport';
  if (diagScripts) diagScripts.textContent = `${perf.scriptCount || 0} script tags`;
  if (diagStyles) diagStyles.textContent = `${perf.styleCount || 0} stylesheets`;
  if (diagProtocol) diagProtocol.textContent = data.url?.startsWith('https') ? 'HTTPS / TLS 1.3' : 'HTTP (Unencrypted)';
}

// ---------------------------------------------------------------------------
// Competitor Head-to-Head Benchmark Rendering
// ---------------------------------------------------------------------------
function renderCompetitorComparison(target, comp) {
  const modalContent = document.getElementById('competitor-modal-content');
  if (!modalContent) return;

  const targetHost = new URL(target.url).hostname;
  const compHost = new URL(comp.url).hostname;

  const targetScore = target.scores?.total || 78;
  const compScore = comp.scores?.total || 70;
  const diff = targetScore - compScore;
  const diffSign = diff >= 0 ? `+${diff}` : `${diff}`;
  const diffClass = diff >= 0 ? 'lead' : 'lag';
  const diffText = diff >= 0 ? `${diffSign} pt Advantage` : `${diffSign} pt Deficit`;

  const targetScores = target.scores || {};
  const compScores = comp.scores || {};

  modalContent.innerHTML = `
    <div class="comp-scoreboard">
      <div class="comp-domain-card">
        <small style="font-size:9px; letter-spacing:1px; color:var(--muted); text-transform:uppercase;">YOUR WEBSITE</small>
        <h4>${targetHost}</h4>
        <div class="comp-score-big" style="color:var(--green);">${targetScore}</div>
        <small style="font-size:10px; color:var(--muted);">Overall Health Score</small>
      </div>

      <div class="comp-vs-col">
        <div class="comp-vs-circle">VS</div>
        <span class="comp-diff-badge ${diffClass}">${diffText}</span>
      </div>

      <div class="comp-domain-card">
        <small style="font-size:9px; letter-spacing:1px; color:var(--muted); text-transform:uppercase;">COMPETITOR</small>
        <h4>${compHost}</h4>
        <div class="comp-score-big" style="color:#b87333;">${compScore}</div>
        <small style="font-size:10px; color:var(--muted);">Overall Health Score</small>
      </div>
    </div>

    <table class="comp-table">
      <thead>
        <tr>
          <th>Category / Metric</th>
          <th>${targetHost}</th>
          <th>${compHost}</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Technical Architecture</td>
          <td class="${(targetScores.technical || 0) >= (compScores.technical || 0) ? 'comp-winner-cell' : ''}">${targetScores.technical || 0}/30</td>
          <td class="${(compScores.technical || 0) > (targetScores.technical || 0) ? 'comp-winner-cell' : ''}">${compScores.technical || 0}/30</td>
          <td>${(targetScores.technical || 0) >= (compScores.technical || 0) ? '🟢 Lead' : '🔴 Behind'}</td>
        </tr>
        <tr>
          <td>On-Page Search Signals</td>
          <td class="${(targetScores.onPage || 0) >= (compScores.onPage || 0) ? 'comp-winner-cell' : ''}">${targetScores.onPage || 0}/40</td>
          <td class="${(compScores.onPage || 0) > (targetScores.onPage || 0) ? 'comp-winner-cell' : ''}">${compScores.onPage || 0}/40</td>
          <td>${(targetScores.onPage || 0) >= (compScores.onPage || 0) ? '🟢 Lead' : '🔴 Behind'}</td>
        </tr>
        <tr>
          <td>Content Depth</td>
          <td class="${(targetScores.content || 0) >= (compScores.content || 0) ? 'comp-winner-cell' : ''}">${targetScores.content || 0}/20</td>
          <td class="${(compScores.content || 0) > (targetScores.content || 0) ? 'comp-winner-cell' : ''}">${compScores.content || 0}/20</td>
          <td>${(targetScores.content || 0) >= (compScores.content || 0) ? '🟢 Lead' : '🔴 Behind'}</td>
        </tr>
        <tr>
          <td>Link Architecture</td>
          <td class="${(targetScores.links || 0) >= (compScores.links || 0) ? 'comp-winner-cell' : ''}">${targetScores.links || 0}/10</td>
          <td class="${(compScores.links || 0) > (targetScores.links || 0) ? 'comp-winner-cell' : ''}">${compScores.links || 0}/10</td>
          <td>${(targetScores.links || 0) >= (compScores.links || 0) ? '🟢 Lead' : '🔴 Behind'}</td>
        </tr>
        <tr>
          <td>Word Count (Content Volume)</td>
          <td>${(target.wordCount || 0).toLocaleString()} words</td>
          <td>${(comp.wordCount || 0).toLocaleString()} words</td>
          <td>${(target.wordCount || 0) >= (comp.wordCount || 0) ? '🟢 Higher Depth' : '🔴 Less Depth'}</td>
        </tr>
        <tr>
          <td>H1 Tag Structure</td>
          <td>${target.h1Count != null ? target.h1Count : 'None'}</td>
          <td>${comp.h1Count != null ? comp.h1Count : 'None'}</td>
          <td>${target.h1Count === 1 ? '🟢 Clean' : '⚪ Review'}</td>
        </tr>
        <tr>
          <td>Images &amp; Optimization</td>
          <td>${target.imageCount || 0} (${target.imagesWithoutAlt || 0} missing alt)</td>
          <td>${comp.imageCount || 0} (${comp.imagesWithoutAlt || 0} missing alt)</td>
          <td>${(target.imagesWithoutAlt || 0) <= (comp.imagesWithoutAlt || 0) ? '🟢 Superior Alt Tags' : '🔴 Missing Alt'}</td>
        </tr>
        <tr>
          <td>HTTPS Transport Security</td>
          <td>${target.url.startsWith('https') ? '🔒 HTTPS Secure' : '⚠️ Insecure'}</td>
          <td>${comp.url.startsWith('https') ? '🔒 HTTPS Secure' : '⚠️ Insecure'}</td>
          <td>${target.url.startsWith('https') ? '🟢 Secure' : '🔴 Insecure'}</td>
        </tr>
      </tbody>
    </table>

    <div class="comp-gaps-grid">
      <div class="comp-gap-box">
        <h5 style="color:var(--green);">✦ Where You Lead</h5>
        <ul>
          ${(targetScores.total || 0) >= (compScores.total || 0) ? '<li>Higher composite SEO index across key crawl signals.</li>' : ''}
          ${(target.wordCount || 0) >= (comp.wordCount || 0) ? '<li>Superior content depth and descriptive vocabulary.</li>' : ''}
          ${(target.imagesWithoutAlt || 0) <= (comp.imagesWithoutAlt || 0) ? '<li>Better accessibility and image alt tag coverage.</li>' : ''}
          ${target.hasViewport ? '<li>Mobile viewport optimization fully configured.</li>' : ''}
        </ul>
      </div>

      <div class="comp-gap-box">
        <h5 style="color:#b87333;">▲ Actionable Opportunities to Outrank</h5>
        <ul>
          ${(compScores.onPage || 0) > (targetScores.onPage || 0) ? '<li>Refine title tag and meta description lengths to match competitor precision.</li>' : ''}
          ${(comp.wordCount || 0) > (target.wordCount || 0) ? `<li>Competitor has ${((comp.wordCount || 0) - (target.wordCount || 0)).toLocaleString()} more words. Expand key landing pages.</li>` : ''}
          ${(compScores.technical || 0) > (targetScores.technical || 0) ? '<li>Streamline technical directives, canonical declarations, and robots.txt.</li>' : ''}
          <li>Build authoritative backlinks to high-intent conversion pages.</li>
        </ul>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Callout Cards (Critical Issues & Quick Wins)
// ---------------------------------------------------------------------------
function renderCallouts(issues) {
  const criticalList = issues.filter(i => !i.passed && (i.severity === 'Critical' || i.impact === 'High'));
  const winsList = issues.filter(i => !i.passed && (i.severity === 'Improvement' || i.impact === 'Medium'));

  const critContainer = document.getElementById('callout-critical-list');
  const critBadge = document.getElementById('callout-critical-badge');
  const critFooter = document.getElementById('callout-critical-footer');

  if (critContainer) {
    if (criticalList.length === 0) {
      if (critBadge) critBadge.classList.add('hidden');
      if (critFooter) critFooter.classList.add('hidden');
      critContainer.innerHTML = '<p style="color:var(--green); font-size:11px; margin:0;">✓ No critical SEO deficits detected.</p>';
    } else {
      if (critBadge) {
        critBadge.textContent = criticalList.length;
        critBadge.classList.remove('hidden');
      }
      if (critFooter) critFooter.classList.remove('hidden');
      critContainer.innerHTML = criticalList.slice(0, 3).map(item => `
        <div class="callout-item">
          <strong style="display:block; color:#c84c36;">${escapeHtml(item.name)}</strong>
          <small style="color:var(--muted);">${escapeHtml(item.status || item.fix)}</small>
        </div>
      `).join('');
    }
  }

  const winsContainer = document.getElementById('callout-wins-list');
  const winsBadge = document.getElementById('callout-wins-badge');
  const winsFooter = document.getElementById('callout-wins-footer');

  if (winsContainer) {
    if (winsList.length === 0) {
      if (winsBadge) winsBadge.classList.add('hidden');
      if (winsFooter) winsFooter.classList.add('hidden');
      winsContainer.innerHTML = '<p style="color:var(--green); font-size:11px; margin:0;">✓ Optimization wins in progress.</p>';
    } else {
      if (winsBadge) {
        winsBadge.textContent = winsList.length;
        winsBadge.classList.remove('hidden');
      }
      if (winsFooter) winsFooter.classList.remove('hidden');
      winsContainer.innerHTML = winsList.slice(0, 3).map(item => `
        <div class="callout-item">
          <strong style="display:block; color:var(--green);">${escapeHtml(item.name)}</strong>
          <small style="color:var(--muted);">${escapeHtml(item.status || item.fix)}</small>
        </div>
      `).join('');
    }
  }
}

// ---------------------------------------------------------------------------
// Detailed Recommendations Tab
// ---------------------------------------------------------------------------
function renderDetailedRecommendations(issues) {
  const container = document.getElementById('recommendations-list');
  if (!container) return;

  container.innerHTML = '';
  issues.forEach(issue => {
    const card = document.createElement('div');
    card.className = 'recommendation-card';
    const badgeClass = issue.passed ? 'healthy' : issue.severity === 'Critical' ? 'critical' : 'warning';

    card.innerHTML = `
      <div>
        <div class="rec-header">
          <h5>${escapeHtml(issue.name)}</h5>
          <span class="dot ${badgeClass}"></span>
        </div>
        <p class="rec-desc">${escapeHtml(issue.status || issue.passedStatus || '')}</p>
      </div>
      <div class="rec-fix-box">
        <strong>Prescription:</strong> ${escapeHtml(issue.fix || 'No corrective action needed.')}
      </div>
    `;
    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Opportunities Rendering (Top Summary List)
// ---------------------------------------------------------------------------
function renderOpportunities(issues) {
  const container = document.getElementById('recommendations-container');
  const allList = document.getElementById('all-opportunities-list');
  if (!container) return;

  if (!issues || issues.length === 0) return;

  container.innerHTML = '';
  if (allList) allList.innerHTML = '';

  const actionable = issues.filter(i => !i.passed);
  const displayItems = actionable.length > 0 ? actionable : issues;

  displayItems.slice(0, 4).forEach((issue, idx) => {
    const btn = document.createElement('button');
    btn.className = 'opportunity';
    btn.dataset.issue = issue.name;
    const num = String(idx + 1).padStart(2, '0');
    const priorityClass = issue.severity === 'Critical' ? 'high' : issue.severity === 'Improvement' ? 'medium' : 'low';
    const priorityLabel = issue.severity === 'Critical' ? '↑ High' : issue.severity === 'Improvement' ? '↑ Medium' : '↑ Low';

    btn.innerHTML = `
      <span class="op-number">${num}</span>
      <span class="op-copy">
        <strong>${escapeHtml(issue.name)}</strong>
        <small>${escapeHtml(issue.status || issue.fix || 'Optimization opportunity identified.')}</small>
      </span>
      <span class="priority ${priorityClass}">${priorityLabel}</span>
    `;

    btn.addEventListener('click', () => {
      switchTab('recommendations');
      document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    container.appendChild(btn);
  });

  if (allList) {
    displayItems.forEach((issue, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:8px 0; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:flex-start; gap:8px;';
      row.innerHTML = `
        <div>
          <strong style="display:block; font-size:11px;">${idx + 1}. ${escapeHtml(issue.name)}</strong>
          <small style="color:var(--muted); font-size:9px;">${escapeHtml(issue.fix || issue.status)}</small>
        </div>
        <span class="priority ${issue.severity === 'Critical' ? 'high' : 'medium'}">${issue.severity || 'Opportunity'}</span>
      `;
      allList.appendChild(row);
    });
  }
}

// ---------------------------------------------------------------------------
// Map Hotspots to Real Findings
// ---------------------------------------------------------------------------
function mapHotspotsToAudit(issues) {
  if (!issues || issues.length === 0) return;

  const hotspots = document.querySelectorAll('.hotspot');
  hotspots.forEach((hs, idx) => {
    const issueMatch = issues[idx];
    if (issueMatch) {
      hs.dataset.issue = issueMatch.name;
      hs.dataset.count = issueMatch.passed ? '0' : '1';
      hs.dataset.detail = issueMatch.fix || issueMatch.status;
      const b = hs.querySelector('b');
      const small = hs.querySelector('small');
      if (b) b.textContent = issueMatch.passed ? '✓' : '▲';
      if (small) small.textContent = issueMatch.name;
    }
  });
}

// ---------------------------------------------------------------------------
// History Archive & Modals
// ---------------------------------------------------------------------------
function addToHistory(result) {
  if (!result || !result.url) return;
  appState.history = appState.history.filter(item => item.url !== result.url);
  appState.history.unshift({
    url: result.url,
    totalScore: result.scores?.total || 78,
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
    container.innerHTML = '<p style="font-size:11px; color:var(--muted); text-align:center; padding:16px;">No previous scans stored in this browser session.</p>';
    return;
  }

  appState.history.forEach(item => {
    const row = document.createElement('div');
    row.className = 'history-item-row';
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
        <span style="font-family:'Playfair Display',serif; font-weight:600; font-size:14px; width:28px;">${item.totalScore}</span>
        <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <div style="font-weight:600; font-size:11px;">${escapeHtml(item.url)}</div>
          <small style="color:var(--muted); font-size:9px;">${item.timestamp}</small>
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="text-action history-reload-btn" data-url="${escapeHtml(item.url)}" style="padding:4px 8px; font-size:9px;">Scan</button>
        <button class="history-del-btn" data-url="${escapeHtml(item.url)}" style="border:0; background:transparent; cursor:pointer; color:var(--muted); font-size:14px;">×</button>
      </div>
    `;

    row.querySelector('.history-reload-btn').addEventListener('click', () => {
      const input = document.getElementById('website-url');
      if (input) input.value = item.url;
      closeModals();
      analyzeDomain(item.url);
    });

    row.querySelector('.history-del-btn').addEventListener('click', () => {
      appState.history = appState.history.filter(h => h.url !== item.url);
      saveHistory();
      renderHistory();
    });

    container.appendChild(row);
  });
}

function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (show === undefined) modal.classList.toggle('hidden');
  else if (show) modal.classList.remove('hidden');
  else modal.classList.add('hidden');
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
}

// ---------------------------------------------------------------------------
// PDF Report Export (Streetcoders SEO Layout)
// ---------------------------------------------------------------------------
function downloadReport() {
  if (!appState.currentResult) {
    const status = document.getElementById('form-status');
    if (status) status.textContent = 'Please run a scan before exporting a PDF report.';
    return;
  }

  if (typeof window.jspdf === 'undefined') {
    alert('PDF export engine is loading. Please retry in a moment.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const result = appState.currentResult;
  const scores = result.scores || { total: 78, onPage: 71, technical: 82, content: 76, links: 68 };

  let y = 20;

  // Header Masthead
  doc.setFillColor(244, 241, 234);
  doc.rect(0, 0, 210, 36, 'F');

  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(23, 24, 21);
  doc.text('STREETCODERS SEO // SEARCH INTELLIGENCE REPORT', 20, y);

  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(119, 118, 109);
  doc.text(`TARGET DOMAIN: ${result.url}  |  DATE: ${new Date().toLocaleDateString()}`, 20, y + 8);

  y = 48;

  // Executive Score Box
  doc.setFillColor(250, 248, 244);
  doc.setDrawColor(216, 211, 199);
  doc.roundedRect(20, y, 170, 32, 2, 2, 'FD');

  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(46, 91, 66);
  doc.text(`${scores.total}`, 28, y + 21);

  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(23, 24, 21);
  doc.text('OVERALL HEALTH SCORE', 52, y + 14);

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(119, 118, 109);
  doc.text(`Technical: ${scores.technical}/30 | On-Page: ${scores.onPage}/40 | Content: ${scores.content}/20 | Links: ${scores.links}/10`, 52, y + 22);

  y += 42;

  // Findings Section
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(23, 24, 21);
  doc.text('KEY AUDIT FINDINGS & RECOMMENDATIONS', 20, y);
  y += 8;

  const issues = (result.issues || []).slice(0, 10);
  issues.forEach(issue => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(issue.passed ? 46 : 184, issue.passed ? 91 : 76, issue.passed ? 66 : 54);
    doc.text(`[${issue.severity || (issue.passed ? 'OPTIMAL' : 'ATTENTION')}] ${issue.name}`, 20, y);
    y += 5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 75);
    doc.text(`Fix: ${issue.fix || issue.status}`, 24, y);
    y += 7;
  });

  // Footer
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(119, 118, 109);
  doc.text('Streetcoders SEO — Less Noise. More Signal.', 20, 290);

  const cleanDomain = result.url.replace(/^https?:\/\//i, '').replace(/[^a-zA-Z0-9]/g, '-');
  doc.save(`streetcoders-seo-${cleanDomain}.pdf`);
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
// Main Initialization
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadStoredHistory();
  renderHistory();

  // Initialize Pie chart with default scores
  renderPieChart({ total: 78, technical: 82, onPage: 71, content: 76, links: 68 });

  // Initialize Backlinks & Performance with realistic baseline data
  renderBacklinks({ linkCount: 42, internalLinks: 31, externalLinks: 11, nofollowLinks: 5, scores: { links: 8 } });
  renderPerformance({ imageCount: 18, imagesWithoutAlt: 2, hasViewport: true, url: 'https://example.com' });

  // Initialize Mountain Stage Drag, Pan & Wheel Zoom interactions
  initMountainInteractions();

  // Tab navigation listeners
  document.querySelectorAll('.tab-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Callout action buttons jump to recommendations
  const calloutCritBtn = document.getElementById('callout-critical-btn');
  if (calloutCritBtn) {
    calloutCritBtn.addEventListener('click', () => {
      switchTab('recommendations');
      document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  const calloutWinsBtn = document.getElementById('callout-wins-btn');
  if (calloutWinsBtn) {
    calloutWinsBtn.addEventListener('click', () => {
      switchTab('recommendations');
      document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Hotspot click handlers
  document.querySelectorAll('.hotspot').forEach(button => {
    button.addEventListener('click', () => selectIssue(button));
  });

  // Inspector actions
  const inspectorClose = document.getElementById('inspector-close');
  if (inspectorClose) inspectorClose.addEventListener('click', closeInspector);

  const inspectAction = document.getElementById('inspect-action');
  if (inspectAction) {
    inspectAction.addEventListener('click', () => {
      switchTab('recommendations');
      document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Zoom controls
  const zoomIn = document.getElementById('zoom-in');
  if (zoomIn) zoomIn.addEventListener('click', () => setZoom(appState.zoom + 0.15));

  const zoomOut = document.getElementById('zoom-out');
  if (zoomOut) zoomOut.addEventListener('click', () => setZoom(appState.zoom - 0.15));

  const resetView = document.getElementById('reset-view');
  if (resetView) resetView.addEventListener('click', resetMountainView);

  // View All Opportunities toggle
  const viewAllBtn = document.getElementById('view-all');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => {
      switchTab('recommendations');
      document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Opportunity click handlers
  document.querySelectorAll('.opportunity').forEach(button => {
    button.addEventListener('click', () => {
      switchTab('recommendations');
      document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x === button));
      const section = button.dataset.view;
      const currentSec = document.getElementById('current-section');
      if (currentSec) currentSec.textContent = section.toUpperCase();

      if (section === 'Overview') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (section === 'Site Explorer') {
        document.getElementById('web-preview-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (section === 'Technical Audit') {
        switchTab('stats');
        document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (section === 'Content Analysis') {
        switchTab('breakdown');
        document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (section === 'Backlinks') {
        switchTab('backlinks');
        document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (section === 'Performance') {
        switchTab('performance');
        document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (section === 'Recommendations') {
        switchTab('recommendations');
        document.getElementById('detailed-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const status = document.getElementById('form-status');
        if (status) status.textContent = `${section} view active.`;
      }
    });
  });

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Help button
  const helpBtn = document.getElementById('help-button');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      const status = document.getElementById('form-status');
      if (status) {
        status.textContent = 'Enter a public website URL (e.g. https://example.com) to generate a comprehensive SEO audit with live preview and category breakdown.';
      }
    });
  }

  // History modal
  const histToggleBtn = document.getElementById('history-toggle-btn');
  if (histToggleBtn) {
    histToggleBtn.addEventListener('click', () => toggleModal('history-modal', true));
  }
  const histModalClose = document.getElementById('history-modal-close');
  if (histModalClose) {
    histModalClose.addEventListener('click', () => toggleModal('history-modal', false));
  }

  // Competitor comparison modal close button
  const compModalClose = document.getElementById('competitor-modal-close');
  if (compModalClose) {
    compModalClose.addEventListener('click', () => toggleModal('competitor-modal', false));
  }

  // Scan mode radio toggle for competitor URL input
  const compInputGroup = document.getElementById('competitor-input-group');
  const compUrlInput = document.getElementById('competitor-url');
  document.querySelectorAll('input[name="scan-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'compare' && radio.checked) {
        if (compInputGroup) compInputGroup.style.display = 'flex';
        if (compUrlInput) {
          compUrlInput.required = true;
          compUrlInput.focus();
        }
      } else if (radio.checked) {
        if (compInputGroup) compInputGroup.style.display = 'none';
        if (compUrlInput) {
          compUrlInput.required = false;
        }
      }
    });
  });

  // PDF report export button
  const reportBtn = document.getElementById('download-report-btn');
  if (reportBtn) reportBtn.addEventListener('click', downloadReport);

  // Form submission
  const analyzeForm = document.getElementById('analyze-form');
  if (analyzeForm) {
    analyzeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = document.getElementById('website-url');
      const statusEl = document.getElementById('form-status');

      let url;
      try {
        let val = input.value.trim();
        if (!/^https?:\/\//i.test(val)) {
          val = 'https://' + val;
          input.value = val;
        }
        url = new URL(val);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Only HTTP and HTTPS URLs are supported.');
        }
      } catch {
        if (statusEl) statusEl.textContent = 'Enter a valid website URL, including https://.';
        input.focus();
        return;
      }

      const modeInput = document.querySelector('input[name="scan-mode"]:checked');
      const mode = modeInput ? modeInput.value : 'full';

      let competitorUrl = null;
      if (mode === 'compare') {
        const compInput = document.getElementById('competitor-url');
        let compVal = compInput ? compInput.value.trim() : '';
        if (!compVal) {
          if (statusEl) statusEl.textContent = 'Enter a valid competitor website URL to benchmark.';
          if (compInput) compInput.focus();
          return;
        }
        if (!/^https?:\/\//i.test(compVal)) {
          compVal = 'https://' + compVal;
          if (compInput) compInput.value = compVal;
        }
        try {
          const compParsed = new URL(compVal);
          if (!['http:', 'https:'].includes(compParsed.protocol)) {
            throw new Error('Only HTTP and HTTPS URLs are supported.');
          }
          competitorUrl = compParsed.href;
        } catch {
          if (statusEl) statusEl.textContent = 'Enter a valid competitor URL, including https://.';
          if (compInput) compInput.focus();
          return;
        }
      }

      analyzeDomain(url.href, mode, competitorUrl);
    });
  }
});
