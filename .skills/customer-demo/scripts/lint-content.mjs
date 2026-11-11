#!/usr/bin/env node
/*
 * customer-demo: content-model linter (P3 read the contract, P4 content parity, P6/P7 decisions).
 * Reads the site's pages, nav, footer and form sheets and checks them against block contracts
 * and the base manifest. Exit 1 on any FAIL.
 *
 *   node lint-content.mjs --site <slug> [--org scdemos] [--preview] [--pages "/a,/b" | --scope "/a,/b"] [--original https://customer.com] [--json]
 *   node lint-content.mjs --self-test
 *
 * --preview lints aem.page (run it after bulk preview, before publish); the default is aem.live.
 */
import {
  MANIFEST, Report, parseArgs, origins, get, getJson, sheetRows, blocksIn, sectionStyles,
  hrefs, internalPath, discoverPages, plainPages, text, childDivs,
} from './lib/site.mjs';

const knownVariants = Object.fromEntries(Object.entries(MANIFEST.blocks).map(([name, b]) => [
  name, new Set((b.variants || []).flatMap((v) => v.split(/\s+/))),
]));
const knownStyles = new Set(Object.keys(MANIFEST.sectionStyles).filter((k) => !k.startsWith('$')));
const markers = MANIFEST.baseContentMarkers?.markers || [];
const OPTION_TYPES = new Set(['checkbox', 'radio', 'select']);

/* ---------- pure rules ---------- */

/** Rules for one page's plain html → findings. */
export function lintPage(page, html, ctx = {}) {
  const out = [];
  const blocks = blocksIn(html);
  blocks.forEach((b) => {
    if (b.name === 'tabs') out.push(['FAIL', 'lint:tabs-model', 'P3', `${page}: "tabs" authored as a block table; the base tabs block is section-driven (Tab Id / Tab title section metadata). Use cards panel for tiles`, 'tabs misuse']);
    if (b.name === 'faq' && !ctx.faqIndex) out.push(['FAIL', 'lint:faq-index', 'P3', `${page}: faq block reads /faq-index.json, which doesn't exist. Use an accordion-style construct or create the index`, 'faq 404']);
    if (b.name === 'journey-map') out.push(['WARN', 'lint:journey-map', 'P3', `${page}: journey-map is a gated checklist, not a timeline (use table striped for timelines)`, 'journey-map misuse']);
    if (!knownVariants[b.name]) {
      out.push(['WARN', 'lint:unknown-block', 'P7', `${page}: block "${b.name}" isn't in demo-manifest.json; record it (level, content model, baseCandidate)`]);
    } else {
      const unknown = b.variants.filter((v) => !knownVariants[b.name].has(v) && !/^(columns-\d|embed-)/.test(v));
      if (unknown.length) out.push(['WARN', 'lint:unknown-variant', 'P7', `${page}: ${b.name} variant(s) ${unknown.join(', ')} not in the manifest (typo, or record it)`]);
    }
    if (!b.rows.length) out.push(['FAIL', 'lint:empty-block', 'P4', `${page}: ${b.name} block has no rows`]);
  });
  sectionStyles(html).filter((s) => !knownStyles.has(s)).forEach((s) => out.push(['WARN', 'lint:unknown-style', 'P7', `${page}: section style "${s}" isn't in the manifest (typo, or record it)`]));
  const h1 = (html.match(/<h1\b/g) || []).length;
  if (!h1) out.push(['FAIL', 'lint:h1', 'P4', `${page}: no H1`]);
  if (h1 > 1) out.push(['WARN', 'lint:h1', 'P4', `${page}: ${h1} H1s`]);
  const body = text(html);
  markers.filter((mk) => body.toLowerCase().includes(mk.toLowerCase())).forEach((mk) => out.push(['FAIL', 'lint:base-leftover', 'P6', `${page}: base content "${mk}" leaked into the customer site`, 'base content inherited']));
  if (ctx.originalHost) {
    const toOriginal = hrefs(html).filter((h) => { try { return new URL(h).host === ctx.originalHost; } catch { return false; } });
    if (toOriginal.length) out.push(['WARN', 'lint:links-to-original', 'P4', `${page}: ${toOriginal.length} link(s) to the original site (map them to demo pages): ${toOriginal.slice(0, 3).join(', ')}`]);
  }
  return out;
}

/** Nav/footer fragments must not carry metadata tables (they render inside the chrome). */
export function lintChrome(name, html) {
  return /<div class="(metadata|section-metadata)"/.test(html)
    ? [['FAIL', 'lint:chrome-metadata', 'P3', `/${name} contains a metadata table; it renders inside the ${name}. Move page metadata to metadata.json`, 'nav metadata leak']]
    : [];
}

/** One form sheet → findings. */
export function lintFormSheet(sheetPath, rows) {
  const out = [];
  rows.forEach((r) => {
    const type = String(r.type || '').toLowerCase();
    const opts = String(r.options || '');
    if (OPTION_TYPES.has(type) && opts.includes(',') && !opts.includes('|')) {
      const parts = opts.split(',').map((x) => x.trim());
      const sentence = parts.some((x) => /^[a-z]/.test(x)) || type === 'checkbox';
      out.push([sentence ? 'FAIL' : 'WARN', 'lint:form-options', 'P3', `${sheetPath} ${r.field}: options split on commas into ${parts.length} choices. Use | between options (end one comma-containing option with |)`, 'consent split into 3 checkboxes']);
    }
    const req = String(r.required ?? '').trim();
    if (req && !/^(true|false)$/i.test(req)) out.push(['WARN', 'lint:form-required', 'P3', `${sheetPath} ${r.field}: required="${req}" isn't TRUE/FALSE`]);
    if (r.field && /\s/.test(r.field)) out.push(['WARN', 'lint:form-field-name', 'P3', `${sheetPath}: field "${r.field}" has spaces (becomes a camel-cased payload key)`]);
  });
  return out;
}

/** Page metadata (rendered meta tags) → findings. */
export function lintMeta(page, metas) {
  return Object.entries(metas)
    .filter(([k, v]) => /^campaign-/.test(k) && /\/index\/?$/.test(v))
    .map(([k, v]) => ['FAIL', 'lint:campaign-index', 'P1', `${page}: ${k} = ${v}; a DA doc named index is served at the folder URL (use ${v.replace(/index\/?$/, '')})`, 'campaign 404']);
}

/**
 * Repeated content (P7): the same section written inline on 2+ pages must be one fragment under
 * /fragments/ (fragment block on each page), so an author edits it once. Short sections are ignored.
 */
export function lintRepeats(plainByPage) {
  const seen = new Map();
  Object.entries(plainByPage).forEach(([page, html]) => childDivs(html).forEach((sec) => {
    const key = text(sec.replace(/<div class="section-metadata">[\s\S]*$/, '')).toLowerCase();
    if (key.length < 80) return;
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key).add(page);
  }));
  return [...seen.entries()].filter(([, pages]) => pages.size > 1).map(([key, pages]) => ['FAIL', 'lint:repeat-inline', 'P7',
    `same section inline on ${[...pages].join(', ')}: "${key.slice(0, 60)}…" → make it /fragments/<name> and use a fragment block`, 'duplicated content']);
}

/* ---------- self-test (P9) ---------- */

function selfTest() {
  const page = (inner, h1 = '<h1>T</h1>') => `<div>${h1}${inner}</div>`;
  const cases = [
    ['tabs table', lintPage('/p', page('<div class="tabs"><div><div>A</div><div>B</div></div></div>')), true],
    ['faq no index', lintPage('/p', page('<div class="faq"><div><div>Q</div></div></div>'), { faqIndex: false }), true],
    ['no h1', lintPage('/p', page('<p>x</p>', '')), true],
    ['base leftover', lintPage('/p', page('<p>Welcome to diyFIRE</p>')), true],
    ['clean page', lintPage('/p', page('<div class="cards panel"><div><div>A</div></div></div>')), false],
    ['nav metadata', lintChrome('nav', '<div><div class="metadata"><div><div>Robots</div></div></div></div>'), true],
    ['nav clean', lintChrome('nav', '<div><ul><li>a</li></ul></div>'), false],
    ['consent split', lintFormSheet('/forms/x.json', [{ field: 'Consent', type: 'checkbox', options: 'By submitting, I consent' }]), true],
    ['pipes ok', lintFormSheet('/forms/x.json', [{ field: 'Consent', type: 'checkbox', options: 'By submitting, I consent|' }]), false],
    ['campaign index', lintMeta('/', { 'campaign-x': '/campaigns/x/index' }), true],
    ['campaign folder', lintMeta('/', { 'campaign-x': '/campaigns/x/' }), false],
    ['repeat inline', lintRepeats({ '/a': `<div><p>${'Talk to our institutional team about your goals today. '.repeat(2)}</p></div>`, '/b': `<div><p>${'Talk to our institutional team about your goals today. '.repeat(2)}</p></div>` }), true],
    ['repeat as fragment', lintRepeats({ '/a': '<div><div class="fragment"><div><div><a href="/fragments/cta">/fragments/cta</a></div></div></div></div>', '/b': '<div><div class="fragment"><div><div><a href="/fragments/cta">/fragments/cta</a></div></div></div></div>' }), false],
  ];
  let bad = 0;
  cases.forEach(([name, results, expectFail]) => {
    const failed = results.some((r) => r[0] === 'FAIL');
    if (failed !== expectFail) bad += 1;
    console.log(`${failed === expectFail ? 'ok  ' : 'BAD '} ${name.padEnd(18)} expected ${expectFail ? 'FAIL' : 'no FAIL'}, got ${failed ? 'FAIL' : 'no FAIL'}`);
  });
  console.log(bad ? `\n${bad} self-test case(s) wrong` : `\nall ${cases.length} self-test cases behave`);
  process.exit(bad ? 1 : 0);
}

/* ---------- run ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['self-test']) selfTest();
  if (!args.site) {
    console.error('usage: node lint-content.mjs --site <slug> [--preview] [--original <url>] | --self-test');
    process.exit(2);
  }
  const org = args.org || 'scdemos';
  const o0 = origins(args.site, org);
  const o = args.preview ? { live: o0.page, page: o0.page } : o0;
  const rep = new Report(`lint-content ${org}/${args.site}${args.preview ? ' (preview)' : ''}`);
  rep.strict = args.strict === 'true';
  const push = (list) => list.forEach(([s, id, p, d, g]) => rep.add(s, id, p, d, g));

  const faqIndex = (await get(`${o.live}/faq-index.json`, { method: 'HEAD' })).ok;
  const originalHost = args.original ? new URL(args.original.startsWith('http') ? args.original : `https://${args.original}`).host : null;
  const list = (v) => (v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const pages = await discoverPages(o, list(args.pages), list(args.scope));
  const plain = await plainPages(o, pages);

  const before = rep.items.length;
  const linted = Object.entries(plain).filter(([p, r]) => {
    if (!r.ok) push([['FAIL', 'lint:unavailable', 'P1', `${p}: ${r.status || r.error} (not previewed/published, so it can't be linted)`]]);
    return r.ok;
  });
  if (!linted.length) push([['FAIL', 'lint:no-pages', 'P1', 'no page could be loaded: nothing was linted']]);
  linted.forEach(([p, r]) => push(lintPage(p, r.body, { faqIndex, originalHost })));
  push(lintRepeats(Object.fromEntries(linted.map(([p, r]) => [p, r.body]))));

  const chrome = await Promise.all(['nav', 'footer'].map(async (n) => [n, await get(`${o.live}/${n}.plain.html`)]));
  chrome.forEach(([n, r]) => push(r.ok ? lintChrome(n, r.body) : [['WARN', 'lint:chrome', 'P2', `/${n} not available (${r.status})`]]));

  const sheets = new Set();
  Object.entries(plain).forEach(([, r]) => blocksIn(r.body).filter((b) => b.name === 'form').forEach((b) => b.rows.flat().flatMap(hrefs).map((h) => internalPath(h, o)).filter((x) => x?.endsWith('.json')).forEach((x) => sheets.add(x))));
  await Promise.all([...sheets].map(async (s) => {
    const r = await getJson(`${o.live}${s}`);
    push(r.json ? lintFormSheet(s, sheetRows(r.json)) : [['WARN', 'lint:form-sheet', 'P1', `${s} not reachable (${r.status})`]]);
  }));

  await Promise.all(pages.map(async (p) => {
    const r = await get(`${o.live}${p}`);
    push(lintMeta(p, Object.fromEntries([...r.body.matchAll(/<meta name="([^"]+)" content="([^"]*)"/g)].map((m) => [m[1], m[2]]))));
  }));

  if (!rep.items.slice(before).some((x) => x.status === 'FAIL' || x.status === 'WARN')) rep.pass('lint', 'P3', `${pages.length} pages, nav, footer and ${sheets.size} form sheet(s) clean`);
  else rep.pass('lint:scanned', 'P3', `${pages.length} pages, nav, footer, ${sheets.size} form sheet(s) scanned`);
  process.exit(rep.print(args.json === 'true'));
}

main();
