// tests/ui_integrity.test.js — Regression checks for UI integrity, chatbot absence, and 3D terrain binding
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('UI Integrity: index.html contains Terra Incognita terrain and design elements', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Key visual & 3D elements
  assert.ok(doc.getElementById('mountain-canvas-container'), 'Mountain 3D canvas container must exist');
  assert.ok(doc.getElementById('mountain-scanning-overlay'), 'Scanning overlay must exist');
  assert.ok(doc.getElementById('terrain-inspector-card'), 'Contextual inspector card must exist');
  assert.ok(doc.getElementById('score-total'), 'Overall summit score element must exist');
  assert.ok(doc.getElementById('recommendations-container'), 'Recommendations container must exist');
  assert.ok(doc.getElementById('web-preview-img'), 'Web preview image element must exist');
  assert.ok(doc.getElementById('history-container'), 'History container must exist');

  // Script tags
  const scripts = Array.from(doc.querySelectorAll('script')).map(s => s.getAttribute('src')).filter(Boolean);
  assert.ok(scripts.some(s => s.includes('three')), 'Three.js must be loaded');
  assert.ok(scripts.includes('terrain.js'), 'terrain.js must be loaded');
  assert.ok(scripts.includes('app.js'), 'app.js must be loaded');
});

test('Chatbot Removal: No dangling chatbot elements or scripts exist', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  assert.strictEqual(doc.getElementById('chatbot-container'), null, 'Chatbot container must not exist');
  assert.strictEqual(doc.getElementById('chat-window'), null, 'Chat window must not exist');
  assert.strictEqual(doc.getElementById('chat-messages'), null, 'Chat messages must not exist');
  assert.strictEqual(doc.getElementById('chat-input'), null, 'Chat input must not exist');
  assert.strictEqual(doc.getElementById('chat-toggle-btn'), null, 'Chat toggle button must not exist');

  const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf-8');
  assert.strictEqual(appJs.includes('sendChatMessage'), false, 'sendChatMessage must not exist in app.js');
  assert.strictEqual(appJs.includes('toggleChat'), false, 'toggleChat must not exist in app.js');
  assert.strictEqual(appJs.includes('chatOpen'), false, 'chatOpen must not exist in app.js');
  assert.strictEqual(appJs.includes('/api/ai-recommend'), false, 'ai-recommend endpoint must not be referenced');

  assert.strictEqual(fs.existsSync(path.join(rootDir, 'api', 'ai-recommend.js')), false, 'ai-recommend.js must be deleted');
});
