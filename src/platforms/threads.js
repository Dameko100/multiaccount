'use strict';
const { request } = require('../http');

const BASE = 'https://graph.threads.net/v1.0';

module.exports = {
  id: 'threads',
  name: 'Threads',
  rules: { maxLength: 500 },
  image: 'optional',
  requiredEnv: ['THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'],
  setupUrl: 'https://developers.facebook.com/docs/threads/get-started',
  async publish({ text, post, env, fetch }) {
    const token = env.THREADS_ACCESS_TOKEN;
    const params = new URLSearchParams({ text, access_token: token, media_type: post.imageUrl ? 'IMAGE' : 'TEXT' });
    if (post.imageUrl) params.set('image_url', post.imageUrl);
    const container = await request(fetch, `${BASE}/${env.THREADS_USER_ID}/threads`, { method: 'POST', body: params });
    const res = await request(fetch, `${BASE}/${env.THREADS_USER_ID}/threads_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    return { id: res.id };
  },
};
