// tests/security.test.js — Regression tests for SSRF, IP filtering, URL validation, and rate limiting
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  isPrivateOrReservedIP,
  validateUrlStructure,
  validateDnsResolution,
  safeFetch,
  apiRateLimiter
} from '../api/_security.js';

test('SSRF Guard: Private & Loopback IPv4 addresses are rejected', () => {
  const privateIps = [
    '127.0.0.1',
    '127.255.255.255',
    '10.0.0.1',
    '10.254.1.99',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.0.1',
    '192.168.1.254',
    '169.254.169.254',
    '169.254.1.1',     
    '0.0.0.0',
    '100.64.0.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',      
    '255.255.255.255' 
  ];

  for (const ip of privateIps) {
    assert.strictEqual(isPrivateOrReservedIPv4(ip), true, `Expected ${ip} to be blocked`);
    assert.strictEqual(isPrivateOrReservedIP(ip), true, `Expected ${ip} to be blocked by universal checker`);
  }
});

test('SSRF Guard: Public routable IPv4 addresses are permitted', () => {
  const publicIps = [
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '142.250.190.46',
    '151.101.1.69'
  ];

  for (const ip of publicIps) {
    assert.strictEqual(isPrivateOrReservedIPv4(ip), false, `Expected ${ip} to be allowed`);
    assert.strictEqual(isPrivateOrReservedIP(ip), false, `Expected ${ip} to be allowed by universal checker`);
  }
});

test('SSRF Guard: Private, Loopback, and Mapped IPv6 addresses are rejected', () => {
  const privateIpv6 = [
    '::1',
    '0:0:0:0:0:0:0:1',
    '::',
    'fc00::1',
    'fd12:3456:789a:1::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:192.168.1.1',
    '::ffff:169.254.169.254',
    '100::1',
    '2001:db8::1'
  ];

  for (const ip of privateIpv6) {
    assert.strictEqual(isPrivateOrReservedIPv6(ip), true, `Expected IPv6 ${ip} to be blocked`);
    assert.strictEqual(isPrivateOrReservedIP(ip), true, `Expected IPv6 ${ip} to be blocked by universal checker`);
  }
});

test('SSRF Guard: Public IPv6 addresses are permitted', () => {
  const publicIpv6 = [
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '2a00:1450:4009:81f::200e'
  ];

  for (const ip of publicIpv6) {
    assert.strictEqual(isPrivateOrReservedIPv6(ip), false, `Expected IPv6 ${ip} to be allowed`);
    assert.strictEqual(isPrivateOrReservedIP(ip), false, `Expected IPv6 ${ip} to be allowed by universal checker`);
  }
});

test('URL Validation: Enforces HTTP/HTTPS and rejects forbidden schemes and credentials', () => {
  // Disallowed schemes
  const badUrls = [
    'file:///etc/passwd',
    'gopher://127.0.0.1:70',
    'ftp://example.com',
    'javascript:alert(1)',
    'data:text/html,<h1>test</h1>',
    'http://admin:secret@example.com', // embedded credentials
    'http://localhost/admin',
    'http://127.0.0.1:8080',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal',
    'http://app.local',
    'http://internal-service.internal'
  ];

  for (const url of badUrls) {
    const res = validateUrlStructure(url);
    assert.strictEqual(res.valid, false, `Expected URL '${url}' to be rejected`);
  }

  // Allowed valid URLs
  const goodUrls = [
    'https://example.com',
    'http://example.com/blog?page=1',
    'https://subdomain.google.com/path',
    'wikipedia.org'
  ];

  for (const url of goodUrls) {
    const res = validateUrlStructure(url);
    assert.strictEqual(res.valid, true, `Expected URL '${url}' to be valid`);
  }
});

test('DNS Resolution: Rejects hostnames resolving to private IPs', async () => {
  await assert.rejects(
    async () => {
      await validateDnsResolution('127.0.0.1');
    },
    /restricted/i
  );
});

test('Rate Limiter: Limits excessive requests within time window', () => {
  const testIp = '198.51.100.99';
  const limiter = new (apiRateLimiter.constructor)(1000, 3); // 3 requests per 1s

  assert.strictEqual(limiter.isRateLimited(testIp).limited, false);
  assert.strictEqual(limiter.isRateLimited(testIp).limited, false);
  assert.strictEqual(limiter.isRateLimited(testIp).limited, false);

  // 4th request must be rate-limited
  const fourth = limiter.isRateLimited(testIp);
  assert.strictEqual(fourth.limited, true);
  assert.strictEqual(fourth.retryAfter >= 1, true);
});
