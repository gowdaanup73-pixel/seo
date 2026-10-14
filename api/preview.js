// api/preview.js — Proxies and validates website screenshot requests with SSRF guards
import {
  validateUrlStructure,
  validateDnsResolution,
  apiRateLimiter,
  getClientIp
} from './_security.js';

const THUM_BASE = 'https://image.thum.io/get/width/1200/crop/800/noanimate/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const cache = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}

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
      message: `Too many requests. Please wait ${rateCheck.retryAfter}s.`
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

  // DNS & SSRF Validation
  try {
    await validateDnsResolution(parsedUrl.hostname);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'restricted-host',
      message: 'The requested target hostname is restricted or invalid.'
    });
  }

  // Normalise cache key
  const cacheKey = parsedUrl.href.replace(/\/$/, '').toLowerCase();
  purgeExpired();

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('X-Preview-Cache', 'HIT');
    return res.status(200).json({ url: cached.screenshotUrl, cached: true, success: true });
  }

  // Build thum.io URL
  const screenshotUrl = THUM_BASE + cacheKey;

  // Verify thum.io will serve image (5s timeout)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const probe = await fetch(screenshotUrl, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);

    if (!probe.ok) {
      return res.status(502).json({
        success: false,
        error: 'preview-unavailable',
        message: 'Preview service returned an error. Target site may block rendering.'
      });
    }
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(502).json({
      success: false,
      error: isTimeout ? 'preview-timeout' : 'preview-unreachable',
      message: isTimeout ? 'Screenshot generation timed out.' : 'Screenshot service unreachable.'
    });
  }

  cache.set(cacheKey, { screenshotUrl, expiresAt: Date.now() + CACHE_TTL_MS });
  res.setHeader('X-Preview-Cache', 'MISS');
  return res.status(200).json({ url: screenshotUrl, success: true });
}
