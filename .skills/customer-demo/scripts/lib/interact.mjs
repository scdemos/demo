/*
 * customer-demo: functional parity probe (capture.mjs --interact). Uses the page like a visitor and
 * records what responds, so compare.mjs can require the demo to work at least like the original:
 *  - menus:    hover / click each top-level header item; how many header links become visible
 *  - carousel: click a "next" control (or a dot); did the visible slide change
 *  - tabs:     click the second tab; did the selected panel change
 *  - accordion: click the first collapsed toggle in main; did it expand
 *  - mobile:   at 390 px, open the menu button; how many nav links become visible
 * Every probe is read-only (no form submits, no navigation): link clicks are prevented.
 */
const visibleLinks = (page, scope) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} a`)]
  .filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== 'hidden'; }).length, scope);

const blockNavigation = (page) => page.evaluate(() => {
  if (window.__cdBlock) return;
  window.__cdBlock = true;
  document.addEventListener('click', (e) => { if (e.target.closest('a[href]')) e.preventDefault(); }, true);
  document.addEventListener('submit', (e) => e.preventDefault(), true);
});

async function menus(page) {
  const header = 'header, [role=banner]';
  const before = await visibleLinks(page, header);
  let max = before;
  const tops = page.locator(`${header} nav li:not(li li) > a, ${header} nav li:not(li li) > button, ${header} [aria-haspopup], ${header} [aria-expanded]`);
  const n = Math.min(await tops.count(), 10);
  for (let i = 0; i < n; i += 1) {
    const t = tops.nth(i);
    // eslint-disable-next-line no-await-in-loop
    if (!(await t.isVisible().catch(() => false))) continue;
    // eslint-disable-next-line no-await-in-loop
    await t.hover({ timeout: 2000 }).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(300);
    // eslint-disable-next-line no-await-in-loop
    max = Math.max(max, await visibleLinks(page, header));
    // eslint-disable-next-line no-await-in-loop
    if ((await t.getAttribute('aria-expanded').catch(() => null)) !== null || (await t.evaluate((x) => x.tagName === 'BUTTON'))) {
      // eslint-disable-next-line no-await-in-loop
      await t.click({ timeout: 2000 }).catch(() => {});
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(300);
      // eslint-disable-next-line no-await-in-loop
      max = Math.max(max, await visibleLinks(page, header));
      // eslint-disable-next-line no-await-in-loop
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  await page.mouse.move(5, 600);
  return { before, revealed: max - before };
}

async function carousel(page) {
  const next = page.locator('main button[aria-label*="next" i], main [class*=next]:is(button,[role=button]), main button[aria-label*="slide" i], main [role=tab][aria-label*="slide" i]').first();
  if (!(await next.count()) || !(await next.isVisible().catch(() => false))) return null;
  const snap = () => page.evaluate(() => [...document.querySelectorAll('main [class*=carousel], main [class*=slider], main [class*=swiper], main [aria-roledescription=carousel]')]
    .map((c) => `${c.scrollLeft}|${[...c.querySelectorAll('[aria-hidden=false], .active, [class*=active], [aria-current=true]')].map((x) => x.textContent.trim().slice(0, 20)).join(',')}|${[...c.querySelectorAll('*')].slice(0, 30).map((x) => getComputedStyle(x).transform).join(',')}`).join('#'));
  const a = await snap();
  await next.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(900);
  return { advances: a !== await snap() };
}

async function tabs(page) {
  const list = page.locator('main [role=tab]:not([aria-label*="slide" i])');
  if ((await list.count()) < 2) return null;
  const second = list.nth(1);
  if (!(await second.isVisible().catch(() => false))) return null;
  await second.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  return { switches: (await second.getAttribute('aria-selected')) === 'true' };
}

async function accordion(page) {
  const toggle = page.locator('main details:not([open]) > summary, main [aria-expanded=false]:not([role=tab]):not([aria-haspopup])').first();
  if (!(await toggle.count()) || !(await toggle.isVisible().catch(() => false))) return null;
  await toggle.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  const opened = await toggle.evaluate((t) => t.getAttribute('aria-expanded') === 'true' || !!t.closest('details')?.open);
  return { expands: opened };
}

async function mobile(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const header = 'header, [role=banner]';
  const before = await visibleLinks(page, header);
  const btn = page.locator(`${header} button[aria-label*="menu" i], ${header} button[aria-label*="navigation" i], ${header} [class*=hamburger] button, ${header} button[class*=hamburger], ${header} button[aria-controls]`).first();
  if (!(await btn.count()) || !(await btn.isVisible().catch(() => false))) return { hasButton: false, revealed: 0 };
  await btn.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { hasButton: true, revealed: (await visibleLinks(page, `${header}, nav`)) - before };
}

export async function interact(page, width) {
  await blockNavigation(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const out = {};
  for (const [name, fn] of [['menus', menus], ['carousel', carousel], ['tabs', tabs], ['accordion', accordion]]) {
    // eslint-disable-next-line no-await-in-loop
    out[name] = await fn(page).catch((e) => ({ error: e.message.split('\n')[0] }));
  }
  out.mobile = await mobile(page).catch((e) => ({ error: e.message.split('\n')[0] }));
  await page.setViewportSize({ width, height: 900 });
  return out;
}
