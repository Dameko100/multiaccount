'use strict';
const { request } = require('../http');
const { poll } = require('../media');

const BASE = 'https://graph.threads.net/v1.0';

module.exports = {
  id: 'threads',
  name: 'Threads',
  rules: { maxLength: 500 },
  image: 'optional',
  // Threads downloads the video itself, so it needs a public URL.
  video: 'url',
  videoMaxBytes: 1024 * 1024 * 1024,
  requiredEnv: ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'],
  setupUrl: 'https://developers.facebook.com/docs/threads/get-started',
  async publish({ text, post, env, fetch, video, sleep }) {
    const token = env.THREADS_ACCESS_TOKEN;
    const params = new URLSearchParams({ text, access_token: token, media_type: 'TEXT' });
    if (video) {
      params.set('media_type', 'VIDEO');
      params.set('video_url', video.url);
    } else if (post.imageUrl) {
      params.set('media_type', 'IMAGE');
      params.set('image_url', post.imageUrl);
    }
    const container = await request(fetch, `${BASE}/${env.THREADS_USER_ID}/threads`, { method: 'POST', body: params });
    if (video) {
      await poll(async () => {
        const s = await request(fetch, `${BASE}/${container.id}?fields=status,error_message&access_token=${encodeURIComponent(token)}`);
        if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new Error(`Threads no pudo procesar el vídeo: ${s.error_message || s.status}`);
        return s.status === 'FINISHED';
      }, { sleep, what: 'a que Threads procese el vídeo' });
    }
    const res = await request(fetch, `${BASE}/${env.THREADS_USER_ID}/threads_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    return { id: res.id };
  },
};
