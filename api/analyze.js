// api/analyze.js — Production-grade SEO crawler with SSRF protection, DNS rebinding guards,
// response bounds, and JSDOM analysis.

import { JSDOM } from 'jsdom';
import {
  validateUrlStructure,
  safeFetch,
  apiRateLimiter,
  getClientIp
} from './_security.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1-hour cache
const cache = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Fetch robots.txt safely
// ---------------------------------------------------------------------------
async function fetchRobotsTxt(baseUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const res = await safeFetch(robotsUrl, {
      timeoutMs: 5000,
      maxRedirects: 3,
      maxSizeBytes: 512 * 1024, // 512 KB
      allowedContentTypes: ['text/plain', 'text/html']
    });
    if (!res.ok) return { found: false, disallowsAll: false, hasSitemap: false };
    const text = await res.text();
    return {
      found: true,
      disallowsAll: /user-agent:\s*\*/i.test(text) && /disallow:\s*\/\s*$/im.test(text),
      hasSitemap: /sitemap:/i.test(text)
    };
  } catch {
    return { found: false, disallowsAll: false, hasSitemap: false };
  }
}

// ---------------------------------------------------------------------------
// Calculate structured scores (server-verified)
// ---------------------------------------------------------------------------
export function calculateScores(data) {
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
  if (data.h1Count > 0) scores.onPage += 3;
  if (!data.imagesWithoutAlt || data.imagesWithoutAlt === 0) scores.onPage += 2;

  // Technical (max 30)
  if (data.url && data.url.startsWith('https')) scores.technical += 10;
  if (data.hasViewport) scores.technical += 10;
  if (data.h1Count === 1) scores.technical += 5;
  if (data.wordCount >= 300) scores.technical += 5;

  // Content (max 20)
  if (data.wordCount >= 300) scores.content += 5;
  if (data.wordCount >= 600) scores.content += 5;
  if (data.h2Count > 0) scores.content += 5;
  scores.content += 5; // Base content score

  // Links (max 10)
  if (data.linkCount >= 5) scores.links += 5;
  if (data.linkCount >= 10) scores.links += 5;

  scores.total = Math.min(100, scores.onPage + scores.technical + scores.content + scores.links);
  return scores;
}

// ---------------------------------------------------------------------------
// Extract all SEO-relevant data from the parsed DOM
// ---------------------------------------------------------------------------
export function extractData(doc, finalUrl, robotsInfo) {
  const titleEl = doc.querySelector('title');
  const title = titleEl ? titleEl.textContent.trim() : '';

  const metaDescEl = doc.querySelector('meta[name="description"]');
  const metaDesc = metaDescEl ? (metaDescEl.getAttribute('content') || '') : '';

  const h1Tags = doc.querySelectorAll('h1');
  const h2Tags = doc.querySelectorAll('h2');
  const images = doc.querySelectorAll('img');
  const links = doc.querySelectorAll('a[href]');

  const bodyText = doc.body ? doc.body.textContent : '';
  const wordCount = bodyText.trim().split(/\s+/).filter(w => w.length > 0).length;

  const hasViewport = !!doc.querySelector('meta[name="viewport"]');
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  const canonical = canonicalEl ? canonicalEl.getAttribute('href') || '' : '';

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

  const imagesWithoutAlt = doc.querySelectorAll('img:not([alt]), img[alt=""]').length;

  const stopWords = new Set([
    'the','a','an','is','are','was','were','be','been','have','has','had',
    'do','does','did','will','would','should','could','can','may','might',
    'of','in','on','at','to','for','from','by','with','about','as','or','and'
  ]);
  const wordFreq = {};
  bodyText.toLowerCase().split(/\W+/).forEach(word => {
    if (word.length > 3 && !stopWords.has(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });
  const topKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const rawData = {
    url: finalUrl,
    title: title || 'Missing',
    metaDesc: metaDesc || 'Missing',
    h1Count: h1Tags.length,
    h2Count: h2Tags.length,
    imageCount: images.length,
    imagesWithoutAlt,
    linkCount: links.length,
    wordCount,
    hasViewport,
    canonical,
    ogTitle,
    ogDesc,
    ogImage,
    topKeywords,
    robots: robotsInfo,
    timestamp: new Date().toISOString()
  };

  const scores = calculateScores(rawData);

  // Compile structured terrain / audit findings
  const issues = [
    {
      id: 'title-audit',
      name: 'Title Tag Audit',
      category: 'onPage',
      passed: rawData.title !== 'Missing' && rawData.title.length >= 30 && rawData.title.length <= 60,
      severity: rawData.title === 'Missing' ? 'Critical' : 'Improvement',
      status: rawData.title === 'Missing' ? 'Missing title tag' : `Length suboptimal (${rawData.title.length} chars)`,
      passedStatus: `Optimal length (${rawData.title.length} chars)`,
      value: rawData.title,
      terrainRegion: 'summit',
      fix: rawData.title === 'Missing' ? 'Add a `<title>Target Keyword | Brand</title>` in `<head>`.' : 'Adjust title tag to between 30 and 60 characters.'
    },
    {
      id: 'meta-desc',
      name: 'Meta Description',
      category: 'onPage',
      passed: rawData.metaDesc !== 'Missing' && rawData.metaDesc.length >= 120 && rawData.metaDesc.length <= 160,
      severity: rawData.metaDesc === 'Missing' ? 'Critical' : 'Improvement',
      status: rawData.metaDesc === 'Missing' ? 'No meta description found' : `Length outside 120-160 range (${rawData.metaDesc.length} chars)`,
      passedStatus: `Optimal description length (${rawData.metaDesc.length} chars)`,
      value: rawData.metaDesc,
      terrainRegion: 'ridge-east',
      fix: 'Provide a compelling meta description between 120 and 160 characters.'
    },
    {
      id: 'h1-presence',
      name: 'H1 Primary Heading',
      category: 'onPage',
      passed: rawData.h1Count > 0,
      severity: 'Critical',
      status: 'No H1 heading detected',
      passedStatus: `H1 heading present (Count: ${rawData.h1Count})`,
      value: rawData.h1Count,
      terrainRegion: 'summit',
      fix: 'Include a primary H1 heading defining the page topic.'
    },
    {
      id: 'single-h1',
      name: 'Single H1 Structure',
      category: 'technical',
      passed: rawData.h1Count === 1,
      severity: 'Improvement',
      status: rawData.h1Count === 0 ? 'No H1 present' : `Multiple H1 tags (${rawData.h1Count})`,
      passedStatus: 'Exactly one H1 used',
      value: rawData.h1Count,
      terrainRegion: 'ridge-west',
      fix: 'Maintain a single primary H1 tag for coherent heading hierarchy.'
    },
    {
      id: 'image-alt',
      name: 'Image Alt Tags',
      category: 'onPage',
      passed: rawData.imagesWithoutAlt === 0,
      severity: 'Improvement',
      status: `${rawData.imagesWithoutAlt} of ${rawData.imageCount} images missing alt text`,
      passedStatus: `All ${rawData.imageCount} images contain alt attributes`,
      value: rawData.imagesWithoutAlt,
      terrainRegion: 'terrace-north',
      fix: 'Add descriptive alt text to all image tags.'
    },
    {
      id: 'https-security',
      name: 'HTTPS Transport Layer',
      category: 'technical',
      passed: rawData.url.startsWith('https://'),
      severity: 'Critical',
      status: 'Insecure HTTP protocol',
      passedStatus: 'Secure HTTPS protocol enabled',
      value: rawData.url.startsWith('https://') ? 'HTTPS' : 'HTTP',
      terrainRegion: 'base-valley',
      fix: 'Redirect all traffic to secure HTTPS and install valid TLS certificate.'
    },
    {
      id: 'viewport-mobile',
      name: 'Mobile Viewport Meta',
      category: 'technical',
      passed: rawData.hasViewport,
      severity: 'Critical',
      status: 'Viewport meta tag missing',
      passedStatus: 'Mobile viewport configured properly',
      value: rawData.hasViewport ? 'Present' : 'Missing',
      terrainRegion: 'ridge-west',
      fix: 'Add `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.'
    },
    {
      id: 'content-depth',
      name: 'Content Depth & Words',
      category: 'content',
      passed: rawData.wordCount >= 600,
      severity: rawData.wordCount < 300 ? 'Critical' : 'Improvement',
      status: rawData.wordCount < 300 ? `Thin content (${rawData.wordCount} words)` : `Word count ${rawData.wordCount} (optimal is 600+)`,
      passedStatus: `Substantial content (${rawData.wordCount} words)`,
      value: rawData.wordCount,
      terrainRegion: 'plateau-south',
      fix: 'Expand page copy with in-depth explanations and context.'
    },
    {
      id: 'h2-structure',
      name: 'H2 Section Subheadings',
      category: 'content',
      passed: rawData.h2Count > 0,
      severity: 'Improvement',
      status: 'No H2 subheadings found',
      passedStatus: `H2 subheadings present (${rawData.h2Count} sections)`,
      value: rawData.h2Count,
      terrainRegion: 'plateau-south',
      fix: 'Structure content sections under clear H2 headings.'
    },
    {
      id: 'link-architecture',
      name: 'Link Architecture',
      category: 'links',
      passed: rawData.linkCount >= 10,
      severity: 'Improvement',
      status: `Sparse link density (${rawData.linkCount} links)`,
      passedStatus: `Healthy link architecture (${rawData.linkCount} links)`,
      value: rawData.linkCount,
      terrainRegion: 'watershed-east',
      fix: 'Integrate relevant internal and external contextual links.'
    },
    {
      id: 'robots-crawlability',
      name: 'Crawl Directives (robots.txt)',
      category: 'technical',
      passed: !(rawData.robots?.disallowsAll),
      severity: 'Critical',
      status: rawData.robots?.disallowsAll ? 'Search bots disallowed from crawling site' : 'Robots.txt not configured',
      passedStatus: 'Search engines permitted to crawl site',
      value: rawData.robots?.found ? 'Found' : 'Not Found',
      terrainRegion: 'base-valley',
      fix: 'Ensure robots.txt allows public crawlers access to public indexable pages.'
    }
  ];

  return {
    success: true,
    ...rawData,
    scores,
    issues
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // Rate Limiting
  const clientIp = getClientIp(req);
  const rateCheck = apiRateLimiter.isRateLimited(clientIp);
  if (rateCheck.limited) {
    res.setHeader('Retry-After', rateCheck.retryAfter);
    return res.status(429).json({
      success: false,
      error: 'rate-limited',
      message: `Rate limit reached. Please wait ${rateCheck.retryAfter}s before submitting another scan.`
    });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  // Strict URL & Protocol Validation
  const urlCheck = validateUrlStructure(url);
  if (!urlCheck.valid) {
    return res.status(400).json({
      success: false,
      error: 'invalid-url',
      message: urlCheck.error
    });
  }
  const parsedUrl = urlCheck.parsedUrl;

  // Cache Check
  const cacheKey = parsedUrl.href.replace(/\/$/, '').toLowerCase();
  purgeExpired();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('X-Analyze-Cache', 'HIT');
    return res.status(200).json({ ...cached.data, cached: true });
  }

  // Parallel Safe Fetch
  let pageRes;
  let robotsInfo;
  try {
    const [pageResult, robotsResult] = await Promise.all([
      safeFetch(parsedUrl.href, {
        timeoutMs: 8000,
        maxRedirects: 5,
        maxSizeBytes: 5 * 1024 * 1024,
        allowedContentTypes: ['text/html', 'application/xhtml+xml', 'application/xml']
      }),
      fetchRobotsTxt(parsedUrl.href)
    ]);
    pageRes = pageResult;
    robotsInfo = robotsResult;
  } catch (err) {
    console.error(`[Crawler Error for ${parsedUrl.hostname}]:`, err.message);

    if (err.name === 'TimeoutError' || err.message.includes('timed out')) {
      return res.status(504).json({
        success: false,
        error: 'timeout',
        message: 'The target server took longer than 8 seconds to respond. The site may be slow or offline.'
      });
    }

    if (err.message.includes('SSRF') || err.message.includes('restricted')) {
      return res.status(400).json({
        success: false,
        error: 'restricted-network',
        message: 'The requested destination resolved to a private or restricted network address.'
      });
    }

    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return res.status(502).json({
        success: false,
        error: 'dns-failed',
        message: 'DNS lookup failed. The domain does not exist or has expired.'
      });
    }

    if (err.message.includes('Unsupported Content-Type')) {
      return res.status(415).json({
        success: false,
        error: 'unsupported-media-type',
        message: err.message
      });
    }

    return res.status(502).json({
      success: false,
      error: 'unreachable',
      message: 'Failed to establish a secure connection to the destination server.'
    });
  }

  if (!pageRes.ok) {
    if (pageRes.status === 403 || pageRes.status === 401) {
      return res.status(403).json({
        success: false,
        error: 'bot-blocked',
        message: 'Target server blocked automated inspection (HTTP 403 Forbidden).'
      });
    }
    return res.status(502).json({
      success: false,
      error: 'site-error',
      message: `Target server returned status code ${pageRes.status}.`
    });
  }

  // Parse HTML
  let html;
  try {
    html = await pageRes.text();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'body-read-failed',
      message: 'Failed to read response body.'
    });
  }

  let doc;
  try {
    const dom = new JSDOM(html, { url: parsedUrl.href });
    doc = dom.window.document;
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'parse-failed',
      message: 'Failed to parse page HTML.'
    });
  }

  try {
    const result = extractData(doc, parsedUrl.href, robotsInfo);
    cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    res.setHeader('X-Analyze-Cache', 'MISS');
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'extract-failed',
      message: 'Failed to process page metrics.'
    });
  }
}
