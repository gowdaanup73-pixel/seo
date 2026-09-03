// dev-server.js — Local dev server that bridges Vercel-style serverless handlers
// Serves static files from project root + routes /api/* to api/*.js handlers
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

// MIME types for static files
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
};

// Lazy-load API handlers (ESM dynamic import)
const handlerCache = {};
async function loadHandler(name) {
  if (!handlerCache[name]) {
    const modulePath = path.join(__dirname, 'api', `${name}.js`);
    if (!fs.existsSync(modulePath)) return null;
    const mod = await import(`file://${modulePath.replace(/\\/g, '/')}`);
    handlerCache[name] = mod.default;
  }
  return handlerCache[name];
}

// Minimal req/res shim to match Vercel's (req.body, res.status().json())
function shimRequest(req, body) {
  try { req.body = JSON.parse(body); } catch { req.body = {}; }
  return req;
}

function shimResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  };
  res.send = (data) => { res.end(data); };
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── API routes: /api/<name> → api/<name>.js default export ──
  const apiMatch = url.pathname.match(/^\/api\/([a-z-]+)$/);
  if (apiMatch) {
    const handlerName = apiMatch[1];
    const handler = await loadHandler(handlerName);
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `No handler for /api/${handlerName}` }));
      return;
    }

    // Collect body
    let body = '';
    for await (const chunk of req) body += chunk;

    try {
      await handler(shimRequest(req, body), shimResponse(res));
    } catch (err) {
      console.error(`[API ERROR] /api/${handlerName}:`, err);
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  // ── Static files ──
  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  filePath = path.normalize(filePath);

  // Security: don't serve outside project root
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🚀  Dev server running at  http://localhost:${PORT}\n`);
  console.log(`  Static files:  ${__dirname}`);
  console.log(`  API routes:    /api/analyze, /api/preview, /api/ai-recommend\n`);
});
