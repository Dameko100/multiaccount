'use strict';
const crypto = require('node:crypto');
const { request } = require('../http');
const { poll } = require('../media');

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// OAuth 1.0a HMAC-SHA1 signature. `params` = oauth params plus any query or
// form-urlencoded params (JSON and multipart bodies are not signed).
function oauthSignature(method, url, params, consumerSecret, tokenSecret) {
  const paramString = Object.keys(params).sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`).join('&');
  const base = [method.toUpperCase(), enc(url), enc(paramString)].join('&');
  const key = `${enc(consumerSecret)}&${enc(tokenSecret || '')}`;
  return crypto.createHmac('sha1', key).update(base).digest('base64');
}

function oauthHeader(method, url, env, query = {}) {
  const oauth = {
    oauth_consumer_key: env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: env.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  oauth.oauth_signature = oauthSignature(method, url, { ...query, ...oauth }, env.X_API_SECRET, env.X_ACCESS_SECRET);
  return 'OAuth ' + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(', ');
}

const TWEETS = 'https://api.x.com/2/tweets';
const UPLOAD = 'https://api.x.com/2/media/upload';
const SEGMENT = 4 * 1024 * 1024;

function mediaId(data) {
  return data?.data?.id || data?.media_id_string || (data?.media_id && String(data.media_id));
}
function processing(data) {
  return data?.data?.processing_info || data?.processing_info;
}

// Chunked upload: INIT → APPEND × n → FINALIZE → STATUS until processed.
async function uploadVideo(video, env, fetch, sleep) {
  const buffer = await video.getBuffer();
  const form = (fields) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };
  const post = (fields) => request(fetch, UPLOAD, { method: 'POST', headers: { Authorization: oauthHeader('POST', UPLOAD, env) }, body: form(fields) });

  const init = await post({ command: 'INIT', media_type: video.mime, total_bytes: String(buffer.length), media_category: 'tweet_video' });
  const id = mediaId(init);
  if (!id) throw new Error('X no devolvió media_id.');

  for (let i = 0, start = 0; start < buffer.length; i++, start += SEGMENT) {
    await post({ command: 'APPEND', media_id: id, segment_index: String(i), media: new Blob([buffer.subarray(start, start + SEGMENT)], { type: video.mime }) });
  }

  let info = processing(await post({ command: 'FINALIZE', media_id: id }));
  if (info && info.state !== 'succeeded') {
    await poll(async () => {
      const query = { command: 'STATUS', media_id: id };
      const url = `${UPLOAD}?${new URLSearchParams(query)}`;
      info = processing(await request(fetch, url, { headers: { Authorization: oauthHeader('GET', UPLOAD, env, query) } }));
      if (info?.state === 'failed') throw new Error(`X no pudo procesar el vídeo: ${info.error?.message || 'error'}`);
      return !info || info.state === 'succeeded';
    }, { interval: (info.check_after_secs || 3) * 1000, sleep, what: 'a que X procese el vídeo' });
  }
  return id;
}

module.exports = {
  id: 'x',
  name: 'X (Twitter)',
  rules: { maxLength: 280, urlWeight: 23 },
  image: 'none',
  video: 'optional',
  videoMaxBytes: 512 * 1024 * 1024,
  requiredEnv: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'],
  setupUrl: 'https://developer.x.com/en/portal/dashboard',
  oauthSignature,
  oauthHeader,
  async publish({ text, env, fetch, video, sleep }) {
    const body = { text };
    if (video) body.media = { media_ids: [await uploadVideo(video, env, fetch, sleep)] };
    const data = await request(fetch, TWEETS, {
      method: 'POST',
      headers: { Authorization: oauthHeader('POST', TWEETS, env), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const id = data?.data?.id;
    return { id, url: id ? `https://x.com/i/web/status/${id}` : undefined };
  },
};
