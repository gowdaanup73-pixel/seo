// api/analyze.js
// Vercel serverless function — fetches and parses a target URL server-side.
//
// Performance improvements in this version:
//   • robots.txt is fetched in parallel with the page fetch (zero extra latency)
//   • extractData() is synchronous so it immediately follows JSDOM parse
//
// Security measures (unchanged):
//   • Rejects non-http(s) schemes
//   • Rejects localhost / 127.x / [::1] / private IP ranges (SSRF protection)
//   • Enforces an 8-second fetch timeout so a slow target can't hang the function

import { JSDOM } from 'jsdom';

const FETCH_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// SSRF guard — returns true if the hostname is safe to fetch
// ---------------------------------------------------------------------------
function isSafeHostname(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1') return false;
  if (/^127\./.test(h)) return false;
  if (/^10\./.test(h)) return false;
  if (/^192\.168\./.test(h)) return false;
  const m = h.match(/^172\.(\d+)\./);
  if (m && parseInt(m[1], 10) >= 16 && parseInt(m[1], 10) <= 31) return false;
  if (/^169\.254\./.test(h)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Fetch robots.txt — best-effort, never throws
// ---------------------------------------------------------------------------
async function fetchRobotsTxt(baseUrl, signal) {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const res = await fetch(robotsUrl, {
      signal,
      headers: { 'User-Agent': 'StreetCodersSEOBot/1.0 (+https://streetcoders.dev)' },
      redirect: 'follow'
    });
    if (!res.ok) return { found: false, disallowsAll: false, hasSitemap: false };
    const text = await res.text();
    return {
      found: true,
      // Rough check: does any User-agent: * block have Disallow: /
      disallowsAll: /user-agent:\s*\*/i.test(text) && /disallow:\s*\/\s*$/im.test(text),
      hasSitemap: /sitemap:/i.test(text)
    };
  } catch {
    return { found: false, disallowsAll: false, hasSitemap: false };
  }
}

// ---------------------------------------------------------------------------
// Extract all SEO-relevant data from the parsed DOM
// ---------------------------------------------------------------------------
function extractData(doc, finalUrl, robotsInfo) {
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

  // Viewport present?
  const hasViewport = !!doc.querySelector('meta[name="viewport"]');

  // Canonical link present?
  const canonicalEl = doc.querySelector('link[rel="canonical"]');
  const canonical = canonicalEl ? canonicalEl.getAttribute('href') || '' : '';

  // Open Graph basics
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
  const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

  // Images missing alt
  const imagesWithoutAlt = doc.querySelectorAll('img:not([alt]), img[alt=""]').length;

  // Top keywords (stop-word filtered, frequency-sorted)
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

  return {
    success: true,
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
    timestamp: new Date().toLocaleString()
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  let { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  url = url.trim();

  // Normalise: prepend https:// if no scheme present
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Parse and validate
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid URL format' });
  }

  // Scheme check — only http and https allowed
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ success: false, error: 'Only http and https URLs are supported' });
  }

  // SSRF guard
  if (!isSafeHostname(parsedUrl.hostname)) {
    return res.status(400).json({ success: false, error: 'Target host is not permitted' });
  }

  // ------------------------------------------------------------------
  // Parallel fetch: page HTML + robots.txt at the same time
  // The robots fetch shares the same AbortController so both are
  // cancelled together if the timeout fires.
  // ------------------------------------------------------------------
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html;
  let robotsInfo;

  try {
    const [pageRes, robotsResult] = await Promise.all([
      fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml',
          'User-Agent': 'StreetCodersSEOBot/1.0 (+https://streetcoders.dev)'
        },
        redirect: 'follow'
      }),
      fetchRobotsTxt(url, controller.signal)
    ]);

    clearTimeout(timeoutId);

    if (!pageRes.ok) {
      return res.status(502).json({
        success: false,
        error: `Target site returned HTTP ${pageRes.status}`
      });
    }

    // Read body and store robots result (robots is already resolved)
    html = await pageRes.text();
    robotsInfo = robotsResult;

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res.status(504).json({ success: false, error: 'Target site timed out (8 s)' });
    }
    console.error('analyze fetch error:', err);
    return res.status(502).json({ success: false, error: 'Failed to fetch target site' });
  }

  // Parse HTML with JSDOM (server-side DOMParser equivalent)
  let doc;
  try {
    const dom = new JSDOM(html, { url });
    doc = dom.window.document;
  } catch (err) {
    console.error('JSDOM parse error:', err);
    return res.status(500).json({ success: false, error: 'Failed to parse HTML' });
  }

  // Extract data and respond
  try {
    const result = extractData(doc, url, robotsInfo);
    return res.status(200).json(result);
  } catch (err) {
    console.error('extractData error:', err);
    return res.status(500).json({ success: false, error: 'Failed to extract SEO data' });
  }
}
