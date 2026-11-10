#!/usr/bin/env node
/*
 * customer-demo: fidelity report.
 *
 *   node compare.mjs --original <captureDir> --demo <captureDir> --out fidelity.html [--map "/a=/b,..."] [--waivers waivers.json]
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
 *  - waivers: a failing check passes only with an explicit reason in --waivers (listed in the output)
 *  - color scheme / readability: declared scheme honored; no text below 3:1 against what is painted under it
 *  - health: no console/network errors on the demo
 */
import fs from 'node:fs';
import path from 'node:path';

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

const norm = (s) => s.toLowerCase().replace(/^h\d:\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (p) => path.relative(path.dirname(path.resolve(outFile)), path.resolve(p));

const pages = fs.readdirSync(origDir).filter((d) => fs.existsSync(path.join(origDir, d, 'page.json')));
const results = [];

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
  // explicit, reasoned exceptions only (closest-possible alternative, last resort): reported, never silent
  checks.forEach((c) => {
    const reason = waivers[slug]?.[c.name] || waivers['*']?.[c.name];
    if (!c.ok && reason) Object.assign(c, { ok: true, waived: reason, detail: `${c.detail} · WAIVED: ${reason}` });
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
console.log(`${results.length - failed.length}/${results.length} pages pass → ${outFile}`);
results.forEach((r) => r.checks.filter((c) => c.waived).forEach((c) => console.log(`WAIVED ${r.slug}: ${c.name}: ${c.waived}`)));
failed.forEach((r) => console.log(`FAIL ${r.slug}: ${r.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join('; ')}`));
process.exit(failed.length ? 1 : 0);
