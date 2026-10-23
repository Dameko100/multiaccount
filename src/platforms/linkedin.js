'use strict';
const { request } = require('../http');

module.exports = {
  id: 'linkedin',
  name: 'LinkedIn',
  rules: { maxLength: 3000 },
  image: 'none',
  requiredEnv: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_AUTHOR_URN'],
  setupUrl: 'https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api',
  async publish({ text, post, env, fetch }) {
    const body = {
      author: env.LINKEDIN_AUTHOR_URN,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (post.link) {
      body.content = { article: { source: post.link, title: post.title || 'Limited Sniper', description: post.linkDescription || '' } };
    }
    const res = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': env.LINKEDIN_VERSION || '202410',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    // LinkedIn returns 201 with the post URN in a header and an empty body.
    const id = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id');
    return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : undefined };
  },
};
