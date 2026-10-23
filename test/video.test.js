'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fakeFetch, ENV } = require('./helpers');
const { platforms } = require('../src/platforms');
const { publish, preview } = require('../src/publisher');
const tiktok = require('../src/platforms/tiktok');
const youtube = require('../src/platforms/youtube');

const VIDEO_ENV = {
  ...ENV,
  YOUTUBE_CLIENT_ID: 'yc', YOUTUBE_CLIENT_SECRET: 'ys', YOUTUBE_REFRESH_TOKEN: 'yr',
  TIKTOK_CLIENT_KEY: 'tk', TIKTOK_CLIENT_SECRET: 'tsec', TIKTOK_REFRESH_TOKEN: 'old',
};
const SIZE = 1000;
const noSleep = async () => {};

function tempVideo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-'));
  const file = path.join(dir, 'demo.mp4');
  fs.writeFileSync(file, Buffer.alloc(SIZE, 7));
  return { path: file, name: 'demo.mp4', mime: 'video/mp4', size: SIZE };
}

function memoryStore() {
  const data = {};
  return { get: (k) => data[k], set: (k, v) => { data[k] = v; }, data };
}

function videoRoutes() {
  let mastodonPolls = 0;
  return [
    // YouTube
    ['oauth2.googleapis.com/token', { access_token: 'ya' }],
    ['upload/youtube/v3/videos', '', { headers: { location: 'https://upload.youtube.test/s1' } }],
    ['upload.youtube.test/s1', { id: 'YT1' }],
    // TikTok
    ['open.tiktokapis.com/v2/oauth/token/', { access_token: 'tt', refresh_token: 'new' }],
    ['creator_info/query', { data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] }, error: { code: 'ok' } }],
    ['post/publish/video/init', { data: { publish_id: 'P1', upload_url: 'https://upload.tiktok.test/u' }, error: { code: 'ok' } }],
    ['upload.tiktok.test', ''],
    // X
    ['api.x.com/2/media/upload?', { data: { processing_info: { state: 'succeeded' } } }],
    ['api.x.com/2/media/upload', (_u, o) => ({
      INIT: { data: { id: 'MX' } },
      APPEND: '',
      FINALIZE: { data: { id: 'MX', processing_info: { state: 'pending', check_after_secs: 1 } } },
    }[o.body.get('command')])],
    ['api.x.com/2/tweets', { data: { id: '111' } }],
    // Bluesky
    ['createSession', { accessJwt: 'jwt', did: 'did:plc:1', handle: 'ls.bsky.social' }],
    ['uploadBlob', { blob: { ref: 'v' } }],
    ['createRecord', { uri: 'at://did:plc:1/app.bsky.feed.post/abc' }],
    // Mastodon (processing twice before ready)
    ['/api/v2/media', { id: 'M1', url: null }],
    ['/api/v1/media/M1', () => ({ id: 'M1', url: ++mastodonPolls >= 2 ? 'https://files/x.mp4' : null })],
    ['mastodon.social/api/v1/statuses', { id: '5', url: 'https://mastodon.social/@ls/5' }],
    // Threads
    ['graph.threads.net/v1.0/T1?', { status: 'FINISHED' }],
    ['/1/threads_publish', { id: 'T2' }],
    ['/1/threads', { id: 'T1' }],
    // Instagram
    ['graph.facebook.com/v21.0/IGC?', { status_code: 'FINISHED' }],
    ['/2/media_publish', { id: 'IG2' }],
    ['/2/media', { id: 'IGC', uri: 'https://rupload.facebook.com/ig-api-upload/v21.0/IGC' }],
    ['rupload.facebook.com', { success: true }],
    // Facebook
    ['graph-video.facebook.com/v21.0/3/videos', { id: 'FV1' }],
    // LinkedIn
    ['rest/videos?action=initializeUpload', { value: { video: 'urn:li:video:V', uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://li-upload.test/p1', firstByte: 0, lastByte: SIZE - 1 }] } }],
    ['li-upload.test', '', { headers: { etag: 'E1' } }],
    ['rest/videos?action=finalizeUpload', ''],
    ['rest/videos/urn', { status: 'AVAILABLE' }],
    ['api.linkedin.com/rest/posts', '', { status: 201, headers: { 'x-restli-id': 'urn:li:share:7' } }],
    // Reddit (text only)
    ['reddit.com/api/v1/access_token', { access_token: 'rt' }],
    ['oauth.reddit.com/api/submit', { json: { errors: [], data: { name: 't3_x', url: 'https://reddit.com/r/test/x' } } }],
    // Telegram, Discord
    ['api.telegram.org/bot', { ok: true, result: { message_id: 4, chat: { username: 'ls' } } }],
    ['discord.com/api/webhooks', { id: 'D1' }],
  ];
}

test('a video goes to all 12 platforms with the right upload flow each', async () => {
  const video = { ...tempVideo(), url: 'https://cdn.example.com/v.mp4' };
  const fetch = fakeFetch(videoRoutes());
  const store = memoryStore();
  const post = { text: 'Mira Limited Sniper en acción', link: 'https://limitedsniper.app', hashtags: ['Roblox'], title: 'Demo', video };
  const results = await publish(post, platforms.map((p) => p.id), { env: VIDEO_ENV, fetch, sleep: noSleep, tokenStore: store });

  for (const r of results) assert.equal(r.ok, true, `${r.platform}: ${r.error}`);
  const by = Object.fromEntries(results.map((r) => [r.platform, r]));
  assert.equal(by.youtube.url, 'https://www.youtube.com/watch?v=YT1');
  assert.equal(by.tiktok.id, 'P1');
  assert.equal(store.data.tiktok_refresh_token, 'new', 'rotated TikTok token is saved');

  const call = (part, method) => fetch.calls.filter((c) => c.url.includes(part) && (!method || c.opts.method === method));
  // YouTube: metadata then the bytes
  const ytMeta = JSON.parse(call('upload/youtube/v3/videos')[0].opts.body);
  assert.equal(ytMeta.snippet.title, 'Demo');
  assert.deepEqual(ytMeta.snippet.tags, ['Roblox']);
  assert.equal(call('upload.youtube.test')[0].opts.body.length, SIZE);
  // TikTok: one chunk with the full range
  assert.equal(call('upload.tiktok.test')[0].opts.headers['Content-Range'], `bytes 0-${SIZE - 1}/${SIZE}`);
  assert.equal(JSON.parse(call('post/publish/video/init')[0].opts.body).post_info.privacy_level, 'PUBLIC_TO_EVERYONE');
  // X: INIT, APPEND, FINALIZE, STATUS, then the post with the media id
  assert.deepEqual(call('api.x.com/2/media/upload', 'POST').map((c) => c.opts.body.get('command')), ['INIT', 'APPEND', 'FINALIZE']);
  assert.equal(call('api.x.com/2/media/upload?').length, 1);
  assert.deepEqual(JSON.parse(call('api.x.com/2/tweets')[0].opts.body).media.media_ids, ['MX']);
  // Bluesky video embed
  assert.equal(JSON.parse(call('createRecord')[0].opts.body).record.embed.$type, 'app.bsky.embed.video');
  // Mastodon waited for processing
  assert.equal(call('/api/v1/media/M1').length, 2);
  // Threads and Instagram use the public URL
  assert.equal(new URLSearchParams(call('/1/threads', 'POST')[0].opts.body).get('video_url'), video.url);
  assert.equal(new URLSearchParams(call('/2/media', 'POST')[0].opts.body).get('media_type'), 'REELS');
  assert.equal(call('rupload.facebook.com').length, 0);
  // Facebook by URL, LinkedIn with the uploaded video
  assert.equal(call('graph-video.facebook.com')[0].opts.body.get('file_url'), video.url);
  assert.equal(JSON.parse(call('api.linkedin.com/rest/posts')[0].opts.body).content.media.id, 'urn:li:video:V');
  assert.deepEqual(JSON.parse(call('finalizeUpload')[0].opts.body).finalizeUploadRequest.uploadedPartIds, ['E1']);
  // Telegram and Discord get the file itself
  assert.ok(call('api.telegram.org')[0].url.endsWith('/sendVideo'));
  assert.equal(call('discord.com')[0].opts.body.get('files[0]').size, SIZE);
  // Reddit gets text only
  assert.equal(new URLSearchParams(call('api/submit')[0].opts.body).get('kind'), 'self');
});

test('without a public URL, Instagram and Facebook upload the file bytes', async () => {
  const fetch = fakeFetch(videoRoutes());
  const results = await publish({ text: 'Hola', video: tempVideo() }, ['instagram', 'facebook'], { env: VIDEO_ENV, fetch, sleep: noSleep });
  for (const r of results) assert.equal(r.ok, true, `${r.platform}: ${r.error}`);
  const rup = fetch.calls.find((c) => c.url.includes('rupload.facebook.com'));
  assert.equal(rup.opts.headers.file_size, String(SIZE));
  assert.equal(rup.opts.body.length, SIZE);
  const fb = fetch.calls.find((c) => c.url.includes('graph-video'));
  assert.equal(fb.opts.body.get('source').size, SIZE);
});

test('blockers: video-only platforms, Threads without URL, size limits', () => {
  const noVideo = preview({ text: 'Hola' }, ['youtube', 'tiktok'], VIDEO_ENV);
  for (const p of noVideo) assert.ok(p.blockers.includes('Requiere vídeo.'));

  const big = { text: 'Hola', video: { path: '/x.mp4', name: 'x.mp4', mime: 'video/mp4', size: 60 * 1024 * 1024 } };
  const [threads, discord, telegram, x, reddit] = preview(big, ['threads', 'discord', 'telegram', 'x', 'reddit'], VIDEO_ENV);
  assert.match(threads.blockers.join(), /URL pública/);
  assert.match(discord.blockers.join(), /demasiado grande/);
  assert.match(telegram.blockers.join(), /demasiado grande/);
  assert.deepEqual(x.blockers, []);
  assert.equal(x.sendsVideo, true);
  assert.equal(reddit.sendsVideo, false);
  assert.match(reddit.warnings.join(), /solo el texto/);
});

test('TikTok publishing is refused clearly when privacy is not allowed', async () => {
  const routes = videoRoutes();
  routes.splice(4, 1, ['creator_info/query', { data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } }]);
  const [r] = await publish({ text: 'Hola', video: tempVideo() }, ['tiktok'], { env: VIDEO_ENV, fetch: fakeFetch(routes), sleep: noSleep, tokenStore: memoryStore() });
  assert.equal(r.ok, false);
  assert.match(r.error, /SELF_ONLY/);
});

test('TikTok chunk plan follows its rules', () => {
  const MB = 1024 * 1024;
  assert.deepEqual(tiktok.chunkPlan(3 * MB), { chunkSize: 3 * MB, count: 1 });
  assert.deepEqual(tiktok.chunkPlan(64 * MB), { chunkSize: 64 * MB, count: 1 });
  assert.deepEqual(tiktok.chunkPlan(105 * MB), { chunkSize: 10 * MB, count: 10 });
});

test('YouTube titles are cleaned and capped at 100 chars', () => {
  assert.equal(youtube.cleanTitle('<b>Hola</b>\nsegunda línea'), 'bHola/b');
  assert.equal(youtube.cleanTitle('a'.repeat(150)).length, 100);
});
