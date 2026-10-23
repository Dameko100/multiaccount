'use strict';
const { request } = require('../http');
const { firstLine, normalizeHashtags } = require('../format');

async function accessToken(env, fetch) {
  const data = await request(fetch, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  return data.access_token;
}

// YouTube titles: max 100 chars, no angle brackets.
function cleanTitle(title) {
  return firstLine(String(title).replace(/[<>]/g, ''), 100) || 'Limited Sniper';
}

module.exports = {
  id: 'youtube',
  name: 'YouTube',
  rules: { maxLength: 5000 },
  image: 'none',
  video: 'required',
  requiredEnv: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN'],
  setupUrl: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  cleanTitle,
  async publish({ text, post, env, fetch, video }) {
    const token = await accessToken(env, fetch);
    const buffer = await video.getBuffer();
    const metadata = {
      snippet: {
        title: cleanTitle(post.title || post.text),
        description: text.replace(/[<>]/g, ''),
        tags: normalizeHashtags(post.hashtags).map((t) => t.slice(1)),
        categoryId: env.YOUTUBE_CATEGORY_ID || '20', // 20 = Gaming
        defaultLanguage: post.lang || 'es',
      },
      status: {
        privacyStatus: env.YOUTUBE_PRIVACY || 'public',
        selfDeclaredMadeForKids: false,
      },
    };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': video.mime,
        'X-Upload-Content-Length': String(buffer.length),
      },
      body: JSON.stringify(metadata),
    });
    if (!init.ok) throw new Error(`HTTP ${init.status}: ${(await init.text()).slice(0, 300)}`);
    const uploadUrl = init.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube no devolvió la URL de subida.');

    const res = await request(fetch, uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': video.mime },
      body: buffer,
    });
    return { id: res.id, url: res.id ? `https://www.youtube.com/watch?v=${res.id}` : undefined };
  },
};
