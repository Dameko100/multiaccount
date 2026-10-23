'use strict';
const { byId, isConfigured, rulesFor } = require('./platforms');
const { composeText, countLength } = require('./format');
const { createVideo, formatBytes, sleep: realSleep } = require('./media');

// Things that stop a platform from publishing (blockers) and things worth
// knowing before publishing (warnings).
function mediaChecks(platform, post) {
  const blockers = [];
  const warnings = [];
  const video = post.video;
  const videoMode = platform.video || 'none';

  if (video) {
    if (videoMode === 'none') {
      warnings.push('Esta red no admite vídeo por API: se publicará solo el texto.');
    } else {
      if (videoMode === 'url' && !video.url) blockers.push('Necesita la URL pública del vídeo (esta red lo descarga ella misma).');
      if (platform.videoMaxBytes && video.size > platform.videoMaxBytes) {
        blockers.push(`Vídeo demasiado grande (${formatBytes(video.size)}; máx. ${formatBytes(platform.videoMaxBytes)}).`);
      }
      if (post.imageUrl && platform.image !== 'none') warnings.push('Se envía el vídeo; la imagen se ignora.');
    }
  } else if (videoMode === 'required') {
    blockers.push('Requiere vídeo.');
  }

  if (!video && post.imageUrl && platform.image === 'none') warnings.push('La imagen no se enviará a esta plataforma.');
  if (platform.requiresMedia && !post.imageUrl && !(video && videoMode !== 'none')) blockers.push('Requiere imagen o vídeo.');
  return { blockers, warnings };
}

// What will be sent to each platform, without sending anything.
function preview(post, platformIds, env = process.env) {
  return platformIds.map((id) => {
    const platform = byId[id];
    if (!platform) return { platform: id, error: 'Plataforma desconocida', blockers: ['Plataforma desconocida'], warnings: [] };
    const rules = rulesFor(platform, post);
    const override = post.overrides?.[id];
    const { text, truncated, droppedHashtags } = override
      ? { text: String(override), truncated: false, droppedHashtags: false }
      : composeText(post, rules);
    const { blockers, warnings } = mediaChecks(platform, post);
    if (truncated) warnings.push('Texto recortado para caber en el límite.');
    if (droppedHashtags) warnings.push('Hashtags omitidos para caber en el límite.');
    const length = countLength(text, rules);
    if (length > rules.maxLength) blockers.push(`Supera el límite (${length}/${rules.maxLength}).`);
    return {
      platform: id,
      name: platform.name,
      configured: isConfigured(platform, env),
      text,
      length,
      maxLength: rules.maxLength,
      sendsVideo: Boolean(post.video) && (platform.video || 'none') !== 'none',
      blockers,
      warnings,
    };
  });
}

// Publishes to every selected platform in parallel. One failure never blocks
// the others; each result says ok/error on its own.
async function publish(post, platformIds, { env = process.env, fetch = globalThis.fetch, dryRun = false, sleep = realSleep, tokenStore } = {}) {
  const items = preview(post, platformIds, env);
  const video = post.video ? createVideo(post.video, fetch) : null;
  return Promise.all(items.map(async (item) => {
    const base = { platform: item.platform, name: item.name, text: item.text };
    if (item.error) return { ...base, ok: false, error: item.error };
    const platform = byId[item.platform];
    if (!item.configured) return { ...base, ok: false, skipped: true, error: `Sin credenciales: ${platform.requiredEnv.join(', ')}` };
    if (item.blockers.length) return { ...base, ok: false, error: item.blockers.join(' ') };
    if (dryRun) return { ...base, ok: true, dryRun: true };
    const started = Date.now();
    try {
      const out = await platform.publish({
        text: item.text, post, env, fetch, sleep,
        video: item.sendsVideo ? video : null,
        ...(tokenStore ? { tokenStore } : {}),
      });
      return { ...base, ok: true, ms: Date.now() - started, ...out };
    } catch (err) {
      return { ...base, ok: false, ms: Date.now() - started, error: err.message };
    }
  }));
}

module.exports = { preview, publish, mediaChecks };
