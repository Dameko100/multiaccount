'use strict';

const platforms = [
  require('./x'),
  require('./bluesky'),
  require('./mastodon'),
  require('./threads'),
  require('./instagram'),
  require('./facebook'),
  require('./linkedin'),
  require('./reddit'),
  require('./telegram'),
  require('./discord'),
];

const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));

function isConfigured(platform, env = process.env) {
  return platform.requiredEnv.every((k) => env[k] && String(env[k]).trim());
}

function rulesFor(platform, post) {
  return platform.rulesFor ? { ...platform.rules, ...platform.rulesFor(post) } : platform.rules;
}

module.exports = { platforms, byId, isConfigured, rulesFor };
