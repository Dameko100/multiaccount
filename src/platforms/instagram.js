'use strict';
const { request } = require('../http');

const BASE = 'https://graph.facebook.com/v21.0';

module.exports = {
  id: 'instagram',
  name: 'Instagram',
  // Links in captions are not clickable on Instagram; keep them anyway so
  // people can copy the URL ("link en la bio" works better).
  rules: { maxLength: 2200 },
  image: 'required',
  requiredEnv: ['INSTAGRAM_USER_ID', 'INSTAGRAM_ACCESS_TOKEN'],
  setupUrl: 'https://developers.facebook.com/docs/instagram-platform/content-publishing',
  async publish({ text, post, env, fetch }) {
    if (!post.imageUrl) throw new Error('Instagram necesita una imagen (URL pública).');
    const token = env.INSTAGRAM_ACCESS_TOKEN;
    const container = await request(fetch, `${BASE}/${env.INSTAGRAM_USER_ID}/media`, {
      method: 'POST',
      body: new URLSearchParams({ image_url: post.imageUrl, caption: text, access_token: token }),
    });
    const res = await request(fetch, `${BASE}/${env.INSTAGRAM_USER_ID}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    return { id: res.id };
  },
};
