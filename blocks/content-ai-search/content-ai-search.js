/*
 * Content AI search: natural-language search with an AI answer.
 * Based on https://github.com/Apoorv-R98/content-ai-search-block (Apache-2.0).
 *
 * The block calls a backend at `base-url` with the Content AI proxy contract:
 *   POST {base-url}/search     ranked pages
 *   POST {base-url}/gensearch  generated answer + the pages it used
 * That is either a Content AI proxy or workers/content_search (query index + Workers AI).
 *
 * Variants: default shows "Results" and "AI answer" tabs; `answer` shows only the AI answer
 * with its source pages as cards.
 * Config rows: base-url, content-source, content-source-type, placeholder, results-size,
 * results-layout (cards | list), disclaimer, suggestions (link to a sheet with `label` and
 * optional `query` columns), suggestions-count; any key of LABELS overrides that text.
 * A `?q=` URL parameter runs a search when the page opens.
 */
import { readBlockConfig } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

const LABELS = {
  placeholder: 'Ask anything…',
  submit: 'Search',
  clear: 'Clear search',
  'results-tab': 'Results',
  'answer-tab': 'AI answer',
  'answer-title': 'AI answer',
  searching: 'Searching…',
  generating: 'Writing an answer…',
  sources: 'Sources',
  'no-results': 'No results found. Try other words.',
  'no-answer': 'No answer found for that. Try other words or one of the suggestions.',
  error: 'Something went wrong. Please try again.',
  retry: 'Try again',
  'load-more': 'Load more results',
  layout: 'Results layout',
  cards: 'Cards',
  list: 'List',
  'suggestions-label': 'Try',
  'search-mode': 'Search mode',
};

const MAX_RESULTS_SIZE = 50;
const LOADING_DISPLAY_DELAY = 300;
// Hybrid query: the full-text weight shrinks as questions get longer, so natural-language
// questions rely mostly on the semantic match.
const VECTOR_NUM_CANDIDATES = 50;
const RESULT_FIELDS = [
  'text', 'source', 'title', 'name', 'metadata.url', 'metadata.source', 'metadata.title',
  'metadata.description', 'metadata.image', 'metadata.meta.image',
];
const EXCERPT_LENGTH = 160;
const MIN_EXCERPT_LINE = 40;
const SKIP_ANCHORS = ['#main-content', '#main', '#content', '#maincontent', '#skip-to-content'];
const DOCUMENT_EXT = /\.(pdf|docx?|pptx?|xlsx?)$/i;

/* ---- backend ---- */

function fulltextBoost(query) {
  const tokens = query.trim().split(/\s+/).length;
  return tokens > 1 ? 1 / (5 * tokens) : 1;
}

async function post(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
  return resp.json();
}

function fetchResults(cfg, text, cursor) {
  return post(`${cfg.baseUrl}/search`, {
    contentSource: cfg.contentSource,
    query: {
      type: 'composite',
      operator: 'OR',
      queries: [
        { type: 'vector', text, options: { numCandidates: VECTOR_NUM_CANDIDATES, boost: 1 } },
        {
          type: 'fulltext',
          text,
          options: { boost: fulltextBoost(text), operator: 'AND', matchStrategy: 'COMBINED_FIELDS' },
        },
      ],
    },
    queryOptions: {
      resultFields: { includes: RESULT_FIELDS },
      pagination: { limit: cfg.resultsSize, ...(cursor ? { cursor } : {}) },
    },
  });
}

function fetchAnswer(cfg, query) {
  return post(`${cfg.baseUrl}/gensearch`, { contentSource: cfg.contentSource, query });
}

/* ---- result data ---- */

function isSafeUrl(url) {
  if (!url) return false;
  try {
    return ['http:', 'https:'].includes(new URL(url, window.location.origin).protocol);
  } catch {
    return false;
  }
}

function labelFromUrl(url) {
  try {
    const segments = new URL(url, window.location.origin).pathname.split('/').filter(Boolean);
    if (!segments.length) return url;
    // document URLs can end in an id (…/Report.pdf/dc1fa6af-…), so use the file name
    const file = [...segments].reverse().find((s) => DOCUMENT_EXT.test(s));
    const slug = decodeURIComponent((file || segments[segments.length - 1]).replace(/\+/g, ' '))
      .replace(DOCUMENT_EXT, '')
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return slug ? slug.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) : url;
  } catch {
    return url;
  }
}

function stripMarkdown(line) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[\s>#*\-+\d.)]+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// pages without a description fall back to the start of their text
function excerpt(text, title = '') {
  if (typeof text !== 'string') return '';
  const heading = String(title).trim().toLowerCase();
  const line = text.split('\n').map(stripMarkdown)
    .find((l) => l.length >= MIN_EXCERPT_LINE && l.toLowerCase() !== heading);
  if (!line || line.length <= EXCERPT_LENGTH) return line || '';
  const cut = line.slice(0, EXCERPT_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,;:.-]+$/, '')}…`;
}

// skip-link anchors (page#main-content) point at the same page
function stripSkipAnchor(url) {
  const i = String(url).indexOf('#');
  return i >= 0 && SKIP_ANCHORS.includes(url.slice(i).toLowerCase()) ? url.slice(0, i) : url;
}

function toItem(metadata = {}, fallback = {}) {
  const meta = metadata || {};
  const url = stripSkipAnchor(meta.url || meta.source || fallback.source || '');
  const title = meta.title || fallback.title || (url ? labelFromUrl(url) : '');
  const description = (typeof meta.description === 'string' && meta.description.trim())
    || excerpt(fallback.text, title);
  const image = meta.image || meta.meta?.image || '';
  return {
    url: isSafeUrl(url) ? url : '',
    title,
    description,
    image: isSafeUrl(image) ? image : '',
  };
}

const identity = (item) => {
  try {
    const u = new URL(item.url, window.location.origin);
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return item.url || item.title;
  }
};

function displayPath(url) {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin ? u.pathname : `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

/* ---- answer text (Markdown subset, escaped first) ---- */

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => (
    isSafeUrl(url) ? `<a href="${url}">${label}</a>` : label));
  return html.split(/(<a\b[^>]*>.*?<\/a>)/g).map((part) => (/^<a\b/.test(part) ? part
    : part.replace(/https?:\/\/[^\s<]+/g, (url) => {
      const trailing = (url.match(/[).,;:!?]+$/) || [''])[0];
      const clean = trailing ? url.slice(0, -trailing.length) : url;
      return isSafeUrl(clean) ? `<a href="${clean}">${clean}</a>${trailing}` : url;
    }))).join('');
}

function renderAnswer(text) {
  let html = '';
  let list = '';
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    const item = line.match(/^(?:[-*]|\d+[.)])\s+(.*)$/);
    if (item) {
      list += `<li>${renderInline(item[1])}</li>`;
      return;
    }
    if (list) {
      html += `<ul>${list}</ul>`;
      list = '';
    }
    if (line) html += `<p>${renderInline(line)}</p>`;
  });
  if (list) html += `<ul>${list}</ul>`;
  return html;
}

/* ---- rendering ---- */

function renderCard(item, cls) {
  const link = createTag(item.url ? 'a' : 'div', { class: cls, ...(item.url ? { href: item.url } : {}) });
  if (item.image) {
    link.append(createTag('img', {
      src: item.image, alt: '', loading: 'lazy', class: `${cls}-image`,
    }));
  }
  const body = createTag('div', { class: `${cls}-body` });
  body.append(createTag('p', { class: `${cls}-title` }, item.title));
  if (item.description) body.append(createTag('p', { class: `${cls}-description` }, item.description));
  if (item.url) body.append(createTag('p', { class: `${cls}-path` }, displayPath(item.url)));
  link.append(body);
  return createTag('li', {}, link);
}

function status(text) {
  const el = createTag('div', { class: 'content-ai-search-status', role: 'status', hidden: '' });
  el.append(createTag('span', { class: 'content-ai-search-spinner', 'aria-hidden': 'true' }), createTag('span', {}, text));
  return el;
}

async function loadSuggestions(href, count) {
  try {
    const resp = await fetch(href);
    if (!resp.ok) return [];
    const rows = (await resp.json())?.data || [];
    const pills = rows.map((r) => ({
      label: String(r.label || r.Label || '').trim(),
      query: String(r.query || r.Query || r.label || r.Label || '').trim(),
    })).filter((p) => p.label);
    for (let i = pills.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pills[i], pills[j]] = [pills[j], pills[i]];
    }
    return pills.slice(0, count);
  } catch {
    return [];
  }
}

/** @param {Element} block */
export default function decorate(block) {
  const config = readBlockConfig(block);
  const label = (key) => config[key] || LABELS[key];
  const answerOnly = block.classList.contains('answer');
  const cfg = {
    baseUrl: String(config['base-url'] || '').replace(/\/+$/, ''),
    contentSource: {
      name: config['content-source'] || '',
      type: config['content-source-type'] || 'AEM_PUBLISH',
    },
    resultsSize: Math.min(parseInt(config['results-size'], 10) || 10, MAX_RESULTS_SIZE),
  };
  let layout = config['results-layout'] === 'list' ? 'list' : 'cards';
  const uid = `content-ai-search-${Math.random().toString(36).slice(2, 8)}`;
  block.textContent = '';

  /* search box */
  const form = createTag('form', { class: 'content-ai-search-form', role: 'search' });
  const field = createTag('div', { class: 'content-ai-search-field' });
  const input = createTag('input', {
    type: 'search',
    name: 'q',
    class: 'content-ai-search-input',
    placeholder: label('placeholder'),
    'aria-label': label('placeholder'),
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const clear = createTag('button', {
    type: 'button', class: 'content-ai-search-clear', 'aria-label': label('clear'), hidden: '',
  });
  const submit = createTag('button', { type: 'submit', class: 'content-ai-search-submit' }, label('submit'));
  field.append(input, clear, submit);
  form.append(field);
  block.append(form);

  const suggestions = createTag('div', { class: 'content-ai-search-suggestions', hidden: '' });
  block.append(suggestions);

  /* answer panel */
  const answerPanel = createTag('div', { class: 'content-ai-search-panel content-ai-search-panel-answer', id: `${uid}-answer` });
  const answerStatus = status(label('generating'));
  const answer = createTag('div', { class: 'content-ai-search-answer', hidden: '' });
  const answerHead = createTag('p', { class: 'content-ai-search-answer-title' }, label('answer-title'));
  const answerText = createTag('div', { class: 'content-ai-search-answer-text', 'aria-live': 'polite' });
  const sourcesLabel = createTag('p', { class: 'content-ai-search-sources-label' }, label('sources'));
  const sources = createTag('ul', { class: 'content-ai-search-sources' });
  answer.append(answerHead, answerText, sourcesLabel, sources);
  if (config.disclaimer) answer.append(createTag('p', { class: 'content-ai-search-disclaimer' }, config.disclaimer));
  const answerError = createTag('div', { class: 'content-ai-search-error', hidden: '' });
  const retry = createTag('button', { type: 'button', class: 'button secondary' }, label('retry'));
  answerError.append(createTag('p', {}, label('error')), retry);
  answerPanel.append(answerStatus, answer, answerError);

  /* results panel */
  const resultsPanel = createTag('div', { class: 'content-ai-search-panel content-ai-search-panel-results', id: `${uid}-results` });
  const resultsStatus = status(label('searching'));
  const resultsWrap = createTag('div', { class: 'content-ai-search-results-wrap', hidden: '' });
  const toolbar = createTag('div', { class: 'content-ai-search-toolbar', role: 'group', 'aria-label': label('layout') });
  const cardsBtn = createTag('button', { type: 'button', class: 'content-ai-search-layout', 'data-layout': 'cards' }, label('cards'));
  const listBtn = createTag('button', { type: 'button', class: 'content-ai-search-layout', 'data-layout': 'list' }, label('list'));
  toolbar.append(cardsBtn, listBtn);
  const results = createTag('ul', { class: 'content-ai-search-results' });
  const empty = createTag('p', { class: 'content-ai-search-empty', hidden: '' });
  const loadMore = createTag('button', { type: 'button', class: 'button secondary content-ai-search-more', hidden: '' }, label('load-more'));
  const moreError = createTag('p', { class: 'content-ai-search-more-error', role: 'alert', hidden: '' }, label('error'));
  resultsWrap.append(toolbar, results, empty, moreError, loadMore);
  resultsPanel.append(resultsStatus, resultsWrap);

  /* tabs (default variant) */
  let tabs;
  if (answerOnly) {
    block.append(answerPanel);
  } else {
    tabs = createTag('div', { class: 'content-ai-search-tabs', role: 'tablist', 'aria-label': label('search-mode'), hidden: '' });
    [[resultsPanel, 'results-tab'], [answerPanel, 'answer-tab']].forEach(([panel, key], i) => {
      const tab = createTag('button', {
        type: 'button',
        role: 'tab',
        id: `${panel.id}-tab`,
        class: 'content-ai-search-tab',
        'aria-controls': panel.id,
        'aria-selected': i === 0 ? 'true' : 'false',
        tabindex: i === 0 ? '0' : '-1',
      }, label(key));
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.hidden = i !== 0;
      tabs.append(tab);
    });
    block.append(tabs, resultsPanel, answerPanel);
  }
  block.classList.add('is-idle');

  /* state */
  let query = '';
  let items = [];
  let cursor = null;
  let resultsRun = 0;
  let answerRun = 0;

  const showLayout = () => {
    block.dataset.layout = layout;
    [cardsBtn, listBtn].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === layout)));
  };

  function renderResults() {
    results.textContent = '';
    items.forEach((item) => results.append(renderCard(item, 'content-ai-search-result')));
    empty.hidden = items.length > 0;
    moreError.hidden = true;
    loadMore.hidden = !cursor;
    resultsWrap.hidden = false;
  }

  function addResults(data) {
    const seen = new Set(items.map(identity));
    (data?.results || []).forEach((r) => {
      const item = toItem(r.data?.metadata, r.data);
      const id = identity(item);
      if (item.title && !seen.has(id)) {
        seen.add(id);
        items.push(item);
      }
    });
    cursor = data?.cursor && data.results?.length ? data.cursor : null;
  }

  async function runResults(text) {
    resultsRun += 1;
    const run = resultsRun;
    items = [];
    cursor = null;
    resultsWrap.hidden = true;
    resultsStatus.hidden = false;
    try {
      const data = await fetchResults(cfg, text);
      if (run !== resultsRun) return;
      addResults(data);
      empty.textContent = label('no-results');
    } catch {
      if (run !== resultsRun) return;
      empty.textContent = label('error');
    }
    resultsStatus.hidden = true;
    renderResults();
  }

  async function runAnswer(text) {
    answerRun += 1;
    const run = answerRun;
    const start = Date.now();
    answer.hidden = true;
    answerError.hidden = true;
    answerStatus.hidden = false;
    let data;
    let failed = false;
    try {
      data = await fetchAnswer(cfg, text);
    } catch {
      failed = true;
    }
    // keep the loading state up long enough not to flash
    await new Promise((r) => { setTimeout(r, Math.max(0, LOADING_DISPLAY_DELAY - (Date.now() - start))); });
    if (run !== answerRun) return;
    answerStatus.hidden = true;
    if (failed) {
      answerError.hidden = false;
      return;
    }
    const hits = [];
    const seen = new Set();
    (data?.hits || []).forEach((hit) => {
      const item = toItem(hit.metadata);
      if (item.url && !seen.has(identity(item))) {
        seen.add(identity(item));
        hits.push(item);
      }
    });
    const result = String(data?.result || '').trim();
    answerText.innerHTML = result ? renderAnswer(result) : `<p>${escapeHtml(label('no-answer'))}</p>`;
    sources.textContent = '';
    hits.forEach((item) => sources.append(renderCard(item, 'content-ai-search-source')));
    sourcesLabel.hidden = !hits.length;
    answer.classList.toggle('is-empty', !result);
    answer.hidden = false;
  }

  function reset() {
    resultsRun += 1;
    answerRun += 1;
    query = '';
    block.classList.add('is-idle');
    if (tabs) tabs.hidden = true;
    [answer, answerError, answerStatus, resultsWrap, resultsStatus].forEach((el) => { el.hidden = true; });
  }

  function run(text) {
    query = text.trim();
    if (!query || !cfg.baseUrl) {
      reset();
      return;
    }
    block.classList.remove('is-idle');
    if (tabs) tabs.hidden = false;
    runAnswer(query);
    if (!answerOnly) runResults(query);
  }

  /* events */
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value);
  });
  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    if (!input.value) reset();
  });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    reset();
    input.focus();
  });
  retry.addEventListener('click', () => runAnswer(query));
  [cardsBtn, listBtn].forEach((b) => b.addEventListener('click', () => {
    layout = b.dataset.layout;
    showLayout();
  }));
  loadMore.addEventListener('click', async () => {
    const run = resultsRun;
    loadMore.disabled = true;
    try {
      const data = await fetchResults(cfg, query, cursor);
      if (run === resultsRun) {
        addResults(data);
        renderResults();
      }
    } catch {
      // keep the cursor so the same page can be tried again
      if (run === resultsRun) moreError.hidden = false;
    }
    loadMore.disabled = false;
  });
  if (tabs) {
    const tabButtons = [...tabs.children];
    const select = (tab) => {
      tabButtons.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        block.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !on;
      });
    };
    tabButtons.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const next = tabButtons[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length];
        select(next);
        next.focus();
      });
    });
  }
  showLayout();

  const initial = new URLSearchParams(window.location.search).get('q');
  if (initial) {
    input.value = initial;
    clear.hidden = false;
    run(initial);
  }

  /* suggestions: loaded without holding up the rest of the page */
  if (config.suggestions) {
    suggestions.hidden = false;
    suggestions.classList.add('is-loading');
    loadSuggestions(config.suggestions, parseInt(config['suggestions-count'], 10) || 5).then((pills) => {
      suggestions.classList.remove('is-loading');
      if (!pills.length) {
        suggestions.hidden = true;
        return;
      }
      const list = createTag('ul');
      pills.forEach((pill) => {
        const button = createTag('button', { type: 'button', class: 'content-ai-search-pill' }, pill.label);
        button.addEventListener('click', () => {
          input.value = pill.query;
          clear.hidden = false;
          run(pill.query);
        });
        list.append(createTag('li', {}, button));
      });
      suggestions.append(createTag('span', { class: 'content-ai-search-suggestions-label' }, label('suggestions-label')), list);
    });
  }
}
