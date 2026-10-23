'use strict';
const { request } = require('../http');

module.exports = {
  id: 'discord',
  name: 'Discord',
  rules: { maxLength: 2000 },
  image: 'optional',
  video: 'optional',
  videoMaxBytes: 10 * 1024 * 1024, // webhook attachment limit without server boosts
  requiredEnv: ['DISCORD_WEBHOOK_URL'],
  setupUrl: 'https://support.discord.com/hc/articles/228383668',
  async publish({ text, post, env, fetch, video }) {
    const url = new URL(env.DISCORD_WEBHOOK_URL);
    url.searchParams.set('wait', 'true');
    const body = { content: text, allowed_mentions: { parse: [] } };
    if (video) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(body));
      form.append('files[0]', await video.getBlob(), video.name);
      const res = await request(fetch, url.toString(), { method: 'POST', body: form });
      return { id: res?.id };
    }
    if (post.imageUrl) body.embeds = [{ image: { url: post.imageUrl } }];
    const res = await request(fetch, url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { id: res?.id };
  },
};
