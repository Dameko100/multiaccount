'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv } = require('./config');

loadEnv();

const { platforms, isConfigured, rulesFor } = require('./platforms');
const { preview, publish } = require('./publisher');
const { createHistory } = require('./history');
const { templates, LINK } = require('./templates');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const MAX_BODY = 1024 * 1024;

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function normalizePost(body) {
  const post = {
    text: String(body.text || ''),
    link: body.link === undefined ? (process.env.DEFAULT_LINK || LINK) : String(body.link || ''),
    hashtags: body.hashtags || [],
    imageUrl: body.imageUrl ? String(body.imageUrl) : '',
    imageAlt: body.imageAlt ? String(body.imageAlt) : '',
    title: body.title ? String(body.title) : '',
    subreddit: body.subreddit ? String(body.subreddit) : '',
    lang: body.lang ? String(body.lang) : 'es',
    overrides: body.overrides && typeof body.overrides === 'object' ? body.overrides : {},
  };
  if (post.imageUrl && !/^https:\/\//i.test(post.imageUrl)) {
    throw Object.assign(new Error('La URL de la imagen debe ser pública y empezar por https://'), { status: 400 });
  }
  return post;
}

function createServer({ env = process.env, fetch = globalThis.fetch, history = createHistory() } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/platforms' && req.method === 'GET') {
        return sendJson(res, 200, platforms.map((p) => ({
          id: p.id, name: p.name, maxLength: p.rules.maxLength, image: p.image,
          configured: isConfigured(p, env), requiredEnv: p.requiredEnv, setupUrl: p.setupUrl,
        })));
      }
      if (url.pathname === '/api/templates' && req.method === 'GET') {
        return sendJson(res, 200, { link: env.DEFAULT_LINK || LINK, templates });
      }
      if (url.pathname === '/api/history' && req.method === 'GET') {
        return sendJson(res, 200, history.read());
      }
      if (url.pathname === '/api/preview' && req.method === 'POST') {
        const body = await readJson(req);
        return sendJson(res, 200, preview(normalizePost(body), body.platforms || [], env));
      }
      if (url.pathname === '/api/publish' && req.method === 'POST') {
        const body = await readJson(req);
        const ids = Array.isArray(body.platforms) ? body.platforms : [];
        if (!ids.length) return sendJson(res, 400, { error: 'Elige al menos una plataforma.' });
        const post = normalizePost(body);
        if (!post.text.trim()) return sendJson(res, 400, { error: 'El texto está vacío.' });
        const dryRun = Boolean(body.dryRun);
        const results = await publish(post, ids, { env, fetch, dryRun });
        const entry = { at: new Date().toISOString(), dryRun, post: { ...post, overrides: undefined }, results };
        if (!dryRun) history.add(entry);
        return sendJson(res, 200, entry);
      }
      if (req.method === 'GET') return serveStatic(url.pathname, res);
      return sendJson(res, 404, { error: 'No encontrado' });
    } catch (err) {
      return sendJson(res, err.status || 500, { error: err.message });
    }
  });
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('No encontrado');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

module.exports = { createServer, normalizePost, rulesFor };

if (require.main === module) {
  const port = Number(process.env.PORT) || 4545;
  // Localhost by default: this process holds every platform's credentials.
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => {
    const ready = platforms.filter((p) => isConfigured(p)).map((p) => p.name);
    console.log(`Multiaccount listo en http://${host}:${port}`);
    console.log(`Plataformas configuradas: ${ready.length ? ready.join(', ') : 'ninguna (edita .env)'}`);
  });
}
