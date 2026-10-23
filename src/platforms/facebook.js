'use strict';
const { request } = require('../http');

const BASE = 'https://graph.facebook.com/v21.0';

module.exports = {
  id: 'facebook',
  name: 'Facebook (página)',
  rules: { maxLength: 63206 },
  image: 'optional',
  video: 'optional',
  videoMaxBytes: 1024 * 1024 * 1024,
  requiredEnv: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_TOKEN'],
  setupUrl: 'https://developers.facebook.com/docs/pages-api/posts',
  async publish({ text, post, env, fetch, video }) {
    const token = env.FACEBOOK_PAGE_TOKEN;
    if (video) {
      const form = new FormData();
      form.append('description', text);
      if (post.title) form.append('title', post.title);
      form.append('access_token', token);
      if (video.url) form.append('file_url', video.url);
      else form.append('source', await video.getBlob(), video.name);
      const res = await request(fetch, `https://graph-video.facebook.com/v21.0/${env.FACEBOOK_PAGE_ID}/videos`, { method: 'POST', body: form });
      return { id: res.id, url: `https://www.facebook.com/${env.FACEBOOK_PAGE_ID}/videos/${res.id}` };
    }
    if (post.imageUrl) {
      const res = await request(fetch, `${BASE}/${env.FACEBOOK_PAGE_ID}/photos`, {
        method: 'POST',
        body: new URLSearchParams({ url: post.imageUrl, caption: text, access_token: token }),
      });
      return { id: res.post_id || res.id, url: `https://www.facebook.com/${res.post_id || res.id}` };
    }
    const params = new URLSearchParams({ message: text, access_token: token });
    if (post.link) params.set('link', post.link);
    const res = await request(fetch, `${BASE}/${env.FACEBOOK_PAGE_ID}/feed`, { method: 'POST', body: params });
    return { id: res.id, url: `https://www.facebook.com/${res.id}` };
  },
};
