#!/usr/bin/env node
/*
 * customer-demo: Lighthouse gate, the last pass before sign-off (SKILL.md phase 10a).
 *
 *   node lighthouse.mjs [--run .customer-demo/run.json] [--site <slug>] [--scope "/,/about"]
 *                       [--base https://main--<slug>--scdemos.aem.live] [--runs 3] [--out fid]
 *                       [--pages "/about"] [--target 100]
 *
 * For every scoped demo page, on the PUBLISHED site (aem.live: CDN, compression and caching like
 * the SC's demo; never localhost or aem.page, whose preview overlay costs points), runs Lighthouse
 * for **mobile** (default emulation) and **desktop** (--preset=desktop). Performance is the median
 * of --runs runs (it varies); the other categories come from the same median run.
 *   Must be ≥ --target (100): Performance, Accessibility, Best Practices. SEO is reported only
 *   (demo sites are noindex on purpose).
 * Writes <out>/lighthouse.json and <out>/lighthouse.md (scores + the failing audits per page and
 * form factor = the fix list), updates run.json (`phases.lighthouse`), exits 0 only when every page
 * reaches the target on both form factors.
 * Needs the Playwright Chromium (`setup-check.mjs --fix`) and npx access to lighthouse@12.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadChromium } from './lib/pw.mjs';
import { parseArgs } from './lib/site.mjs';

const args = parseArgs(process.argv.slice(2));
const runFile = args.run || '.customer-demo/run.json';
const run = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, 'utf8')) : {};
const site = args.site || run.site;
const base = (args.base || (site ? `https://main--${site}--scdemos.aem.live` : '')).replace(/\/$/, '');
const scope = (args.scope ? args.scope.split(',') : (run.scope || []).map((x) => x.demo || x.original)).map((x) => x.trim()).filter(Boolean);
const only = new Set((args.pages || '').split(',').map((x) => x.trim()).filter(Boolean));
const pages = only.size ? scope.filter((p) => only.has(p)) : scope;
const runs = Math.max(1, Number(args.runs || 3));
const target = Number(args.target || 100);
const out = args.out || 'fid';
if (!base || !pages.length) {
  console.error('usage: node lighthouse.mjs --site <slug> --scope "/,/a" (or a run state with site + scope)');
  process.exit(2);
}
if (/localhost|aem\.page/.test(base)) console.warn(`⚠️  ${base}: score the published aem.live site; preview and localhost aren't representative`);

const GATED = ['performance', 'accessibility', 'best-practices'];
const chromium = await loadChromium();
const chromePath = chromium.executablePath();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-'));

function lighthouse(url, factor) {
  const file = path.join(tmp, `r-${Date.now()}.json`);
  try {
    execFileSync('npx', ['-y', 'lighthouse@12', url, '--quiet', '--output=json', `--output-path=${file}`,
      '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless=new --no-sandbox',
      ...(factor === 'desktop' ? ['--preset=desktop'] : [])], { env: { ...process.env, CHROME_PATH: chromePath }, stdio: 'ignore', timeout: 180000 });
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { error: e.message.split('\n')[0] };
  }
}

const results = [];
for (const p of pages) {
  for (const factor of ['mobile', 'desktop']) {
    const reports = [];
    for (let i = 0; i < runs; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const r = lighthouse(`${base}${p}`, factor);
      if (!r.error) reports.push(r);
    }
    if (!reports.length) {
      results.push({ page: p, factor, error: 'lighthouse failed on every run' });
      console.log(`❌ ${p} ${factor}: lighthouse failed`);
      continue;
    }
    reports.sort((a, b) => a.categories.performance.score - b.categories.performance.score);
    const median = reports[Math.floor(reports.length / 2)];
    const scores = Object.fromEntries(['performance', 'accessibility', 'best-practices', 'seo'].map((c) => [c, Math.round((median.categories[c]?.score ?? 0) * 100)]));
    // the fix list: every audit pulling a gated category below 100
    const failing = GATED.flatMap((c) => median.categories[c].auditRefs
      .filter((ref) => ref.weight > 0 && median.audits[ref.id]?.score !== null && median.audits[ref.id]?.score < 1)
      .map((ref) => {
        const au = median.audits[ref.id];
        // where it happens: element selectors (a11y) or URLs (cookies, issues), first 3
        const where = (au.details?.items || []).slice(0, 3).map((it) => it.node?.selector || it.url || it.source?.url || '').filter(Boolean);
        return { category: c, id: ref.id, title: au.title, display: au.displayValue || '', where };
      }));
    const ok = GATED.every((c) => scores[c] >= target);
    results.push({ page: p, factor, scores, ok, runs: reports.length, perfRuns: reports.map((r) => Math.round(r.categories.performance.score * 100)), failing });
    console.log(`${ok ? '✅' : '❌'} ${p} ${factor}: perf ${scores.performance} (runs ${reports.map((r) => Math.round(r.categories.performance.score * 100)).join('/')}) · a11y ${scores.accessibility} · bp ${scores['best-practices']} · seo ${scores.seo} (not gated)`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

const complete = results.every((r) => r.ok);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'lighthouse.json'), JSON.stringify({ complete, target, base, at: new Date().toISOString(), results }, null, 2));
const md = [`# Lighthouse: ${complete ? 'PASS ✅' : 'FAIL ❌'} (target ${target}; Performance, Accessibility, Best Practices; SEO not gated)`, '',
  `Site: ${base} · median of ${runs} runs per page and form factor`, '',
  '| page | form factor | performance | accessibility | best practices | seo |', '|---|---|---|---|---|---|',
  ...results.map((r) => (r.error ? `| ${r.page} | ${r.factor} | ❌ ${r.error} | | | |`
    : `| ${r.page} | ${r.factor} | ${r.scores.performance} | ${r.scores.accessibility} | ${r.scores['best-practices']} | ${r.scores.seo} |`)), '',
  '## Fix list', '', ...(results.some((r) => r.failing?.length) ? results.filter((r) => r.failing?.length).flatMap((r) => [`### ${r.page} (${r.factor})`,
    ...r.failing.map((f) => `- [ ] **${f.category} · ${f.title}**${f.display ? ` (${f.display})` : ''} \`${f.id}\`${f.where.length ? ` → ${f.where.map((w) => `\`${w}\``).join(', ')}` : ''}`), '']) : ['Nothing left to fix.'])];
fs.writeFileSync(path.join(out, 'lighthouse.md'), md.join('\n'));
if (fs.existsSync(runFile)) {
  run.phases = { ...(run.phases || {}), lighthouse: complete ? 'done' : 'running' };
  run.lighthouse = { complete, failing: results.filter((r) => !r.ok).map((r) => `${r.page} ${r.factor}`) };
  fs.writeFileSync(runFile, JSON.stringify(run, null, 2));
}
console.log(complete ? '\n✅ every page scores 100 on mobile and desktop (SEO excluded)' : `\n❌ work through ${out}/lighthouse.md, publish, then rerun with --pages "${[...new Set(results.filter((r) => !r.ok).map((r) => r.page))].join(',')}"`);
process.exit(complete ? 0 : 1);
