#!/usr/bin/env node
/*
 * customer-demo: site doctor. Fast, non-visual health checks on a demo site, each mapped to an
 * operating principle (SKILL.md P1–P10) and to the gotcha it prevents. Exit 1 on any FAIL.
 *
 *   node doctor.mjs --site <slug> [--org scdemos] [--only state,code,index,search,links,icons,forms,metadata,experiments,library,worker]
 *                   [--pages "/a,/b" | --scope "/a,/b"] [--strict] [--terms "credit,equity"] [--admin-token <token> | --site-config f --base-config f] [--json]
 *   node doctor.mjs --self-test          # negative tests: every evaluator must FAIL on broken fixtures
 *
 * `state` needs the site config (admin.hlx.page). Either set DA_TOKEN (IMS token of a signed-in da.live
 * user), pass --admin-token (or set AEM_ADMIN_TOKEN), or save both configs from the signed-in da.live
 * tab (site-tab.js / fetch with the tab's token; redact apiKeys / cdn tokens) and pass
 * --site-config site.json --base-config demo.json. Without either, the state checks are SKIPPED,
 * never passed.
 *
 * --scope limits checks to exactly those pages (the demo's page scope); --pages adds pages to discovery.
 * --strict (use it in the final sweep): any SKIP is a FAIL, so unverifiable state can't pass.
 *
 * Forms are submitted ONLY in dry-run mode (`x-dry-run: 1`), and only when the endpoint advertises
 * dry-run support. The endpoint posts to a live Slack channel (P8).
 */
import {
  MANIFEST, FORMS_ENDPOINT, NON_CONTENT, Report, parseArgs, origins, get, getJson, sheetRows,
  blocksIn, sectionStyles, hrefs, internalPath, discoverPages, plainPages, isContentPath, text,
} from './lib/site.mjs';

const STATE_COPY = ['headers', 'robots', 'sidekick', 'public'];
// platform-controlled: site admins can't set it (403), so a gap is a WARN
const STATE_PLATFORM = ['features'];
const BASE_MARKERS = /scdemos\/demo\/|main--demo--scdemos|\/content\/dam\/cashub|demo\.bbird\.live\/sitemap/;
const META_FORM_TYPES = new Set(['submit', 'reset', 'confirmation', 'hidden', 'fieldset', 'heading', 'plaintext']);

/* ---------- pure evaluators (unit-testable, see --self-test) ---------- */

export function evalIndex(rows, navPaths) {
  const out = [];
  if (!rows) return [['FAIL', 'index', 'P2', '/query-index.json missing: copy query.yaml from the base, then republish content pages', 'dead search']];
  if (!rows.length) return [['FAIL', 'index', 'P2', 'query index is empty: republish content pages (the index builds on publish only)', 'dead search']];
  const stray = rows.map((r) => r.path).filter((p) => NON_CONTENT.some((re) => re.test(p)));
  out.push(stray.length
    ? ['FAIL', 'index:content-only', 'P2', `non-content paths indexed: ${stray.join(', ')} (exclude in query.yaml, DELETE /index/<path>)`, 'stray search results']
    : ['PASS', 'index:content-only', 'P2', `${rows.length} content rows`]);
  const indexed = new Set(rows.map((r) => r.path));
  const missing = navPaths.filter((p) => isContentPath(p) && !indexed.has(p));
  out.push(missing.length
    ? ['FAIL', 'index:coverage', 'P2', `nav pages not indexed (publish them): ${missing.join(', ')}`, 'dead search']
    : ['PASS', 'index:coverage', 'P2', 'every nav page is indexed']);
  const untitled = rows.filter((r) => !r.title || !r.description).map((r) => r.path);
  if (untitled.length) out.push(['WARN', 'index:metadata', 'P4', `rows without title/description (poor search results): ${untitled.join(', ')}`]);
  return out;
}

export function evalSearchTerms(rows, terms) {
  // mirrors blocks/search matchesQuery: every word must appear in title, description or path
  return terms.map((t) => {
    const words = t.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = (rows || []).filter((r) => {
      const hay = `${r.title} ${r.description} ${r.path}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    return hits.length
      ? ['PASS', 'search:term', 'P1', `"${t}" → ${hits.length} result(s)`]
      : ['FAIL', 'search:term', 'P1', `"${t}" → no results (customer term must be findable)`, 'dead search'];
  });
}

/** One form block: { page, sheetPath, endpoint, rows } → findings.
 *  Hard rule: the form posts to the shared endpoint. Everything else is best effort (WARN). */
export function evalForm(f) {
  const out = [];
  const where = `${f.page} (${f.sheetPath || 'no sheet link'})`;
  out.push(f.endpoint === FORMS_ENDPOINT
    ? ['PASS', 'forms:endpoint', 'P3', `${where} → shared endpoint`]
    : ['FAIL', 'forms:endpoint', 'P3', `${where} posts to ${f.endpoint || 'nothing'}; must be ${FORMS_ENDPOINT}`, 'forms standard']);
  if (!f.rows) { out.push(['WARN', 'forms:sheet', 'P1', `${where} sheet not reachable (preview + publish /forms/*.json)`]); return out; }
  const types = f.rows.map((r) => String(r.type || '').toLowerCase());
  if (!types.includes('submit')) out.push(['WARN', 'forms:sheet', 'P1', `${where} has no submit row`]);
  if (!types.includes('confirmation')) out.push(['WARN', 'forms:sheet', 'P1', `${where} has no confirmation row (no thank-you)`]);
  if (!f.rows.some((r) => r.field && !META_FORM_TYPES.has(String(r.type).toLowerCase()))) out.push(['WARN', 'forms:fields', 'P4', `${where} has no input fields`]);
  return out;
}

/** Dry-run payload from a form sheet: required fields get plausible values. */
export function samplePayload(rows) {
  const data = {};
  rows.forEach((r) => {
    const type = String(r.type || 'text').toLowerCase();
    if (!r.field || ['submit', 'reset', 'confirmation', 'fieldset', 'heading', 'plaintext'].includes(type)) return;
    const opts = String(r.options || '').split(String(r.options || '').includes('|') ? '|' : ',').map((o) => o.trim()).filter(Boolean);
    if (type === 'hidden') data[r.field] = r.default || r.label || '';
    else if (type === 'email') data[r.field] = 'doctor@example.com';
    else if (['select', 'radio', 'checkbox'].includes(type)) data[r.field] = opts[0] || 'on';
    else if (type === 'number') data[r.field] = '1';
    else data[r.field] = `doctor dry-run (${r.field})`;
  });
  data._dryrun = 'true';
  return data;
}

export function evalState(site, base, slug) {
  const out = [];
  if (!site) return [['SKIP', 'state', 'P2', 'site config not readable: set DA_TOKEN, pass --admin-token, or pass --site-config/--base-config saved from the da.live tab']];
  const roles = site.access?.admin?.role || {};
  const has = (role) => (roles[role] || []).includes('*@adobe.com');
  out.push(has('author') && (has('publish') || has('basic_publish'))
    ? ['PASS', 'state:roles', 'P2', '*@adobe.com can author and publish']
    : ['FAIL', 'state:roles', 'P2', `*@adobe.com missing from author/publish (roles: ${Object.keys(roles).join(', ') || 'none'})`, 'single-admin site']);
  STATE_COPY.forEach((k) => {
    if (base && base[k] === undefined) return;
    if (site[k] === undefined) { out.push(['FAIL', `state:${k}`, 'P2', `${k} not set (base has it): copy and rewrite from the base`, 'template copies code, not state']); return; }
    const leaked = JSON.stringify(site[k]).match(BASE_MARKERS);
    out.push(leaked
      ? ['FAIL', `state:${k}`, 'P2', `${k} still points at the base ("${leaked[0]}"): rewrite for ${slug}`]
      : ['PASS', `state:${k}`, 'P2', 'set, no base-bound values']);
  });
  STATE_PLATFORM.forEach((k) => { if (base?.[k] !== undefined && site[k] === undefined) out.push(['WARN', `state:${k}`, 'P2', `${k} differs from the base and is platform-controlled (ask the AEM team if needed)`]); });
  if (site.sidekick && base?.sidekick && site.sidekick.project === base.sidekick.project) out.push(['FAIL', 'state:sidekick-name', 'P6', `sidekick project is still "${site.sidekick.project}"`]);
  ['cdn', 'apiKeys'].forEach((k) => { if (site[k] && base && JSON.stringify(site[k]) === JSON.stringify(base[k])) out.push(['FAIL', `state:${k}`, 'P2', `${k} copied from the base (never copy)`]); });
  return out;
}

export function evalLibrary(used, library) {
  if (!library) return [['FAIL', 'library', 'P2', 'docs/library/blocks.json not published']];
  const missing = [...used].filter((sig) => !library.has(sig));
  return missing.length
    ? [['FAIL', 'library:variants', 'P2', `block variants used on pages but missing from the library: ${missing.join(' · ')}`, 'library drift']]
    : [['PASS', 'library:variants', 'P2', `all ${used.size} block variants in use are in the library`]];
}

/** Library completeness beyond variants: sheets, options, icons, base-block coverage. */
export function evalLibraryKit({ sheets, blockRows, optionRows, iconKeys, usedIcons, usedStyles, baseBlocks }) {
  const out = [];
  const missingSheets = Object.entries(sheets).filter(([, ok]) => !ok).map(([n]) => n);
  out.push(missingSheets.length
    ? ['FAIL', 'library:sheets', 'P2', `library sheets missing or empty: ${missingSheets.join(', ')} (preview + publish docs/library/*.json)`]
    : ['PASS', 'library:sheets', 'P2', `${Object.keys(sheets).join(', ')} present`]);
  const styles = new Set((optionRows.find((r) => r.key === 'style')?.values || '').split('|').map((v) => v.trim().toLowerCase()).filter(Boolean));
  const unlisted = usedStyles.filter((st) => !styles.has(st));
  out.push(unlisted.length
    ? ['FAIL', 'library:styles', 'P2', `section styles used on pages but missing from the options sheet: ${unlisted.join(', ')}`]
    : ['PASS', 'library:styles', 'P2', `${usedStyles.length} section styles listed`]);
  const noIcon = usedIcons.filter((i) => !iconKeys.includes(i));
  out.push(noIcon.length
    ? ['WARN', 'library:icons', 'P2', `icons used but not in icons.json: ${noIcon.join(', ')}`]
    : ['PASS', 'library:icons', 'P2', `${usedIcons.length} icons listed`]);
  const linksBase = blockRows.some((r) => /\/demo\/docs\/library\//.test(r.path || ''));
  const names = blockRows.map((r) => String(r.name || '').toLowerCase()).join(' | ');
  const uncovered = baseBlocks.filter((b) => !names.includes(b.replace(/-/g, ' ')) && !names.includes(b));
  out.push(!uncovered.length || linksBase
    ? ['PASS', 'library:base-blocks', 'P2', linksBase ? 'base library linked for the remaining base blocks' : 'every base block has a library entry']
    : ['FAIL', 'library:base-blocks', 'P2', `base blocks an SC may demo have no library entry and no link to the base library: ${uncovered.join(', ')}`]);
  return out;
}

export function evalMetadata(metas, usedBlocks) {
  const out = [];
  out.push(metas['color-scheme']
    ? ['PASS', 'metadata:color-scheme', 'P6', `color-scheme: ${metas['color-scheme']}`]
    : ['FAIL', 'metadata:color-scheme', 'P6', 'no color-scheme decision: a dark OS will restyle the site', 'OS dark mode hijack']);
  out.push(metas['social-share']
    ? ['PASS', 'metadata:social-share', 'P6', `social-share: ${metas['social-share']}`]
    : ['WARN', 'metadata:social-share', 'P6', 'social-share not decided (base shows a floating dock)']);
  if ([...usedBlocks].some((b) => /calculator/.test(b))) {
    out.push(metas.currency && metas.locale
      ? ['PASS', 'metadata:currency', 'P6', `${metas.currency} / ${metas.locale}`]
      : ['FAIL', 'metadata:currency', 'P6', 'calculator in use but currency/locale not set (base default leaks)', 'CAD calculator']);
  }
  return out;
}

/* ---------- self-test (P9: verify the verifier) ---------- */

function selfTest() {
  const cases = [
    ['index missing', evalIndex(null, []), true],
    ['index strays', evalIndex([{ path: '/nav', title: 'x', description: 'y' }, { path: '/a', title: 'a', description: 'b' }], []), true],
    ['index ok', evalIndex([{ path: '/a', title: 'a', description: 'b' }], ['/a']), false],
    ['term miss', evalSearchTerms([{ title: 'Equity', description: '' }], ['credit']), true],
    ['term hit', evalSearchTerms([{ title: 'Private credit', description: '' }], ['credit']), false],
    ['form wrong endpoint', evalForm({ page: '/c', sheetPath: '/forms/c.json', endpoint: 'https://example.com/x', rows: [{ field: 'email', type: 'email' }, { field: 'submit', type: 'submit' }] }), true],
    ['form no submit (warn)', evalForm({ page: '/c', sheetPath: '/forms/c.json', endpoint: FORMS_ENDPOINT, rows: [{ field: 'email', type: 'email' }] }), false],
    ['form ok', evalForm({ page: '/c', sheetPath: '/forms/c.json', endpoint: FORMS_ENDPOINT, rows: [{ field: 'email', type: 'email' }, { field: 'submit', type: 'submit' }, { type: 'confirmation' }] }), false],
    ['state roles', evalState({ access: { admin: { role: { admin: ['x@y'] } } } }, {}, 's'), true],
    ['state leaked', evalState({ access: { admin: { role: { author: ['*@adobe.com'], publish: ['*@adobe.com'] } } }, public: { p: '/scdemos/demo/main/' } }, { public: {} }, 's'), true],
    ['state missing key', evalState({ access: { admin: { role: { author: ['*@adobe.com'], publish: ['*@adobe.com'] } } } }, { robots: {} }, 's'), true],
    ['state ok', evalState({ access: { admin: { role: { author: ['*@adobe.com'], publish: ['*@adobe.com'] } } }, robots: { txt: 'x' } }, { robots: {} }, 's'), false],
    ['library drift', evalLibrary(new Set(['cards promo']), new Set(['cards'])), true],
    ['library ok', evalLibrary(new Set(['cards']), new Set(['cards', 'hero'])), false],
    ['kit missing sheet', evalLibraryKit({ sheets: { blocks: true, icons: false }, blockRows: [], optionRows: [], iconKeys: [], usedIcons: [], usedStyles: [], baseBlocks: [] }), true],
    ['kit style unlisted', evalLibraryKit({ sheets: { blocks: true }, blockRows: [], optionRows: [{ key: 'style', values: 'band' }], iconKeys: [], usedIcons: [], usedStyles: ['tags'], baseBlocks: [] }), true],
    ['kit base uncovered', evalLibraryKit({ sheets: { blocks: true }, blockRows: [{ name: 'Cards', path: '/x' }], optionRows: [], iconKeys: [], usedIcons: [], usedStyles: [], baseBlocks: ['cards', 'quiz'] }), true],
    ['kit ok', evalLibraryKit({ sheets: { blocks: true }, blockRows: [{ name: 'Cards', path: '/x' }, { name: 'Base', path: 'https://content.da.live/scdemos/demo/docs/library/blocks/cards' }], optionRows: [{ key: 'style', values: 'band | tags' }], iconKeys: ['logo'], usedIcons: ['logo'], usedStyles: ['band'], baseBlocks: ['cards', 'quiz'] }), false],
    ['no color-scheme', evalMetadata({}, new Set()), true],
    ['calc no currency', evalMetadata({ 'color-scheme': 'light' }, new Set(['compound-interest-calculator'])), true],
    ['metadata ok', evalMetadata({ 'color-scheme': 'light', 'social-share': 'off' }, new Set(['cards'])), false],
  ];
  let bad = 0;
  cases.forEach(([name, results, expectFail]) => {
    const failed = results.some((r) => r[0] === 'FAIL');
    const ok = failed === expectFail;
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok  ' : 'BAD '} ${name.padEnd(22)} expected ${expectFail ? 'FAIL' : 'no FAIL'}, got ${failed ? 'FAIL' : 'no FAIL'}`);
  });
  console.log(bad ? `\n${bad} self-test case(s) wrong` : `\nall ${cases.length} self-test cases behave`);
  process.exit(bad ? 1 : 0);
}

/* ---------- gatherers ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['self-test']) selfTest();
  if (!args.site) {
    console.error('usage: node doctor.mjs --site <slug> [--only ...] [--admin-token ...] | --self-test');
    process.exit(2);
  }
  const org = args.org || 'scdemos';
  const o = origins(args.site, org);
  const only = args.only ? new Set(args.only.split(',')) : null;
  const want = (g) => !only || only.has(g);
  const rep = new Report(`doctor ${org}/${args.site}`);
  rep.strict = args.strict === 'true';
  const push = (list) => list.forEach(([s, id, p, d, g]) => rep.add(s, id, p, d, g));

  const list = (v) => (v || '').split(',').map((x) => x.trim()).filter(Boolean);
  const pages = await discoverPages(o, list(args.pages), list(args.scope));
  const plain = await plainPages(o, pages);
  const all = Object.entries(plain);
  const usedBlocks = new Set();
  const usedSigs = new Set();
  all.forEach(([, r]) => blocksIn(r.body).forEach((b) => { usedBlocks.add(b.name); usedSigs.add(b.signature); }));

  if (want('code')) {
    const res = await Promise.all(['/scripts/aem.js', '/scripts/scripts.js', '/styles/styles.css'].map((p) => get(`${o.live}${p}`, { method: 'HEAD' }).then((r) => [p, r.status])));
    const bad = res.filter(([, s]) => s !== 200);
    push([bad.length
      ? ['FAIL', 'code', 'P2', `code not synced: ${bad.map(([p, s]) => `${p} ${s}`).join(', ')} (POST /code/${org}/${args.site}/main/*)`, 'JS 404 after template']
      : ['PASS', 'code', 'P2', 'scripts and styles served']]);
  }

  if (want('pages')) {
    const bad = all.filter(([, r]) => !r.ok).map(([p, r]) => `${p} ${r.status}`);
    push([bad.length ? ['FAIL', 'pages', 'P1', `not published: ${bad.join(', ')}`] : ['PASS', 'pages', 'P1', `${all.length} pages published`]]);
  }

  const idx = await getJson(`${o.live}/query-index.json?limit=500`);
  const rows = idx.json ? sheetRows(idx.json) : null;
  const nav = await get(`${o.live}/nav.plain.html`);
  const navPaths = [...new Set(hrefs(nav.body).map((h) => internalPath(h, o)).filter(Boolean))];

  // every scoped page (CTA targets, legal pages, template examples) must be searchable, not only nav pages
  if (want('index')) push(evalIndex(rows, [...new Set([...navPaths, ...list(args.scope).filter((p) => p !== '/search')])]));

  if (want('search')) {
    const s = await get(`${o.live}/search.plain.html`);
    push([s.ok && /class="search\b/.test(s.body)
      ? ['PASS', 'search:page', 'P1', '/search page with a search block']
      : ['FAIL', 'search:page', 'P1', '/search page missing or without a search block (inventory S5)', 'dead search']]);
    const terms = args.terms ? args.terms.split(',')
      : [...nav.body.matchAll(/<li>\s*<p><a [^>]*>([\s\S]*?)<\/a><\/p>/g)].map((m) => text(m[1])).filter((t) => t.length >= 4).slice(1, 3);
    if (terms.length) push(evalSearchTerms(rows, terms));
  }

  if (want('links')) {
    const extra = await Promise.all(['/nav', '/footer'].map((p) => get(`${o.live}${p}.plain.html`)));
    const targets = new Set();
    [...all.map(([, r]) => r.body), ...extra.map((r) => r.body)].forEach((b) => hrefs(b).forEach((h) => { const p = internalPath(h, o); if (p) targets.add(p); }));
    const res = await Promise.all([...targets].map((p) => get(`${o.live}${p}`, { method: 'HEAD' }).then((r) => [p, r.status])));
    const broken = res.filter(([, s]) => s >= 400 || s === 0);
    push([broken.length
      ? ['FAIL', 'links', 'P1', `broken internal links: ${broken.map(([p, s]) => `${p} (${s})`).join(', ')}`]
      : ['PASS', 'links', 'P1', `${targets.size} internal link targets resolve`]]);
  }

  if (want('icons')) {
    const extra = await Promise.all(['/nav', '/footer'].map((p) => get(`${o.live}${p}.plain.html`)));
    const names = new Set();
    [...all.map(([, r]) => r.body), ...extra.map((r) => r.body)].forEach((b) => [...b.matchAll(/class="icon icon-([a-z0-9-]+)"/g)].forEach((m) => names.add(m[1])));
    const res = await Promise.all([...names].map((n) => get(`${o.live}/icons/${n}.svg`, { method: 'HEAD' }).then((r) => [n, r.status])));
    const missing = res.filter(([, s]) => s !== 200).map(([n]) => n);
    push([missing.length
      ? ['FAIL', 'icons', 'P2', `icons used but not in /icons: ${missing.join(', ')}`, 'icons not in git']
      : ['PASS', 'icons', 'P2', `${names.size} icons resolve`]]);
  }

  if (want('worker') || want('forms')) {
    const h = await getJson(FORMS_ENDPOINT);
    rep.workerDryRun = !!h.json?.dryRun;
    if (want('worker')) {
      push([h.json?.ok && h.json?.dryRun
        ? ['PASS', 'worker', 'P8', 'shared forms endpoint is up and advertises dry-run']
        : ['FAIL', 'worker', 'P8', `forms endpoint ${h.status}${h.json && !h.json.dryRun ? ' without dry-run support: deploy workers/contact_us' : ''}`]]);
    }
  }

  if (want('forms')) {
    const forms = [];
    all.forEach(([page, r]) => blocksIn(r.body).filter((b) => b.name === 'form').forEach((b) => {
      const links = b.rows.flat().flatMap(hrefs);
      forms.push({ page, sheetPath: links.map((l) => internalPath(l, o)).find((p) => p?.endsWith('.json')), endpoint: links.find((l) => /^https?:/.test(l) && !internalPath(l, o)) });
    }));
    if (!forms.length) push([['WARN', 'forms', 'P4', 'no form blocks found (does the original have forms?)']]);
    for (const f of forms) {
      // eslint-disable-next-line no-await-in-loop
      const sheet = f.sheetPath ? await getJson(`${o.live}${f.sheetPath}`) : { json: null };
      f.rows = sheet.json ? sheetRows(sheet.json) : null;
      push(evalForm(f));
      if (f.rows && f.endpoint === FORMS_ENDPOINT) {
        if (!rep.workerDryRun) {
          push([['SKIP', 'forms:submit', 'P8', `${f.page}: endpoint doesn't advertise dry-run, so not submitting`]]);
        } else {
          // eslint-disable-next-line no-await-in-loop
          const r = await getJson(FORMS_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dry-run': '1', origin: o.live, referer: `${o.live}${f.page}` },
            body: JSON.stringify({ data: samplePayload(f.rows) }),
          });
          push([r.json?.dryRun
            ? ['PASS', 'forms:submit', 'P1', `${f.page}: dry-run accepted (${r.json.fields} fields)`]
            : ['WARN', 'forms:submit', 'P1', `${f.page}: dry-run submit → ${r.status} ${r.body.slice(0, 80)}`, 'worker 400']]);
          const conf = f.rows.find((x) => String(x.type).toLowerCase() === 'confirmation');
          const target = conf && internalPath(conf.default || conf.label, o);
          if (target) {
            // eslint-disable-next-line no-await-in-loop
            const c = await get(`${o.live}${target}`, { method: 'HEAD' });
            if (c.status !== 200) push([['WARN', 'forms:thanks', 'P1', `${f.page}: confirmation page ${target} → ${c.status}`]]);
          }
        }
      }
    }
  }

  if (want('metadata')) {
    const home = await get(`${o.live}/`);
    const metas = Object.fromEntries([...home.body.matchAll(/<meta name="([^"]+)" content="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    push(evalMetadata(metas, usedBlocks));
  }

  if (want('experiments')) {
    const urls = new Set();
    await Promise.all(pages.map(async (p) => {
      const r = await get(`${o.live}${p}`);
      [...r.body.matchAll(/<meta name="(experiment-variants|campaign-[^"]+|audience-[^"]+)" content="([^"]+)"/g)]
        .forEach((m) => m[2].split(',').map((u) => internalPath(u.trim(), o)).filter(Boolean).forEach((u) => urls.add(`${p} → ${u}`)));
    }));
    const res = await Promise.all([...urls].map(async (pair) => {
      const target = pair.split(' → ')[1];
      return [pair, (await get(`${o.live}${target}`, { method: 'HEAD' })).status];
    }));
    const bad = res.filter(([, s]) => s !== 200);
    // experiments, campaigns and audiences are opt-in (the SC adds them when the demo story needs them)
    push([!urls.size ? ['PASS', 'experiments', 'P1', 'none set (optional: add them when the SC asks)']
      : bad.length ? ['FAIL', 'experiments', 'P1', `variant URLs not served: ${bad.map(([u, s]) => `${u} (${s})`).join(', ')}`, 'campaign index 404']
        : ['PASS', 'experiments', 'P1', `${urls.size} variant URLs served`]]);
  }

  if (want('library')) {
    const lib = await getJson(`${o.live}/docs/library/blocks.json`);
    let sigs = null;
    if (lib.json) {
      sigs = new Set();
      const paths = sheetRows(lib.json).map((r) => { try { return new URL(r.path).pathname; } catch { return r.path; } })
        .filter((p) => p && p.startsWith(`/${org}/${args.site}/`)).map((p) => p.replace(`/${org}/${args.site}`, ''));
      const libPages = await plainPages(o, paths);
      Object.values(libPages).forEach((r) => blocksIn(r.body).forEach((b) => sigs.add(b.signature)));
    }
    push(evalLibrary(usedSigs, sigs));
    if (lib.json) {
      const sheet = async (n) => { const r = await getJson(`${o.live}/docs/library/${n}.json`); return r.json ? sheetRows(r.json) : null; };
      const [icons, templates, tagging] = await Promise.all(['icons', 'templates', 'tagging'].map(sheet));
      const usedIcons = new Set();
      const usedStyles = new Set();
      const chrome = await Promise.all(['/nav', '/footer'].map((x) => get(`${o.live}${x}.plain.html`)));
      [...all.map(([, r]) => r.body), ...chrome.map((r) => r.body)].forEach((b) => {
        [...b.matchAll(/class="icon icon-([a-z0-9-]+)"/g)].forEach((m) => usedIcons.add(m[1]));
      });
      all.forEach(([, r]) => sectionStyles(r.body).forEach((st) => usedStyles.add(st)));
      const nonDemo = new Set(['header', 'footer', 'fragment', 'modal', 'social-share', 'auth-toggle']);
      push(evalLibraryKit({
        sheets: { blocks: sheetRows(lib.json).length > 0, options: sheetRows(lib.json, 'options').length > 0, icons: !!icons?.length, templates: !!templates?.length, tagging: !!tagging?.length },
        blockRows: sheetRows(lib.json),
        optionRows: sheetRows(lib.json, 'options'),
        iconKeys: (icons || []).map((r) => r.key),
        usedIcons: [...usedIcons],
        usedStyles: [...usedStyles],
        baseBlocks: Object.keys(MANIFEST.blocks).filter((b) => !nonDemo.has(b)),
      }));
    }
  }

  if (want('state')) {
    const token = args['admin-token'] || process.env.AEM_ADMIN_TOKEN;
    const ims = process.env.DA_TOKEN;
    let site = null;
    let base = null;
    if (args['site-config']) {
      // saved from a signed-in admin.hlx.page tab (secrets redacted); same checks, no token needed
      const fs = await import('node:fs');
      site = JSON.parse(fs.readFileSync(args['site-config'], 'utf8'));
      base = args['base-config'] ? JSON.parse(fs.readFileSync(args['base-config'], 'utf8')) : null;
    } else if (token || ims) {
      const h = { headers: token ? { 'x-auth-token': token } : { authorization: `Bearer ${ims}` } };
      site = (await getJson(`https://admin.hlx.page/config/${org}/sites/${args.site}.json`, h)).json;
      base = (await getJson(`https://admin.hlx.page/config/${org}/sites/demo.json`, h)).json;
      const q = await get(`https://admin.hlx.page/config/${org}/sites/${args.site}/content/query.yaml`, h);
      push([q.ok ? ['PASS', 'state:query.yaml', 'P2', 'index definition present'] : ['FAIL', 'state:query.yaml', 'P2', `query.yaml ${q.status}: copy from the base`, 'dead search']]);
    }
    push(evalState(site, base, args.site));
  }

  process.exit(rep.print(args.json === 'true'));
}

main();
