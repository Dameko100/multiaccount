'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('../src/server');
const { createHistory } = require('../src/history');

async function withServer(opts, fn) {
  const server = createServer(opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test('API: platforms, templates, publish, history and static files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-'));
  const history = createHistory(path.join(dir, 'h.json'));
  const fetch = async () => new Response(JSON.stringify({ id: 'D1' }), { status: 200 });
  const env = { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/a' };

  await withServer({ env, fetch, history }, async (base) => {
    const platforms = await (await globalThis.fetch(`${base}/api/platforms`)).json();
    assert.equal(platforms.find((p) => p.id === 'discord').configured, true);
    assert.equal(platforms.find((p) => p.id === 'x').configured, false);
    assert.equal(JSON.stringify(platforms).includes('webhooks/1/a'), false, 'never leaks secrets');

    const tpl = await (await globalThis.fetch(`${base}/api/templates`)).json();
    assert.ok(tpl.templates.length >= 4);

    const res = await globalThis.fetch(`${base}/api/publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hola', platforms: ['discord'] }),
    });
    const entry = await res.json();
    assert.equal(entry.results[0].ok, true);
    assert.equal(entry.post.link, 'https://limitedsniper.app');
    assert.equal(history.read().length, 1);

    const bad = await globalThis.fetch(`${base}/api/publish`, { method: 'POST', body: JSON.stringify({ text: 'x', platforms: ['discord'], imageUrl: 'file:///etc/passwd' }) });
    assert.equal(bad.status, 400);

    const html = await globalThis.fetch(`${base}/`);
    assert.match(await html.text(), /Multiaccount/);
    const escape = await globalThis.fetch(`${base}/..%2fpackage.json`);
    assert.equal(escape.status, 404);
  });
});
