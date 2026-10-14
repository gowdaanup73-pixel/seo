// tests/api.test.js — Automated tests for /api/analyze and scoring logic
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { calculateScores, extractData } from '../api/analyze.js';
import analyzeHandler from '../api/analyze.js';
import previewHandler from '../api/preview.js';

function mockReq(body = {}, method = 'POST', headers = {}) {
  return {
    method,
    body,
    headers: {
      'x-forwarded-for': '198.51.100.42',
      ...headers
    },
    socket: { remoteAddress: '198.51.100.42' }
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    ended: false,
    body: null,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      this.ended = true;
      return this;
    },
    send(data) {
      this.body = data;
      this.ended = true;
      return this;
    }
  };
  return res;
}

test('API Analyze: Rejects non-POST requests with 405 Method Not Allowed', async () => {
  const req = mockReq({}, 'GET');
  const res = mockRes();
  await analyzeHandler(req, res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.body.error, 'Method Not Allowed');
});

test('API Analyze: Rejects missing URL with 400 Bad Request', async () => {
  const req = mockReq({ url: '' }, 'POST');
  const res = mockRes();
  await analyzeHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
});

test('API Analyze: Blocks SSRF attempts to localhost and private IPs', async () => {
  const targets = [
    'http://localhost',
    'http://127.0.0.1:8080',
    'http://192.168.1.1',
    'http://10.0.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal'
  ];

  for (const target of targets) {
    const req = mockReq({ url: target });
    const res = mockRes();
    await analyzeHandler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message || res.body.error, /prohibited|restricted|invalid/i);
  }
});

test('API Preview: Rejects SSRF targets', async () => {
  const req = mockReq({ url: 'http://127.0.0.1:3000' });
  const res = mockRes();
  await previewHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
});

test('Scoring Engine: Computes precise points across all categories', () => {
  // Test case 1: Perfect website
  const perfectData = {
    title: 'Precision Landscape & Architecture - Geological Analysis', // 55 chars
    metaDesc: 'Discover bespoke geological terrain analysis, sculptural architectural visualization, and fine editorial topography design with precision instruments.', // 152 chars
    h1Count: 1,
    h2Count: 4,
    imageCount: 5,
    imagesWithoutAlt: 0,
    linkCount: 12,
    wordCount: 850,
    hasViewport: true,
    url: 'https://example.com'
  };

  const scores = calculateScores(perfectData);
  assert.strictEqual(scores.onPage, 40);
  assert.strictEqual(scores.technical, 30);
  assert.strictEqual(scores.content, 20);
  assert.strictEqual(scores.links, 10);
  assert.strictEqual(scores.total, 100);

  // Test case 2: Site with common flaws
  const flawedData = {
    title: 'Missing',
    metaDesc: 'Missing',
    h1Count: 0,
    h2Count: 0,
    imageCount: 4,
    imagesWithoutAlt: 4,
    linkCount: 1,
    wordCount: 120,
    hasViewport: false,
    url: 'http://insecure-site.com'
  };

  const flawedScores = calculateScores(flawedData);
  assert.strictEqual(flawedScores.onPage, 0);
  assert.strictEqual(flawedScores.technical, 0);
  assert.strictEqual(flawedScores.content, 5); // base content score
  assert.strictEqual(flawedScores.links, 0);
  assert.strictEqual(flawedScores.total, 5);
});

test('Data Extraction: Generates structured audit and terrain issue list', () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Topographic Survey of Modern SEO Terrains</title>
      <meta name="description" content="Explore geological terrain visualization and technical SEO analysis. We provide architectural intelligence for complex web systems.">
      <link rel="canonical" href="https://topoterrain.com">
    </head>
    <body>
      <h1>Topographic SEO Architecture</h1>
      <h2>Ridge Elevation</h2>
      <p>This is comprehensive technical documentation detailing the nuances of search architecture. We analyze deep links, structured content, and crawl accessibility across distributed networks.</p>
      <h2>Plateau Terraces</h2>
      <p>Geological formations reflect structured data hierarchies in digital landscapes.</p>
      <img src="mountain.jpg" alt="Sculptural mountain ridge">
      <img src="chart.png">
      <a href="/about">About</a>
      <a href="/research">Research</a>
      <a href="/contact">Contact</a>
      <a href="/docs">Docs</a>
      <a href="/blog">Blog</a>
      <a href="/pricing">Pricing</a>
    </body>
    </html>
  `;

  const dom = new JSDOM(sampleHtml, { url: 'https://topoterrain.com' });
  const robots = { found: true, disallowsAll: false, hasSitemap: true };
  const extracted = extractData(dom.window.document, 'https://topoterrain.com', robots);

  assert.strictEqual(extracted.success, true);
  assert.strictEqual(extracted.title, 'Topographic Survey of Modern SEO Terrains');
  assert.strictEqual(extracted.h1Count, 1);
  assert.strictEqual(extracted.h2Count, 2);
  assert.strictEqual(extracted.imageCount, 2);
  assert.strictEqual(extracted.imagesWithoutAlt, 1);
  assert.strictEqual(extracted.linkCount, 6);
  assert.strictEqual(extracted.hasViewport, true);
  assert.strictEqual(extracted.robots.found, true);

  // Issues list must contain terrainRegion definitions for 3D mountain
  assert.ok(Array.isArray(extracted.issues));
  assert.ok(extracted.issues.length >= 10);
  assert.ok(extracted.issues.some(i => i.terrainRegion === 'summit'));
  assert.ok(extracted.issues.some(i => i.terrainRegion === 'ridge-west'));
  assert.ok(extracted.issues.some(i => i.id === 'image-alt' && !i.passed));
});
