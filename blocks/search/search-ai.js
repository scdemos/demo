/*
 * AI modes of the search block: "Search (AI)" answers a question with AI and lists the pages
 * it used; "Search (Tabs)" puts the keyword results and the AI answer in tabs under one box.
 * Based on https://github.com/Apoorv-R98/content-ai-search-block (Apache-2.0).
 *
 * The answer comes from `base-url` with the Content AI proxy contract:
 *   POST {base-url}/gensearch  generated answer + the pages it used
 * That is either a Content AI proxy or workers/content_search (query index + Workers AI).
 *
 * Rows: base-url, content-source, content-source-type, placeholder, disclaimer,
 * suggestions (link to a sheet with `label` and optional `query` columns), suggestions-count;
 * any key of LABELS overrides that text. A `?q=` URL parameter runs a search when the page opens.
 */
import { createTag } from '../../scripts/shared.js';
import { LABELS as KEYWORD_LABELS } from './search.js';

const LABELS = {
  placeholder: 'Ask anything…',
  submit: 'Search',
  clear: 'Clear search',
  'results-tab': 'Results',
  'answer-tab': 'AI answer',
  'answer-title': 'AI answer',
  generating: 'Writing an answer…',
  sources: 'Sources',
  'no-answer': 'No answer found for that. Try other words or one of the suggestions.',
  error: 'Something went wrong. Please try again.',
  retry: 'Try again',
  'suggestions-label': 'Try',
  'search-mode': 'Search mode',
};

const CONFIG_KEYS = [
  'base-url', 'content-source', 'content-source-type', 'disclaimer', 'suggestions', 'suggestions-count',
];

const LOADING_DISPLAY_DELAY = 300;
const EXCERPT_LENGTH = 160;
const MIN_EXCERPT_LINE = 40;
const SKIP_ANCHORS = ['#main-content', '#main', '#content', '#maincontent', '#skip-to-content'];
const DOCUMENT_EXT = /\.(pdf|docx?|pptx?|xlsx?)$/i;

/* ---- backend ---- */

async function post(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
  return resp.json();
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
  const el = createTag('div', { class: 'search-ai-status', role: 'status', hidden: '' });
  el.append(createTag('span', { class: 'search-ai-spinner', 'aria-hidden': 'true' }), createTag('span', {}, text));
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

/**
 * @param {Element} block emptied search block
 * @param {object} config block config
 * @param {object} options keywordSearch: keyword search factory; tabs: show both in tabs
 */
export default async function decorate(block, config, { keywordSearch, tabs: withTabs }) {
  const label = (key) => config[key] || LABELS[key] || KEYWORD_LABELS[key];
  const cfg = {
    baseUrl: String(config['base-url'] || '').replace(/\/+$/, ''),
    contentSource: {
      name: config['content-source'] || '',
      type: config['content-source-type'] || 'AEM_PUBLISH',
    },
  };
  const uid = `search-${Math.random().toString(36).slice(2, 8)}`;

  /* search box */
  const form = createTag('form', { class: 'search-ai-form', role: 'search' });
  const field = createTag('div', { class: 'search-ai-field' });
  const input = createTag('input', {
    type: 'search',
    name: 'q',
    class: 'search-ai-input',
    placeholder: label('placeholder'),
    'aria-label': label('placeholder'),
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const clear = createTag('button', {
    type: 'button', class: 'search-ai-clear', 'aria-label': label('clear'), hidden: '',
  });
  const submit = createTag('button', { type: 'submit', class: 'search-ai-submit' }, label('submit'));
  field.append(input, clear, submit);
  form.append(field);
  block.append(form);

  const suggestions = createTag('div', { class: 'search-ai-suggestions', hidden: '' });
  block.append(suggestions);

  /* answer panel */
  const answerPanel = createTag('div', { class: 'search-ai-panel search-ai-panel-answer', id: `${uid}-answer` });
  const answerStatus = status(label('generating'));
  const answer = createTag('div', { class: 'search-ai-answer', hidden: '' });
  const answerHead = createTag('p', { class: 'search-ai-answer-title' }, label('answer-title'));
  const answerText = createTag('div', { class: 'search-ai-answer-text', 'aria-live': 'polite' });
  const sourcesLabel = createTag('p', { class: 'search-ai-sources-label' }, label('sources'));
  const sources = createTag('ul', { class: 'search-ai-sources' });
  answer.append(answerHead, answerText, sourcesLabel, sources);
  if (config.disclaimer) answer.append(createTag('p', { class: 'search-ai-disclaimer' }, config.disclaimer));
  const answerError = createTag('div', { class: 'search-ai-error', hidden: '' });
  const retry = createTag('button', { type: 'button', class: 'button secondary' }, label('retry'));
  answerError.append(createTag('p', {}, label('error')), retry);
  answerPanel.append(answerStatus, answer, answerError);

  /* tabs: keyword results + AI answer */
  let tabs;
  let keyword;
  if (withTabs) {
    const resultsPanel = createTag('div', { class: 'search-ai-panel search-ai-panel-results', id: `${uid}-results` });
    tabs = createTag('div', { class: 'search-ai-tabs', role: 'tablist', 'aria-label': label('search-mode'), hidden: '' });
    [[resultsPanel, 'results-tab'], [answerPanel, 'answer-tab']].forEach(([panel, key], i) => {
      const tab = createTag('button', {
        type: 'button',
        role: 'tab',
        id: `${panel.id}-tab`,
        class: 'search-ai-tab',
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
    try {
      keyword = await keywordSearch(resultsPanel, config, {
        form: false,
        loose: true,
        reserved: [...CONFIG_KEYS, ...Object.keys(LABELS)],
        label,
      });
    } catch {
      // the AI answer still works without the query index
      resultsPanel.textContent = '';
      resultsPanel.append(createTag('p', { class: 'search-ai-error' }, label('error')));
    }
  } else {
    block.append(answerPanel);
  }
  block.classList.add('is-idle');

  /* state */
  let query = '';
  let answerRun = 0;

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
    hits.forEach((item) => sources.append(renderCard(item, 'search-ai-source')));
    sourcesLabel.hidden = !hits.length;
    answer.classList.toggle('is-empty', !result);
    answer.hidden = false;
  }

  function reset() {
    answerRun += 1;
    query = '';
    block.classList.add('is-idle');
    if (tabs) {
      tabs.hidden = true;
      tabs.firstElementChild.click();
    }
    if (keyword) keyword.search('');
    [answer, answerError, answerStatus].forEach((el) => { el.hidden = true; });
  }

  function run(text) {
    query = text.trim();
    if (!query) {
      reset();
      return;
    }
    block.classList.remove('is-idle');
    if (tabs) tabs.hidden = false;
    if (keyword) keyword.search(query);
    if (cfg.baseUrl) runAnswer(query);
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
        const button = createTag('button', { type: 'button', class: 'search-ai-pill' }, pill.label);
        button.addEventListener('click', () => {
          input.value = pill.query;
          clear.hidden = false;
          run(pill.query);
        });
        list.append(createTag('li', {}, button));
      });
      suggestions.append(createTag('span', { class: 'search-ai-suggestions-label' }, label('suggestions-label')), list);
    });
  }
}
