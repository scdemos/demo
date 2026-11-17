#!/usr/bin/env node
/*
 * customer-demo: fidelity report.
 *
 *   node compare.mjs --original <captureDir> --demo <captureDir> --out fidelity.html [--map "/a=/b,..."] [--waivers waivers.json]
 *                    [--final --review review.json] [--allow "phrase,phrase"] [--scope "/,/about"] [--json results.json]
 *   node compare.mjs --self-test     # negative tests: each check FAILs on a broken demo, PASSes on a faithful one
 *
 * Reads page.json from both captures (see capture.mjs), aligns pages by slug (or --map), and writes
 * an HTML report with side-by-side screenshots, a section-by-section inventory table and an
 * automatic verdict per check. Exit code 1 when any page FAILs, so agents can loop until it passes.
 *
 * Checks (per page):
 *  - chrome: header item coverage, side rail present when original has one, footer link coverage
 *  - sections: demo keeps at least 50% of the original's section count (originals nest arbitrarily)
 *  - content: every original heading text is present on the demo page (normalized)
 *  - chrome: no original header item or footer link missing
 *  - interactions: visible forms/inputs not lower than the original; visible CTAs ≥ 80%
 *  - media: images ≥ 90% of the original; text: visible copy ≥ 80% of the original
 *  - waivers: a failing check passes only with an explicit reason in --waivers (listed in the output);
 *    the fidelity checks (F1-F5) can only be waived by the SC: the reason must start with 'SC:'
 *  - color scheme / readability: declared scheme honored; no text below 3:1 against what is painted under it
 *  - health: no console/network errors on the demo
 *  - header layout: height (±25%), rows (utility bar / sub-nav), logo placement, sticky, mega menu
 *  - carousels: every original carousel/slider is a carousel on the demo too
 *  - layout: per section (matched by heading), same alignment (centered/start), tone (dark/light),
 *    full bleed, columns (±1) and text width (±20 points)
 *  - provenance: demo copy comes from the original site (any captured page); invented text blocks
 *    fail (allowed: --allow phrases, "illustration only" notes)
 *  - functionality (captures made with --interact): what responds on the original must respond on
 *    the demo: header menus reveal ≥ 80% as many links, the mobile menu opens, carousels advance,
 *    tabs switch, accordions expand
 *  - review (--final): every page has a by-eye verdict in review.json; a template is written next to
 *    the report. The verdict says what was compared ("header, hero, 3 cards, footer match at 1440").
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--self-test')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-'));
  const sec = (o = {}) => ({
    box: { y: 0, h: 400 }, bg: 'rgb(255, 255, 255)', tone: 'light', bleed: false, layout: { align: 'start', left: 10, width: 60 }, carousel: false,
    headings: ['H2: Global investment capabilities'], texts: ['We manage assets for institutions around the world with a disciplined approach.'],
    textChars: 300, links: 2, buttons: 1, images: 1, forms: 0, inputs: [], columns: 2, ...o,
  });
  const pageOf = (o = {}) => ({
    header: { box: { h: 80 }, rows: 2, sticky: false, logo: { h: 50, centered: false }, hiddenLinks: 20, items: ['Capabilities', 'Insights'] },
    footer: { links: ['Privacy'], texts: [] }, sections: [sec()], errors: [], ...o,
  });
  const write = (dir, page) => { fs.mkdirSync(path.join(tmp, dir, 'home'), { recursive: true }); fs.writeFileSync(path.join(tmp, dir, 'home', 'page.json'), JSON.stringify(page)); };
  write('orig', pageOf({ sections: [sec({ carousel: true })], interactions: { menus: { revealed: 12 }, carousel: { advances: true }, mobile: { hasButton: true, revealed: 8 } } }));
  const cases = [
    ['faithful demo', pageOf({ sections: [sec({ carousel: true })], interactions: { menus: { revealed: 11 }, carousel: { advances: true }, mobile: { hasButton: true, revealed: 9 } } }), null],
    ['header: 1 row, no mega menu, taller', pageOf({ header: { box: { h: 140 }, rows: 1, sticky: false, logo: { h: 50, centered: false }, hiddenLinks: 0, items: ['Capabilities', 'Insights'] }, sections: [sec({ carousel: true })] }), 'header layout'],
    ['carousel dropped', pageOf(), 'carousels'],
    ['section centered on a dark band', pageOf({ sections: [sec({ carousel: true, tone: 'dark', layout: { align: 'center', left: 20, width: 60 } })] }), 'layout'],
    ['dead carousel + mobile menu', pageOf({ sections: [sec({ carousel: true })], interactions: { carousel: { advances: false }, mobile: { hasButton: true, revealed: 0 } } }), 'functionality'],
    ['invented copy', pageOf({ sections: [sec({ carousel: true, texts: ['Unlock synergies with our best-in-class holistic solutions for tomorrow.', 'Our award winning team delivers outcomes that matter to you every day.'] })] }), 'provenance'],
  ];
  const self = fileURLToPath(import.meta.url);
  let bad = 0;
  cases.forEach(([name, demo, mustFail]) => {
    fs.rmSync(path.join(tmp, 'demo'), { recursive: true, force: true });
    write('demo', demo);
    let out = '';
    try { out = execFileSync(process.execPath, [self, '--original', path.join(tmp, 'orig'), '--demo', path.join(tmp, 'demo'), '--out', path.join(tmp, 'f.html')], { encoding: 'utf8' }); } catch (e) { out = e.stdout; }
    const failed = (out.match(/^FAIL home: (.*)$/m)?.[1] || '').split('; ').map((x) => x.replace(/ \(.*$/, ''));
    const ok = mustFail ? failed.includes(mustFail) : failed.length === 1 && failed[0] === '';
    if (!ok) bad += 1;
    console.log(`${ok ? '✅' : '❌'} ${name}: ${mustFail ? `${mustFail} must FAIL` : 'must PASS'} → ${failed.filter(Boolean).join(', ') || 'pass'}`);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? `${bad} self-test case(s) misbehave` : `all ${cases.length} self-test cases behave`);
  process.exit(bad ? 1 : 0);
}

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const origDir = args.original;
const demoDir = args.demo;
const outFile = args.out || 'fidelity.html';
const map = Object.fromEntries((args.map || '').split(',').filter(Boolean).map((m) => m.split('=')));
// --waivers waivers.json: { "<page slug>|*": { "<check name>": "reason" } }
const waivers = args.waivers ? JSON.parse(fs.readFileSync(args.waivers, 'utf8')) : {};
const final = 'final' in args;
const review = args.review && fs.existsSync(args.review) ? JSON.parse(fs.readFileSync(args.review, 'utf8')) : {};
const allow = ['for illustration only', 'demo content', ...(args.allow || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)];

const norm = (s) => s.toLowerCase().replace(/^h\d:\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (p) => path.relative(path.dirname(path.resolve(outFile)), path.resolve(p));

const pages = fs.readdirSync(origDir).filter((d) => fs.existsSync(path.join(origDir, d, 'page.json')));
const results = [];
// --scope: every scoped page must have been captured on both sides (a skipped page can't pass silently)
const slugOf = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_'));
(args.scope || '').split(',').map((x) => x.trim()).filter(Boolean).map(slugOf).filter((slug) => !pages.includes(slug))
  .forEach((slug) => results.push({ slug, demoSlug: map[slug] || slug, checks: [{ name: 'page exists', ok: false, detail: 'scoped page has no original capture' }] }));

// provenance corpus: word 4-grams of every captured original page (copy may move between pages)
const grams = (t) => { const w = norm(t).split(' ').filter(Boolean); return w.length < 4 ? [w.join(' ')] : w.slice(0, -3).map((_, i) => w.slice(i, i + 4).join(' ')); };
const corpus = new Set(pages.flatMap((slug) => {
  const o = JSON.parse(fs.readFileSync(path.join(origDir, slug, 'page.json')));
  return [...o.sections.flatMap((x) => [...(x.texts || []), ...x.headings]), ...(o.footer?.texts || [])].flatMap(grams);
}));
const whole = new Set(pages.flatMap((slug) => {
  const o = JSON.parse(fs.readFileSync(path.join(origDir, slug, 'page.json')));
  return [...o.sections.flatMap((x) => [...(x.texts || []), ...(x.labels || []), ...x.headings]), ...(o.header?.items || []), ...(o.footer?.links || [])].map(norm);
}));
const wholeText = [...whole].join(' | ');
// short text (headings, labels) must appear verbatim on the original; longer copy needs half its 4-grams
const fromOriginal = (t) => {
  const n = norm(t);
  if (n.split(' ').length < 6) return whole.has(n) || wholeText.includes(n);
  const g = grams(t);
  return g.filter((x) => corpus.has(x)).length / g.length >= 0.5;
};
// fidelity checks only the SC can waive (reason "SC: ..."), so the agent can't wave its own misses through
const FIDELITY = new Set(['functionality', 'text', 'media', 'buttons', 'forms & inputs', 'headings', 'header items', 'header layout', 'footer links', 'side rail', 'carousels', 'layout', 'provenance', 'section count', 'review']);

const headerChecks = (o, d) => {
  const oh = o.header || {};
  const dh = d.header || {};
  const miss = [];
  if (oh.box && dh.box && Math.abs(dh.box.h - oh.box.h) > Math.max(24, oh.box.h * 0.25)) miss.push(`height ${oh.box.h} → ${dh.box.h}px`);
  if (oh.rows && dh.rows && oh.rows !== dh.rows) miss.push(`rows ${oh.rows} → ${dh.rows} (utility bar / sub-nav)`);
  if (oh.logo && !dh.logo) miss.push('logo missing');
  if (oh.logo && dh.logo && oh.logo.centered !== dh.logo.centered) miss.push(`logo ${oh.logo.centered ? 'centered' : 'left'} → ${dh.logo.centered ? 'centered' : 'left'}`);
  if (oh.logo && dh.logo && Math.abs(dh.logo.h - oh.logo.h) > Math.max(10, oh.logo.h * 0.35)) miss.push(`logo height ${oh.logo.h} → ${dh.logo.h}px`);
  if (oh.sticky !== undefined && dh.sticky !== undefined && oh.sticky !== dh.sticky) miss.push(`sticky ${oh.sticky} → ${dh.sticky}`);
  if ((oh.hiddenLinks || 0) >= 8 && (dh.hiddenLinks || 0) < oh.hiddenLinks * 0.5) miss.push(`mega menu / sub-nav links ${oh.hiddenLinks} → ${dh.hiddenLinks || 0}`);
  return miss;
};

const functionChecks = (oi, di) => {
  if (!oi || !di) return null;
  const miss = [];
  if ((oi.menus?.revealed || 0) >= 3 && (di.menus?.revealed || 0) < oi.menus.revealed * 0.8) miss.push(`menus reveal ${oi.menus.revealed} → ${di.menus?.revealed || 0} links`);
  if (oi.mobile?.hasButton && !(di.mobile?.hasButton && di.mobile.revealed > 0)) miss.push('mobile menu does not open');
  if (oi.carousel?.advances && !di.carousel?.advances) miss.push('carousel does not advance');
  if (oi.tabs?.switches && !di.tabs?.switches) miss.push('tabs do not switch');
  if (oi.accordion?.expands && !di.accordion?.expands) miss.push('accordion does not expand');
  return miss;
};

const layoutChecks = (o, d) => {
  const miss = [];
  o.sections.forEach((os, i) => {
    const h = os.headings.map(norm).find((x) => x.length > 3);
    if (!h || !os.layout) return;
    const ds = d.sections.find((x) => x.headings.map(norm).some((y) => y.includes(h.slice(0, 50)) || (h.includes(y) && y.length > 10)));
    if (!ds?.layout) return;
    const name = `#${i} "${h.slice(0, 30)}"`;
    if (os.layout.align !== ds.layout.align) miss.push(`${name} ${os.layout.align} → ${ds.layout.align}`);
    if (os.tone && ds.tone && os.tone !== ds.tone) miss.push(`${name} ${os.tone} → ${ds.tone} background`);
    if (os.bleed !== undefined && ds.bleed !== undefined && os.bleed !== ds.bleed) miss.push(`${name} full-bleed ${os.bleed} → ${ds.bleed}`);
    if (Math.abs(os.columns - ds.columns) > 1) miss.push(`${name} columns ${os.columns} → ${ds.columns}`);
    if (Math.abs(os.layout.width - ds.layout.width) > 20) miss.push(`${name} text width ${os.layout.width}% → ${ds.layout.width}%`);
  });
  return miss;
};

pages.forEach((slug) => {
  const demoSlug = map[slug] || slug;
  const o = JSON.parse(fs.readFileSync(path.join(origDir, slug, 'page.json')));
  const dPath = path.join(demoDir, demoSlug, 'page.json');
  if (!fs.existsSync(dPath)) {
    results.push({ slug, demoSlug, checks: [{ name: 'page exists', ok: false, detail: 'missing demo capture' }] });
    return;
  }
  const d = JSON.parse(fs.readFileSync(dPath));
  const sum = (p, k) => p.sections.reduce((a, s) => a + (Array.isArray(s[k]) ? s[k].length : s[k]), 0);
  // substring match on the first ~60 chars: originals often split one visual heading across elements
  // (styled spans, line breaks) or wrap body copy inside the heading element
  const demoHeadings = d.sections.flatMap((s) => s.headings).map(norm).join(' | ');
  const key = (h) => (norm(h).length > 60 ? norm(h).slice(0, 60).replace(/\s\S*$/, '') : norm(h));
  const demoList = d.sections.flatMap((s) => s.headings).map(norm);
  const found = (h) => demoHeadings.includes(key(h)) || demoList.some((x) => x.length >= 15 && norm(h).startsWith(x));
  const missingHeadings = o.sections.flatMap((s) => s.headings).filter((h) => key(h) && !found(h));
  const oHeader = (o.header?.items || []).map(norm).filter((t) => t.length > 1);
  const dHeaderText = [...(d.header?.items || []), ...(d.rail?.items || [])].map(norm).join(' | ');
  const missingHeader = oHeader.filter((t) => !dHeaderText.includes(t));
  const oFooter = (o.footer?.links || []).map(norm);
  const dFooter = (d.footer?.links || []).map(norm).join(' | ');
  const missingFooter = oFooter.filter((t) => t && !dFooter.includes(t));
  const checks = [
    { name: 'side rail', ok: !o.rail || !!d.rail, detail: o.rail ? `original rail: ${o.rail.items.slice(0, 8).join(', ')}` : 'n/a' },
    { name: 'header items', ok: missingHeader.length === 0, detail: missingHeader.length ? `missing: ${missingHeader.join(', ')}` : 'all present' },
    { name: 'footer links', ok: missingFooter.length === 0, detail: missingFooter.length ? `missing: ${missingFooter.join(', ')}` : 'all present' },
    // originals nest sections arbitrarily (AEM Sites grids, wrappers); only flag a demo that collapsed the page
    { name: 'section count', ok: d.sections.length >= Math.ceil(o.sections.length * 0.5), detail: `${o.sections.length} → ${d.sections.length} (needs ≥ 50%)` },
    { name: 'headings', ok: missingHeadings.length === 0, detail: missingHeadings.length ? `missing: ${missingHeadings.join(' · ')}` : 'all present' },
    { name: 'forms & inputs', ok: sum(d, 'forms') >= sum(o, 'forms') && sum(d, 'inputs') >= sum(o, 'inputs'), detail: `forms ${sum(o, 'forms')} → ${sum(d, 'forms')}, inputs ${sum(o, 'inputs')} → ${sum(d, 'inputs')}` },
    { name: 'buttons', ok: sum(d, 'buttons') >= Math.ceil(sum(o, 'buttons') * 0.8), detail: `${sum(o, 'buttons')} → ${sum(d, 'buttons')} (visible CTAs, needs ≥ 80%)` },
    { name: 'media', ok: sum(d, 'images') >= Math.ceil(sum(o, 'images') * 0.9), detail: `${sum(o, 'images')} → ${sum(d, 'images')} (needs ≥ 90%)` },
    // content parity (P4): the demo carries at least 80% of the original's visible copy
    { name: 'text', ok: sum(d, 'textChars') >= Math.ceil(sum(o, 'textChars') * 0.8), detail: `${sum(o, 'textChars')} → ${sum(d, 'textChars')} chars (needs ≥ 80%)` },
    {
      name: 'color scheme',
      ok: !d.declaredScheme || d.declaredScheme === 'auto' || d.theme === d.declaredScheme,
      detail: `declared ${d.declaredScheme || 'none (follows OS)'} → rendered ${d.theme} (bg ${d.bodyBg})`,
    },
    {
      name: 'readability',
      ok: (d.lowContrast || []).length === 0,
      detail: (d.lowContrast || []).map((x) => `"${x.t}" ${x.ratio}:1`).join(' · ') || 'no text below 3:1',
    },
    { name: 'health', ok: (d.errors || []).length === 0, detail: (d.errors || []).slice(0, 3).join(' | ') || 'no errors' },
  ];
  const hdr = headerChecks(o, d);
  checks.push({ name: 'header layout', ok: !hdr.length, detail: hdr.join(' · ') || `height ${o.header?.box?.h}px, ${o.header?.rows} rows, logo ${o.header?.logo?.centered ? 'centered' : 'left'}` });
  const oCar = o.sections.filter((x) => x.carousel).length;
  const dCar = d.sections.filter((x) => x.carousel).length;
  checks.push({ name: 'carousels', ok: dCar >= oCar, detail: `${oCar} → ${dCar}` });
  const fn = functionChecks(o.interactions, d.interactions);
  if (fn) checks.push({ name: 'functionality', ok: !fn.length, detail: fn.join(' · ') || 'menus, mobile menu, carousel, tabs and accordion respond like the original' });
  else if (final) checks.push({ name: 'functionality', ok: false, detail: 'capture both sites with --interact for the final sweep' });
  const lay = layoutChecks(o, d);
  checks.push({ name: 'layout', ok: !lay.length, detail: lay.slice(0, 6).join(' · ') || 'alignment, tone, bleed, columns and width match' });
  const dTexts = [...d.sections.flatMap((x) => x.texts || []), ...d.sections.flatMap((x) => x.labels || []), ...d.sections.flatMap((x) => x.headings).map((h) => h.replace(/^H\d:\s*/, '')).filter((h) => h.split(/\s+/).length >= 3)];
  if (dTexts.length) {
    const invented = dTexts.filter((t) => !allow.some((a) => t.toLowerCase().includes(a)) && !fromOriginal(t));
    checks.push({
      name: 'provenance',
      ok: invented.length === 0,
      detail: invented.length ? `${invented.length}/${dTexts.length} text blocks not on the original: ${invented.slice(0, 4).map((t) => `"${t.slice(0, 60)}"`).join(' · ')}` : `${dTexts.length} text blocks, all from the original`,
    });
  }
  if (final) {
    const v = review[slug];
    // "waived" is only valid with the SC's approval in the note ("SC: …")
    const okVerdict = v && (v.verdict === 'match' || (v.verdict === 'waived' && /SC:/.test(v.note || '')));
    checks.push({ name: 'review', ok: !!okVerdict && String(v.note || '').length > 20, detail: v ? `${v.verdict}: ${v.note}` : 'no by-eye verdict in review.json' });
  }
  // explicit, reasoned exceptions only (closest-possible alternative, last resort): reported, never silent
  checks.forEach((c) => {
    const reason = waivers[slug]?.[c.name] || waivers['*']?.[c.name];
    if (!c.ok && reason && FIDELITY.has(c.name) && !/^SC:/i.test(reason)) c.detail += ' · waiver ignored: fidelity checks need the SC approval ("SC: ...")';
    else if (!c.ok && reason) Object.assign(c, { ok: true, waived: reason, detail: `${c.detail} · WAIVED: ${reason}` });
  });
  results.push({ slug, demoSlug, o, d, checks });
});

const failed = results.filter((r) => r.checks.some((c) => !c.ok));
const row = (s) => (s ? `<td><b>${esc(s.bg)}</b> · cols ${s.columns} · ${s.textChars} chars · ${s.links} links · ${s.buttons} btn · ${s.images} img${s.forms ? ` · ${s.forms} form` : ''}<br><small>${s.headings.map(esc).join('<br>')}</small></td>` : '<td class="miss">—</td>');
const html = `<!doctype html><meta charset="utf-8"><title>Fidelity report</title>
<style>body{font:14px system-ui;margin:24px;color:#222}h2{margin-top:48px}.ok{color:#0a7a3e}.bad{color:#b00020}
table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #ddd;padding:6px;vertical-align:top;font-size:12px}
.shots{display:grid;grid-template-columns:1fr 1fr;gap:16px}.shots img{width:100%;border:1px solid #ccc}.miss{background:#fff1f1}</style>
<h1>Fidelity report</h1><p>${results.length - failed.length}/${results.length} pages pass. Original: <code>${esc(origDir)}</code> · Demo: <code>${esc(demoDir)}</code></p>
${results.map((r) => `<h2>${esc(r.slug)} ${r.checks.every((c) => c.ok) ? '<span class="ok">PASS</span>' : '<span class="bad">FAIL</span>'}</h2>
<table><tr><th>check</th><th>result</th><th>detail</th></tr>${r.checks.map((c) => `<tr><td>${c.name}</td><td class="${c.ok ? 'ok' : 'bad'}">${c.waived ? 'waived' : (c.ok ? 'pass' : 'FAIL')}</td><td>${esc(c.detail)}</td></tr>`).join('')}</table>
${r.o ? `<table><tr><th>#</th><th>original section</th><th>demo section</th></tr>${Array.from({ length: Math.max(r.o.sections.length, r.d.sections.length) }, (_, i) => `<tr><td>${i}</td>${row(r.o.sections[i])}${row(r.d.sections[i])}</tr>`).join('')}</table>
<div class="shots"><div><b>original</b><img loading="lazy" src="${esc(rel(path.join(origDir, r.slug, 'full.png')))}"></div><div><b>demo</b><img loading="lazy" src="${esc(rel(path.join(demoDir, r.demoSlug, 'full.png')))}"></div></div>` : ''}`).join('')}`;
fs.writeFileSync(outFile, html);
if (args.json) fs.writeFileSync(args.json, JSON.stringify(results.map((r) => ({ slug: r.slug, demoSlug: r.demoSlug, checks: r.checks.map(({ name, ok, detail, waived }) => ({ name, ok, detail, waived })) })), null, 2));
// by-eye review template: one verdict per page after looking at both screenshots and every section
const tpl = path.join(path.dirname(path.resolve(outFile)), 'review.template.json');
fs.writeFileSync(tpl, JSON.stringify(Object.fromEntries(results.map((r) => [r.slug, review[r.slug] || { verdict: 'match | mismatch | waived', note: 'what you compared and what differs (header, each section, footer, 1440 + 390)' }])), null, 2));
console.log(`${results.length - failed.length}/${results.length} pages pass → ${outFile}`);
results.forEach((r) => r.checks.filter((c) => c.waived).forEach((c) => console.log(`WAIVED ${r.slug}: ${c.name}: ${c.waived}`)));
failed.forEach((r) => console.log(`FAIL ${r.slug}: ${r.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join('; ')}`));
process.exit(failed.length ? 1 : 0);
