'use strict';
const { request } = require('../http');
const { poll } = require('../media');

module.exports = {
  id: 'mastodon',
  name: 'Mastodon',
  rules: { maxLength: 500, urlWeight: 23 },
  image: 'optional',
  video: 'optional',
  videoMaxBytes: 99 * 1024 * 1024,
  requiredEnv: ['MASTODON_INSTANCE', 'MASTODON_ACCESS_TOKEN'],
  setupUrl: 'https://docs.joinmastodon.org/client/token/',
  async publish({ text, post, env, fetch, video, sleep }) {
    const base = env.MASTODON_INSTANCE.replace(/\/$/, '');
    const auth = { Authorization: `Bearer ${env.MASTODON_ACCESS_TOKEN}` };
    const body = { status: text, visibility: 'public', language: post.lang || 'es' };

    let file = null;
    if (video) {
      file = [await video.getBlob(), video.name];
    } else if (post.imageUrl) {
      const img = await fetch(post.imageUrl);
      if (!img.ok) throw new Error(`No se pudo descargar la imagen (${img.status})`);
      file = [new Blob([await img.arrayBuffer()], { type: img.headers.get('content-type') || 'image/png' }), 'image'];
    }
    if (file) {
      const form = new FormData();
      form.append('file', ...file);
      if (post.imageAlt) form.append('description', post.imageAlt);
      let media = await request(fetch, `${base}/api/v2/media`, { method: 'POST', headers: auth, body: form });
      // Videos are processed asynchronously: url stays null until ready.
      if (!media.url) {
        await poll(async () => {
          media = await request(fetch, `${base}/api/v1/media/${media.id}`, { headers: auth });
          return Boolean(media.url);
        }, { sleep, what: 'a que Mastodon procese el vídeo' });
      }
      body.media_ids = [media.id];
    }

    const res = await request(fetch, `${base}/api/v1/statuses`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { id: res.id, url: res.url };
  },
};
