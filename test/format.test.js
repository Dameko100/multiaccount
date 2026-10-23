'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { composeText, countLength, normalizeHashtags } = require('../src/format');
const { parseEnv } = require('../src/config');

test('normalizeHashtags dedupes and prefixes', () => {
  assert.deepEqual(normalizeHashtags('Roblox, #roblox #Roblox LimitedSniper'), ['#Roblox', '#roblox', '#LimitedSniper']);
});

test('URLs count as fixed weight when the platform says so', () => {
  const t = 'hola https://limitedsniper.app/pricing/with/a/very/long/path';
  assert.equal(countLength(t, { urlWeight: 23 }), 5 + 23);
  assert.equal(countLength('🎯👍🏽', {}), 2);
});

test('composeText appends link and hashtags when they fit', () => {
  const { text, truncated } = composeText({ text: 'Hola', link: 'https://limitedsniper.app', hashtags: ['Roblox'] }, { maxLength: 280 });
  assert.equal(text, 'Hola\n\nhttps://limitedsniper.app\n\n#Roblox');
  assert.equal(truncated, false);
});

test('composeText does not duplicate a link already in the text', () => {
  const { text } = composeText({ text: 'Mira https://limitedsniper.app', link: 'https://limitedsniper.app' }, {});
  assert.equal(text, 'Mira https://limitedsniper.app');
});

test('composeText drops hashtags first, then cuts the body but keeps the link', () => {
  const link = 'https://limitedsniper.app';
  const rules = { maxLength: 60 };
  const a = composeText({ text: 'x'.repeat(25), link, hashtags: ['Roblox', 'LimitedSniper'] }, rules);
  assert.equal(a.text, 'x'.repeat(25) + '\n\n' + link);
  assert.equal(a.truncated, false);
  assert.equal(a.droppedHashtags, true);
  const b = composeText({ text: 'y'.repeat(200), link, hashtags: ['Roblox'] }, rules);
  assert.ok(b.text.endsWith('…\n\n' + link));
  assert.ok(countLength(b.text, rules) <= 60);
  assert.equal(b.truncated, true);
});

test('composeText respects X url weight when truncating', () => {
  const rules = { maxLength: 280, urlWeight: 23 };
  const { text } = composeText({ text: 'z'.repeat(400), link: 'https://limitedsniper.app/' + 'p'.repeat(80) }, rules);
  assert.equal(countLength(text, rules), 280);
});

test('parseEnv handles quotes and comments', () => {
  assert.deepEqual(parseEnv('# c\nA=1\nB="dos tres"\n\nC=\'x=y\'\nbad'), { A: '1', B: 'dos tres', C: 'x=y' });
});
