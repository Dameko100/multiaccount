'use strict';
const { request } = require('../http');
const { createTokenStore } = require('../tokens');

const API = 'https://open.tiktokapis.com/v2';
const MB = 1024 * 1024;
const SINGLE_CHUNK_MAX = 64 * MB;
const CHUNK = 10 * MB;

// TikTok chunk rules: whole file if <= 64 MB; otherwise fixed chunks with the
// remainder folded into the last one (count = floor(size / chunk)).
function chunkPlan(size) {
  if (size <= SINGLE_CHUNK_MAX) return { chunkSize: size, count: 1 };
  return { chunkSize: CHUNK, count: Math.floor(size / CHUNK) };
}

async function accessToken(env, fetch, store) {
  const refresh = store.get('tiktok_refresh_token') || env.TIKTOK_REFRESH_TOKEN;
  const data = await request(fetch, `${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  if (!data.access_token) throw new Error(`TikTok no devolvió token: ${data.error_description || data.error || 'desconocido'}`);
  if (data.refresh_token && data.refresh_token !== refresh) store.set('tiktok_refresh_token', data.refresh_token);
  return data.access_token;
}

function apiError(data) {
  const code = data?.error?.code;
  return code && code !== 'ok' ? new Error(`TikTok: ${code} ${data.error.message || ''}`.trim()) : null;
}

module.exports = {
  id: 'tiktok',
  name: 'TikTok',
  rules: { maxLength: 2200 },
  image: 'none',
  video: 'required',
  videoMaxBytes: 4 * 1024 * MB,
  requiredEnv: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN'],
  setupUrl: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
  chunkPlan,
  async publish({ text, env, fetch, video, tokenStore = createTokenStore() }) {
    const token = await accessToken(env, fetch, tokenStore);
    const json = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' };
    // "draft" sends the video to the TikTok app inbox to finish there; works
    // before the app passes TikTok's audit. "direct" publishes straight away.
    const mode = (env.TIKTOK_MODE || 'direct').toLowerCase();
    const buffer = await video.getBuffer();
    const { chunkSize, count } = chunkPlan(buffer.length);
    const source_info = { source: 'FILE_UPLOAD', video_size: buffer.length, chunk_size: chunkSize, total_chunk_count: count };

    let body;
    let endpoint;
    if (mode === 'draft') {
      endpoint = `${API}/post/publish/inbox/video/init/`;
      body = { source_info };
    } else {
      const creator = await request(fetch, `${API}/post/publish/creator_info/query/`, { method: 'POST', headers: json, body: '{}' });
      const err = apiError(creator);
      if (err) throw err;
      const options = creator.data?.privacy_level_options || [];
      const privacy = env.TIKTOK_PRIVACY || 'PUBLIC_TO_EVERYONE';
      if (options.length && !options.includes(privacy)) {
        throw new Error(`TikTok no permite la privacidad ${privacy} para esta cuenta/app (opciones: ${options.join(', ')}). Las apps sin auditar solo pueden usar SELF_ONLY: pon TIKTOK_PRIVACY=SELF_ONLY o TIKTOK_MODE=draft.`);
      }
      endpoint = `${API}/post/publish/video/init/`;
      body = {
        post_info: { title: text, privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
        source_info,
      };
    }

    const init = await request(fetch, endpoint, { method: 'POST', headers: json, body: JSON.stringify(body) });
    const err = apiError(init);
    if (err) throw err;
    const { publish_id: publishId, upload_url: uploadUrl } = init.data || {};

    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? buffer.length : start + chunkSize;
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': video.mime,
          'Content-Range': `bytes ${start}-${end - 1}/${buffer.length}`,
        },
        body: buffer.subarray(start, end),
      });
      if (!res.ok) throw new Error(`TikTok rechazó el trozo ${i + 1}/${count}: HTTP ${res.status}`);
    }
    return { id: publishId, note: mode === 'draft' ? 'Enviado a la bandeja de TikTok: termina la publicación en la app.' : undefined };
  },
};
