'use strict';
const { request } = require('../http');

function messageLink(msg = {}) {
  const username = msg.chat?.username;
  return { id: String(msg.message_id ?? ''), url: username ? `https://t.me/${username}/${msg.message_id}` : undefined };
}

module.exports = {
  id: 'telegram',
  name: 'Telegram',
  // 1024 is the caption limit when an image is attached; plain messages allow 4096.
  rules: { maxLength: 4096 },
  rulesFor: (post) => ({ maxLength: post.imageUrl || post.video ? 1024 : 4096 }),
  image: 'optional',
  video: 'optional',
  videoMaxBytes: 50 * 1024 * 1024, // bot API upload limit
  requiredEnv: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
  setupUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
  async publish({ text, post, env, fetch, video }) {
    const base = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
    if (video) {
      const form = new FormData();
      form.append('chat_id', env.TELEGRAM_CHAT_ID);
      form.append('caption', text);
      form.append('supports_streaming', 'true');
      form.append('video', await video.getBlob(), video.name);
      const res = await request(fetch, `${base}/sendVideo`, { method: 'POST', body: form });
      return messageLink(res.result);
    }
    const payload = post.imageUrl
      ? { method: 'sendPhoto', body: { chat_id: env.TELEGRAM_CHAT_ID, photo: post.imageUrl, caption: text } }
      : { method: 'sendMessage', body: { chat_id: env.TELEGRAM_CHAT_ID, text, link_preview_options: { url: post.link || undefined } } };
    const res = await request(fetch, `${base}/${payload.method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.body),
    });
    return messageLink(res.result);
  },
};
