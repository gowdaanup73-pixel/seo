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
    const response = await fetch('/api/ai-recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'AI service error');
    }

    return data.reply;
  } catch (error) {
    console.error('AI API Error:', error);
    return 'Sorry, I encountered an error. Please try again.';
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
      return { success: false, error: 'Analysis request was cancelled' };
    }

    updateLoadingStatus('Scoring results…');
    const data = await analyzeResponse.json();

    if (!analyzeResponse.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Server error ${analyzeResponse.status}`
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
    return { success: false, error: error.message };
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

// Display results
function displayResults(result) {
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
  
  // Generate recommendations
  generateRecommendations(result);
  
  // Load screenshot
  loadScreenshot(result.url);
  
  // Save to history
  appState.history.unshift(result);
  if (appState.history.length > 10) appState.history.pop();
  updateHistory();
  
  // Scroll to results
  setTimeout(() => {
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
  }, 300);
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
  button.textContent = '✓ Completed';
  button.classList.add('bg-green-600', 'hover:bg-green-700');
  button.classList.remove('bg-primary-600', 'hover:bg-primary-700');
  button.disabled = true;
}
window.markCompleted = markCompleted;

// Generate recommendations with expanded details
function generateRecommendations(result) {
  const container = document.getElementById('recommendations-list');
  const recs = [];
  
  // Meta Description - High Priority
  if (!result.metaDesc || result.metaDesc === 'Missing') {
    recs.push({
      priority: 'high',
      title: 'Add Meta Description',
      time: '10-15 min',
      description: 'Your website is missing a meta description, which is crucial for search engine results. A well-crafted meta description acts as a "sales pitch" in search results, directly impacting your click-through rate (CTR). Search engines like Google display this 150-160 character snippet below your page title, making it one of the first things potential visitors see.',
      impact: ['Increases click-through rates by 5-15%', 'Improves search result appearance', 'Helps search engines understand page content', 'Influences social media shares'],
      steps: [
        'Open your HTML file or CMS settings',
        'Locate the &lt;head&gt; section',
        'Add the meta description tag',
        'Write compelling 150-160 character description',
        'Include primary keywords naturally'
      ],
      code: `&lt;meta name="description" 
      content="Discover expert SEO tips and 
      strategies to boost your website ranking. 
      Improve visibility, traffic, and conversions 
      with proven techniques."&gt;`,
      bestPractices: [
        'Keep it between 150-160 characters (optimal length)',
        'Include your primary keyword near the beginning',
        'Write for humans, not just search engines',
        'Make it unique for each page',
        'Include a call-to-action when appropriate',
        'Avoid duplicate descriptions across pages'
      ]
    });
  }
  
  // Title Tag - High Priority
  if (!result.title || result.title === 'Missing') {
    recs.push({
      priority: 'high',
      title: 'Add Title Tag',
      time: '5-10 min',
      description: 'Your page is missing a title tag, which is one of the most important on-page SEO elements. The title tag appears in search engine results, browser tabs, and social media shares. Without it, search engines cannot properly index your page, and users won\'t understand what your page is about before clicking.',
      impact: ['Critical for search engine ranking', 'First impression in search results', 'Improves click-through rate by 20-30%', 'Required for social media sharing'],
      steps: [
        'Open your HTML file',
        'Find the &lt;head&gt; section',
        'Add a &lt;title&gt; tag',
        'Write a descriptive 50-60 character title',
        'Include your primary keyword'
      ],
      code: `&lt;title&gt;SEO Tips &amp; Strategies | Boost Your Rankings - YourBrand&lt;/title&gt;`,
      bestPractices: [
        'Keep between 50-60 characters for optimal display',
        'Put important keywords first',
        'Include your brand name at the end',
        'Make each page title unique',
        'Avoid keyword stuffing',
        'Write compelling, clickable titles'
      ]
    });
  } else if (result.title.length < 30) {
    recs.push({
      priority: 'medium',
      title: 'Expand Title Tag Length',
      time: '5 min',
      description: `Your title tag is only ${result.title.length} characters, which is too short to be effective. Search engines display up to 60 characters in search results, and you\'re not utilizing this valuable space. A longer, more descriptive title can significantly improve your click-through rate and provide better context to both users and search engines.`,
      impact: ['Better use of SERP real estate', 'Improved keyword targeting', 'Higher click-through rates', 'More descriptive for users'],
      steps: [
        'Review your current title: "' + result.title + '"',
        'Add descriptive keywords',
        'Expand to 50-60 characters',
        'Test the appearance in Google SERP simulator'
      ],
      code: null,
      bestPractices: [
        'Aim for 50-60 characters total',
        'Include primary and secondary keywords',
        'Make it compelling and clickable',
        'Add your brand name if space allows'
      ]
    });
  }
  
  // H1 Tag - High Priority
  if (result.h1Count === 0) {
    recs.push({
      priority: 'high',
      title: 'Add H1 Heading Tag',
      time: '5 min',
      description: 'Your page is missing an H1 tag, which is essential for proper page structure and SEO. The H1 tag tells both users and search engines what the main topic of your page is. Without it, search engines have difficulty understanding your content hierarchy, which can negatively impact your rankings.',
      impact: ['Improves content structure', 'Helps search engines understand page topic', 'Better accessibility for screen readers', 'Increases relevance for target keywords'],
      steps: [
        'Identify the main heading on your page',
        'Wrap it in an &lt;h1&gt; tag',
        'Ensure it includes your primary keyword',
        'Use only ONE H1 per page'
      ],
      code: `&lt;h1&gt;Complete Guide to SEO Optimization in 2025&lt;/h1&gt;`,
      bestPractices: [
        'Use only one H1 tag per page',
        'Include your primary keyword',
        'Make it descriptive and compelling',
        'Keep it between 20-70 characters',
        'Place it prominently near the top of the page'
      ]
    });
  } else if (result.h1Count > 1) {
    recs.push({
      priority: 'medium',
      title: 'Use Only One H1 Tag',
      time: '10 min',
      description: `Your page has ${result.h1Count} H1 tags, but SEO best practices recommend using only one H1 per page. Multiple H1 tags confuse search engines about which heading is the main topic of your page. This dilutes the SEO value and can harm your rankings. Convert additional H1 tags to H2 or H3 tags to maintain proper content hierarchy.`,
      impact: ['Clearer content hierarchy', 'Better search engine understanding', 'Improved page structure', 'Stronger focus on main keyword'],
      steps: [
        'Identify all H1 tags on your page',
        'Choose the most important one as your main H1',
        'Convert others to H2 or H3 tags',
        'Verify the hierarchy makes sense'
      ],
      code: null,
      bestPractices: [
        'Always use exactly one H1 per page',
        'Use H2 for major sections',
        'Use H3 for subsections',
        'Maintain logical hierarchy (H1 → H2 → H3)',
        'Don\'t skip heading levels'
      ]
    });
  }
  
  // Content Length - Medium Priority
  if (result.wordCount < 300) {
    recs.push({
      priority: 'medium',
      title: 'Increase Content Length',
      time: '30-60 min',
      description: `Your page currently has only ${result.wordCount} words, which is significantly below the recommended minimum of 600-1000 words for good SEO performance. Longer, comprehensive content tends to rank better in search results because it provides more value to users and more opportunities to target relevant keywords naturally.`,
      impact: ['Better search rankings', 'More keyword opportunities', 'Higher user engagement', 'Increased authority'],
      steps: [
        'Research your topic thoroughly',
        'Add detailed explanations and examples',
        'Include relevant statistics and data',
        'Add FAQ sections',
        'Expand on key points'
      ],
      code: null,
      bestPractices: [
        'Aim for at least 600-1000 words',
        'Focus on quality over quantity',
        'Break content into scannable sections',
        'Use bullet points and lists',
        'Add relevant images and media',
        'Answer user questions thoroughly'
      ]
    });
  }
  
  // H2 Headings - Low Priority
  if (result.h2Count === 0) {
    recs.push({
      priority: 'low',
      title: 'Add H2 Subheadings',
      time: '15-20 min',
      description: 'Your page lacks H2 subheadings, which are important for organizing content and improving readability. Subheadings break up long text, make content scannable, and help search engines understand your content structure. They also provide additional opportunities to include relevant keywords naturally.',
      impact: ['Better content organization', 'Improved readability', 'Enhanced user experience', 'Additional keyword opportunities'],
      steps: [
        'Identify major sections in your content',
        'Add descriptive H2 tags for each section',
        'Include relevant keywords where appropriate'
      ],
      code: `&lt;h2&gt;Why SEO Matters for Your Business&lt;/h2&gt;
&lt;p&gt;Content about SEO importance...&lt;/p&gt;

&lt;h2&gt;Top SEO Strategies for 2025&lt;/h2&gt;
&lt;p&gt;Content about strategies...&lt;/p&gt;`,
      bestPractices: [
        'Use H2 for major sections',
        'Make headings descriptive',
        'Include keywords naturally',
        'Keep headings concise',
        'Maintain logical flow'
      ]
    });
  }
  
  // HTTPS - High Priority
  if (!result.url.startsWith('https')) {
    recs.push({
      priority: 'high',
      title: 'Enable HTTPS Security',
      time: '30-60 min',
      description: 'Your website is not using HTTPS, which means the connection is not secure. HTTPS is a confirmed Google ranking factor, and modern browsers display "Not Secure" warnings for HTTP sites. This damages user trust, reduces conversions, and negatively impacts your search rankings. Enabling HTTPS is essential for any modern website.',
      impact: ['Improved security and user trust', 'Better search engine rankings', 'Required for modern web features', 'Increased conversion rates'],
      steps: [
        'Purchase or obtain a free SSL certificate (Let\'s Encrypt)',
        'Install the SSL certificate on your server',
        'Update all internal links to HTTPS',
        'Set up 301 redirects from HTTP to HTTPS',
        'Update your sitemap and robots.txt'
      ],
      code: null,
      bestPractices: [
        'Use free Let\'s Encrypt certificates',
        'Enable HSTS (HTTP Strict Transport Security)',
        'Update all internal links',
        'Check for mixed content warnings',
        'Monitor certificate expiration'
      ]
    });
  }
  
  // Internal Links - Low Priority
  if (result.linkCount < 5) {
    recs.push({
      priority: 'low',
      title: 'Add More Internal Links',
      time: '15-20 min',
      description: `Your page has only ${result.linkCount} links. Internal linking is crucial for SEO as it helps search engines discover and index your content, distributes page authority, and improves user navigation. A well-structured internal linking strategy keeps users on your site longer and helps search engines understand your site\'s information architecture.`,
      impact: ['Better site structure', 'Improved crawlability', 'Enhanced user navigation', 'Distributed page authority'],
      steps: [
        'Identify related pages on your site',
        'Add contextual links within content',
        'Use descriptive anchor text'
      ],
      code: `&lt;p&gt;Learn more about &lt;a href="/seo-tips"&gt;advanced SEO techniques&lt;/a&gt; 
to improve your rankings.&lt;/p&gt;`,
      bestPractices: [
        'Use descriptive anchor text',
        'Link to relevant pages only',
        'Aim for 3-5 internal links per page',
        'Avoid over-optimization',
        'Link to both new and important pages'
      ]
    });
  }
  
  // Schema Markup - Low Priority
  recs.push({
    priority: 'low',
    title: 'Add Schema Markup',
    time: '20-30 min',
    description: 'Schema markup (structured data) helps search engines better understand your content and can result in rich snippets in search results. Rich snippets can include ratings, prices, availability, and other information that makes your listing stand out, potentially increasing click-through rates by 20-30%.',
    impact: ['Rich snippets in search results', 'Enhanced SERP appearance', 'Better search engine understanding', 'Increased click-through rates'],
    steps: [
      'Identify appropriate schema type (Article, Product, etc.)',
      'Use Google\'s Structured Data Markup Helper',
      'Add JSON-LD script to your page',
      'Test with Google\'s Rich Results Test'
    ],
    code: `&lt;script type="application/ld+json"&gt;
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Your Article Title",
  "author": {
    "@type": "Person",
    "name": "Author Name"
  },
  "datePublished": "2025-10-29"
}
&lt;/script&gt;`,
    bestPractices: [
      'Use JSON-LD format (Google recommended)',
      'Choose the most specific schema type',
      'Test with Google\'s validation tools',
      'Keep markup up to date',
      'Include all required properties'
    ]
  });
  
  // Render recommendations with expanded details
  container.innerHTML = '';
  recs.forEach((rec, index) => {
    const card = document.createElement('div');
    card.className = 'recommendation-card bg-white dark:bg-darkCard rounded-2xl shadow-lg p-6 hover:shadow-xl transition';
    
    const priorityStyles = {
      high: { color: 'border-red-500', badge: 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400', emoji: '🔴' },
      medium: { color: 'border-orange-500', badge: 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400', emoji: '🟠' },
      low: { color: 'border-green-500', badge: 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400', emoji: '🟢' }
    };
    
    const style = priorityStyles[rec.priority];
    card.classList.add(style.color, 'border-l-4');
    
    let html = `
      <!-- Priority Badge -->
      <div class="flex items-start justify-between mb-4">
        <span class="px-3 py-1 ${style.badge} text-xs font-bold rounded-full uppercase">
          ${style.emoji} ${rec.priority} Priority
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400">⏱️ ${rec.time}</span>
      </div>
      
      <!-- Title -->
      <h5 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
        ${rec.title}
      </h5>
      
      <!-- Description -->
      <p class="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
        ${rec.description}
      </p>
      
      <!-- Impact -->
      <div class="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
        <p class="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">📊 Impact:</p>
        <ul class="text-sm text-blue-800 dark:text-blue-400 space-y-1">
          ${rec.impact.map(item => `<li>• ${item}</li>`).join('')}
        </ul>
      </div>
      
      <!-- Implementation Steps -->
      <div class="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 mb-4">
        <p class="text-sm font-semibold text-gray-900 dark:text-white mb-3">🔧 How to Fix:</p>
        <ol class="text-sm text-gray-700 dark:text-gray-300 space-y-2">
          ${rec.steps.map((step, i) => `<li><strong>${i + 1}.</strong> ${step}</li>`).join('')}
        </ol>
      </div>
    `;
    
    // Add code example if provided
    if (rec.code) {
      html += `
        <!-- Code Example -->
        <div class="bg-gray-900 dark:bg-slate-950 rounded-lg p-4 mb-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-mono text-gray-400">HTML</p>
            <button onclick="copyCode(this)" class="text-xs text-primary-400 hover:text-primary-300">
              Copy
            </button>
          </div>
          <pre class="text-sm text-green-400 font-mono overflow-x-auto"><code>${rec.code}</code></pre>
        </div>
      `;
    }
    
    // Add best practices if provided
    if (rec.bestPractices && rec.bestPractices.length > 0) {
      html += `
        <!-- Best Practices -->
        <details class="mb-4">
          <summary class="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition">
            💡 Best Practices &amp; Tips
          </summary>
          <ul class="mt-3 text-sm text-gray-700 dark:text-gray-300 space-y-2 pl-4">
            ${rec.bestPractices.map(tip => `<li>• ${tip}</li>`).join('')}
          </ul>
        </details>
      `;
    }
    
    // Add action button
    html += `
      <!-- Action Button -->
      <button onclick="markCompleted(this)" class="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition">
        Mark as Completed ✓
      </button>
    `;
    
    card.innerHTML = html;
    container.appendChild(card);
    
    // Trigger animation
    setTimeout(() => {
      card.classList.add('is-visible');
    }, 100 * index);
  });
}

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
function showPreviewFallback(url) {
  const loading  = document.getElementById('preview-loading');
  const skeleton = document.getElementById('preview-skeleton');
  const img      = document.getElementById('web-preview-img');
  const fallback = document.getElementById('preview-fallback');

  if (loading)  loading.style.display  = 'none';
  if (skeleton) skeleton.style.display = 'none';
  if (img)      img.style.display      = 'none';
  if (fallback) fallback.style.display = 'flex';

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
      clearTimeout(skeletonTimer);
      showPreviewFallback(cleanUrl);
      return;
    }

    const { url: screenshotUrl } = await response.json();

    // Preload image before swapping in
    const testImg = new Image();
    await new Promise((resolve, reject) => {
      testImg.onload  = resolve;
      testImg.onerror = reject;
      testImg.src     = screenshotUrl;
      setTimeout(reject, 12000); // 12s image-load timeout
    });

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


// Update history
function updateHistory() {
  const container = document.getElementById('history-list');
  
  if (appState.history.length === 0) {
    container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-8">No history yet. Analyze a website to get started!</p>';
    return;
  }
  
  container.innerHTML = appState.history.map((item, index) => `
    <div class="border-b border-gray-100 dark:border-slate-700 last:border-0 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors px-4 rounded-lg" onclick="loadHistoryItem(${index})">
      <div class="flex justify-between items-center">
        <div>
          <p class="font-semibold text-gray-800 dark:text-gray-200">${item.url}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">${item.timestamp}</p>
        </div>
        <div class="text-2xl font-bold text-primary-600 dark:text-primary-500">${item.scores.total}</div>
      </div>
    </div>
  `).join('');
}

// Load history item
function loadHistoryItem(index) {
  const item = appState.history[index];
  if (item) {
    displayResults(item);
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
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
      alert('Error: ' + (result ? result.error : 'Unknown error'));
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
});