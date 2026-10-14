// api/_security.js — Comprehensive SSRF, DNS rebinding, rate limiting, and security guards
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------
export const MAX_REDIRECTS = 5;
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB max response size
export const DEFAULT_TIMEOUT_MS = 8000;             // 8 seconds timeout

// Restricted domain suffixes and names
const FORBIDDEN_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
  '169.254.169.254'
]);

const FORBIDDEN_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
  '.onion',
  '.corp',
  '.lan',
  '.home.arpa'
];

// ---------------------------------------------------------------------------
// IP Classification & Safety Verification
// ---------------------------------------------------------------------------

/**
 * Checks whether an IPv4 address string falls into a private, loopback,
 * link-local, multicast, or reserved CIDR range.
 */
export function isPrivateOrReservedIPv4(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed treated as unsafe
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network RFC 1122)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private-Use RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared Address Space / CGNAT RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback RFC 1122)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-Local / Cloud Metadata RFC 3927)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private-Use RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments RFC 6890)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1 RFC 5737)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast RFC 7526)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private-Use RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network Interconnect Device Benchmark Testing RFC 2544)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2 RFC 5737)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3 RFC 5737)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast RFC 5771)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved for Future Use RFC 1112) + 255.255.255.255 Broadcast
  if (a >= 240) return true;

  return false;
}

/**
 * Expands and parses an IPv6 address into eight 16-bit integers.
 */
function parseIPv6Words(ip) {
  const clean = ip.toLowerCase().trim().replace(/^\[|\]$/g, '');

  // Check IPv4-mapped notation (e.g. ::ffff:192.168.1.1)
  const mappedMatch = clean.match(/^(?:.*:)?(\d+\.\d+\.\d+\.\d+)$/);
  let v4Words = null;
  let baseStr = clean;

  if (mappedMatch) {
    const v4 = mappedMatch[1];
    const parts = v4.split('.').map(Number);
    if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      v4Words = [(parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]];
      baseStr = clean.slice(0, clean.lastIndexOf(':'));
      if (baseStr === '') baseStr = '::';
    } else {
      return null;
    }
  }

  // Handle double colon :: expansion
  const segments = baseStr.split('::');
  if (segments.length > 2) return null;

  const left = segments[0] ? segments[0].split(':').filter(Boolean) : [];
  const right = segments.length === 2 && segments[1] ? segments[1].split(':').filter(Boolean) : [];

  const needed = (v4Words ? 6 : 8) - (left.length + right.length);
  if (needed < 0) return null;

  const fill = Array(needed).fill('0');
  const hexParts = segments.length === 2 ? [...left, ...fill, ...right] : left;
  if (v4Words) {
    hexParts.push(v4Words[0].toString(16), v4Words[1].toString(16));
  }

  if (hexParts.length !== 8) return null;

  const words = hexParts.map(h => parseInt(h, 16));
  if (words.some(w => isNaN(w) || w < 0 || w > 0xffff)) return null;

  return words;
}

/**
 * Checks whether an IPv6 address string falls into a private, loopback,
 * link-local, site-local, multicast, or reserved CIDR range.
 */
export function isPrivateOrReservedIPv6(ip) {
  if (!ip || typeof ip !== 'string') return true;

  const words = parseIPv6Words(ip);
  if (!words) return true; // Malformed treated as unsafe

  // Unspecified (::/128)
  if (words.every(w => w === 0)) return true;

  // Loopback (::1/128)
  if (words.slice(0, 7).every(w => w === 0) && words[7] === 1) return true;

  // IPv4-mapped IPv6 (::ffff:0:0/96)
  if (words.slice(0, 5).every(w => w === 0) && words[5] === 0xffff) {
    const v4 = `${(words[6] >> 8) & 0xff}.${words[6] & 0xff}.${(words[7] >> 8) & 0xff}.${words[7] & 0xff}`;
    return isPrivateOrReservedIPv4(v4);
  }

  // IPv4-compatible (::/96)
  if (words.slice(0, 6).every(w => w === 0) && words[6] !== 0) {
    const v4 = `${(words[6] >> 8) & 0xff}.${words[6] & 0xff}.${(words[7] >> 8) & 0xff}.${words[7] & 0xff}`;
    return isPrivateOrReservedIPv4(v4);
  }

  // Unique Local Addresses (fc00::/7 -> fc00 to fdff)
  if ((words[0] & 0xfe00) === 0xfc00) return true;

  // Link-Local Unicast (fe80::/10 -> fe80 to febf)
  if ((words[0] & 0xffc0) === 0xfe80) return true;

  // Multicast (ff00::/8)
  if ((words[0] & 0xff00) === 0xff00) return true;

  // Discard-Only (100::/64)
  if (words[0] === 0x0100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return true;

  // Documentation (2001:db8::/32)
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true;

  // 6to4 relay prefix (2002::/16)
  if (words[0] === 0x2002) {
    const v4 = `${(words[1] >> 8) & 0xff}.${words[1] & 0xff}.${(words[2] >> 8) & 0xff}.${words[2] & 0xff}`;
    if (isPrivateOrReservedIPv4(v4)) return true;
  }

  return false;
}

/**
 * Universal IP safety checker.
 */
export function isPrivateOrReservedIP(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const cleanIp = ip.replace(/^\[|\]$/g, ''); // strip IPv6 brackets if present
  const family = net.isIP(cleanIp);
  if (family === 4) return isPrivateOrReservedIPv4(cleanIp);
  if (family === 6) return isPrivateOrReservedIPv6(cleanIp);
  return true; // Not a valid IP format -> reject
}

// ---------------------------------------------------------------------------
// URL & Hostname Verification
// ---------------------------------------------------------------------------

/**
 * Validates a user-supplied URL and its hostname before any network call.
 * Returns { valid: boolean, parsedUrl?: URL, error?: string }
 */
export function validateUrlStructure(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return { valid: false, error: 'url is required and must be a string' };
  }

  let trimmed = inputUrl.trim();
  if (trimmed.length > 2048) {
    return { valid: false, error: 'URL exceeds maximum permitted length of 2048 characters' };
  }

  // Check if scheme is present
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return { valid: false, error: `Protocol '${scheme}:' is not permitted. Only http: and https: are allowed.` };
    }
  } else {
    // No scheme present, default to https://
    trimmed = 'https://' + trimmed;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Malformed URL format' };
  }

  // Strict protocol allowlist
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http and https protocols are permitted' };
  }

  // Reject embedded credentials (http://user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with embedded authentication credentials are not permitted' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname.length === 0) {
    return { valid: false, error: 'Target URL hostname is missing' };
  }

  // Check forbidden exact hostnames
  if (FORBIDDEN_HOSTNAMES.has(hostname)) {
    return { valid: false, error: `Access to restricted host '${hostname}' is prohibited` };
  }

  // Check forbidden domain suffixes
  for (const suffix of FORBIDDEN_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { valid: false, error: `Access to internal domain suffix '${suffix}' is prohibited` };
    }
  }

  // If hostname is directly an IP address, validate immediately
  const cleanHost = hostname.replace(/^\[|\]$/g, '');
  const ipFamily = net.isIP(cleanHost);
  if (ipFamily !== 0 && isPrivateOrReservedIP(cleanHost)) {
    return { valid: false, error: `Direct access to private or reserved IP '${hostname}' is prohibited` };
  }

  return { valid: true, parsedUrl: parsed };
}

/**
 * Resolves all DNS records (A and AAAA) for a hostname and verifies that
 * none of them point to private, loopback, or reserved IP ranges.
 */
export async function validateDnsResolution(hostname) {
  const cleanHost = hostname.replace(/^\[|\]$/g, '');
  // If it's already an IP, test it directly
  if (net.isIP(cleanHost)) {
    if (isPrivateOrReservedIP(cleanHost)) {
      throw new Error(`Hostname '${hostname}' is a restricted private IP address`);
    }
    return [{ address: cleanHost, family: net.isIP(cleanHost) }];
  }

  let addresses;
  try {
    addresses = await dns.promises.lookup(cleanHost, { all: true, verbatim: true });
  } catch (err) {
    const error = new Error(`DNS resolution failed for '${hostname}': ${err.code || err.message}`);
    error.code = err.code || 'ENOTFOUND';
    throw error;
  }

  if (!addresses || addresses.length === 0) {
    const error = new Error(`No DNS records found for '${hostname}'`);
    error.code = 'ENOTFOUND';
    throw error;
  }

  for (const record of addresses) {
    if (isPrivateOrReservedIP(record.address)) {
      throw new Error(`SSRF blocked: Domain '${hostname}' resolves to restricted IP ${record.address}`);
    }
  }

  return addresses;
}

// ---------------------------------------------------------------------------
// Pinning Safe HTTP/HTTPS Agents (DNS Rebinding & TOCTOU Protection)
// ---------------------------------------------------------------------------

/**
 * Creates custom agents for http and https that validate resolved IP
 * addresses immediately prior to socket creation.
 */
function createSafeAgent(isHttps) {
  const options = {
    keepAlive: false,
    timeout: DEFAULT_TIMEOUT_MS,
    lookup: (hostname, lookupOpts, callback) => {
      const cleanHost = hostname.replace(/^\[|\]$/g, '');
      dns.lookup(cleanHost, lookupOpts, (err, addresses, family) => {
        if (err) return callback(err);
        const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family }];
        for (const record of list) {
          const ip = typeof record === 'string' ? record : record.address;
          if (isPrivateOrReservedIP(ip)) {
            return callback(new Error(`SSRF blocked: Socket connection resolves to restricted IP ${ip}`));
          }
        }
        if (Array.isArray(addresses)) {
          callback(null, addresses);
        } else {
          callback(null, addresses, family);
        }
      });
    }
  };

  return isHttps ? new https.Agent(options) : new http.Agent(options);
}

const safeHttpAgent = createSafeAgent(false);
const safeHttpsAgent = createSafeAgent(true);

// ---------------------------------------------------------------------------
// Secure Fetch Wrapper (SSRF-hardened, Redirect-controlled, Size-bounded)
// ---------------------------------------------------------------------------

/**
 * Fetch a URL safely with:
 * - Pre-flight URL & DNS validation
 * - Socket-level DNS rebinding protection
 * - Manual, validated redirect following
 * - Strict response timeouts
 * - Maximum response size enforcement
 * - Content-Type allowlisting
 */
export async function safeFetch(targetUrl, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = MAX_REDIRECTS,
    maxSizeBytes = MAX_RESPONSE_BYTES,
    allowedContentTypes = null, // e.g. ['text/html', 'application/xhtml+xml']
    headers = {},
    redirectCount = 0
  } = options;

  if (redirectCount > maxRedirects) {
    throw new Error(`Maximum redirect limit of ${maxRedirects} exceeded`);
  }

  // 1. Validate URL structure
  const urlCheck = validateUrlStructure(targetUrl);
  if (!urlCheck.valid) {
    throw new Error(`Invalid URL: ${urlCheck.error}`);
  }
  const parsedUrl = urlCheck.parsedUrl;

  // 2. Pre-flight DNS resolution
  await validateDnsResolution(parsedUrl.hostname);

  // 3. Perform manual request using Node http/https with safe agent
  return new Promise((resolve, reject) => {
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const agent = isHttps ? safeHttpsAgent : safeHttpAgent;

    let timedOut = false;
    const reqHeaders = {
      'User-Agent': 'TerraIncognitaSEOBot/2.0 (+https://streetcoders.dev; security-audited)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.1',
      ...headers,
      'Host': parsedUrl.host
    };

    const reqOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: reqHeaders,
      agent,
      timeout: timeoutMs
    };

    const req = client.request(reqOptions, async (res) => {
      // 4. Handle Redirects Manually
      const statusCode = res.statusCode || 200;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        res.resume(); // consume response to free memory
        const redirectLocation = res.headers['location'];
        if (!redirectLocation) {
          return reject(new Error(`Redirect response (HTTP ${statusCode}) missing Location header`));
        }

        let nextUrl;
        try {
          nextUrl = new URL(redirectLocation, parsedUrl.href).href;
        } catch {
          return reject(new Error(`Invalid redirect Location URL: '${redirectLocation}'`));
        }

        try {
          const redirectRes = await safeFetch(nextUrl, {
            ...options,
            redirectCount: redirectCount + 1
          });
          return resolve(redirectRes);
        } catch (err) {
          return reject(err);
        }
      }

      // 5. Check Content-Type if specified
      const contentType = (res.headers['content-type'] || '').toLowerCase();
      if (allowedContentTypes && allowedContentTypes.length > 0) {
        const matchesAllowed = allowedContentTypes.some(ct => contentType.includes(ct.toLowerCase()));
        if (!matchesAllowed) {
          res.resume();
          return reject(new Error(`Unsupported Content-Type '${contentType}'. Permitted types: ${allowedContentTypes.join(', ')}`));
        }
      }

      // 6. Check Content-Length if present
      const contentLengthHeader = res.headers['content-length'];
      if (contentLengthHeader) {
        const length = parseInt(contentLengthHeader, 10);
        if (!isNaN(length) && length > maxSizeBytes) {
          res.resume();
          return reject(new Error(`Response size ${length} bytes exceeds maximum permitted size of ${maxSizeBytes} bytes`));
        }
      }

      // 7. Stream & size-cap body
      let totalBytes = 0;
      const chunks = [];

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxSizeBytes) {
          req.destroy(new Error(`Response body exceeded maximum allowed limit of ${maxSizeBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          url: parsedUrl.href,
          text: async () => bodyBuffer.toString('utf-8'),
          buffer: async () => bodyBuffer
        });
      });

      res.on('error', (err) => {
        reject(err);
      });
    });

    req.on('timeout', () => {
      timedOut = true;
      req.destroy();
      const err = new Error(`Connection timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
    });

    req.on('error', (err) => {
      if (timedOut) return;
      reject(err);
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// In-Memory Rate Limiter (Sliding Window per IP)
// ---------------------------------------------------------------------------
class RateLimiter {
  constructor(windowMs = 60000, maxRequests = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.clients = new Map();
  }

  isRateLimited(ip) {
    const key = ip || 'anonymous';
    const now = Date.now();
    let record = this.clients.get(key);

    if (!record) {
      record = { timestamps: [] };
      this.clients.set(key, record);
    }

    // Filter timestamps within window
    const cutoff = now - this.windowMs;
    record.timestamps = record.timestamps.filter(ts => ts > cutoff);

    if (record.timestamps.length >= this.maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfter = Math.ceil((oldest + this.windowMs - now) / 1000);
      return { limited: true, retryAfter: Math.max(1, retryAfter) };
    }

    record.timestamps.push(now);
    return { limited: false, remaining: this.maxRequests - record.timestamps.length };
  }

  purge() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [key, record] of this.clients) {
      record.timestamps = record.timestamps.filter(ts => ts > cutoff);
      if (record.timestamps.length === 0) this.clients.delete(key);
    }
  }
}

export const apiRateLimiter = new RateLimiter(60000, 30); // 30 req/min
setInterval(() => apiRateLimiter.purge(), 300000).unref(); // purge every 5 mins

/**
 * Extracts client IP from request headers or socket.
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}
