#!/usr/bin/env node
/*
 * customer-demo: capture pages for the fidelity gate.
 *
 *   node capture.mjs --base <origin> --pages "/,/contact-us" --out <dir> [--width 1440] [--headed]
 *                    [--dismiss "I agree,Accept all cookies"] [--scheme dark|light] [--interact]
 *
 * --interact also uses each page like a visitor (lib/interact.mjs): header menus, carousel, tabs,
 * accordion, mobile menu. compare.mjs then requires the demo to respond at least like the original.
 *
 * --scheme emulates the OS color preference. Capture the demo with both to verify the site
 * honors its declared default (metadata `color-scheme`) and stays readable.
 *
 * For each page it writes:
 *   <dir>/<slug>/full.png          full-page screenshot (after scrolling, modals dismissed)
 *   <dir>/<slug>/sec-<n>.png       one screenshot per top-level content section
 *   <dir>/<slug>/page.json         structure from browser/inventory.js: header anatomy (rows, logo,
 *                                  sticky, mega menu), footer, rail + per-section inventory (headings,
 *                                  text blocks, alignment/width, tone, bleed, columns, carousel,
 *                                  buttons, images, forms, inputs)
 *
 * Use --headed for bot-protected originals (Akamai etc. return 403 to headless Chromium).
 * Requires playwright-core and a Chromium: `node setup-check.mjs --fix` once.
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadChromium } from './lib/pw.mjs';
import { browserFn } from './lib/site.mjs';
import { interact } from './lib/interact.mjs';

const inventorySrc = browserFn('inventory');

const chromium = await loadChromium();

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]);
  return acc;
}, []));
const base = args.base.replace(/\/$/, '');
const pages = (args.pages || '/').split(',').map((p) => p.trim());
const out = args.out || 'capture';
const width = Number(args.width || 1440);
const dismiss = (args.dismiss || 'I agree,Accept all cookies,Accept all,Accept').split(',');

const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_'));

const browser = await chromium.launch({
  headless: args.headed !== 'true',
  args: ['--disable-blink-features=AutomationControlled'],
});
const ctx = await browser.newContext({
  viewport: { width, height: 900 },
  colorScheme: args.scheme === 'dark' ? 'dark' : 'light',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
});
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));

for (const p of pages) {
  const dir = path.join(out, slug(p));
  fs.mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400 && !/analytics|beacon|collect|adobedc|demdex/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
  let resp = await page.goto(base + p, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  for (const name of dismiss) {
    const btn = page.getByRole('button', { name, exact: true }).first();
    // eslint-disable-next-line no-await-in-loop
    if (await btn.count()) await btn.evaluate((b) => b.click()).catch(() => {});
  }
  // dismissing gates can trigger a navigation/reload: settle, then re-open the target if we left it
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(1500);
  if (!page.url().startsWith(base + p.replace(/\/$/, ''))) {
    // the status we report must belong to the load we screenshot
    resp = await page.goto(base + p, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
  }
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 120); });
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(dir, 'full.png'), fullPage: true });

  const info = await page.evaluate(`(${inventorySrc})()`);
  for (let i = 0; i < info.sections.length; i += 1) {
    const { box } = info.sections[i];
    // eslint-disable-next-line no-await-in-loop
    await page.screenshot({ path: path.join(dir, `sec-${i}.png`), fullPage: true, clip: { x: 0, y: box.y, width, height: Math.max(1, Math.min(box.h, 3000)) } }).catch(() => {});
  }
  // functional parity runs last: it opens menus and moves carousels, which would skew the screenshots
  const interactions = args.interact === 'true' ? await interact(page, width).catch((e) => ({ error: e.message.split('\n')[0] })) : undefined;
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify({ url: base + p, status: resp?.status(), errors, ...info, interactions }, null, 2));
  console.log(`${p} -> ${dir} (status ${resp?.status()}, ${info.sections.length} sections, ${errors.length} errors)`);
  await page.close();
}
await browser.close();
