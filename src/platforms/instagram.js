'use strict';
const { request } = require('../http');
const { poll } = require('../media');

const VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

module.exports = {
  id: 'instagram',
  name: 'Instagram',
  // Links in captions are not clickable on Instagram; keep them anyway so
  // people can copy the URL ("link en la bio" works better).
  rules: { maxLength: 2200 },
  image: 'optional',
  video: 'optional', // published as a Reel
  requiresMedia: true,
  videoMaxBytes: 300 * 1024 * 1024,
  requiredEnv: ['INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN'],
  setupUrl: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
  async publish({ text, post, env, fetch, video, sleep }) {
    const token = env.INSTAGRAM_ACCESS_TOKEN;
    const user = env.INSTAGRAM_USER_ID;
    let container;

    if (video && video.url) {
      container = await request(fetch, `${BASE}/${user}/media`, {
        method: 'POST',
        body: new URLSearchParams({ media_type: 'REELS', video_url: video.url, caption: text, share_to_feed: 'true', access_token: token }),
      });
    } else if (video) {
      // Resumable upload: create the container, then send the bytes to rupload.
      container = await request(fetch, `${BASE}/${user}/media`, {
        method: 'POST',
        body: new URLSearchParams({ media_type: 'REELS', upload_type: 'resumable', caption: text, share_to_feed: 'true', access_token: token }),
      });
      const buffer = await video.getBuffer();
      await request(fetch, container.uri || `https://rupload.facebook.com/ig-api-upload/${VERSION}/${container.id}`, {
        method: 'POST',
        headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(buffer.length) },
        body: buffer,
      });
    } else if (post.imageUrl) {
      container = await request(fetch, `${BASE}/${user}/media`, {
        method: 'POST',
        body: new URLSearchParams({ image_url: post.imageUrl, caption: text, access_token: token }),
      });
    } else {
      throw new Error('Instagram necesita una imagen o un vídeo.');
    }

    if (video) {
      await poll(async () => {
        const s = await request(fetch, `${BASE}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
        if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram no pudo procesar el vídeo: ${s.status || s.status_code}`);
        return s.status_code === 'FINISHED';
      }, { sleep, what: 'a que Instagram procese el Reel' });
    }

    const res = await request(fetch, `${BASE}/${user}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    return { id: res.id };
  },
};
