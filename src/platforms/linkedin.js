'use strict';
const { request } = require('../http');
const { poll } = require('../media');

const API = 'https://api.linkedin.com/rest';

function headers(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
    'LinkedIn-Version': env.LINKEDIN_VERSION || '202410',
    'X-Restli-Protocol-Version': '2.0.0',
    ...extra,
  };
}

// Videos API: initialize → PUT each part (collect ETags) → finalize → wait.
async function uploadVideo(video, env, fetch, sleep) {
  const buffer = await video.getBuffer();
  const init = await request(fetch, `${API}/videos?action=initializeUpload`, {
    method: 'POST',
    headers: headers(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ initializeUploadRequest: { owner: env.LINKEDIN_AUTHOR_URN, fileSizeBytes: buffer.length, uploadCaptions: false, uploadThumbnail: false } }),
  });
  const { video: urn, uploadInstructions = [], uploadToken = '' } = init.value || {};
  const etags = [];
  for (const part of uploadInstructions) {
    const res = await fetch(part.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer.subarray(part.firstByte, part.lastByte + 1),
    });
    if (!res.ok) throw new Error(`LinkedIn rechazó una parte del vídeo: HTTP ${res.status}`);
    etags.push(res.headers.get('etag'));
  }
  await request(fetch, `${API}/videos?action=finalizeUpload`, {
    method: 'POST',
    headers: headers(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ finalizeUploadRequest: { video: urn, uploadToken, uploadedPartIds: etags } }),
  });
  await poll(async () => {
    const v = await request(fetch, `${API}/videos/${encodeURIComponent(urn)}`, { headers: headers(env) });
    if (v.status === 'PROCESSING_FAILED') throw new Error('LinkedIn no pudo procesar el vídeo.');
    return v.status === 'AVAILABLE';
  }, { sleep, what: 'a que LinkedIn procese el vídeo' });
  return urn;
}

module.exports = {
  id: 'linkedin',
  name: 'LinkedIn',
  rules: { maxLength: 3000 },
  image: 'none',
  video: 'optional',
  videoMaxBytes: 500 * 1024 * 1024,
  requiredEnv: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_AUTHOR_URN'],
  setupUrl: 'https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api',
  async publish({ text, post, env, fetch, video, sleep }) {
    const body = {
      author: env.LINKEDIN_AUTHOR_URN,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (video) {
      body.content = { media: { id: await uploadVideo(video, env, fetch, sleep), title: post.title || 'Limited Sniper' } };
    } else if (post.link) {
      body.content = { article: { source: post.link, title: post.title || 'Limited Sniper', description: post.linkDescription || '' } };
    }
    const res = await fetch(`${API}/posts`, {
      method: 'POST',
      headers: headers(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    // LinkedIn returns 201 with the post URN in a header and an empty body.
    const id = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id');
    return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : undefined };
  },
};
