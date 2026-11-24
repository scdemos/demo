// Page insights (opened from da.live): how one page and the whole site perform, from each analytics
// source the page insights worker (workers/page_insights) is connected to. The page is the one after #,
// addressed as DA addresses documents (/org/site/en/products/duo).
const DA_SDK_URL = 'https://da.live/nx/utils/sdk.js';
const params = new URLSearchParams(window.location.search);
// ?worker= is only honored for local testing
const WORKER = params.get('worker')?.startsWith('http://localhost') ? params.get('worker') : 'https://demo.bbird.live/page-insights';
const DEFAULT_PAGE = '/en/';

const MESSAGES = {
  sign_in_required: 'Open this page from da.live while signed in with your Adobe account.',
  token_not_accepted: 'Open this page from da.live while signed in with your Adobe account.',
  token_invalid: 'Your Adobe sign-in expired. Reload the page.',
  not_an_author: 'Page insights is for authors of this site. Ask a demo admin for access.',
  invalid_path: 'That isn\'t a page path. Paths look like /en/products/duo.',
  not_configured: 'Not connected yet. Ask a demo admin to connect it.',
  custom_dimensions_missing: 'To see this, register block_name and link_text as event-scoped custom dimensions in Google Analytics (Admin → Custom definitions).',
  no_access_to_property: 'Page insights can\'t read this Google Analytics property. Add its service account as Viewer.',
  google_auth_failed: 'Page insights couldn\'t sign in to Google. Check its service account key.',
};
const say = (code) => MESSAGES[code] || `Couldn't load this (${code}).`;

// The site's analytics events (scripts/cart.js, form, booking and quiz blocks) by their GA4 names.
const EVENT_LABELS = {
  page_view: 'Page views',
  view_item: 'Product views',
  add_to_cart: 'Add to carts',
  view_cart: 'Cart views',
  begin_checkout: 'Checkouts started',
  purchase: 'Purchases',
  generate_lead: 'Leads',
  quiz_complete: 'Quizzes completed',
  cta_click: 'Button clicks',
  block_interaction: 'Block interactions',
  view_item_list: 'Product list views',
  select_item: 'Products picked from a list',
  view_promotion: 'Promotion views',
  select_promotion: 'Promotion clicks',
  remove_from_cart: 'Removals from cart',
  search: 'Searches',
  view_search_results: 'Search results views',
  share: 'Shares',
  form_start: 'Forms started',
  click: 'Outbound clicks',
  file_download: 'File downloads',
  scroll: 'Scrolls',
  user_engagement: 'Engagement pings',
  session_start: 'Sessions started',
  first_visit: 'First visits',
};
const eventLabel = (name) => EVENT_LABELS[name] || name;

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('en-US');
const pf = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

/** Element helper: tag, attributes, children (strings become text). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === false || v === null || v === undefined) return;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

function setStatus(text, error = false) {
  const el = $('status');
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('error', error);
}

let token = '';
let org = '';
let site = '';
let page = DEFAULT_PAGE;
// opened without a page, the app shows the whole site until one is picked
let pagePicked = false;
let days = 30;
let pageRequest = 0;
let siteRequest = 0;

async function post(route, body = {}) {
  const res = await fetch(`${WORKER}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * The page path a DA document path stands for: en/index → /en/, en/products/duo.html →
 * /en/products/duo. Empty for no document.
 */
function toPagePath(docPath) {
  const path = String(docPath || '').replace(/^\/+/, '').replace(/\.html$/, '');
  return path ? `/${path}`.replace(/(^|\/)index$/, '$1') : '';
}

const liveUrl = (path) => `https://main--${site}--${org}.aem.live${path}`;

function showPage() {
  $('page-path').value = page;
  const link = $('page-link');
  link.href = liveUrl(page);
  document.title = pagePicked ? `Page insights: ${page}` : 'Page insights';
}

// ---- small charts (inline SVG, with the numbers in their label) ----


function bars(values, { label, height = 48 } = {}) {
  const max = Math.max(1, ...values);
  const w = 100 / values.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 100 ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.classList.add('insights-bars');
  values.forEach((v, i) => {
    const bh = v ? Math.max(2, (v / max) * height) : 0;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(i * w + w * 0.15));
    rect.setAttribute('width', String(w * 0.7));
    rect.setAttribute('y', String(height - bh));
    rect.setAttribute('height', String(bh));
    svg.append(rect);
  });
  return svg;
}

// ---- page ----

function delta(current, previous) {
  if (!previous) return null;
  const change = (current - previous) / previous;
  const up = change >= 0;
  return h('span', { class: `insights-delta ${up ? 'up' : 'down'}` }, `${up ? '▲' : '▼'} ${pf.format(Math.abs(change))}`);
}

function duration(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function kpi(label, value, current, previous) {
  return h(
    'div',
    { class: 'insights-kpi' },
    h('dt', {}, label),
    h('dd', {}, h('span', { class: 'insights-kpi-value' }, value), delta(current, previous)),
  );
}

function card(title, body) {
  return h('section', { class: 'insights-card' }, h('h3', {}, title), body);
}

const sectionError = (part) => h('p', { class: 'insights-source-note' }, say(part.error));

function summaryCard({ current: c, previous: p }) {
  const perUser = (x) => (x.users ? x.engagementSeconds / x.users : 0);
  return h(
    'dl',
    { class: 'insights-kpis' },
    kpi('Views', nf.format(c.views), c.views, p.views),
    kpi('Visitors', nf.format(c.users), c.users, p.users),
    kpi('Engaged sessions', nf.format(c.engagedSessions), c.engagedSessions, p.engagedSessions),
    kpi('Time per visitor', duration(perUser(c)), perUser(c), perUser(p)),
  );
}

const where = (scope) => (scope === 'site' ? 'on the site' : 'on this page');

function conversionsCard(conversions, views, scope) {
  const hits = conversions.filter((x) => x.count > 0);
  if (!hits.length) return h('p', { class: 'insights-empty' }, `No conversions ${where(scope)} in this period.`);
  return h('ul', { class: 'insights-conversions' }, hits.map((x) => h(
    'li',
    {},
    h('span', {}, eventLabel(x.name)),
    h('strong', {}, nf.format(x.count)),
    views ? h('span', { class: 'insights-rate' }, `${pf.format(x.count / views)} of views`) : '',
  )));
}

function trendCard(trend) {
  const total = trend.reduce((sum, d) => sum + d.views, 0);
  const label = (d) => `${d.date.slice(4, 6)}/${d.date.slice(6)}`;
  return h(
    'div',
    {},
    bars(trend.map((d) => d.views), { label: `Views per day: ${trend.map((d) => `${label(d)} ${d.views}`).join(', ')}`, height: 64 }),
    h('p', { class: 'insights-axis' }, h('span', {}, label(trend[0])), h('span', {}, `${nf.format(total)} views`), h('span', {}, label(trend.at(-1)))),
  );
}

function table(caption, head, rows) {
  return h(
    'table',
    { class: 'insights-table' },
    h('caption', { class: 'visually-hidden' }, caption),
    h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { scope: 'col', class: i === head.length - 1 ? 'num' : null }, x)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((x, i) => h('td', { class: i === r.length - 1 ? 'num' : null }, x))))),
  );
}

function ctasCard(ctas) {
  if (!ctas.length) return h('p', { class: 'insights-empty' }, 'No clicks on this page in this period.');
  return table('Clicks by block', ['Block', 'Clicked', 'Clicks'], ctas.map((x) => [x.block === 'default-content' ? 'Page text' : x.block, x.label || '–', nf.format(x.clicks)]));
}

function channelsCard(channels, scope) {
  if (!channels.length) return h('p', { class: 'insights-empty' }, `No visits ${scope === 'site' ? 'to the site' : 'to this page'} in this period.`);
  return table('Sessions by source', ['Source', 'Medium', 'Sessions'], channels.map((x) => [x.source, x.medium, nf.format(x.sessions)]));
}

function pagesCard(pages) {
  if (!pages.length) return h('p', { class: 'insights-empty' }, 'No page views in this period.');
  return table('Most viewed pages', ['Page', 'Visitors', 'Views'], pages.map((x) => [
    h('a', { href: `#/${org}/${site}${x.path}`, 'data-page': x.path }, x.path),
    nf.format(x.users),
    nf.format(x.views),
  ]));
}

function eventsCard(events) {
  if (!events.length) return h('p', { class: 'insights-empty' }, 'No events in this period.');
  return h('ul', { class: 'insights-chips' }, events.map((e) => h('li', {}, eventLabel(e.name), ' ', h('strong', {}, nf.format(e.count)))));
}

const part = (p, render) => (p.error ? sectionError(p) : render(p.value));

/** One analytics source's section: `scope` is 'page' or 'site'. */
function renderSource(s, scope) {
  const title = scope === 'site' ? `Whole site · ${s.label}` : s.label;
  const head = h('h2', {}, title);
  if (s.status !== 'ok') return h('section', { class: 'insights-source' }, head, h('p', { class: 'insights-source-note' }, say(s.status === 'error' ? s.error : s.status)));
  const d = s.data;
  const views = d.summary.value?.current.views || 0;
  const cards = scope === 'site'
    ? [
      card('Most viewed pages', part(d.pages, pagesCard)),
      card('Events', part(d.events, eventsCard)),
    ]
    : [card('What visitors clicked', part(d.ctas, ctasCard))];
  return h(
    'section',
    { class: `insights-source insights-for-${scope}` },
    head,
    h('p', { class: 'insights-note' }, `Last ${days} days, compared with the ${days} days before. Google Analytics can take a few hours to process new visits.`),
    part(d.summary, summaryCard),
    h(
      'div',
      { class: 'insights-grid' },
      card('Views per day', part(d.trend, trendCard)),
      card('Conversions', part(d.conversions, (c) => conversionsCard(c, views, scope))),
      ...cards,
      card('Where visitors came from', part(d.channels, (c) => channelsCard(c, scope))),
    ),
  );
}

async function loadPage() {
  if (!pagePicked) return;
  pageRequest += 1;
  const mine = pageRequest;
  showPage();
  $('sources').setAttribute('aria-busy', 'true');
  setStatus(`Loading ${page}…`);
  try {
    const data = await post('page', { path: page, days });
    if (mine !== pageRequest) return;
    setStatus('');
    $('sources').replaceChildren(...data.sources.map((x) => renderSource(x, 'page')));
  } catch (e) {
    if (mine !== pageRequest) return;
    $('sources').replaceChildren();
    setStatus(say(e.message), true);
  } finally {
    if (mine === pageRequest) $('sources').removeAttribute('aria-busy');
  }
}

async function loadSite() {
  siteRequest += 1;
  const mine = siteRequest;
  $('site').setAttribute('aria-busy', 'true');
  // with no page picked, the site report is the whole view and the status line is its own
  if (!pagePicked) setStatus('Loading the whole site…');
  try {
    const data = await post('site', { days });
    if (mine !== siteRequest) return;
    if (!pagePicked) setStatus('');
    $('site').replaceChildren(...data.sources.map((x) => renderSource(x, 'site')));
  } catch (e) {
    if (mine !== siteRequest) return;
    if (!pagePicked) setStatus('');
    $('site').replaceChildren(h('p', { class: 'insights-source-note' }, say(e.message)));
  } finally {
    if (mine === siteRequest) $('site').removeAttribute('aria-busy');
  }
}

function showPath(path) {
  page = path;
  pagePicked = true;
  window.history.replaceState(null, '', `#/${org}/${site}${page}`);
  loadPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function wire() {
  $('page-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('page-path').value.trim();
    let next = raw;
    try {
      // a pasted page URL works too
      if (/^https?:\/\//.test(raw)) next = new URL(raw).pathname;
    } catch { /* checked by the worker */ }
    showPath(toPagePath(next) || DEFAULT_PAGE);
  });
  $('range').addEventListener('change', (e) => {
    days = Number(e.target.value) === 7 ? 7 : 30;
    loadPage();
    loadSite();
  });
  // a page in "Most viewed pages" opens its insights here
  $('site').addEventListener('click', (e) => {
    const link = e.target.closest('a[data-page]');
    if (!link) return;
    e.preventDefault();
    showPath(link.dataset.page);
  });
}

async function init() {
  try {
    const { default: DA_SDK } = await import(DA_SDK_URL);
    const sdk = await Promise.race([DA_SDK, new Promise((_, no) => { setTimeout(() => no(new Error('sign_in_required')), 8000); })]);
    token = sdk.token;
    // the document: #/org/site/path in this app's address, else DA's context (library or Apps page)
    const [, o = '', s = '', ...rest] = (window.location.hash || sdk.context?.hash || '').replace(/^#/, '').split('/');
    org = o || sdk.context?.org || '';
    site = s || sdk.context?.repo || '';
    const docPath = rest.length ? rest.join('/') : sdk.context?.path || params.get('page') || '';
    // a page named in the link (even the root, /) is shown; no page at all shows the whole site
    pagePicked = String(docPath).trim() !== '';
    page = pagePicked ? toPagePath(docPath) || '/' : DEFAULT_PAGE;
    if (!token || !org || !site) throw new Error('sign_in_required');
  } catch (e) {
    setStatus(say(e.message === 'sign_in_required' ? e.message : 'sign_in_required'), true);
    return;
  }
  wire();
  showPage();
  loadPage();
  loadSite();
}

init();
