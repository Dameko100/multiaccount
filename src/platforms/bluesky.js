'use strict';
const { request } = require('../http');
const { URL_RE } = require('../format');

const encoder = new TextEncoder();
const byteLen = (s) => encoder.encode(s).length;

// Rich-text facets so links and hashtags are clickable. Offsets are UTF-8 bytes.
function buildFacets(text) {
  const facets = [];
  for (const m of text.matchAll(URL_RE)) {
    const uri = m[0].replace(/[.,;:!?)\]]+$/, '');
    const start = byteLen(text.slice(0, m.index));
    facets.push({
      index: { byteStart: start, byteEnd: start + byteLen(uri) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const start = byteLen(text.slice(0, m.index + m[1].length));
    facets.push({
      index: { byteStart: start, byteEnd: start + byteLen('#' + m[2]) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }],
    });
  }
  return facets;
}

module.exports = {
  id: 'bluesky',
  name: 'Bluesky',
  rules: { maxLength: 300 },
  image: 'optional',
  requiredEnv: ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'],
  setupUrl: 'https://bsky.app/settings/app-passwords',
  buildFacets,
  async publish({ text, post, env, fetch }) {
    const service = (env.BLUESKY_SERVICE || 'https://bsky.social').replace(/\/$/, '');
    const session = await request(fetch, `${service}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: env.BLUESKY_HANDLE, password: env.BLUESKY_APP_PASSWORD }),
    });
    const auth = { Authorization: `Bearer ${session.accessJwt}` };

    const record = {
      $type: 'app.bsky.feed.post',
      text,
      facets: buildFacets(text),
      createdAt: new Date().toISOString(),
      langs: [post.lang || 'es'],
    };

    if (post.imageUrl) {
      const img = await fetch(post.imageUrl);
      if (!img.ok) throw new Error(`No se pudo descargar la imagen (${img.status})`);
      const blob = await request(fetch, `${service}/xrpc/com.atproto.repo.uploadBlob`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': img.headers.get('content-type') || 'image/png' },
        body: Buffer.from(await img.arrayBuffer()),
      });
      record.embed = { $type: 'app.bsky.embed.images', images: [{ alt: post.imageAlt || '', image: blob.blob }] };
    } else if (post.link) {
      record.embed = {
        $type: 'app.bsky.embed.external',
        external: { uri: post.link, title: post.title || 'Limited Sniper', description: post.linkDescription || '' },
      };
    }

    const res = await request(fetch, `${service}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
    });
    const rkey = res.uri?.split('/').pop();
    return { id: res.uri, url: rkey ? `https://bsky.app/profile/${session.handle || env.BLUESKY_HANDLE}/post/${rkey}` : undefined };
  },
};
