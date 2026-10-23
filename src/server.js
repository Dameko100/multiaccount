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
const { saveUpload, getMedia, deleteMedia, MEDIA_DIR } = require('./media');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
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

const publicMedia = ({ path: _p, ...meta }) => meta;

function normalizePost(body, mediaDir = MEDIA_DIR) {
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
  const videoUrl = body.videoUrl ? String(body.videoUrl).trim() : '';
  if (videoUrl && !/^https:\/\//i.test(videoUrl)) {
    throw Object.assign(new Error('La URL del vídeo debe ser pública y empezar por https://'), { status: 400 });
  }
  if (body.videoId) {
    const media = getMedia(body.videoId, mediaDir);
    if (!media) throw Object.assign(new Error('El vídeo subido ya no existe. Vuelve a subirlo.'), { status: 400 });
    post.video = { path: media.path, name: media.name, mime: media.mime, size: media.size, url: videoUrl };
  } else if (videoUrl) {
    post.video = { url: videoUrl };
  }
  return post;
}

function createServer({ env = process.env, fetch = globalThis.fetch, history = createHistory(), mediaDir = MEDIA_DIR, sleep } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const mediaMatch = url.pathname.match(/^\/api\/media\/([a-f0-9]{24})$/);
    try {
      if (url.pathname === '/api/media' && req.method === 'POST') {
        const name = decodeURIComponent(req.headers['x-filename'] || 'video.mp4');
        const meta = await saveUpload(req, { name, mime: req.headers['content-type'], dir: mediaDir });
        return sendJson(res, 201, meta);
      }
      if (mediaMatch && req.method === 'GET') {
        const media = getMedia(mediaMatch[1], mediaDir);
        return media ? sendJson(res, 200, publicMedia(media)) : sendJson(res, 404, { error: 'No encontrado' });
      }
      if (mediaMatch && req.method === 'DELETE') {
        deleteMedia(mediaMatch[1], mediaDir);
        return sendJson(res, 200, { ok: true });
      }
      const fileMatch = url.pathname.match(/^\/media\/([a-f0-9]{24})$/);
      if (fileMatch && req.method === 'GET') return serveMedia(getMedia(fileMatch[1], mediaDir), req, res);
      if (url.pathname === '/api/platforms' && req.method === 'GET') {
        return sendJson(res, 200, platforms.map((p) => ({
          id: p.id, name: p.name, maxLength: p.rules.maxLength, image: p.image,
          video: p.video || 'none', videoMaxBytes: p.videoMaxBytes || null, requiresMedia: Boolean(p.requiresMedia),
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
        return sendJson(res, 200, preview(normalizePost(body, mediaDir), body.platforms || [], env));
      }
      if (url.pathname === '/api/publish' && req.method === 'POST') {
        const body = await readJson(req);
        const ids = Array.isArray(body.platforms) ? body.platforms : [];
        if (!ids.length) return sendJson(res, 400, { error: 'Elige al menos una plataforma.' });
        const post = normalizePost(body, mediaDir);
        if (!post.text.trim()) return sendJson(res, 400, { error: 'El texto está vacío.' });
        const dryRun = Boolean(body.dryRun);
        const results = await publish(post, ids, { env, fetch, dryRun, ...(sleep ? { sleep } : {}) });
        const video = post.video ? { name: post.video.name, url: post.video.url, size: post.video.size } : undefined;
        const entry = { at: new Date().toISOString(), dryRun, post: { ...post, overrides: undefined, video }, results };
        if (!dryRun) history.add(entry);
        return sendJson(res, 200, entry);
      }
      if (req.method === 'GET') return serveStatic(url.pathname, res);
      return sendJson(res, 404, { error: 'No encontrado' });
    } catch (err) {
      if (res.headersSent) return res.destroy();
      return sendJson(res, err.status || 500, { error: err.message });
    }
  });
  // Big video uploads and slow platform processing can take minutes.
  server.requestTimeout = 0;
  return server;
}

// Video preview with Range support so the <video> player can seek.
function serveMedia(media, req, res) {
  if (!media) { res.writeHead(404); return res.end(); }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, media.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), media.size - 1) : media.size - 1;
    if (start >= media.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${media.size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': media.mime, 'Content-Range': `bytes ${start}-${end}/${media.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return fs.createReadStream(media.path, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': media.mime, 'Accept-Ranges': 'bytes', 'Content-Length': media.size });
  fs.createReadStream(media.path).pipe(res);
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
