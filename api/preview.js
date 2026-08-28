// api/preview.js
// Vercel serverless function — proxies and caches website screenshot requests.
//
// Why server-side?
//   • Fixes the encodeURIComponent bug: thum.io needs the URL as a plain path
//     segment, not percent-encoded. Client code was sending 400s silently.
//   • 24-hour in-memory cache: same URL won't trigger a new screenshot render
//     on repeat visits within the same function instance lifetime.
//   • Hides the thum.io URL pattern from the client.
//   • SSRF guard: only allows http/https to public hosts (same rules as /api/analyze).
//
// Cache strategy:
//   Vercel serverless functions are stateless across cold starts, so in-memory
//   cache is best-effort (warm instances share it; cold starts reset it).
//   For a portfolio-scale app this is fine — thum.io is fast enough that a
//   cache miss costs ~2-3 s, not a fatal UX hit. Upgrade to Vercel KV when
//   traffic warrants persistent caching.
//
// Response:
//   { url: string }  — the thum.io image URL the client should load.
//   The client still loads the image directly (no need to proxy binary data).

const THUM_BASE = 'https://image.thum.io/get/width/1200/crop/800/noanimate/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache: Map<normalizedUrl, { screenshotUrl, expiresAt }>
const cache = new Map();

// Purge entries older than TTL (runs on each request to avoid unbounded growth)
function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}

// SSRF guard (mirrors /api/analyze)
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }

  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https URLs are supported' });
  }

  if (!isSafeHostname(parsedUrl.hostname)) {
    return res.status(400).json({ error: 'Target host is not permitted' });
  }

  // Normalise cache key: strip trailing slash, lowercase host
  const cacheKey = parsedUrl.href.replace(/\/$/, '');

  purgeExpired();

  // Cache hit
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('X-Preview-Cache', 'HIT');
    return res.status(200).json({ url: cached.screenshotUrl, cached: true });
  }

  // Build thum.io URL — append target URL as a plain path segment (NOT encoded)
  // thum.io rejects percent-encoded URLs with 400.
  const screenshotUrl = THUM_BASE + cacheKey;

  // Verify thum.io will actually serve an image (HEAD request, 5s timeout)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const probe = await fetch(screenshotUrl, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);

    if (!probe.ok) {
      return res.status(502).json({ 
        success: false, 
        error: 'preview-unavailable', 
        message: 'Thum.io screenshot service returned an error. The target domain might block screenshots.' 
      });
    }
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(502).json({ 
      success: false, 
      error: isTimeout ? 'preview-timeout' : 'preview-unreachable', 
      message: isTimeout ? 'Generating the website preview timed out (5s).' : 'Screenshot service was unreachable.' 
    });
  }

  // Cache and return
  cache.set(cacheKey, { screenshotUrl, expiresAt: Date.now() + CACHE_TTL_MS });
  res.setHeader('X-Preview-Cache', 'MISS');
  return res.status(200).json({ url: screenshotUrl, success: true });
}
