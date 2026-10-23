'use strict';

// Fake fetch: records calls, answers from a list of [matcher, response] pairs.
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const route = routes.find(([m]) => String(url).includes(m));
    if (!route) throw new Error('Unexpected fetch ' + url);
    const [, spec, init = {}] = route;
    const body = typeof spec === 'function' ? spec(String(url), opts) : spec;
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

module.exports = { fakeFetch, ENV };
