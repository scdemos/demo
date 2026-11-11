/*
 * customer-demo: shared helpers for doctor.mjs and lint-content.mjs.
 * Plain Node (>= 18, global fetch). No dependencies, so any agent harness can run it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, '../../references/demo-manifest.json'), 'utf8'));
/** Source of an in-page function in scripts/browser/<name>.js, ready for page.evaluate(`(${src})()`). */
export const browserFn = (name) => fs.readFileSync(path.join(HERE, `../browser/${name}.js`), 'utf8')
  .replace(/^\/\*[\s\S]*?\*\/\s*(\/\/.*\n)?/, '').trim().replace(/;$/, '');

export const FORMS_ENDPOINT = 'https://demo.bbird.live/contact-us/';

// paths that must never be in the query index (non-content)
export const NON_CONTENT = [
  /^\/nav$/, /^\/footer$/, /^\/metadata/, /^\/search$/, /-thanks$/,
  /\/fragments\//, /\/forms\//, /\/tools\//, /\/docs\//, /\/drafts\//, /^\/experiments\//,
];

// meta/plumbing classes that are not blocks
export const NOT_BLOCKS = new Set(['section-metadata', 'metadata', 'library-metadata', 'library-container-start', 'library-container-end', 'default-content-wrapper']);

export function parseArgs(argv) {
  const out = {};
  argv.forEach((a, i) => {
    if (!a.startsWith('--')) return;
    const next = argv[i + 1];
    out[a.slice(2)] = next === undefined || next.startsWith('--') ? 'true' : next;
  });
  return out;
}

export function origins(site, org = 'scdemos', ref = 'main') {
  return {
    live: `https://${ref}--${site}--${org}.aem.live`,
    page: `https://${ref}--${site}--${org}.aem.page`,
  };
}

export async function get(url, opts = {}) {
  try {
    const res = await fetch(url, { redirect: 'follow', ...opts });
    const body = opts.method === 'HEAD' ? '' : await res.text();
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: '', error: e.message };
  }
}

export async function getJson(url, opts) {
  const r = await get(url, opts);
  if (!r.ok) return { ...r, json: null };
  try { return { ...r, json: JSON.parse(r.body) }; } catch { return { ...r, json: null }; }
}

/** Rows of a single- or multi-sheet EDS json. */
export function sheetRows(json, sheet = 'data') {
  if (!json) return [];
  if (Array.isArray(json.data)) return json.data;
  return json[sheet]?.data || [];
}

/** Direct child <div>s of an html fragment, as inner html strings (depth-aware). */
export function childDivs(html) {
  const out = [];
  const re = /<(\/?)div\b[^>]*>/g;
  let depth = 0;
  let start = -1;
  let m;
  while ((m = re.exec(html))) {
    if (!m[1]) {
      if (depth === 0) start = re.lastIndex;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && start >= 0) { out.push(html.slice(start, m.index)); start = -1; }
    }
  }
  return out;
}

/** Every opening <div> with its nesting depth (0 = section) and class list. */
function scanDivs(html) {
  const out = [];
  const tag = /<(\/?)div\b([^>]*)>/g;
  let depth = 0;
  let m;
  while ((m = tag.exec(html))) {
    if (m[1]) {
      depth -= 1;
    } else {
      const cls = (m[2].match(/class="([^"]*)"/) || [])[1];
      out.push({ index: m.index, depth, classes: cls ? cls.trim().split(/\s+/) : [] });
      depth += 1;
    }
  }
  return out;
}

/** Blocks in a .plain.html document: [{ name, variants, signature, rows: [[cellHtml]] }].
 *  Top-level divs are sections (their classes are section styles); blocks are classed divs inside them. */
export function blocksIn(html) {
  return scanDivs(html)
    .filter((d) => d.depth === 1 && d.classes.length && !NOT_BLOCKS.has(d.classes[0]))
    .map((d) => {
      const [name, ...variants] = d.classes;
      const inner = childDivs(html.slice(d.index))[0] || '';
      return { name, variants, signature: [name, ...[...variants].sort()].join(' '), rows: childDivs(inner).map((row) => childDivs(row)) };
    });
}

/** Section styles: classes on top-level section divs + section-metadata `style` values. */
export function sectionStyles(html) {
  const styles = new Set();
  scanDivs(html).forEach((d) => {
    if (d.depth === 0) d.classes.forEach((c) => styles.add(c));
    if (d.depth === 1 && d.classes[0] === 'section-metadata') {
      const inner = childDivs(html.slice(d.index))[0] || '';
      childDivs(inner).forEach((row) => {
        const [k, v] = childDivs(row).map(text);
        if (/^style$/i.test(k || '')) (v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).forEach((x) => styles.add(x));
      });
    }
  });
  return [...styles];
}

export const text = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export const hrefs = (html = '') => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

/** Internal path for an href on this site, or null. */
export function internalPath(href, o) {
  if (!href || /^(mailto:|tel:|javascript:|#)/.test(href)) return null;
  try {
    const u = new URL(href, o.live);
    const hosts = [new URL(o.live).host, new URL(o.page).host];
    return hosts.includes(u.host) ? u.pathname : null;
  } catch { return null; }
}

export const isContentPath = (p) => !NON_CONTENT.some((re) => re.test(p)) && !/\.(json|pdf|png|jpe?g|svg|webp|xml|txt)$/.test(p);

/** Pages in scope. With `scope` (explicit list) only those pages; otherwise home ∪ query index ∪ nav/footer links ∪ extra. */
export async function discoverPages(o, extra = [], scope = []) {
  if (scope.length) return [...new Set(scope)].sort();
  const set = new Set(['/', ...extra]);
  const idx = await getJson(`${o.live}/query-index.json?limit=500`);
  sheetRows(idx.json).forEach((r) => r.path && set.add(r.path));
  const frags = await Promise.all(['/nav', '/footer'].map((f) => get(`${o.live}${f}.plain.html`)));
  frags.forEach((r) => hrefs(r.body).map((h) => internalPath(h, o)).filter(Boolean).forEach((p) => set.add(p)));
  return [...set].filter(isContentPath).sort();
}

/** Fetch .plain.html for many paths (bounded concurrency). */
export async function plainPages(o, paths) {
  const out = {};
  const queue = [...paths];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const p = queue.shift();
      const url = `${o.live}${p.endsWith('/') ? `${p}index` : p}.plain.html`;
      // eslint-disable-next-line no-await-in-loop
      out[p] = await get(url);
    }
  }));
  return out;
}

export class Report {
  constructor(name) { this.name = name; this.items = []; }

  add(status, id, principle, detail, gotcha = '') { this.items.push({ status, id, principle, detail, gotcha }); }

  pass(id, p, d) { this.add('PASS', id, p, d); }

  fail(id, p, d, g) { this.add('FAIL', id, p, d, g); }

  warn(id, p, d, g) { this.add('WARN', id, p, d, g); }

  skip(id, p, d) { this.add('SKIP', id, p, d); }

  get failed() { return this.items.some((x) => x.status === 'FAIL' || (this.strict && x.status === 'SKIP')); }

  print(json = false) {
    if (json) {
      console.log(JSON.stringify(this.items, null, 2));
    } else {
      const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ', SKIP: '⏭️ ' };
      this.items.forEach((x) => console.log(`${icon[x.status]} ${x.id.padEnd(24)} [${x.principle}] ${x.detail}${x.gotcha ? `  ← ${x.gotcha}` : ''}`));
      const c = (s) => this.items.filter((x) => x.status === s).length;
      console.log(`\n${this.name}: ${c('PASS')} pass · ${c('FAIL')} fail · ${c('WARN')} warn · ${c('SKIP')} skip${this.strict && c('SKIP') ? ' (strict: SKIP counts as FAIL)' : ''}`);
    }
    return this.failed ? 1 : 0;
  }
}
