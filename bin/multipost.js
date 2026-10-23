#!/usr/bin/env node
'use strict';
// Uso:
//   node bin/multipost.js "Texto" [--platforms x,bluesky] [--link URL] [--tags "Roblox LimitedSniper"]
//                         [--image URL] [--title "..."] [--subreddit nombre] [--template id] [--dry-run]
const { parseArgs } = require('node:util');
const { loadEnv } = require('../src/config');
loadEnv();
const { platforms, isConfigured } = require('../src/platforms');
const { publish } = require('../src/publisher');
const { templates, LINK } = require('../src/templates');
const { createHistory } = require('../src/history');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    platforms: { type: 'string', short: 'p' },
    link: { type: 'string', short: 'l' },
    tags: { type: 'string', short: 't' },
    image: { type: 'string', short: 'i' },
    title: { type: 'string' },
    subreddit: { type: 'string' },
    template: { type: 'string' },
    lang: { type: 'string' },
    'dry-run': { type: 'boolean' },
    list: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(require('node:fs').readFileSync(__filename, 'utf8').split('\n').slice(2, 5).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}

if (values.list) {
  for (const p of platforms) console.log(`${isConfigured(p) ? '✅' : '  '} ${p.id.padEnd(10)} ${p.name}`);
  console.log('\nPlantillas:');
  for (const t of templates) console.log(`   ${t.id.padEnd(16)} ${t.name}`);
  process.exit(0);
}

const tpl = values.template ? templates.find((t) => t.id === values.template) : null;
if (values.template && !tpl) { console.error(`Plantilla desconocida: ${values.template}`); process.exit(1); }

const post = {
  text: positionals.join(' ') || tpl?.text || '',
  link: values.link ?? process.env.DEFAULT_LINK ?? LINK,
  hashtags: values.tags ?? tpl?.hashtags ?? [],
  imageUrl: values.image || '',
  title: values.title || tpl?.title || '',
  subreddit: values.subreddit || '',
  lang: values.lang || tpl?.lang || 'es',
};
if (!post.text.trim()) { console.error('Falta el texto (o usa --template). Prueba --help.'); process.exit(1); }

const ids = values.platforms
  ? values.platforms.split(',').map((s) => s.trim()).filter(Boolean)
  : platforms.filter((p) => isConfigured(p)).map((p) => p.id);
if (!ids.length) { console.error('No hay plataformas configuradas. Rellena .env (ver .env.example).'); process.exit(1); }

(async () => {
  const dryRun = Boolean(values['dry-run']);
  const results = await publish(post, ids, { dryRun });
  if (!dryRun) createHistory().add({ at: new Date().toISOString(), dryRun, post, results });
  for (const r of results) {
    const icon = r.ok ? '✅' : r.skipped ? '⏭ ' : '❌';
    console.log(`${icon} ${r.name || r.platform}: ${r.ok ? (r.dryRun ? 'OK (simulación)' : r.url || 'publicado') : r.error}`);
    if (dryRun) console.log('   ' + r.text.replace(/\n/g, '\n   '));
  }
  process.exit(results.every((r) => r.ok) ? 0 : 2);
})();
