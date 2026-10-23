'use strict';
const { request } = require('../http');

module.exports = {
  id: 'mastodon',
  name: 'Mastodon',
  rules: { maxLength: 500, urlWeight: 23 },
  image: 'optional',
  requiredEnv: ['MASTODON_INSTANCE', 'MASTODON_ACCESS_TOKEN'],
  setupUrl: 'https://docs.joinmastodon.org/client/token/',
  async publish({ text, post, env, fetch }) {
    const base = env.MASTODON_INSTANCE.replace(/\/$/, '');
    const auth = { Authorization: `Bearer ${env.MASTODON_ACCESS_TOKEN}` };
    const body = { status: text, visibility: 'public', language: post.lang || 'es' };

    if (post.imageUrl) {
      const img = await fetch(post.imageUrl);
      if (!img.ok) throw new Error(`No se pudo descargar la imagen (${img.status})`);
      const form = new FormData();
      form.append('file', new Blob([await img.arrayBuffer()], { type: img.headers.get('content-type') || 'image/png' }), 'image');
      if (post.imageAlt) form.append('description', post.imageAlt);
      const media = await request(fetch, `${base}/api/v2/media`, { method: 'POST', headers: auth, body: form });
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
