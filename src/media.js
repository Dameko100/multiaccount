'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

const MEDIA_DIR = path.join(__dirname, '..', 'data', 'media');
const MAX_UPLOAD_BYTES = 4 * 1024 ** 3; // TikTok's ceiling; nobody else takes more
const ID_RE = /^[a-f0-9]{24}$/;

const MIME_BY_EXT = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };

function mimeFromName(name) {
  return MIME_BY_EXT[path.extname(name || '').toLowerCase()] || 'video/mp4';
}

function formatBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

// Streams an uploaded video to data/media/<id> with a JSON sidecar.
async function saveUpload(stream, { name, mime, dir = MEDIA_DIR }) {
  if (!/^video\//.test(mime || '')) throw Object.assign(new Error('Solo se aceptan archivos de vídeo.'), { status: 415 });
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomBytes(12).toString('hex');
  const file = path.join(dir, id);
  let size = 0;
  const counter = new (require('node:stream').Transform)({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) return cb(Object.assign(new Error('El vídeo supera 4 GB.'), { status: 413 }));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(stream, counter, fs.createWriteStream(file));
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
  if (!size) { fs.rmSync(file, { force: true }); throw Object.assign(new Error('Archivo vacío.'), { status: 400 }); }
  const meta = { id, name: path.basename(name || 'video.mp4'), mime, size, uploadedAt: new Date().toISOString() };
  fs.writeFileSync(`${file}.json`, JSON.stringify(meta));
  return meta;
}

function getMedia(id, dir = MEDIA_DIR) {
  if (!ID_RE.test(String(id || ''))) return null;
  const file = path.join(dir, id);
  try {
    const meta = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'));
    return { ...meta, path: file };
  } catch { return null; }
}

function deleteMedia(id, dir = MEDIA_DIR) {
  if (!ID_RE.test(String(id || ''))) return false;
  fs.rmSync(path.join(dir, id), { force: true });
  fs.rmSync(path.join(dir, `${id}.json`), { force: true });
  return true;
}

// Video handed to every platform of one publish. The bytes are read (or
// downloaded) once and shared, however many platforms ask for them.
function createVideo({ path: filePath, url, name, mime, size }, fetchImpl = globalThis.fetch) {
  let pending;
  const video = {
    path: filePath || '',
    url: url || '',
    name: name || (filePath ? path.basename(filePath) : (url ? path.basename(new URL(url).pathname) : 'video.mp4')) || 'video.mp4',
    mime: mime || mimeFromName(name || filePath || url),
    size: size || 0,
    getBuffer() {
      pending ||= (async () => {
        if (filePath) return fs.promises.readFile(filePath);
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(`No se pudo descargar el vídeo (${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        video.size = buf.length;
        return buf;
      })();
      return pending;
    },
    async getBlob() {
      return new Blob([await video.getBuffer()], { type: video.mime });
    },
  };
  return video;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Calls check() until it returns a truthy value or time runs out.
async function poll(check, { interval = 3000, timeout = 10 * 60 * 1000, sleep: wait = sleep, what = 'el procesado' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const done = await check();
    if (done) return done;
    if (Date.now() > deadline) throw new Error(`Tiempo de espera agotado esperando ${what}.`);
    await wait(interval);
  }
}

module.exports = { MEDIA_DIR, MAX_UPLOAD_BYTES, saveUpload, getMedia, deleteMedia, createVideo, mimeFromName, formatBytes, poll, sleep };
