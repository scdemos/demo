#!/usr/bin/env node
/*
 * customer-demo: final parity loop — the definition of done for a migration (SKILL.md phase 12).
 *
 *   node parity.mjs [--run .customer-demo/run.json] [--original https://customer.com/section]
 *                   [--scope "/,/about=/about-us"] [--demo http://localhost:3000] [--out fid]
 *                   [--pages "/about"] [--recapture-original] [--headed] [--review fid/review.json] [--site <slug>]
 *
 * Scope comes from the run state (`scope: [{ original, demo }]`, `customerUrl`) or --scope
 * ("<original path>=<demo path>", demo defaults to the same path). For each page and for both widths
 * (1440 and 390 px) it captures the original (once; reused unless --recapture-original) and the demo
 * on localhost (always fresh, with --interact, light scheme like the original), runs compare.mjs
 * --final, plus a dark-OS pass at 1440 that only counts color scheme + readability, and writes:
 *   <out>/parity.json   { complete, iteration, pages: [{ original, demo, columns, fails }] }
 *   <out>/parity.md     the parity matrix (page × design, content, look & feel, functionality)
 *                       and the FIX LIST: every failing check with its evidence, page by page
 * It updates run.json (`phases.parity`, `parity`) and exits 0 only when every page passes everything.
 * Loop: fix what the fix list says → rerun with --pages "<failed pages>" → repeat (max 3 rounds per
 * page, then the SC decides). Never say the migration is complete while this exits non-zero.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HERE, parseArgs } from './lib/site.mjs';

const args = parseArgs(process.argv.slice(2));
const runFile = args.run || '.customer-demo/run.json';
const run = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, 'utf8')) : {};
const original = (args.original || run.customerUrl || '').replace(/\/$/, '');
const demo = (args.demo || 'http://localhost:3000').replace(/\/$/, '');
const out = args.out || 'fid';
const scope = args.scope
  ? args.scope.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [o, d] = x.split('='); return { original: o, demo: d || o }; })
  : (run.scope || []).map((x) => ({ original: x.original, demo: x.demo || x.original }));
if (!original || !scope.length) {
  console.error('usage: node parity.mjs --original <customer url> --scope "/,/a=/b" (or a run state with customerUrl + scope)');
  process.exit(2);
}
const only = new Set((args.pages || '').split(',').map((x) => x.trim()).filter(Boolean));
const pages = only.size ? scope.filter((p) => only.has(p.original) || only.has(p.demo)) : scope;
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_'));
const node = (script, list) => {
  try {
    return { ok: true, out: execFileSync(process.execPath, [path.join(HERE, '..', script), ...list], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` }; }
};

// the demo is judged on local code: localhost must be up (aem up) and serve THIS demo, not another project
const site = args.site || run.site;
const title = async (url) => ((await (await fetch(url, { signal: AbortSignal.timeout(15000) })).text()).match(/<title>([^<]*)<\/title>/i)?.[1] || '').trim();
try {
  const r = await fetch(`${demo}/`, { signal: AbortSignal.timeout(10000) });
  if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
  if (site && /localhost|127\.0\.0\.1/.test(demo)) {
    const [local, remote] = await Promise.all([title(`${demo}${scope[0].demo}`), title(`https://main--${site}--scdemos.aem.page${scope[0].demo}`)]);
    if (local !== remote) {
      console.error(`❌ ${demo} serves "${local}", but scdemos/${site} is "${remote}": another project is on that port. Stop it, or run aem up in the demo repo on another port and pass --demo http://localhost:<port>`);
      process.exit(2);
    }
  }
} catch (e) {
  console.error(`❌ ${demo} isn't answering (${e.message}). Start the dev server in the demo repo: aem up`);
  process.exit(2);
}

// which matrix column each compare check belongs to
const COLUMN = {
  'header layout': 'design', 'header items': 'design', 'footer links': 'design', 'side rail': 'design', layout: 'design', carousels: 'design', 'section count': 'design',
  headings: 'content', text: 'content', media: 'content', provenance: 'content', buttons: 'content', 'forms & inputs': 'content', 'page exists': 'content',
  'color scheme': 'look & feel', readability: 'look & feel', review: 'look & feel',
  functionality: 'functionality', health: 'functionality',
};
const COLUMNS = ['design', 'content', 'look & feel', 'functionality'];

const map = pages.map((p) => `${slug(p.original)}=${slug(p.demo)}`).join(',');
const results = new Map(pages.map((p) => [slug(p.original), { original: p.original, demo: p.demo, fails: [] }]));
for (const width of [1440, 390]) {
  const o = path.join(out, `orig-${width}`);
  const d = path.join(out, `demo-${width}`);
  const missingOrig = pages.filter((p) => args['recapture-original'] === 'true' || !fs.existsSync(path.join(o, slug(p.original), 'page.json')));
  if (missingOrig.length) {
    console.log(`capturing original ${width}px: ${missingOrig.map((p) => p.original).join(', ')}`);
    const r = node('capture.mjs', ['--base', original, '--pages', missingOrig.map((p) => p.original).join(','), '--out', o, '--width', String(width), '--interact', ...(args.headed === 'false' ? [] : ['--headed'])]);
    if (!r.ok) console.log(r.out.split('\n').slice(-5).join('\n'));
  }
  console.log(`capturing demo ${width}px (${demo}): ${pages.map((p) => p.demo).join(', ')}`);
  const rd = node('capture.mjs', ['--base', demo, '--pages', pages.map((p) => p.demo).join(','), '--out', d, '--width', String(width), '--interact']);
  if (!rd.ok) console.log(rd.out.split('\n').slice(-5).join('\n'));
  // compare only the pages of this round: stage their original captures in a scoped dir
  const staged = path.join(out, `.stage-${width}`);
  fs.rmSync(staged, { recursive: true, force: true });
  pages.forEach((p) => { if (fs.existsSync(path.join(o, slug(p.original)))) fs.cpSync(path.join(o, slug(p.original)), path.join(staged, slug(p.original)), { recursive: true }); });
  const json = path.join(out, `compare-${width}.json`);
  node('compare.mjs', ['--original', staged, '--demo', d, '--out', path.join(out, `fidelity-${width}.html`), '--map', map, '--final', '--json', json,
    '--scope', pages.map((p) => p.original).join(','), ...(args.review ? ['--review', args.review] : []), ...(args.waivers ? ['--waivers', args.waivers] : [])]);
  if (!fs.existsSync(json)) { console.error(`❌ compare.mjs produced no results for ${width}px`); process.exit(1); }
  JSON.parse(fs.readFileSync(json, 'utf8')).forEach((r) => r.checks.filter((c) => !c.ok)
    .forEach((c) => results.get(r.slug)?.fails.push({ width, check: c.name, column: COLUMN[c.name] || 'design', detail: c.detail, evidence: `${out}/fidelity-${width}.html#${r.slug}` })));
}

// dark OS: the demo must honor its declared scheme and stay readable (only those two checks count here)
{
  const d = path.join(out, 'demo-1440-dark');
  console.log(`capturing demo 1440px on a dark OS: ${pages.map((p) => p.demo).join(', ')}`);
  node('capture.mjs', ['--base', demo, '--pages', pages.map((p) => p.demo).join(','), '--out', d, '--scheme', 'dark']);
  const json = path.join(out, 'compare-dark.json');
  node('compare.mjs', ['--original', path.join(out, '.stage-1440'), '--demo', d, '--out', path.join(out, 'fidelity-dark.html'), '--map', map, '--json', json]);
  if (fs.existsSync(json)) {
    JSON.parse(fs.readFileSync(json, 'utf8')).forEach((r) => r.checks.filter((c) => !c.ok && ['color scheme', 'readability'].includes(c.name))
      .forEach((c) => results.get(r.slug)?.fails.push({ width: '1440 dark', check: c.name, column: 'look & feel', detail: c.detail, evidence: `${out}/fidelity-dark.html#${r.slug}` })));
  }
}

// merge with earlier rounds (pages not rerun keep their last result)
const parityFile = path.join(out, 'parity.json');
const prev = fs.existsSync(parityFile) ? JSON.parse(fs.readFileSync(parityFile, 'utf8')) : { pages: [], iteration: 0 };
const merged = new Map(prev.pages.map((p) => [p.original, p]));
results.forEach((r) => {
  const before = merged.get(r.original);
  const columns = Object.fromEntries(COLUMNS.map((c) => [c, r.fails.some((f) => f.column === c) ? 'fail' : 'pass']));
  merged.set(r.original, { ...r, columns, rounds: (before?.rounds || 0) + 1 });
});
const all = scope.map((p) => merged.get(p.original) || { ...p, columns: Object.fromEntries(COLUMNS.map((c) => [c, 'not run'])), fails: [], rounds: 0 });
const complete = all.every((p) => COLUMNS.every((c) => p.columns[c] === 'pass'));
const parity = { complete, iteration: prev.iteration + 1, at: new Date().toISOString(), original, demo, pages: all };
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(parityFile, JSON.stringify(parity, null, 2));

const icon = (v) => ({ pass: '✅', fail: '❌' }[v] || '⏳');
const md = [`# Parity: ${complete ? 'COMPLETE ✅' : 'NOT COMPLETE ❌'} (round ${parity.iteration}, ${parity.at})`, '',
  `Original: ${original} · Demo: ${demo} · widths 1440 + 390 (+ dark OS at 1440) · interactions exercised`, '',
  `| page | ${COLUMNS.join(' | ')} | rounds |`, `|---|${COLUMNS.map(() => '---').join('|')}|---|`,
  ...all.map((p) => `| ${p.original}${p.demo !== p.original ? ` → ${p.demo}` : ''} | ${COLUMNS.map((c) => icon(p.columns[c])).join(' | ')} | ${p.rounds} |`), '',
  '## Fix list', '', ...(all.some((p) => p.fails.length) ? all.filter((p) => p.fails.length).flatMap((p) => [`### ${p.original}${p.rounds >= 3 ? ' — 3 rounds: ask the SC' : ''}`,
    ...p.fails.map((f) => `- [ ] **${f.column} · ${f.check} @${f.width}px**: ${f.detail} (${f.evidence})`), '']) : ['Nothing left to fix.'])];
fs.writeFileSync(path.join(out, 'parity.md'), md.join('\n'));

if (fs.existsSync(runFile) || run.scope) {
  run.phases = { ...(run.phases || {}), parity: complete ? 'done' : 'running' };
  run.parity = { complete, iteration: parity.iteration, failing: all.filter((p) => p.fails.length).map((p) => p.original) };
  fs.mkdirSync(path.dirname(runFile), { recursive: true });
  fs.writeFileSync(runFile, JSON.stringify(run, null, 2));
}
console.log(md.slice(0, 6 + all.length).join('\n'));
console.log(complete ? '\n✅ parity complete: the migration may be reported as done' : `\n❌ not complete: work through ${out}/parity.md (fix list), then rerun with --pages "${all.filter((p) => p.fails.length).map((p) => p.original).join(',')}"`);
process.exit(complete ? 0 : 1);
