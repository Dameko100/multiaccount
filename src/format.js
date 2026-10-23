'use strict';

const URL_RE = /https?:\/\/[^\s]+/g;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemes(str) {
  return [...segmenter.segment(str)].map((s) => s.segment);
}

// Length as the platform counts it. Some (X, Mastodon) count every URL as a
// fixed number of characters regardless of its real length.
function countLength(text, rules = {}) {
  if (!rules.urlWeight) return graphemes(text).length;
  let len = 0;
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    len += graphemes(text.slice(last, m.index)).length + rules.urlWeight;
    last = m.index + m[0].length;
  }
  return len + graphemes(text.slice(last)).length;
}

function normalizeHashtags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(/[\s,]+/);
  return [...new Set(list.map((t) => t.trim().replace(/^#+/, '')).filter(Boolean))].map((t) => `#${t}`);
}

function joinParts(parts) {
  return parts.filter((p) => p && p.trim()).join('\n\n');
}

// Builds the final text for one platform: body + link + hashtags, trimmed to
// fit. The link is never cut; hashtags are dropped before the body is cut.
function composeText(post, rules = {}) {
  const body = String(post.text || '').trim();
  const link = post.link && !body.includes(post.link) ? post.link : '';
  const tags = rules.hashtags === false ? '' : normalizeHashtags(post.hashtags).join(' ');
  const max = rules.maxLength || Infinity;

  let text = joinParts([body, link, tags]);
  if (countLength(text, rules) <= max) return { text, truncated: false, droppedHashtags: false };

  text = joinParts([body, link]);
  if (countLength(text, rules) <= max) return { text, truncated: false, droppedHashtags: Boolean(tags) };

  const reserve = link ? countLength(`\n\n${link}`, rules) : 0;
  const chars = graphemes(body);
  let keep = Math.max(0, max - reserve - 1);
  let cut = chars.slice(0, keep).join('').trimEnd() + '…';
  while (keep > 0 && countLength(joinParts([cut, link]), rules) > max) {
    keep -= 1;
    cut = chars.slice(0, keep).join('').trimEnd() + '…';
  }
  return { text: joinParts([cut, link]), truncated: true, droppedHashtags: Boolean(tags) };
}

function firstLine(text, max = 300) {
  const line = String(text || '').split(/\r?\n/).find((l) => l.trim()) || '';
  const chars = graphemes(line.trim());
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}

module.exports = { URL_RE, countLength, composeText, normalizeHashtags, firstLine, graphemes };
