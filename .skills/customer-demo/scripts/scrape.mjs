#!/usr/bin/env node
/*
 * customer-demo: harness-independent discovery + asset capture for the ORIGINAL site (phases 3/3b).
 * Works for server- and client-rendered sites and for CDNs that block page-JS fetches: every page is
 * rendered in a real browser, scrolled (lazy/reveal), outlined with extract-outline.js, and images
 * are captured from the browser's own network responses (no CORS, no re-fetch).
 *
 *   node scrape.mjs --base https://www.customer.com/section --pages "/,/about" --out scrape [--headed]
 *                   [--dismiss "I agree,Accept all"] [--min-width 120] [--max-images 60]
 *
 * Writes:
 *   <out>/<slug>/outline.json   ordered sections (headings, copy, lists, tables, forms, embeds, unknown widgets)
 *   <out>/<slug>/screenshot.png full page
 *   <out>/assets/<hash>.<ext>   images actually rendered at >= --min-width px, deduplicated
 *   <out>/assets.json           [{ file, url, alt, width, pages }], for upload to DA media/
 *   <out>/brand.json            computed colors (by frequency), fonts, logo candidates, favicon
 *   <out>/<slug>/design.json    browser/design.js: nav tree (dropdowns, mega menu, sub-nav), type scale,
 *                               button and card styles, container width, section bands
 *   <out>/<slug>/inventory.json browser/inventory.js: header anatomy + per-section layout, tone, carousel
 *   <out>/design.json           site-level summary: nav tree, type, buttons, cards, container (home page)
 *   <out>/repeats.json          sections that repeat on 2+ pages (same text): fragment candidates
 *
 * Use --headed when the CDN blocks headless Chromium (403 / empty page).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadChromium, DESKTOP_UA } from './lib/pw.mjs';
import { HERE, parseArgs, browserFn } from './lib/site.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.base) {
  console.error('usage: node scrape.mjs --base <url> --pages "/,/a" --out <dir> [--headed]');
  process.exit(2);
}
const base = args.base.replace(/\/$/, '');
const pages = (args.pages || '/').split(',').map((p) => p.trim()).filter(Boolean);
const out = args.out || 'scrape';
const minWidth = Number(args['min-width'] || 120);
const maxImages = Number(args['max-images'] || 60);
const dismiss = (args.dismiss || 'I agree,Accept all cookies,Accept all,Accept,Agree,OK').split(',');
const outlineSrc = fs.readFileSync(path.join(HERE, '../extract-outline.js'), 'utf8');
// page.evaluate that survives one late navigation (gates, consent reloads)
async function evalSafe(page, fn, arg) {
  try { return await page.evaluate(fn, arg); } catch (e) {
    if (!/context was destroyed|navigation/i.test(e.message)) throw e;
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(1500);
    return page.evaluate(fn, arg);
  }
}
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_'));
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: args.headed !== 'true', args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));

const bodies = new Map(); // url -> { buf, type }
const assets = new Map(); // hash -> asset
const truncated = new Set(); // rendered images skipped because of --max-images (a scope decision, never silent)
let brand = null;
let design = null;
const repeats = new Map(); // normalized section text -> { title, pages }
const designSrc = browserFn('design');
const inventorySrc = browserFn('inventory');

for (const p of pages) {
  const dir = path.join(out, slug(p));
  fs.mkdirSync(dir, { recursive: true });
  const page = await ctx.newPage();
  page.on('response', async (r) => {
    const type = r.headers()['content-type'] || '';
    if (r.request().resourceType() !== 'image' || !/image\/(jpe?g|png|webp|avif|gif|svg)/.test(type) || bodies.has(r.url())) return;
    try { bodies.set(r.url(), { buf: await r.body(), type }); } catch { /* redirected or aborted */ }
  });
  let resp;
  try {
    resp = await page.goto(base + p, { waitUntil: 'load', timeout: 60000 });
  } catch (e) {
    console.log(`❌ ${p}: ${e.message.split('\n')[0]}`);
    await page.close();
    continue;
  }
  await page.waitForTimeout(2500);
  for (const name of dismiss) {
    const btn = page.getByRole('button', { name, exact: true }).first();
    // eslint-disable-next-line no-await-in-loop
    if (await btn.count()) await btn.evaluate((b) => b.click()).catch(() => {});
  }
  // dismissing a gate often reloads/navigates: let that finish, then return to the target if we left it
  await page.waitForTimeout(1500);
  await page.waitForLoadState('load').catch(() => {});
  if (!page.url().startsWith(base + p.replace(/\/$/, ''))) await page.goto(base + p, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1000);
  // render everything lazy / client-side: slow scroll to the bottom, wait for network to calm down
  await evalSafe(page, async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo({ top: y, behavior: 'instant' });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 150); });
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true }).catch(() => {});

  const outline = await evalSafe(page, `${outlineSrc}\nextractOutline();`);
  fs.writeFileSync(path.join(dir, 'outline.json'), JSON.stringify(outline, null, 2));
  // deep design analysis: what must look the same, not just what must be said
  const pageDesign = await evalSafe(page, `(${designSrc})()`).catch((e) => ({ error: e.message }));
  fs.writeFileSync(path.join(dir, 'design.json'), JSON.stringify(pageDesign, null, 2));
  const inventory = await evalSafe(page, `(${inventorySrc})()`).catch((e) => ({ error: e.message }));
  fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify(inventory, null, 2));
  if (!design && !pageDesign.error) design = { ...pageDesign, header: inventory.header, rail: inventory.rail };

  // rendered images (incl. CSS backgrounds) with their displayed width + alt
  const shown = await evalSafe(page, (min) => {
    const list = [];
    document.querySelectorAll('img').forEach((i) => {
      const w = i.getBoundingClientRect().width;
      if (w >= min && i.currentSrc) list.push({ url: i.currentSrc, alt: i.alt || '', width: Math.round(w) });
    });
    document.querySelectorAll('*').forEach((e) => {
      const m = getComputedStyle(e).backgroundImage.match(/url\(["']?([^"')]+)/);
      const r = e.getBoundingClientRect();
      if (m && r.width >= Math.max(min, 300)) list.push({ url: new URL(m[1], location.href).href, alt: '', width: Math.round(r.width) });
    });
    return list;
  }, minWidth);
  shown.forEach((s) => {
    const body = bodies.get(s.url);
    if (!body) return;
    const hash = crypto.createHash('sha1').update(body.buf).digest('hex').slice(0, 12);
    const ext = (body.type.match(/image\/(\w+)/)?.[1] || 'jpg').replace('jpeg', 'jpg');
    if (!assets.has(hash)) {
      if (assets.size >= maxImages) { truncated.add(s.url); return; }
      const file = `${hash}.${ext}`;
      fs.writeFileSync(path.join(out, 'assets', file), body.buf);
      assets.set(hash, { file, url: s.url, alt: s.alt, width: s.width, pages: [] });
    }
    const a = assets.get(hash);
    if (!a.pages.includes(p)) a.pages.push(p);
    if (!a.alt && s.alt) a.alt = s.alt;
  });

  if (!brand) {
    brand = await evalSafe(page, () => {
      const count = (prop) => {
        const m = new Map();
        document.querySelectorAll('body *').forEach((e) => {
          const v = getComputedStyle(e)[prop];
          if (v && !/rgba\(0, 0, 0, 0\)|transparent/.test(v)) m.set(v, (m.get(v) || 0) + 1);
        });
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v, n]) => ({ v, n }));
      };
      const fonts = count('fontFamily').map((f) => f.v);
      const logo = [...document.querySelectorAll('header img, header svg, [class*=logo] img, [class*=logo] svg')].slice(0, 4)
        .map((e) => (e.tagName === 'IMG' ? e.currentSrc : 'inline-svg'));
      return {
        colors: count('color'), backgrounds: count('backgroundColor'), borders: count('borderTopColor').slice(0, 6), fonts,
        headingFont: getComputedStyle(document.querySelector('h1, h2') || document.body).fontFamily,
        radius: getComputedStyle(document.querySelector('a[class*=btn], button, [class*=button]') || document.body).borderRadius,
        logo,
        favicon: document.querySelector('link[rel*=icon]')?.href || null,
        siteName: document.querySelector('meta[property="og:site_name"]')?.content
          || document.title.split(/[|–-]/).map((t) => t.trim()).filter((t) => t.length > 3).pop() || document.title,
      };
    });
  }
  outline.sections.forEach((s) => {
    // every string in the section (lists, tables, forms, image alts, links), not just paragraph text
    const leaves = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(leaves) : v && typeof v === 'object' ? Object.entries(v).filter(([k]) => k !== 'html').flatMap(([, x]) => leaves(x)) : []);
    const key = [s.title?.text, ...leaves(s.items)].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (key.length < 80) return;
    if (!repeats.has(key)) repeats.set(key, { title: s.title?.text || key.slice(0, 60), pages: [] });
    if (!repeats.get(key).pages.includes(p)) repeats.get(key).pages.push(p);
  });
  const counts = outline.sections.reduce((a, s) => a + s.items.length, 0);
  console.log(`${resp && resp.status() < 400 ? '✅' : '⚠️ '} ${p} (${resp?.status()}): ${outline.sections.length} sections, ${counts} items`);
  await page.close();
}

fs.writeFileSync(path.join(out, 'assets.json'), JSON.stringify([...assets.values()], null, 2));
fs.writeFileSync(path.join(out, 'brand.json'), JSON.stringify(brand, null, 2));
if (truncated.size) {
  fs.writeFileSync(path.join(out, 'assets-truncated.json'), JSON.stringify([...truncated], null, 2));
  console.log(`⚠️  ${truncated.size} rendered images not saved (--max-images ${maxImages}): see assets-truncated.json; raise the limit or record the decision`);
}
if (design) fs.writeFileSync(path.join(out, 'design.json'), JSON.stringify(design, null, 2));
const shared = [...repeats.values()].filter((r) => r.pages.length > 1);
fs.writeFileSync(path.join(out, 'repeats.json'), JSON.stringify(shared, null, 2));
if (shared.length) console.log(`${shared.length} section(s) repeat across pages → fragment candidates in repeats.json`);
console.log(`${assets.size} images → ${out}/assets (manifest assets.json), brand → ${out}/brand.json`);
await browser.close();
