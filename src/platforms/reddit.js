'use strict';
const { request } = require('../http');
const { firstLine } = require('../format');

module.exports = {
  id: 'reddit',
  name: 'Reddit',
  rules: { maxLength: 40000, hashtags: false },
  image: 'none',
  requiredEnv: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD'],
  setupUrl: 'https://www.reddit.com/prefs/apps',
  async publish({ text, post, env, fetch }) {
    const subreddit = (post.subreddit || env.REDDIT_SUBREDDIT || '').replace(/^\/?r\//, '');
    if (!subreddit) throw new Error('Falta el subreddit (campo "Subreddit" o REDDIT_SUBREDDIT).');
    const ua = env.REDDIT_USER_AGENT || 'multiaccount/1.0';
    const basic = Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64');

    const token = await request(fetch, 'https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'User-Agent': ua },
      body: new URLSearchParams({ grant_type: 'password', username: env.REDDIT_USERNAME, password: env.REDDIT_PASSWORD }),
    });
    if (!token.access_token) throw new Error(`Reddit no devolvió token: ${JSON.stringify(token).slice(0, 200)}`);

    const res = await request(fetch, 'https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': ua },
      body: new URLSearchParams({
        sr: subreddit,
        kind: 'self',
        title: post.title || firstLine(post.text),
        text,
        api_type: 'json',
        resubmit: 'true',
      }),
    });
    const errors = res?.json?.errors;
    if (errors && errors.length) throw new Error(`Reddit: ${errors.map((e) => e.join(' ')).join('; ')}`);
    return { id: res?.json?.data?.name, url: res?.json?.data?.url };
  },
};
