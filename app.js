// In-memory storage (localStorage blocked in sandbox)
const appState = {
  history: [],
  currentResult: null,
  darkMode: false
};

// Domain validation function
async function validateDomain(url) {
  try {
    // Extract hostname from URL
    let hostname;
    try {
      const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
      hostname = urlObj.hostname;
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
    
    // Use Google DNS API to check if domain exists
    const dnsUrl = `https://dns.google/resolve?name=${hostname}&type=A`;
    const response = await fetch(dnsUrl);
    const data = await response.json();
    
    // Check DNS status
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      // Domain exists and is registered
      return { valid: true, domain: hostname };
    } else if (data.Status === 3) {
      // NXDOMAIN - Domain does not exist
      return { 
        valid: false, 
        error: 'Domain not registered',
        domain: hostname 
      };
    } else {
      // Other DNS errors
      return { 
        valid: false, 
        error: 'Could not validate domain',
        domain: hostname 
      };
    }
  } catch (error) {
    return { 
      valid: false, 
      error: 'Validation failed: ' + error.message 
    };
  }
}

// Show error modal
function showErrorModal(errorMessage, domain) {
  const modal = document.getElementById('error-modal');
  const errorMsg = document.getElementById('error-message');
  const errorDomain = document.getElementById('error-domain');
  
  errorMsg.textContent = errorMessage;
  errorDomain.textContent = domain || 'Unknown domain';
  
  modal.classList.remove('hidden');
}

// Close error modal
function closeErrorModal() {
  const modal = document.getElementById('error-modal');
  modal.classList.add('hidden');
}

// Try example domain
function tryExample(domain) {
  document.getElementById('url-input').value = domain;
  closeErrorModal();
  document.getElementById('launch-btn').click();
}
window.tryExample = tryExample;
window.closeErrorModal = closeErrorModal;

// Retry with correction
function retryWithCorrection() {
  closeErrorModal();
  document.getElementById('url-input').focus();
}
window.retryWithCorrection = retryWithCorrection;

// Send message to AI — proxied through /api/ai-recommend (key stored server-side)
async function sendMessageToAI(userMessage) {
  try {
    const payload = {
      message: userMessage,
      auditData: appState.currentResult ? {
        url: appState.currentResult.url,
        title: appState.currentResult.title,
        metaDesc: appState.currentResult.metaDesc,
        h1Count: appState.currentResult.h1Count,
        h2Count: appState.currentResult.h2Count,
        imageCount: appState.currentResult.imageCount,
        imagesWithoutAlt: appState.currentResult.imagesWithoutAlt,
        linkCount: appState.currentResult.linkCount,
        wordCount: appState.currentResult.wordCount,
        hasViewport: appState.currentResult.hasViewport,
        scores: appState.currentResult.scores,
        topKeywords: appState.currentResult.topKeywords,
        robots: appState.currentResult.robots
      } : null
    };

    const response = await fetch('/api/ai-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || data.error || 'AI service error.');
    }

    return data.reply;
  } catch (error) {
    console.error('AI API Error:', error);
    return `AI Chatbot Error: ${error.message || 'Failed to contact AI recommendations service. Please verify server connectivity.'}`;
  }
}


// Stop words to filter
const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'about', 'as', 'or', 'and'];

// Theme toggle
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  
  if (isDark) {
    html.classList.remove('dark');
    html.classList.add('light');
    appState.darkMode = false;
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    appState.darkMode = true;
  }
}

// Analyze website — DNS check and server crawl run in parallel
async function analyzeWebsite(url) {
  // Normalise before either call
  const normalisedUrl = url.startsWith('http') ? url : 'https://' + url;

  // Shared abort controller — if DNS fails we cancel the analyze fetch
  const abortController = new AbortController();

  updateLoadingStatus('Checking domain & fetching page…');

  try {
    // ─── PARALLEL: DNS validation + server-side crawl ────────────────────────
    // DNS check is client-side (Google DNS API) and used only for the friendly
    // error modal. The /api/analyze server also validates the URL, so we don't
    // gate the server request on DNS completing first — both fire at once.
    const [validation, analyzeResponse] = await Promise.all([
      validateDomain(normalisedUrl),
      fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalisedUrl }),
        signal: abortController.signal
      }).catch(err => {
        // If aborted (DNS failed fast and we bailed), return null
        if (err.name === 'AbortError') return null;
        throw err;
      })
    ]);

    // ─── DNS result handling ──────────────────────────────────────────────────
    if (!validation.valid) {
      // Cancel any still-pending analyze fetch
      abortController.abort();
      showErrorModal(validation.error, validation.domain);
      return { success: false, error: validation.error, domainError: true };
    }

    // ─── Analyze response handling ────────────────────────────────────────────
    if (!analyzeResponse) {
      return { success: false, error: 'Analysis request was cancelled.' };
    }

    updateLoadingStatus('Scoring results…');
    const data = await analyzeResponse.json().catch(() => ({}));

    if (!analyzeResponse.ok || data.success === false) {
      return {
        success: false,
        error: data.message || data.error || `Server error ${analyzeResponse.status}`
      };
    }

    // ─── Score calculation (synchronous, runs once) ───────────────────────────
    const scores = calculateDetailedScores({
      title:     data.title,
      metaDesc:  data.metaDesc,
      h1Count:   data.h1Count,
      h2Count:   data.h2Count,
      imageCount: data.imageCount,
      linkCount:  data.linkCount,
      wordCount:  data.wordCount,
      hasViewport: data.hasViewport,
      url:       data.url
    });

    return { ...data, scores };

  } catch (error) {
    return { success: false, error: `Failed to fetch analysis: ${error.message || 'connection failed.'}` };
  }
}



// Calculate detailed scores
function calculateDetailedScores(data) {
  const scores = {
    onPage: 0,
    technical: 0,
    content: 0,
    links: 0
  };
  
  // On-Page SEO (max 40)
  if (data.title && data.title !== 'Missing') {
    scores.onPage += 15;
    if (data.title.length >= 30 && data.title.length <= 60) scores.onPage += 5;
  }
  if (data.metaDesc && data.metaDesc !== 'Missing') {
    scores.onPage += 10;
    if (data.metaDesc.length >= 120 && data.metaDesc.length <= 160) scores.onPage += 5;
  }
  if (data.h1Count > 0) scores.onPage += 5;
  
  // Technical (max 30)
  if (data.url.startsWith('https')) scores.technical += 10;
  if (data.hasViewport) scores.technical += 10; // Real viewport check from server
  if (data.h1Count === 1) scores.technical += 5;
  if (data.wordCount > 300) scores.technical += 5;
  
  // Content (max 20)
  if (data.wordCount > 300) scores.content += 5;
  if (data.wordCount > 600) scores.content += 5;
  if (data.h2Count > 0) scores.content += 5;
  scores.content += 5; // Base content score
  
  // Links (max 10)
  if (data.linkCount > 5) scores.links += 5;
  if (data.linkCount > 10) scores.links += 5;
  
  scores.total = scores.onPage + scores.technical + scores.content + scores.links;
  
  return scores;
}



// Render pie chart
function renderPieChart(scores) {
  const svg = document.getElementById('pie-chart-svg');
  const legend = document.getElementById('pie-chart-legend');
  
  const data = [
    { label: 'OnPage', value: scores.onPage, color: '#3b82f6', max: 40 },
    { label: 'Technical', value: scores.technical, color: '#10b981', max: 30 },
    { label: 'Content', value: scores.content, color: '#f97316', max: 20 },
    { label: 'Link', value: scores.links, color: '#ef4444', max: 10 }
  ];
  
  let total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;
  
  svg.innerHTML = '';
  legend.innerHTML = '';
  
  data.forEach(item => {
    const percentage = (item.value / total) * 100;
    const angle = (percentage / 100) * 360;
    
    // Create pie slice
    const x1 = 100 + 80 * Math.cos((currentAngle - 90) * Math.PI / 180);
    const y1 = 100 + 80 * Math.sin((currentAngle - 90) * Math.PI / 180);
    const x2 = 100 + 80 * Math.cos((currentAngle + angle - 90) * Math.PI / 180);
    const y2 = 100 + 80 * Math.sin((currentAngle + angle - 90) * Math.PI / 180);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`);
    path.setAttribute('fill', item.color);
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
    
    currentAngle += angle;
    
    // Create legend item
    const legendItem = document.createElement('div');
    legendItem.className = 'flex items-center gap-3';
    legendItem.innerHTML = `
      <div class="w-4 h-4 rounded" style="background: ${item.color}"></div>
      <span class="text-gray-700 dark:text-gray-300 font-medium">${item.label}: ${item.value}/${item.max} (${percentage.toFixed(1)}%)</span>
    `;
    legend.appendChild(legendItem);
  });
}



// Generate recommendations with structured checks grouped by Critical, Improvement, and Passed
function generateRecommendations(result) {
  const container = document.getElementById('recommendations-list');
  if (!container) return;

  // Define the audit checks
  const checks = [
    // 1. Title Presence & Length (OnPage)
    {
      name: 'Title Tag Audit',
      category: 'onPage',
      passed: result.title && result.title !== 'Missing' && result.title.length >= 30 && result.title.length <= 60,
      severity: result.title === 'Missing' ? 'Critical' : 'Improvement',
      status: result.title === 'Missing' ? 'No title tag detected' : `Title length is suboptimal (${result.title.length} chars: "${result.title}")`,
      passedStatus: `Title length is optimal (${result.title.length} chars: "${result.title}")`,
      explanation: result.title === 'Missing' 
        ? 'Your website is completely missing a title tag in the head section.'
        : `Your title tag is ${result.title.length < 30 ? 'too short' : 'too long'} to display properly in search engine result pages.`,
      whyItMatters: 'Title tags are the primary clickable link displayed on search results pages and are heavily weighted by search engines to understand page topic.',
      fix: result.title === 'Missing'
        ? 'Add a `<title>Your Target Keyword | BrandName</title>` tag within the `<head>` block of your HTML.'
        : `Revise the title tag to be between 30 and 60 characters long. Current title: "${result.title}" (length: ${result.title.length}).`,
      code: '&lt;title&gt;Target Keyword | Described Brand&lt;/title&gt;'
    },
    // 2. Meta Description (OnPage)
    {
      name: 'Meta Description Audit',
      category: 'onPage',
      passed: result.metaDesc && result.metaDesc !== 'Missing' && result.metaDesc.length >= 120 && result.metaDesc.length <= 160,
      severity: result.metaDesc === 'Missing' ? 'Critical' : 'Improvement',
      status: result.metaDesc === 'Missing' ? 'No meta description detected' : `Meta description length is suboptimal (${result.metaDesc.length} chars: "${result.metaDesc}")`,
      passedStatus: `Meta description is optimal (${result.metaDesc.length} chars)`,
      explanation: result.metaDesc === 'Missing'
        ? 'No meta description tag was found on the page.'
        : `The meta description length of ${result.metaDesc.length} characters is outside the optimal 120-160 range.`,
      whyItMatters: 'Meta descriptions act as search snippet copy; they directly impact Click-Through Rate (CTR) even though they are not a direct ranking factor.',
      fix: result.metaDesc === 'Missing'
        ? 'Add a `<meta name="description" content="...">` tag to the `<head>` with a summary between 120 and 160 characters.'
        : `Rewrite your description to fit within the 120-160 character display limit. Current: "${result.metaDesc}"`,
      code: '&lt;meta name="description" content="A compelling summary of the page containing your primary keywords."&gt;'
    },
    // 3. H1 Presence (OnPage/Technical)
    {
      name: 'H1 Heading Presence',
      category: 'onPage',
      passed: result.h1Count > 0,
      severity: 'Critical',
      status: 'No H1 tag detected on the page',
      passedStatus: `H1 tag is present (Count: ${result.h1Count})`,
      explanation: 'Your page does not contain any H1 heading tags.',
      whyItMatters: 'H1 tags define the top-level heading of a page. Search engines use them to grasp the main topic of your page content.',
      fix: 'Create exactly one H1 tag near the top of your page wrapper containing your primary keyword.',
      code: '&lt;h1&gt;Main Page Heading Containing Keywords&lt;/h1&gt;'
    },
    // 4. Single H1 Rule (Technical)
    {
      name: 'Single H1 Restriction',
      category: 'technical',
      passed: result.h1Count === 1,
      severity: 'Improvement',
      status: `Multiple H1 tags detected (${result.h1Count} tags found)`,
      passedStatus: 'Exactly one H1 tag is used (Optimal)',
      explanation: `Your page has ${result.h1Count} H1 tags instead of the recommended single H1.`,
      whyItMatters: 'Using more than one H1 tag dilutes keyword focus and makes page hierarchy confusing for screen readers and crawlers.',
      fix: `Keep only the primary heading as H1 and convert the other ${result.h1Count - 1} H1 tags to H2 or H3 tags.`,
      code: null
    },
    // 5. Image Alt Attributes (OnPage)
    {
      name: 'Image Alt Tags Audit',
      category: 'onPage',
      passed: result.imagesWithoutAlt === 0,
      severity: 'Improvement',
      status: `${result.imagesWithoutAlt} out of ${result.imageCount} images lack descriptive alt tags`,
      passedStatus: `All ${result.imageCount} images have alt tags`,
      explanation: `There are ${result.imagesWithoutAlt} image element(s) with missing or empty alt properties.`,
      whyItMatters: 'Alt attributes tell search engines what an image represents and are crucial for screen reader accessibility and image search rankings.',
      fix: 'Add a descriptive `alt="..."` attribute to every image tag that lacks one.',
      code: '&lt;img src="image.jpg" alt="Descriptive explanation of the image content"&gt;'
    },
    // 6. HTTPS Security (Technical)
    {
      name: 'HTTPS Protocol Secure Connection',
      category: 'technical',
      passed: result.url.startsWith('https'),
      severity: 'Critical',
      status: `Insecure HTTP protocol in use: "${result.url}"`,
      passedStatus: 'Secure HTTPS protocol enabled',
      explanation: 'The connection protocol is HTTP instead of HTTPS.',
      whyItMatters: 'HTTPS is a confirmed search ranking signal. Insecure sites display browser warnings, increasing user bounce rates.',
      fix: 'Configure an SSL certificate on your web host and redirect all HTTP traffic to HTTPS via 301 redirects.',
      code: null
    },
    // 7. Viewport Configuration (Technical)
    {
      name: 'Viewport Meta Tag Definition',
      category: 'technical',
      passed: result.hasViewport,
      severity: 'Critical',
      status: 'Viewport meta tag is missing',
      passedStatus: 'Viewport meta tag is defined correctly',
      explanation: 'No viewport meta tag was detected in the document header.',
      whyItMatters: 'The viewport tag ensures search engines recognize your site as mobile-friendly and scale it correctly on phone devices.',
      fix: 'Add the viewport meta tag inside the `<head>` section of the page.',
      code: '&lt;meta name="viewport" content="width=device-width, initial-scale=1.0"&gt;'
    },
    // 8. Content Word Count (Content)
    {
      name: 'Page Word Count',
      category: 'content',
      passed: result.wordCount >= 600,
      severity: result.wordCount < 300 ? 'Critical' : 'Improvement',
      status: result.wordCount < 300 
        ? `Thin content detected: only ${result.wordCount} words` 
        : `Suboptimal word count: only ${result.wordCount} words (optimal is 600+)`,
      passedStatus: `Optimal word count: ${result.wordCount} words`,
      explanation: `The page contains only ${result.wordCount} words of text.`,
      whyItMatters: 'Longer, comprehensive copy ranks higher because it matches search queries and offers greater depth of information.',
      fix: `Expand the page copy with detailed sections, explanations, or FAQs to reach at least 600 words. Current: ${result.wordCount} words.`,
      code: null
    },
    // 9. H2 Subheadings (Content)
    {
      name: 'H2 Subheadings Presence',
      category: 'content',
      passed: result.h2Count > 0,
      severity: 'Improvement',
      status: 'No H2 subheadings found',
      passedStatus: `H2 subheadings present (Count: ${result.h2Count})`,
      explanation: 'The page lacks H2 subheading tags to organize the text copy.',
      whyItMatters: 'H2 tags act as section breaks, improving scannability for readers and providing hierarchy context to web crawlers.',
      fix: 'Identify major sections within your text copy and wrap their headings in H2 tags.',
      code: '&lt;h2&gt;Subheading Topic&lt;/h2&gt;'
    },
    // 10. Link Density (Links)
    {
      name: 'Link Density & Distribution',
      category: 'links',
      passed: result.linkCount >= 10,
      severity: 'Improvement',
      status: `Low link density: only ${result.linkCount} links found (optimal is 10+)`,
      passedStatus: `Optimal link density: ${result.linkCount} links`,
      explanation: `Only ${result.linkCount} total links were detected on the page.`,
      whyItMatters: 'Links help build page relationships, index site contents, and guide user navigation.',
      fix: 'Incorporate relevant contextual text links to internal pages or high-authority external sources.',
      code: '&lt;a href="/internal-page"&gt;Related Article&lt;/a&gt;'
    }
  ];

  // Group the checks
  const critical = [];
  const improvement = [];
  const passed = [];

  checks.forEach(check => {
    if (check.passed) {
      passed.push(check);
    } else if (check.severity === 'Critical') {
      critical.push(check);
    } else {
      improvement.push(check);
    }
  });

  // Render HTML structures
  container.innerHTML = '';

  function renderGroup(title, list, badgeColor, borderColor) {
    if (list.length === 0) return '';
    
    let groupHtml = `
      <div class="col-span-1 md:col-span-2 mt-4">
        <h5 class="text-xl font-bold flex items-center gap-2 mb-4">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${badgeColor}">${list.length}</span>
          <span class="text-gray-800 dark:text-gray-200">${title}</span>
        </h5>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
    `;

    list.forEach(check => {
      groupHtml += `
        <div class="recommendation-card is-visible bg-white dark:bg-darkCard rounded-2xl shadow-md p-6 border-l-4 ${borderColor} transition hover:shadow-lg">
          <div class="flex items-start justify-between mb-3">
            <span class="text-sm font-bold text-gray-900 dark:text-white">${check.name}</span>
            <span class="text-xs uppercase font-bold px-2 py-0.5 rounded ${check.passed ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : (check.severity === 'Critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400')}">
              ${check.passed ? 'Passed' : check.severity}
            </span>
          </div>
          
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2 font-mono break-all">
            Status: ${check.passed ? check.passedStatus : check.status}
          </p>
          
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
            ${check.passed ? 'No issues found. This check meets optimal SEO criteria.' : check.explanation}
          </p>
          
          ${!check.passed ? `
            <div class="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 rounded-lg p-3.5 mb-3 text-xs text-blue-900 dark:text-blue-300">
              <span class="font-bold">Why it matters:</span> ${check.whyItMatters}
            </div>
            <div class="bg-gray-50 dark:bg-slate-800 rounded-lg p-3.5 mb-3 text-xs text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-slate-700">
              <span class="font-bold text-gray-900 dark:text-white">🔧 How to fix:</span> ${check.fix}
            </div>
          ` : ''}
          
          ${check.code && !check.passed ? `
            <div class="bg-gray-900 dark:bg-slate-950 rounded-lg p-3 mb-3">
              <pre class="text-xs text-green-400 font-mono overflow-x-auto"><code>${check.code}</code></pre>
            </div>
          ` : ''}
          
          ${!check.passed ? `
            <button onclick="markCompleted(this)" class="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 rounded-lg transition text-xs">
              Mark as Fixed
            </button>
          ` : `
            <div class="text-xs text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
              ✓ Meets SEO best practices
            </div>
          `}
        </div>
      `;
    });

    groupHtml += `
        </div>
      </div>
    `;
    return groupHtml;
  }

  // Render in columns/grids
  let finalHtml = '';
  finalHtml += renderGroup('Critical Issues', critical, 'bg-red-500 text-white', 'border-red-500');
  finalHtml += renderGroup('Improvements Needed', improvement, 'bg-orange-500 text-white', 'border-orange-500');
  finalHtml += renderGroup('Passed Checks', passed, 'bg-green-500 text-white', 'border-green-500');

  container.innerHTML = finalHtml;
}


// Modified displayResults function to render one-line reasons for lost points dynamically
function displayResults(result) {
  // Save current result
  appState.currentResult = result;

  // Show results section
  document.getElementById('results-section').classList.remove('hidden');
  
  // Update overall score
  document.getElementById('overall-score').textContent = `${result.scores.total}/100`;
  
  // Update individual scores with animation
  const circumference = 2 * Math.PI * 45;
  
  // OnPage
  const onPagePercent = (result.scores.onPage / 40) * 100;
  const onPageOffset = circumference - (onPagePercent / 100) * circumference;
  document.getElementById('score-onpage').textContent = result.scores.onPage;
  setTimeout(() => {
    document.getElementById('circle-onpage').style.strokeDashoffset = onPageOffset;
  }, 100);
  
  // Technical
  const techPercent = (result.scores.technical / 30) * 100;
  const techOffset = circumference - (techPercent / 100) * circumference;
  document.getElementById('score-technical').textContent = result.scores.technical;
  setTimeout(() => {
    document.getElementById('circle-technical').style.strokeDashoffset = techOffset;
  }, 200);
  
  // Content
  const contentPercent = (result.scores.content / 20) * 100;
  const contentOffset = circumference - (contentPercent / 100) * circumference;
  document.getElementById('score-content').textContent = result.scores.content;
  setTimeout(() => {
    document.getElementById('circle-content').style.strokeDashoffset = contentOffset;
  }, 300);
  
  // Link
  const linkPercent = (result.scores.links / 10) * 100;
  const linkOffset = circumference - (linkPercent / 100) * circumference;
  document.getElementById('score-link').textContent = result.scores.links;
  setTimeout(() => {
    document.getElementById('circle-link').style.strokeDashoffset = linkOffset;
  }, 400);
  
  // Final score
  const finalPercent = (result.scores.total / 100) * 100;
  const finalOffset = circumference - (finalPercent / 100) * circumference;
  document.getElementById('final-score-text').textContent = result.scores.total;
  setTimeout(() => {
    document.getElementById('final-circle').style.strokeDashoffset = finalOffset;
  }, 500);

  // ─── Compile Category Reasons for Lost Points ─────────────────────────────────
  const reasons = {
    onPage: [],
    technical: [],
    content: [],
    link: []
  };

  // On-Page failed checks compile
  if (!result.title || result.title === 'Missing') {
    reasons.onPage.push('Title tag missing (-15)');
  } else if (result.title.length < 30 || result.title.length > 60) {
    reasons.onPage.push('Suboptimal Title length (-5)');
  }
  if (!result.metaDesc || result.metaDesc === 'Missing') {
    reasons.onPage.push('Meta description missing (-10)');
  } else if (result.metaDesc.length < 120 || result.metaDesc.length > 160) {
    reasons.onPage.push('Suboptimal Meta description length (-5)');
  }
  if (result.h1Count === 0) {
    reasons.onPage.push('H1 tag missing (-5)');
  }

  // Technical failed checks compile
  if (!result.url.startsWith('https')) {
    reasons.technical.push('Insecure HTTP Connection (-10)');
  }
  if (!result.hasViewport) {
    reasons.technical.push('Viewport meta tag missing (-10)');
  }
  if (result.h1Count !== 1) {
    reasons.technical.push('Page H1 count is not exactly 1 (-5)');
  }
  if (result.wordCount <= 300) {
    reasons.technical.push('Thin content word count (-5)');
  }

  // Content failed checks compile
  if (result.wordCount <= 300) {
    reasons.content.push('Word count is below 300 (-10)');
  } else if (result.wordCount <= 600) {
    reasons.content.push('Word count is below 600 (-5)');
  }
  if (result.h2Count === 0) {
    reasons.content.push('H2 subheadings missing (-5)');
  }

  // Link failed checks compile
  if (result.linkCount <= 5) {
    reasons.link.push('Link count is below 5 (-10)');
  } else if (result.linkCount <= 10) {
    reasons.link.push('Link count is below 10 (-5)');
  }

  // Display reasons dynamically below each progress ring
  const updateReasonEl = (id, reasonList, maxScore, actualScore) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (actualScore === maxScore || reasonList.length === 0) {
      el.classList.add('hidden');
    } else {
      el.textContent = reasonList.join('; ');
      el.classList.remove('hidden');
    }
  };

  updateReasonEl('reason-onpage', reasons.onPage, 40, result.scores.onPage);
  updateReasonEl('reason-technical', reasons.technical, 30, result.scores.technical);
  updateReasonEl('reason-content', reasons.content, 20, result.scores.content);
  updateReasonEl('reason-link', reasons.link, 10, result.scores.links);
  
  // Render pie chart
  renderPieChart(result.scores);
  
  // Update quick stats
  document.getElementById('stats-title').textContent = result.title;
  document.getElementById('stats-desc').textContent = result.metaDesc;
  document.getElementById('stats-h1').textContent = result.h1Count;
  document.getElementById('stats-words').textContent = result.wordCount;
  document.getElementById('stats-images').textContent = result.imageCount;
  document.getElementById('stats-links').textContent = result.linkCount;
  document.getElementById('stats-https').textContent = result.url.startsWith('https') ? '✓' : '✗';
  document.getElementById('stats-keywords').textContent = result.topKeywords.length;
  
  // Render the structured checks inside recommendations-list
  generateRecommendations(result);
  
  // Load screenshot
  loadScreenshot(result.url);
  
  // Save to history
  try {
    result.domain = new URL(result.url).hostname;
  } catch {
    result.domain = result.url;
  }
  result.savedAt = Date.now();

  let history = getStoredHistory();
  const normUrl = result.url.replace(/\/$/, '').toLowerCase();
  history = history.filter(item => item.url.replace(/\/$/, '').toLowerCase() !== normUrl);
  history.unshift(result);
  if (history.length > 20) history.pop();
  saveStoredHistory(history);
  updateHistory();
  
  // Scroll to results
  setTimeout(() => {
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
  }, 300);
}
// Copy code function
function copyCode(button) {
  const codeBlock = button.closest('.bg-gray-900, .bg-slate-950').querySelector('code');
  const text = codeBlock.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  });
}
window.copyCode = copyCode;

// Mark as completed
function markCompleted(button) {
  button.textContent = '✓ Fixed';
  button.classList.add('bg-green-600', 'hover:bg-green-700');
  button.classList.remove('bg-primary-600', 'hover:bg-primary-700');
  button.disabled = true;
}
window.markCompleted = markCompleted;

// ─── Preview helpers ──────────────────────────────────────────────────────────

// Set URL bar text and HTTPS badge visibility
function setPreviewUrlBar(url) {
  const urlBar = document.getElementById('preview-url-bar');
  const httpsBadge = document.getElementById('preview-https-badge');
  if (!urlBar) return;

  try {
    const parsed = new URL(url);
    urlBar.textContent = parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
    if (httpsBadge) {
      if (parsed.protocol === 'https:') {
        httpsBadge.classList.remove('hidden');
        httpsBadge.classList.add('flex');
      } else {
        httpsBadge.classList.add('hidden');
        httpsBadge.classList.remove('flex');
      }
    }
  } catch {
    urlBar.textContent = url;
  }
}

// Show fallback state with favicon + domain + retry/visit links
function showPreviewFallback(url, errorMsg = '') {
  const loading  = document.getElementById('preview-loading');
  const skeleton = document.getElementById('preview-skeleton');
  const img      = document.getElementById('web-preview-img');
  const fallback = document.getElementById('preview-fallback');

  if (loading)  loading.style.display  = 'none';
  if (skeleton) skeleton.style.display = 'none';
  if (img)      img.style.display      = 'none';
  if (fallback) fallback.style.display = 'flex';

  const errorEl = document.getElementById('preview-error-message');
  if (errorEl) {
    errorEl.textContent = errorMsg || 'Preview unavailable';
  }

  try {
    const parsed = new URL(url);
    const faviconEl = document.getElementById('preview-favicon');
    const domainEl  = document.getElementById('preview-fallback-domain');
    const visitLink = document.getElementById('preview-visit-link');

    if (faviconEl) {
      faviconEl.src = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
      faviconEl.style.display = 'block';
    }
    if (domainEl)  domainEl.textContent = parsed.hostname;
    if (visitLink) visitLink.href = url;
  } catch { /* ignore parse errors */ }
}

// Load screenshot via /api/preview (caching + correct URL encoding)
async function loadScreenshot(url) {
  const img      = document.getElementById('web-preview-img');
  const loading  = document.getElementById('preview-loading');
  const skeleton = document.getElementById('preview-skeleton');
  const fallback = document.getElementById('preview-fallback');

  // Reset all states
  if (loading)  loading.style.display  = 'flex';
  if (skeleton) skeleton.style.display = 'none';
  if (img)      img.style.display      = 'none';
  if (fallback) fallback.style.display = 'none';

  const cleanUrl = url.startsWith('http') ? url : 'https://' + url;

  // Populate URL bar and HTTPS badge immediately (data is already known)
  setPreviewUrlBar(cleanUrl);

  // Wire up retry button
  const retryBtn = document.getElementById('preview-retry-btn');
  if (retryBtn) {
    // Remove any previous listener by cloning the node
    const freshBtn = retryBtn.cloneNode(true);
    retryBtn.parentNode.replaceChild(freshBtn, retryBtn);
    freshBtn.addEventListener('click', () => loadScreenshot(cleanUrl));
  }

  // Switch to skeleton after 300ms so rapid loads don't flash it
  const skeletonTimer = setTimeout(() => {
    if (loading && skeleton) {
      loading.style.display  = 'none';
      skeleton.style.display = 'block';
    }
  }, 300);

  try {
    // Ask the server for the (possibly cached) thum.io URL
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      clearTimeout(skeletonTimer);
      showPreviewFallback(cleanUrl, errData.message || 'Screenshot service returned an error.');
      return;
    }

    const { url: screenshotUrl } = await response.json();

    // Preload image before swapping in
    const testImg = new Image();
    try {
      await new Promise((resolve, reject) => {
        testImg.onload  = resolve;
        testImg.onerror = () => reject(new Error('Image failed to load from screenshot service.'));
        testImg.src     = screenshotUrl;
        setTimeout(() => reject(new Error('Screenshot load timed out.')), 12000);
      });
    } catch (imageErr) {
      clearTimeout(skeletonTimer);
      showPreviewFallback(cleanUrl, imageErr.message);
      return;
    }

    // Save to result object if it's the current one
    if (appState.currentResult && appState.currentResult.url === cleanUrl) {
      appState.currentResult.screenshotUrl = screenshotUrl;
      let hist = getStoredHistory();
      const normClean = cleanUrl.replace(/\/$/, '').toLowerCase();
      const match = hist.find(item => item.url.replace(/\/$/, '').toLowerCase() === normClean);
      if (match) {
        match.screenshotUrl = screenshotUrl;
        saveStoredHistory(hist);
        updateHistory();
      }
    }

    clearTimeout(skeletonTimer);

    // Show image
    img.src           = screenshotUrl;
    img.style.display = 'block';
    if (loading)  loading.style.display  = 'none';
    if (skeleton) skeleton.style.display = 'none';

  } catch {
    clearTimeout(skeletonTimer);
    showPreviewFallback(cleanUrl);
  }
}


// Local storage helper methods for analysis history
function getStoredHistory() {
  try {
    const data = localStorage.getItem('streetcoders_seo_history');
    return data ? JSON.parse(data) : [];
  } catch {
    return appState.history || [];
  }
}

function saveStoredHistory(history) {
  appState.history = history;
  try {
    localStorage.setItem('streetcoders_seo_history', JSON.stringify(history));
  } catch {
    // Fail silently if blocked in sandboxed environment
  }
}

// Delete history item
function deleteHistoryItem(index) {
  let history = getStoredHistory();
  history.splice(index, 1);
  saveStoredHistory(history);
  updateHistory();
}
window.deleteHistoryItem = deleteHistoryItem;

// Update history
function updateHistory() {
  const container = document.getElementById('history-list');
  const history = getStoredHistory();
  
  if (history.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 px-4 text-center">
        <svg class="w-12 h-12 text-gray-300 dark:text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p class="text-sm font-medium text-gray-500 dark:text-gray-400">No analysis history yet</p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Audit websites to keep track of your scores over time.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = history.map((item, index) => {
    const domain = item.domain || new URL(item.url).hostname;
    const thumbnail = item.screenshotUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    return `
      <div class="border-b border-gray-100 dark:border-slate-700 last:border-0 py-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors px-4 rounded-lg">
        <div class="flex items-center gap-4 cursor-pointer flex-1 min-w-0" onclick="loadHistoryItem(${index})">
          <img src="${thumbnail}" class="w-12 h-12 rounded object-cover border border-gray-200 dark:border-slate-700 bg-gray-50 flex-shrink-0" onerror="this.src='https://www.google.com/s2/favicons?domain=${domain}&sz=64'" />
          <div class="min-w-0">
            <p class="font-semibold text-gray-800 dark:text-gray-200 truncate">${domain}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">${item.timestamp}</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-xl font-bold text-primary-600 dark:text-primary-500">${item.scores.total}</div>
          <button onclick="deleteHistoryItem(${index}); event.stopPropagation();" class="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20" title="Delete from history">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Load history item
async function loadHistoryItem(index) {
  const history = getStoredHistory();
  const item = history[index];
  if (!item) return;

  const ageMs = Date.now() - (item.savedAt || 0);
  const oneHour = 60 * 60 * 1000;

  if (ageMs < oneHour) {
    // Re-load from local cache
    displayResults(item);
  } else {
    // Re-run analysis
    document.getElementById('url-input').value = item.url;
    document.getElementById('launch-btn').click();
  }
}
window.loadHistoryItem = loadHistoryItem;

// Chat bot functionality
let chatOpen = false;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addMessageToChat(message, sender) {
  const messagesDiv = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  
  if (sender === 'user') {
    messageDiv.className = 'flex justify-end';
    messageDiv.innerHTML = `
      <div class="bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white p-3 rounded-2xl rounded-tr-none max-w-[80%]">
        <p class="text-sm">${escapeHtml(message)}</p>
      </div>
    `;
  } else {
    messageDiv.className = 'flex gap-2';
    messageDiv.innerHTML = `
      <div class="bg-primary-500 text-white p-3 rounded-2xl rounded-tl-none max-w-[80%]">
        <p class="text-sm">${escapeHtml(message)}</p>
      </div>
    `;
  }
  
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showTypingIndicator() {
  const messagesDiv = document.getElementById('chat-messages');
  const typingDiv = document.createElement('div');
  typingDiv.id = 'typing-indicator';
  typingDiv.className = 'flex gap-2';
  typingDiv.innerHTML = `
    <div class="bg-primary-500 text-white p-3 rounded-2xl rounded-tl-none">
      <div class="flex gap-1">
        <span class="w-2 h-2 bg-white rounded-full animate-bounce"></span>
        <span class="w-2 h-2 bg-white rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        <span class="w-2 h-2 bg-white rounded-full animate-bounce" style="animation-delay: 0.4s"></span>
      </div>
    </div>
  `;
  messagesDiv.appendChild(typingDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeTypingIndicator() {
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  // Add user message to chat
  addMessageToChat(message, 'user');
  input.value = '';
  
  // Show typing indicator
  showTypingIndicator();
  
  // Get AI response
  const aiResponse = await sendMessageToAI(message);
  
  // Remove typing indicator and add AI response
  removeTypingIndicator();
  addMessageToChat(aiResponse, 'ai');
}

function toggleChat() {
  chatOpen = !chatOpen;
  const chatWindow = document.getElementById('chat-window');
  const toggleBtn = document.getElementById('chat-toggle-btn');
  
  if (chatOpen) {
    chatWindow.classList.add('active');
    chatWindow.style.display = 'flex';
    toggleBtn.style.transform = 'scale(0)';
  } else {
    chatWindow.classList.remove('active');
    chatWindow.style.display = 'none';
    toggleBtn.style.transform = 'scale(1)';
  }
}

// Update the status text shown inside the loading spinner, and advance phase pills.
// Phase messages (in order):
//   'Checking domain & fetching page…'  → phase 1 active
//   'Scoring results…'                   → phase 2 done, phase 3 active
function updateLoadingStatus(message) {
  const statusEl = document.querySelector('#loading-section p');
  if (statusEl) statusEl.textContent = message;

  const pillActive   = 'bg-primary-500 text-white';
  const pillDone     = 'bg-green-500 text-white';
  const pillPending  = 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-400';

  function setPill(id, state) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = el.className
      .replace(/bg-\S+|text-\S+/g, '')
      .trim();
    const classes = state === 'active'  ? pillActive
                  : state === 'done'    ? pillDone
                  : pillPending;
    el.className += ' ' + classes;
  }

  if (message.startsWith('Checking domain')) {
    setPill('phase-domain', 'active');
    setPill('phase-fetch',  'active'); // Both DNS + fetch fire together
    setPill('phase-score',  'pending');
  } else if (message.startsWith('Scoring')) {
    setPill('phase-domain', 'done');
    setPill('phase-fetch',  'done');
    setPill('phase-score',  'active');
  }
}

// Generate and download a PDF report using jsPDF (client-side)
async function downloadReport() {
  const result = appState.currentResult;
  if (!result) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  
  let y = 15;
  const margin = 15;
  const pageHeight = 280;

  const addText = (text, size = 10, isBold = false, color = '#333333') => {
    doc.setFontSize(size);
    doc.setFont('Helvetica', isBold ? 'bold' : 'normal');
    if (color === 'primary') {
      doc.setTextColor(13, 148, 136); // #0d9488
    } else if (color === 'red') {
      doc.setTextColor(239, 68, 68);
    } else if (color === 'orange') {
      doc.setTextColor(249, 115, 22);
    } else if (color === 'green') {
      doc.setTextColor(16, 185, 129);
    } else {
      doc.setTextColor(51, 51, 51);
    }

    const splitText = doc.splitTextToSize(text, 180);
    splitText.forEach(line => {
      if (y > pageHeight) {
        doc.addPage();
        y = 15;
      }
      doc.text(line, margin, y);
      y += (size * 0.3527) + 2.5; // spacing
    });
  };

  const addDivider = () => {
    if (y > pageHeight - 10) {
      doc.addPage();
      y = 15;
    }
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, y, 195, y);
    y += 5;
  };

  // Title
  addText('STREET CODERS - SEO AUDIT REPORT', 16, true, 'primary');
  addText(`Generated on: ${new Date().toLocaleString()}`, 9, false, 'gray');
  y += 3;
  addDivider();

  // Overview
  addText('1. AUDIT OVERVIEW', 13, true, 'primary');
  addText(`Target URL: ${result.url}`, 10, false);
  addText(`Overall SEO Score: ${result.scores.total}/100`, 11, true, 'primary');
  y += 2;
  
  addText('Category Breakdown:', 10, true);
  
  const getCategoryReason = (cat) => {
    const reasons = {
      onPage: [],
      technical: [],
      content: [],
      link: []
    };
    if (!result.title || result.title === 'Missing') reasons.onPage.push('Title missing (-15)');
    else if (result.title.length < 30 || result.title.length > 60) reasons.onPage.push('Suboptimal Title length (-5)');
    if (!result.metaDesc || result.metaDesc === 'Missing') reasons.onPage.push('Meta description missing (-10)');
    else if (result.metaDesc.length < 120 || result.metaDesc.length > 160) reasons.onPage.push('Suboptimal Meta description length (-5)');
    if (result.h1Count === 0) reasons.onPage.push('H1 missing (-5)');

    if (!result.url.startsWith('https')) reasons.technical.push('Insecure HTTP Connection (-10)');
    if (!result.hasViewport) reasons.technical.push('Viewport missing (-10)');
    if (result.h1Count !== 1) reasons.technical.push('H1 count not 1 (-5)');
    if (result.wordCount <= 300) reasons.technical.push('Thin content (-5)');

    if (result.wordCount <= 300) reasons.content.push('Word count < 300 (-10)');
    else if (result.wordCount <= 600) reasons.content.push('Word count < 600 (-5)');
    if (result.h2Count === 0) reasons.content.push('H2 missing (-5)');

    if (result.linkCount <= 5) reasons.link.push('Link count < 5 (-10)');
    else if (result.linkCount <= 10) reasons.link.push('Link count < 10 (-5)');

    return reasons[cat].length > 0 ? `(Deductions: ${reasons[cat].join('; ')})` : '(No deductions)';
  };

  addText(`• On-Page SEO: ${result.scores.onPage}/40 ${getCategoryReason('onPage')}`, 9.5, false);
  addText(`• Technical SEO: ${result.scores.technical}/30 ${getCategoryReason('technical')}`, 9.5, false);
  addText(`• Content Quality: ${result.scores.content}/20 ${getCategoryReason('content')}`, 9.5, false);
  addText(`• Link Density: ${result.scores.links}/10 ${getCategoryReason('link')}`, 9.5, false);
  y += 3;
  addDivider();

  // Stats
  addText('2. WEBSITE METRICS', 13, true, 'primary');
  addText(`• Title Tag: ${result.title}`, 9.5, false);
  addText(`• Meta Description: ${result.metaDesc}`, 9.5, false);
  addText(`• Headings: ${result.h1Count} H1 heading(s) / ${result.h2Count} H2 heading(s)`, 9.5, false);
  addText(`• Word Count: ${result.wordCount} words`, 9.5, false);
  addText(`• Link Density: ${result.linkCount} links`, 9.5, false);
  addText(`• Images Audit: ${result.imageCount} image(s) total (${result.imagesWithoutAlt} missing alt tags)`, 9.5, false);
  addText(`• Security Status: ${result.url.startsWith('https') ? 'Secure (HTTPS)' : 'Insecure (HTTP)'}`, 9.5, false);
  y += 3;
  addDivider();

  // Actionable findings
  addText('3. ACTIONABLE AUDIT FINDINGS', 13, true, 'primary');
  
  const checks = [
    { name: 'Title Tag Audit', passed: result.title && result.title !== 'Missing' && result.title.length >= 30 && result.title.length <= 60, severity: result.title === 'Missing' ? 'Critical' : 'Improvement', fix: result.title === 'Missing' ? 'Add a title tag inside the <head> block.' : `Revise title tag to 30-60 characters.` },
    { name: 'Meta Description Audit', passed: result.metaDesc && result.metaDesc !== 'Missing' && result.metaDesc.length >= 120 && result.metaDesc.length <= 160, severity: result.metaDesc === 'Missing' ? 'Critical' : 'Improvement', fix: result.metaDesc === 'Missing' ? 'Add a meta description to your head section.' : `Rewrite description to fit within 120-160 characters.` },
    { name: 'H1 Heading Presence', passed: result.h1Count > 0, severity: 'Critical', fix: 'Add exactly one H1 tag near the top of the page.' },
    { name: 'Single H1 Restriction', passed: result.h1Count === 1, severity: 'Improvement', fix: 'Keep only one H1 and convert additional ones to H2 or H3 tags.' },
    { name: 'Image Alt Tags Audit', passed: result.imagesWithoutAlt === 0, severity: 'Improvement', fix: 'Add alt attributes to all images.' },
    { name: 'HTTPS Connection', passed: result.url.startsWith('https'), severity: 'Critical', fix: 'Install SSL certificate and configure redirect.' },
    { name: 'Viewport Meta Tag', passed: result.hasViewport, severity: 'Critical', fix: 'Add viewport meta tag to document header.' },
    { name: 'Page Word Count', passed: result.wordCount >= 600, severity: result.wordCount < 300 ? 'Critical' : 'Improvement', fix: 'Expand page content to at least 600 words.' },
    { name: 'H2 Subheadings Presence', passed: result.h2Count > 0, severity: 'Improvement', fix: 'Organize text sections under H2 subheadings.' },
    { name: 'Link Density & Distribution', passed: result.linkCount >= 10, severity: 'Improvement', fix: 'Incorporate relevant internal or external contextual links.' }
  ];

  const failedChecks = checks.filter(c => !c.passed);
  const passedChecks = checks.filter(c => c.passed);

  if (failedChecks.length > 0) {
    addText('Identified Issues:', 10.5, true, 'red');
    failedChecks.forEach(c => {
      addText(`[${c.severity}] ${c.name} — Recommended Fix: ${c.fix}`, 9, false, c.severity === 'Critical' ? 'red' : 'orange');
    });
    y += 2;
  }

  if (passedChecks.length > 0) {
    addText('Passed Audits:', 10.5, true, 'green');
    passedChecks.forEach(c => {
      addText(`✓ ${c.name}`, 9, false, 'green');
    });
    y += 2;
  }
  
  // Chat logs
  const messagesContainer = document.getElementById('chat-messages');
  if (messagesContainer) {
    const aiMessages = Array.from(messagesContainer.querySelectorAll('.bg-primary-500 p'));
    if (aiMessages.length > 1) {
      y += 3;
      addDivider();
      addText('4. INTERACTIVE AI CHAT ASSISTANT NOTES', 13, true, 'primary');
      aiMessages.slice(1).forEach((msg, idx) => {
        addText(`AI note ${idx + 1}: ${msg.textContent}`, 9, false);
      });
    }
  }

  const filename = `seo-report-${result.url.replace(/^https?:\/\//i, '').replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
  doc.save(filename);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // PDF Report button
  document.getElementById('download-report-btn').addEventListener('click', downloadReport);

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  
  // Launch button
  document.getElementById('launch-btn').addEventListener('click', async () => {
    const url = document.getElementById('url-input').value.trim();
    
    if (!url) {
      alert('Please enter a URL');
      return;
    }
    
    // Show loading, hide any previous results
    const loadingSection = document.getElementById('loading-section');
    const resultsSection = document.getElementById('results-section');
    loadingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    updateLoadingStatus('Checking domain & fetching page…');
    
    // Reset progress circles
    document.querySelectorAll('.progress-circle').forEach(circle => {
      circle.style.strokeDashoffset = 283;
    });
    
    // Run analysis (DNS + crawl run in parallel inside analyzeWebsite)
    const result = await analyzeWebsite(url);
    
    // Hide loading
    loadingSection.classList.add('hidden');
    
    if (result && result.success) {
      // Render results immediately — all data is available in one pass
      displayResults(result);
    } else if (result && result.domainError) {
      // Domain validation error already shown via modal
      return;
    } else {
      showErrorModal(result ? result.error : 'An unexpected error occurred.', url);
    }
  });
  
  // Enter key
  document.getElementById('url-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('launch-btn').click();
    }
  });
  
  // Chat bot toggle
  document.getElementById('chat-toggle-btn').addEventListener('click', toggleChat);
  
  // Chat close
  document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
  
  // Chat send
  document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
  
  // Chat enter key
  document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });

  // Render history on load
  updateHistory();
});