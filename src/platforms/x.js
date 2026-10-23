'use strict';
const crypto = require('node:crypto');
const { request } = require('../http');

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// OAuth 1.0a HMAC-SHA1 signature. `params` = query/form params that are part
// of the signature (a JSON body is not).
function oauthSignature(method, url, params, consumerSecret, tokenSecret) {
  const paramString = Object.keys(params).sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`).join('&');
  const base = [method.toUpperCase(), enc(url), enc(paramString)].join('&');
  const key = `${enc(consumerSecret)}&${enc(tokenSecret || '')}`;
  return crypto.createHmac('sha1', key).update(base).digest('base64');
}

function oauthHeader(method, url, env, extra = {}) {
  const oauth = {
    oauth_consumer_key: env.X_API_KEY,
    oauth_nonce: extra.nonce || crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: extra.timestamp || String(Math.floor(Date.now() / 1000)),
    oauth_token: env.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  oauth.oauth_signature = oauthSignature(method, url, oauth, env.X_API_SECRET, env.X_ACCESS_SECRET);
  return 'OAuth ' + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(', ');
}

const URL = 'https://api.x.com/2/tweets';

module.exports = {
  id: 'x',
  name: 'X (Twitter)',
  rules: { maxLength: 280, urlWeight: 23 },
  image: 'none',
  requiredEnv: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'],
  setupUrl: 'https://developer.x.com/en/portal/dashboard',
  oauthSignature,
  oauthHeader,
  async publish({ text, env, fetch }) {
    const data = await request(fetch, URL, {
      method: 'POST',
      headers: { Authorization: oauthHeader('POST', URL, env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const id = data?.data?.id;
    return { id, url: id ? `https://x.com/i/web/status/${id}` : undefined };
  },
};
