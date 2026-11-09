#!/usr/bin/env node
/*
 * customer-demo: capture pages for the fidelity gate.
 *
 *   node capture.mjs --base <origin> --pages "/,/contact-us" --out <dir> [--width 1440] [--headed]
 *                    [--dismiss "I agree,Accept all cookies"] [--scheme dark|light]
 *
 * --scheme emulates the OS color preference. Capture the demo with both to verify the site
 * honors its declared default (metadata `color-scheme`) and stays readable.
 *
 * For each page it writes:
 *   <dir>/<slug>/full.png          full-page screenshot (after scrolling, modals dismissed)
 *   <dir>/<slug>/sec-<n>.png       one screenshot per top-level content section
 *   <dir>/<slug>/page.json         structure: header/nav/footer boxes + per-section inventory
 *                                  (headings, text length, links, buttons, images, forms, inputs,
 *                                  background color, layout columns)
 *
 * Use --headed for bot-protected originals (Akamai etc. return 403 to headless Chromium).
 * Requires playwright-core and a Chromium (`npx playwright install chromium` once).
 */
import fs from 'node:fs';
import path from 'node:path';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core missing: run `npm i --no-save playwright-core` in this folder (or globally).');
  process.exit(2);
}

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
  const resp = await page.goto(base + p, { waitUntil: 'load', timeout: 60000 });
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
    await page.goto(base + p, { waitUntil: 'load', timeout: 60000 });
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

  const info = await page.evaluate(() => {
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.height > 60 && r.width > 200 && s.display !== 'none' && s.visibility !== 'hidden'; };
    const main = document.querySelector('main') || document.body;
    // descend through single-child wrappers to find the list of content sections
    let container = main;
    while (container.children.length === 1 && container.firstElementChild.children.length) container = container.firstElementChild;
    const sections = [...container.children].filter(visible);
    const bg = (e) => {
      let n = e;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)') return c;
        n = n.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };
    const columns = (e) => {
      const kids = [...e.querySelectorAll('h2, h3, img, form, li, article')].map((k) => Math.round(k.getBoundingClientRect().x / 40));
      return new Set(kids).size;
    };
    const inventory = (e) => ({
      box: box(e),
      bg: bg(e),
      headings: [...e.querySelectorAll('h1, h2, h3, h4')].filter((h) => h.offsetParent).map((h) => `${h.tagName}: ${h.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)}`),
      textChars: e.innerText.replace(/\s+/g, ' ').trim().length,
      links: e.querySelectorAll('a[href]').length,
      buttons: e.querySelectorAll('button, a.button, [role=button]').length,
      images: [...e.querySelectorAll('img, picture, svg')].filter((i) => i.getBoundingClientRect().width > 40).length,
      forms: e.querySelectorAll('form').length,
      inputs: [...e.querySelectorAll('input, select, textarea')].filter((i) => i.type !== 'hidden').map((i) => `${i.tagName.toLowerCase()}:${i.type || ''}:${(i.labels?.[0]?.textContent || i.placeholder || i.name || '').trim().slice(0, 40)}`),
      columns: columns(e),
    });
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    // side rail: a tall, narrow navigation column pinned to the left edge (nav/aside or any fixed element)
    const rail = [...document.querySelectorAll('nav, aside, nav > *, header *')].find((n) => {
      const r = n.getBoundingClientRect();
      return r.left < 5 && r.width > 40 && r.width < 200 && r.height > 400 && n.querySelectorAll('a').length >= 3;
    });
    // readability: text whose contrast against its effective background is below 3:1
    const lum = (c) => {
      const m = c.match(/[\d.]+/g);
      if (!m) return 1;
      const [r, g, b] = m.slice(0, 3).map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const lowContrast = [...document.querySelectorAll('main h1, main h2, main h3, main p, main a, main label, footer p, header a')]
      .filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => {
        const a = lum(getComputedStyle(e).color);
        const b = lum(bg(e));
        return { t: e.innerText.trim().slice(0, 40), ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10 };
      })
      .filter((x) => x.ratio < 3);
    return {
      theme: document.documentElement.dataset.theme || null,
      declaredScheme: document.querySelector('meta[name="color-scheme"]')?.content || null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      lowContrast: lowContrast.slice(0, 10),
      title: document.title,
      height: document.body.scrollHeight,
      header: header && { box: box(header), items: [...header.querySelectorAll('a, button, input')].filter((x) => x.offsetParent).map((x) => (x.innerText || x.placeholder || x.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 30) },
      rail: rail && { box: box(rail), items: rail.innerText.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 20) },
      footer: footer && { ...inventory(footer), links: [...footer.querySelectorAll('a')].map((a) => a.textContent.trim()).filter(Boolean) },
      sections: sections.map(inventory),
      dialogs: [...document.querySelectorAll('dialog[open], [role=dialog]')].filter((d) => d.offsetParent).length,
    };
  });
  for (let i = 0; i < info.sections.length; i += 1) {
    const { box } = info.sections[i];
    // eslint-disable-next-line no-await-in-loop
    await page.screenshot({ path: path.join(dir, `sec-${i}.png`), fullPage: true, clip: { x: 0, y: box.y, width, height: Math.max(1, Math.min(box.h, 3000)) } }).catch(() => {});
  }
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify({ url: base + p, status: resp?.status(), errors, ...info }, null, 2));
  console.log(`${p} -> ${dir} (status ${resp?.status()}, ${info.sections.length} sections, ${errors.length} errors)`);
  await page.close();
}
await browser.close();
