'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const x = require('../src/platforms/x');
const bluesky = require('../src/platforms/bluesky');
const { platforms, byId } = require('../src/platforms');
const { publish, preview } = require('../src/publisher');

// Fake fetch: records calls, answers from a list of [matcher, response] pairs.
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const route = routes.find(([m]) => String(url).includes(m));
    if (!route) throw new Error('Unexpected fetch ' + url);
    const [, body, init = {}] = route;
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status: init.status || 200, headers: init.headers || { 'content-type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}

const ENV = {
  X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'ts',
  BLUESKY_HANDLE: 'ls.bsky.social', BLUESKY_APP_PASSWORD: 'p',
  MASTODON_INSTANCE: 'https://mastodon.social', MASTODON_ACCESS_TOKEN: 'm',
  THREADS_USER_ID: '1', THREADS_ACCESS_TOKEN: 'th',
  INSTAGRAM_USER_ID: '2', INSTAGRAM_ACCESS_TOKEN: 'ig',
  FACEBOOK_PAGE_ID: '3', FACEBOOK_PAGE_TOKEN: 'fb',
  LINKEDIN_ACCESS_TOKEN: 'li', LINKEDIN_AUTHOR_URN: 'urn:li:organization:9',
  REDDIT_CLIENT_ID: 'c', REDDIT_CLIENT_SECRET: 'cs', REDDIT_USERNAME: 'u', REDDIT_PASSWORD: 'pw', REDDIT_SUBREDDIT: 'test',
  TELEGRAM_BOT_TOKEN: 'b', TELEGRAM_CHAT_ID: '@ls',
  DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc',
};

test('X OAuth 1.0a signature matches the official example', () => {
  const sig = x.oauthSignature('POST', 'https://api.twitter.com/1.1/statuses/update.json', {
    include_entities: 'true',
    status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
    oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
    oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: '1318622958',
    oauth_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
    oauth_version: '1.0',
  }, 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw', 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE');
  assert.equal(sig, 'hCtSmYh+iHYCEqBWrE7C7hYmtUk=');
});

test('Bluesky facets use UTF-8 byte offsets', () => {
  const text = '🎯 Mira https://limitedsniper.app #Roblox';
  const facets = bluesky.buildFacets(text);
  const bytes = new TextEncoder().encode(text);
  const slice = (f) => new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
  assert.equal(slice(facets[0]), 'https://limitedsniper.app');
  assert.equal(slice(facets[1]), '#Roblox');
  assert.equal(facets[1].features[0].tag, 'Roblox');
});

test('every platform publishes in parallel with the right API calls', async () => {
  const fetch = fakeFetch([
    ['api.x.com/2/tweets', { data: { id: '111' } }],
    ['createSession', { accessJwt: 'jwt', did: 'did:plc:1', handle: 'ls.bsky.social' }],
    ['createRecord', { uri: 'at://did:plc:1/app.bsky.feed.post/abc' }],
    ['mastodon.social/api/v1/statuses', { id: '5', url: 'https://mastodon.social/@ls/5' }],
    ['/threads_publish', { id: 'T2' }],
    ['/1/threads', { id: 'T1' }],
    ['/2/media_publish', { id: 'IG2' }],
    ['/2/media', { id: 'IG1' }],
    ['/3/photos', { id: 'P1', post_id: '3_9' }],
    ['api.linkedin.com/rest/posts', '', { status: 201, headers: { 'x-restli-id': 'urn:li:share:7' } }],
    ['reddit.com/api/v1/access_token', { access_token: 'rt' }],
    ['oauth.reddit.com/api/submit', { json: { errors: [], data: { name: 't3_x', url: 'https://reddit.com/r/test/x' } } }],
    ['api.telegram.org/bot', { ok: true, result: { message_id: 4, chat: { username: 'ls' } } }],
    ['discord.com/api/webhooks', { id: 'D1' }],
    ['cdn.example.com', 'PNGDATA', { headers: { 'content-type': 'image/png' } }],
    ['uploadBlob', { blob: { ref: 'b' } }],
    ['/api/v2/media', { id: 'M1' }],
  ]);
  const post = { text: 'Prueba', link: 'https://limitedsniper.app', hashtags: ['Roblox'], imageUrl: 'https://cdn.example.com/a.png', title: 'Limited Sniper' };
  const ids = platforms.map((p) => p.id);
  const results = await publish(post, ids, { env: ENV, fetch });

  for (const r of results) assert.equal(r.ok, true, `${r.platform}: ${r.error}`);
  const byPlatform = Object.fromEntries(results.map((r) => [r.platform, r]));
  assert.equal(byPlatform.x.url, 'https://x.com/i/web/status/111');
  assert.equal(byPlatform.bluesky.url, 'https://bsky.app/profile/ls.bsky.social/post/abc');
  assert.equal(byPlatform.linkedin.id, 'urn:li:share:7');
  assert.equal(byPlatform.telegram.url, 'https://t.me/ls/4');
  assert.equal(byPlatform.reddit.text.includes('#Roblox'), false, 'Reddit omits hashtags');

  const xCall = fetch.calls.find((c) => c.url.includes('api.x.com'));
  assert.match(xCall.opts.headers.Authorization, /^OAuth oauth_consumer_key="k"/);
  assert.equal(JSON.parse(xCall.opts.body).text, byPlatform.x.text);

  const tg = fetch.calls.find((c) => c.url.includes('telegram'));
  assert.ok(tg.url.endsWith('/sendPhoto'));
});

test('one failing platform does not stop the others', async () => {
  const fetch = fakeFetch([
    ['discord.com', { message: 'Unknown Webhook' }, { status: 404 }],
    ['telegram', { ok: true, result: { message_id: 1, chat: {} } }],
  ]);
  const results = await publish({ text: 'Hola', link: '' }, ['discord', 'telegram'], { env: ENV, fetch });
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /404/);
  assert.equal(results[1].ok, true);
});

test('unconfigured platforms are skipped and dry-run sends nothing', async () => {
  const fetch = fakeFetch([]);
  const results = await publish({ text: 'Hola' }, ['x', 'discord'], { env: { DISCORD_WEBHOOK_URL: 'https://d' }, fetch, dryRun: true });
  assert.equal(results[0].skipped, true);
  assert.equal(results[1].ok, true);
  assert.equal(results[1].dryRun, true);
  assert.equal(fetch.calls.length, 0);
});

test('preview warns about Instagram without image and honours overrides', () => {
  const [ig, x] = preview({ text: 'Hola', overrides: { x: 'Solo para X' } }, ['instagram', 'x'], ENV);
  assert.ok(ig.warnings.some((w) => /imagen/i.test(w)));
  assert.equal(x.text, 'Solo para X');
});

test('an override that is too long is rejected before calling the API', async () => {
  const fetch = fakeFetch([]);
  const [r] = await publish({ text: 'a', overrides: { x: 'a'.repeat(300) } }, ['x'], { env: ENV, fetch });
  assert.equal(r.ok, false);
  assert.match(r.error, /límite/);
  assert.equal(fetch.calls.length, 0);
});

test('platform ids are unique', () => {
  assert.equal(Object.keys(byId).length, platforms.length);
});
