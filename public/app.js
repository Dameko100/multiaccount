'use strict';

const $ = (id) => document.getElementById(id);
const state = { platforms: [], templates: [], selected: new Set(), overrides: {}, busy: false };

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function currentPost() {
  return {
    text: $('text').value,
    link: $('link').value.trim(),
    hashtags: $('hashtags').value,
    title: $('title').value.trim(),
    imageUrl: $('imageUrl').value.trim(),
    imageAlt: $('imageAlt').value.trim(),
    subreddit: $('subreddit').value.trim(),
    lang: $('lang').value,
    overrides: state.overrides,
    platforms: state.platforms.map((p) => p.id).filter((id) => state.selected.has(id)),
  };
}

function saveDraft() {
  const { overrides, platforms, ...draft } = currentPost();
  store.set('draft', draft);
  store.set('selected', platforms);
}

// ---- Platforms ----
function renderPlatforms() {
  const box = $('platforms');
  box.replaceChildren(...state.platforms.map((p) => {
    const input = el('input', { type: 'checkbox', checked: state.selected.has(p.id), onchange: (e) => {
      e.target.checked ? state.selected.add(p.id) : state.selected.delete(p.id);
      saveDraft(); refreshPreview();
    } });
    const title = p.configured ? 'Configurada' : `Falta en .env: ${p.requiredEnv.join(', ')}`;
    return el('label', { class: `platform${p.configured ? '' : ' off'}`, title },
      input, el('span', {}, p.name), el('span', { class: `dot${p.configured ? ' on' : ''}` }));
  }));
  updatePublishButton();
}

function updatePublishButton() {
  const n = [...state.selected].filter((id) => state.platforms.find((p) => p.id === id)?.configured).length;
  const btn = $('publish');
  btn.disabled = state.busy || n === 0 || !$('text').value.trim();
  btn.textContent = state.busy ? 'Publicando…' : n ? `Publicar en ${n} plataforma${n > 1 ? 's' : ''}` : 'Publicar';
}

// ---- Previews ----
let previewTimer;
function refreshPreview() {
  updatePublishButton();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const post = currentPost();
    if (!post.platforms.length) {
      $('previews').replaceChildren(el('p', { class: 'empty' }, 'Selecciona plataformas para ver cómo quedará cada post.'));
      return;
    }
    try { renderPreviews(await api('/api/preview', post)); }
    catch (err) { $('previews').replaceChildren(el('p', { class: 'warn' }, err.message)); }
  }, 200);
}

function renderPreviews(items) {
  const active = document.activeElement;
  const focused = active?.dataset?.platform;
  const caret = focused ? [active.selectionStart, active.selectionEnd] : null;
  $('previews').replaceChildren(...items.map((item) => {
    const edited = item.platform in state.overrides;
    const count = el('span', { class: `count${item.length > item.maxLength ? ' over' : ''}` }, `${item.length}/${item.maxLength}`);
    const area = el('textarea', { 'data-platform': item.platform, oninput: (e) => {
      state.overrides[item.platform] = e.target.value;
      refreshPreview();
    } });
    area.value = item.text;
    area.addEventListener('input', () => autosize(area));
    const reset = edited ? el('button', { class: 'ghost small', onclick: () => { delete state.overrides[item.platform]; refreshPreview(); } }, 'Restablecer') : null;
    return el('article', { class: 'preview' },
      el('header', {},
        el('strong', {}, item.name || item.platform),
        el('span', { class: 'row' },
          edited ? el('span', { class: 'tag edited' }, 'editado') : null,
          item.configured ? null : el('span', { class: 'tag' }, 'sin credenciales'),
          count)),
      area,
      ...(item.warnings || []).map((w) => el('p', { class: 'warn' }, '⚠ ' + w)),
      reset);
  }));
  for (const area of document.querySelectorAll('.preview textarea')) autosize(area);
  if (focused) {
    const area = document.querySelector(`textarea[data-platform="${focused}"]`);
    if (area) { area.focus(); area.setSelectionRange(...caret); }
  }
}

function autosize(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

// ---- Publish ----
async function send(dryRun) {
  const post = currentPost();
  const configured = post.platforms.filter((id) => state.platforms.find((p) => p.id === id)?.configured);
  if (!dryRun && !confirm(`¿Publicar ahora en ${configured.length} plataforma(s)?`)) return;
  state.busy = true; updatePublishButton(); $('dryRun').disabled = true;
  $('results').replaceChildren(el('div', { class: 'result' }, dryRun ? 'Simulando…' : 'Publicando en paralelo…'));
  try {
    const entry = await api('/api/publish', { ...post, dryRun });
    renderResults(entry);
    if (!dryRun) loadHistory();
  } catch (err) {
    $('results').replaceChildren(el('div', { class: 'result fail' }, el('span', { class: 'err' }, err.message)));
  } finally {
    state.busy = false; $('dryRun').disabled = false; updatePublishButton();
  }
}

function renderResults(entry) {
  $('results').replaceChildren(...entry.results.map((r) => {
    const icon = r.ok ? '✅' : r.skipped ? '⏭' : '❌';
    const detail = r.ok
      ? (r.dryRun ? 'Listo para publicar (simulación)' : r.url ? el('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'Ver publicación') : 'Publicado')
      : el('span', { class: 'err' }, r.error);
    return el('div', { class: `result ${r.ok ? 'ok' : 'fail'}` },
      el('span', { class: 'icon' }, icon), el('strong', {}, r.name || r.platform), detail);
  }));
}

// ---- History ----
async function loadHistory() {
  const list = await api('/api/history').catch(() => []);
  const box = $('history');
  if (!list.length) return box.replaceChildren(el('p', { class: 'empty' }, 'Todavía no has publicado nada.'));
  box.replaceChildren(...list.map((e) => el('article', { class: 'entry' },
    el('time', { datetime: e.at }, new Date(e.at).toLocaleString()),
    el('p', {}, e.post.text),
    el('div', { class: 'chips' }, ...e.results.map((r) => r.url
      ? el('a', { class: `chip ${r.ok ? 'ok' : 'fail'}`, href: r.url, target: '_blank', rel: 'noopener' }, r.name || r.platform)
      : el('span', { class: `chip ${r.ok ? 'ok' : 'fail'}`, title: r.error || '' }, r.name || r.platform))))));
}

// ---- Templates ----
function applyTemplate(id) {
  const t = state.templates.find((x) => x.id === id);
  if (!t) return;
  $('text').value = t.text;
  $('title').value = t.title || '';
  $('hashtags').value = (t.hashtags || []).join(' ');
  $('lang').value = t.lang || 'es';
  state.overrides = {};
  saveDraft(); refreshPreview();
}

// ---- Init ----
async function init() {
  const [platforms, tpl] = await Promise.all([api('/api/platforms'), api('/api/templates')]);
  state.platforms = platforms;
  state.templates = tpl.templates;
  $('link').placeholder = tpl.link;

  for (const t of tpl.templates) $('template').append(el('option', { value: t.id }, t.name));

  const draft = store.get('draft', null);
  const fields = ['text', 'link', 'hashtags', 'title', 'imageUrl', 'imageAlt', 'subreddit', 'lang'];
  if (draft) for (const f of fields) if (draft[f] != null) $(f).value = draft[f];
  if (!$('link').value) $('link').value = tpl.link;

  const saved = store.get('selected', null);
  const initial = saved || platforms.filter((p) => p.configured).map((p) => p.id);
  state.selected = new Set(initial.filter((id) => platforms.some((p) => p.id === id)));

  for (const f of fields) $(f).addEventListener('input', () => { saveDraft(); refreshPreview(); });
  $('lang').addEventListener('change', () => { saveDraft(); refreshPreview(); });
  $('template').addEventListener('change', (e) => applyTemplate(e.target.value));
  $('selectReady').addEventListener('click', () => {
    state.selected = new Set(platforms.filter((p) => p.configured).map((p) => p.id));
    saveDraft(); renderPlatforms(); refreshPreview();
  });
  $('selectNone').addEventListener('click', () => { state.selected.clear(); saveDraft(); renderPlatforms(); refreshPreview(); });
  $('publish').addEventListener('click', () => send(false));
  $('dryRun').addEventListener('click', () => send(true));

  for (const btn of document.querySelectorAll('[data-tab]')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b === btn));
      $('tab-compose').hidden = btn.dataset.tab !== 'compose';
      $('tab-history').hidden = btn.dataset.tab !== 'history';
      if (btn.dataset.tab === 'history') loadHistory();
    });
  }

  renderPlatforms();
  refreshPreview();
}

init().catch((err) => {
  document.querySelector('main').prepend(el('div', { class: 'result fail' }, el('span', { class: 'err' }, 'No se pudo cargar: ' + err.message)));
});
