'use strict';
const { byId, isConfigured, rulesFor } = require('./platforms');
const { composeText, countLength } = require('./format');

// What will be sent to each platform, without sending anything.
function preview(post, platformIds, env = process.env) {
  return platformIds.map((id) => {
    const platform = byId[id];
    if (!platform) return { platform: id, error: 'Plataforma desconocida' };
    const rules = rulesFor(platform, post);
    const override = post.overrides?.[id];
    const { text, truncated, droppedHashtags } = override
      ? { text: String(override), truncated: false, droppedHashtags: false }
      : composeText(post, rules);
    const warnings = [];
    if (truncated) warnings.push('Texto recortado para caber en el límite.');
    if (droppedHashtags) warnings.push('Hashtags omitidos para caber en el límite.');
    if (platform.image === 'required' && !post.imageUrl) warnings.push('Requiere imagen.');
    if (platform.image === 'none' && post.imageUrl) warnings.push('La imagen no se enviará a esta plataforma.');
    const length = countLength(text, rules);
    if (length > rules.maxLength) warnings.push(`Supera el límite (${length}/${rules.maxLength}).`);
    return {
      platform: id,
      name: platform.name,
      configured: isConfigured(platform, env),
      text,
      length,
      maxLength: rules.maxLength,
      warnings,
    };
  });
}

// Publishes to every selected platform in parallel. One failure never blocks
// the others; each result says ok/error on its own.
async function publish(post, platformIds, { env = process.env, fetch = globalThis.fetch, dryRun = false } = {}) {
  const items = preview(post, platformIds, env);
  const results = await Promise.all(items.map(async (item) => {
    const base = { platform: item.platform, name: item.name, text: item.text };
    if (item.error) return { ...base, ok: false, error: item.error };
    const platform = byId[item.platform];
    if (!item.configured) return { ...base, ok: false, skipped: true, error: `Sin credenciales: ${platform.requiredEnv.join(', ')}` };
    if (item.length > item.maxLength) return { ...base, ok: false, error: `Supera el límite (${item.length}/${item.maxLength})` };
    if (dryRun) return { ...base, ok: true, dryRun: true };
    const started = Date.now();
    try {
      const out = await platform.publish({ text: item.text, post, env, fetch });
      return { ...base, ok: true, ms: Date.now() - started, ...out };
    } catch (err) {
      return { ...base, ok: false, ms: Date.now() - started, error: err.message };
    }
  }));
  return results;
}

module.exports = { preview, publish };
