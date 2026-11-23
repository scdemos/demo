/*
 * tutorial-screencast: Experience Workspace (da.live) actions a tutorial spec can use.
 * Each action gets the run context ({ page, t, spec, run }) and the step's own fields.
 * Selectors use accessible names; the layout canvas is the first iframe of the editor.
 */

import { escapeHtml } from './spec.mjs';
import { liveModified } from './da.mjs';

// Controls that change what is live. Only the preview action may use them (and never in test takes).
// Deliberately broad: "Preview" in the file browser publishes to preview, so Library "Preview"
// buttons are blocked too; show a Library preview with its own action if a tutorial needs one.
const DEPLOY = /preview|publish|update|unpublish|delete|send/i;

const layout = (page) => page.frameLocator('iframe').first();

// Locate the element to work on: "layout" = rendered page (iframe), "content" = document editor.
// Text in the document being edited: in Content view prefer the editor itself, so a word like
// "list" isn't found in the app's own menus or panels first.
// `nth` picks a later match (-1 = the last, e.g. the metadata copy of a sentence the hero repeats).
async function docText(page, where, text, nth = 0) {
  if (where === 'layout') return layout(page).getByText(text).nth(nth);
  const inDoc = page.locator('.ProseMirror').getByText(text);
  return (await inDoc.count()) ? inDoc.nth(nth) : page.getByText(text).nth(nth);
}

// Page coordinates of one word inside an element, so a double-click lands exactly on it.
async function wordPoint(locator, word) {
  await locator.scrollIntoViewIfNeeded();
  const el = await locator.boundingBox();
  const r = await locator.evaluate((node, w) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
      const i = tn.data.indexOf(w);
      if (i >= 0) {
        const range = document.createRange();
        range.setStart(tn, i); range.setEnd(tn, i + w.length);
        const rr = range.getBoundingClientRect(); const nr = node.getBoundingClientRect();
        return { x: rr.left - nr.left + rr.width / 2, y: rr.top - nr.top + rr.height / 2 };
      }
    }
    return null;
  }, word);
  if (!r) throw new Error(`word "${word}" not found in element`);
  return { x: Math.round(el.x + r.x), y: Math.round(el.y + r.y) };
}

async function ensureToolsPanel({ page, t }) {
  const panels = page.getByRole('button', { name: 'Panels' });
  if (await panels.isVisible()) return;
  await t.click(page.getByRole('button', { name: 'Open after panel' }));
  await t.wait(1000);
}


// An element inside a side-panel plugin's iframe (see framePoint/frameClick/frameType).
function frameTarget(page, { frame, role, name, text, exact = true, nth = 0 }, what) {
  if (!/^[a-z0-9-]+$/.test(frame || '')) throw new Error(`${what}: "frame" is part of the plugin URL, e.g. "workfront"`);
  if (!Number.isInteger(nth) || nth < 0) throw new Error(`${what}: nth must be 0 or more`);
  const f = page.frameLocator(`iframe[src*="${frame}"]`);
  if (role && name) return f.getByRole(role, { name, exact }).nth(nth);
  if (text) return f.getByText(text, { exact }).nth(nth);
  throw new Error(`${what}: give "role" + "name", or "text"`);
}

// Click a plugin element with the mouse at its center. Web-component buttons (e.g. Shoelace
// sl-button in Experience Workspace's Experimentation panel) put a wrapper over the real <button>,
// which fails Playwright's actionability check although a real click there works.
async function frameMouseClick(t, el, what) {
  await el.waitFor({ state: 'visible', timeout: 20000 });
  await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
  const b = await el.boundingBox();
  if (!b) throw new Error(`${what}: the element has no box on screen`);
  await t.clickAt(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2));
}

// Adobe CX Enterprise Coworker (experience.adobe.com): its UI is an iframe inside the Experience Cloud shell.
const COWORKER = 'https://experience.adobe.com/#/@ccs/coworker';
const coworker = (page) => page.frameLocator('iframe[src*="coworker-ui"]');
// Visible text of the AEM Sidekick (its UI is in shadow roots).
const sidekickText = (page) => page.locator('aem-sidekick').evaluate((el) => {
  const out = [];
  const walk = (root) => root.querySelectorAll('*').forEach((n) => {
    if (n.shadowRoot) walk(n.shadowRoot);
    if (!n.children.length) out.push(n.textContent.trim());
  });
  if (el.shadowRoot) walk(el.shadowRoot);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}).catch(() => '');
const center = async (loc) => {
  const b = await loc.boundingBox();
  return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
};
const secs = (run) => (Date.now() - run.startedAt) / 1000;

// Wait until an AI assistant has finished answering: `busy()` (a Stop button) is gone and the text
// it shows (`size()`) hasn't changed for `quiet` ms. Up to `max` ms.
async function settle(t, { busy, size, quiet = 8000, max = 600000, what }) {
  const start = Date.now();
  let last = -1;
  let since = Date.now();
  while (Date.now() - start < max) {
    await t.wait(1500);
    const n = await size().catch(() => -1);
    if (n !== last || await busy().catch(() => false)) { last = n; since = Date.now(); continue; }
    if (Date.now() - since >= quiet) return;
  }
  throw new Error(`${what}: still working after ${Math.round(max / 60000)} minutes`);
}

// Pages a tutorial may open with `visit`: the live site and this site's aem.page/aem.live hosts.
function allowedUrl(spec, url) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`visit: invalid URL ${JSON.stringify(url)}`); }
  const hosts = [new URL(spec.siteOrigin).host, `main--${spec.site}--${spec.org}.aem.page`, `main--${spec.site}--${spec.org}.aem.live`];
  if (u.protocol !== 'https:' || !hosts.includes(u.host) || u.username || u.password) {
    throw new Error(`visit: ${url} is not on ${hosts.join(', ')}`);
  }
  return u.toString();
}


// Wait (outside the page) until `url` serves `text`: published changes take a few seconds to reach the
// CDN, and a take that shows the page too early records the old content.
// The time spent waiting is cut from the video (run.cuts): viewers don't need to watch the CDN.
// `bust: false` polls the URL as given, for endpoints that answer 404 to a query string (a Worker on
// an exact route, like the site's /rss.xml).
async function waitServed(t, run, url, text, bust = true) {
  let since = null;
  for (let i = 0; i < 45; i += 1) {
    const polled = bust ? `${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}` : url;
    const body = await fetch(polled, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : '')).catch(() => '');
    if (body.includes(text)) {
      if (since !== null) (run.cuts ||= []).push([since, (Date.now() - run.startedAt) / 1000]);
      return;
    }
    if (since === null) since = (Date.now() - run.startedAt) / 1000;
    await t.wait(2000);
  }
  throw new Error(`${url} still doesn't serve "${text}"`);
}

// Enlarge small text (JSON, XML feeds) by zooming the page's own content, not the recorder's
// overlay (#tt-root: cursor, captions, cards).
async function zoomContent(page, zoom, what) {
  if (zoom === undefined) return;
  if (!(zoom >= 0.5 && zoom <= 3)) throw new Error(`${what}: zoom must be between 0.5 and 3`);
  await page.evaluate((z) => {
    [...document.body.children].forEach((el) => { if (el.id !== 'tt-root') el.style.zoom = String(z); });
  }, zoom);
}

// Drop the browser's HTTP cache so a page shown again after a publish loads fresh content.
async function clearCache(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await cdp.detach().catch(() => {});
}

// URLs `openUrl` may open: the site's app (spec.appUrl), this site's pages as JSON from the
// Structured Content API (sc-api) or its structured content documents (da-sc), or the site's own hosts.
function appOrJsonUrl(spec, url) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`openUrl: invalid URL ${JSON.stringify(url)}`); }
  const app = spec.appUrl && new URL(spec.appUrl);
  const okApp = app && u.origin === app.origin && u.pathname.startsWith(app.pathname);
  const okJson = ['https://da-sc.adobeaem.workers.dev', 'https://sc-api.adobeaem.workers.dev'].includes(u.origin)
    && new RegExp(`^/(live|preview)/${spec.org}/${spec.site}(/[a-z0-9][a-z0-9_-]*)+(\\.json)?$`).test(u.pathname)
    && !u.username && !u.password;
  if (okApp || okJson) return u.toString();
  return allowedUrl(spec, url); // throws unless it's one of the site's hosts
}

async function siteAuthenticated(page, origin) {
  return page.evaluate(async (o) => {
    try {
      const r = await fetch(`${o}/auth/session`, { credentials: 'include', redirect: 'manual' });
      return r.ok && (await r.json()).authenticated === true;
    } catch { return false; }
  }, origin).catch(() => false);
}

// Actions that use step.hold themselves; record.mjs must not wait for it again.
export const OWN_HOLD = new Set(['titleCard', 'endCard', 'caption']);

const cardHtml = ({ kicker = '', title = '', items = [] }) => `${kicker ? `<p>${escapeHtml(kicker)}</p>` : ''}<h1>${escapeHtml(title)}</h1>${
  items.length ? `<ol>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>` : ''}`;

export const actions = {
  async titleCard({ t, run }, { kicker, title, items, hold = 5000 }) {
    await t.card(cardHtml({ kicker, title, items }));
    if (run.trimStart === undefined) run.trimStart = (Date.now() - run.startedAt) / 1000 + 0.3;
    await t.wait(hold);
    await t.card('');
    await t.wait(600);
  },

  // Closing card: stays on screen until the recording ends.
  async endCard({ t }, { kicker, title, items, hold = 4500 }) {
    await t.caption('');
    await t.card(cardHtml({ kicker, title, items }));
    await t.wait(hold);
  },

  async caption({ t }, { hold = 2500 }) { await t.wait(hold); },

  async wait({ t }, { ms = 1000 }) { await t.wait(ms); },

  // Always the spec's folder: record.mjs checks the page name there before anything is created.
  async openFolder({ page, spec }) {
    await page.goto(`https://da.live/#/${spec.org}/${spec.site}${spec.folder}`);
    await page.getByRole('button', { name: 'New', exact: true }).waitFor({ timeout: 30000 });
  },

  // Always run.pageName: the name record.mjs checked (with the -test- suffix in test takes).
  async createPage(ctx) {
    const { page, t } = ctx;
    const name = ctx.run.pageName;
    await t.click(page.getByRole('button', { name: 'New', exact: true }));
    await t.wait(500);
    await t.click(page.getByRole('menuitem', { name: 'Page' }));
    await t.wait(500);
    await t.click(page.getByRole('textbox', { name: 'Name' }));
    await t.type(name);
    await t.wait(500);
    await t.click(page.getByRole('button', { name: 'Create' }));
    await page.waitForURL('**/canvas**', { timeout: 30000 });
    await page.getByRole('button', { name: 'Layout', exact: true }).waitFor({ timeout: 30000 });
    await t.restoreCursor();
    await t.wait(2000);
  },

  async view({ page, t }, { mode = 'layout' }) {
    const name = { layout: 'Layout', content: 'Content', split: 'Split view' }[mode];
    if (!name) throw new Error(`view: unknown mode "${mode}"`);
    await t.click(page.getByRole('button', { name, exact: true }));
    await t.wait(mode === 'split' ? 2000 : 1200);
  },

  async openPanel(ctx, { name }) {
    const { page, t } = ctx;
    await ensureToolsPanel(ctx);
    const pinned = page.getByRole('navigation', { name: 'Pinned panels' }).getByRole('button', { name, exact: true });
    if (await pinned.isVisible()) { await t.click(pinned); return; }
    await t.click(page.getByRole('button', { name: 'Panels' }));
    await t.wait(700);
    await t.click(page.getByRole('option', { name, exact: true }));
    await t.wait(500);
    await t.press('Escape');
    await t.wait(800);
  },

  async addTemplate(ctx, { name }) {
    const { page, t } = ctx;
    const row = page.getByRole('listitem').filter({ has: page.getByRole('button', { name, exact: true }) });
    if (!(await row.first().isVisible())) await actions.openPanel(ctx, { name: 'Templates' });
    await t.hover(row.getByRole('button', { name, exact: true }));
    await t.wait(500);
    await t.click(row.getByRole('button', { name: 'Add' }));
    await layout(page).locator('main').first().waitFor({ timeout: 20000 });
    await t.wait(2500);
  },

  // Content view: click just below the last block so the next insert goes at the end of the page.
  // (A block added right after another one replaces it, because the new block stays selected.)
  async cursorToEnd({ page, t }) {
    const last = page.locator('.ProseMirror > *:last-child').first();
    // Bring the block's bottom edge (where we click) into view, even when the block is taller than the
    // screen, then scroll a little further so there is space below it (at the end of the document the
    // editor's bottom padding provides it).
    await last.evaluate((n) => n.scrollIntoView({ block: 'end' }));
    const editorBox = await page.locator('.ProseMirror').first().boundingBox();
    await page.mouse.move(Math.round(editorBox.x + editorBox.width / 2), 450);
    await page.mouse.wheel(0, 300);
    await t.wait(600);
    const b = await last.boundingBox();
    const editor = await page.locator('.ProseMirror').first().boundingBox();
    const viewport = page.viewportSize();
    const y = Math.round(Math.min(b.y + b.height + 24, editor.y + editor.height - 4, viewport.height - 8));
    if (y <= b.y + b.height) throw new Error('cursorToEnd: no room below the last block to click');
    await t.clickAt(Math.round(b.x + b.width / 2), y);
    await t.wait(500);
    // The caret must now be outside the last block, or the next insert would replace or nest in it.
    const inside = await last.evaluate((n) => {
      const sel = n.ownerDocument.getSelection();
      return !!sel.anchorNode && n.contains(sel.anchorNode);
    });
    if (inside) throw new Error('cursorToEnd: caret is still inside the last block');
  },

  // Blocks panel: search, pick the variant, then its "Add … to page" button.
  async addBlock(ctx, { search, name }) {
    const { page, t } = ctx;
    const box = page.getByRole('searchbox', { name: 'Search blocks' });
    if (!(await box.isVisible())) await actions.openPanel(ctx, { name: 'Blocks' });
    const clear = page.getByRole('button', { name: 'Clear search' });
    if (await clear.isVisible()) { await t.click(clear); await t.wait(300); }
    await t.click(box);
    await t.type(search, 110);
    await t.wait(600);
    // A block with one variant has a group and a variant of the same name (e.g. Search): take the variant.
    const named = page.getByRole('button', { name, exact: true });
    const variant = named.and(page.locator('.ext-variant-title'));
    await t.click((await variant.count()) ? variant.first() : named);
    await t.wait(400);
    await t.click(page.getByRole('button', { name: `Add ${name} to page` }));
    await t.wait(1800);
  },

  // Layout view: scroll the rendered page to a block (by its block class, e.g. "cards") and point at it.
  // Uses the last one on the page: blocks a tutorial adds go at the end.
  async showBlock({ page, t }, { block }) {
    if (!/^[a-z0-9-]+$/.test(block)) throw new Error(`showBlock: invalid block name "${block}"`);
    const el = layout(page).locator(`div.${block}`).last();
    await el.waitFor({ timeout: 20000 });
    await el.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.wait(1500);
    await t.hover(el);
  },

  async scroll({ page, t }, { by = [500, 500, -1000], x = 540, y = 500 }) {
    await t.moveTo(x, y);
    for (const dy of by) {
      await page.mouse.wheel(0, dy);
      await t.wait(1300);
    }
  },

  // Replace one word: double-click it and type. `in` is text that identifies the element.
  async editText({ page, t }, {
    where = 'content', in: inText, word, with: replacement, nth = 0,
  }) {
    const el = await docText(page, where, inText, nth);
    let p = await wordPoint(el, word);
    if (where === 'layout') {
      // In Layout view the first click only puts the block into edit mode.
      await t.clickAt(p.x, p.y, { pause: 400 });
      await t.wait(900);
      p = await wordPoint(el, word);
    }
    const selected = () => el.evaluate((n) => n.ownerDocument.getSelection().toString().trim());
    await t.clickAt(p.x, p.y, { clickCount: 2 });
    await t.wait(400);
    if ((await selected()) !== word) { await page.mouse.dblclick(p.x, p.y); await t.wait(400); }
    const got = await selected();
    if (got !== word) throw new Error(`editText: selected "${got}", expected "${word}"`);
    await t.wait(300);
    await t.type(replacement, 110);
    await t.wait(900);
  },

  async hover({ page, t }, { where = 'content', text }) {
    const el = await docText(page, where, text);
    await el.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.wait(900);
    await t.hover(el);
  },

  async click({ page, t }, { role = 'button', name, text }) {
    const el = text ? page.getByText(text, { exact: true }).first() : page.getByRole(role, { name, exact: true });
    // Check what would really be clicked (its control's label), not just the words in the spec.
    const label = await el.evaluate((n) => {
      const c = n.closest('button, a, [role="button"], [role="menuitem"], [role="radio"], [role="option"]') || n;
      return `${c.getAttribute('aria-label') || ''} ${c.textContent || ''}`;
    });
    if (DEPLOY.test(`${name || ''} ${text || ''} ${label}`)) throw new Error(`click: "${name || text}" is a Send/Preview/Publish control; use the preview action`);
    await t.click(el);
    await t.wait(800);
  },


  // Type into a field of the page in front (a site's search box or form): found by its label or
  // accessible name, clicked, cleared, typed. `submit` presses Enter afterwards.
  // Test takes don't preview, so a field that only exists on the preview page is skipped there.
  // `exact: false` matches labels with extras, such as a required field's asterisk.
  async fillField({ page, t, run }, { label, role = 'textbox', text, submit = false, exact = true }) {
    if (!label || typeof text !== 'string') throw new Error('fillField: give "label" and "text"');
    if (!['textbox', 'searchbox', 'combobox'].includes(role)) throw new Error('fillField: role is textbox, searchbox or combobox');
    if (DEPLOY.test(label)) throw new Error(`fillField: "${label}" names a Send/Preview/Publish control`);
    const byRole = page.getByRole(role, { name: label, exact });
    const el = byRole.or(page.getByLabel(label, { exact })).filter({ visible: true }).first();
    try {
      await el.waitFor({ timeout: run.noPreview ? 5000 : 20000 });
    } catch (e) {
      if (run.noPreview) return;
      throw new Error(`fillField: no visible field "${label}"`);
    }
    // Only ever click something that takes text: never a button or link that shares the label.
    if (!(await el.isEditable())) throw new Error(`fillField: "${label}" is not an editable field`);
    await el.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.wait(700);
    await t.click(el);
    await el.fill('');
    await t.type(text, 90);
    await t.wait(500);
    if (submit) { await t.press('Enter'); await page.waitForLoadState('networkidle').catch(() => {}); }
    await t.wait(900);
  },

  // Content view: add a row to a table by pressing Tab in its last cell, then type the cells.
  // `after` is the exact text of that last cell (e.g. "article" in metadata, "prose" in section metadata).
  async addRow({ page, t }, { after, cells }) {
    if (!after || !Array.isArray(cells) || !cells.length) throw new Error('addRow: needs "after" and "cells"');
    const cell = page.locator('.ProseMirror td').filter({ hasText: new RegExp(`^\\s*${after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) });
    if ((await cell.count()) !== 1) throw new Error(`addRow: ${await cell.count()} cells read "${after}", need exactly 1`);
    const table = cell.locator('xpath=ancestor::table[1]');
    const rows = await table.locator('tr').count();
    await cell.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.wait(900);
    const b = await cell.boundingBox();
    await t.clickAt(Math.round(b.x + b.width - 24), Math.round(b.y + b.height / 2));
    await t.press('End');
    const isLast = await cell.evaluate((td) => !td.nextElementSibling && !td.parentElement.nextElementSibling);
    if (!isLast) throw new Error(`addRow: "${after}" is not the last cell of its table`);
    await t.wait(300);
    await t.press('Tab');
    await t.wait(500);
    if ((await table.locator('tr').count()) !== rows + 1) throw new Error('addRow: Tab did not add a row');
    for (const [i, text] of cells.entries()) {
      if (i) { await t.press('Tab'); await t.wait(300); }
      await t.type(text, 100);
    }
    await t.wait(700);
  },

  // Preview page of a gated page: open the floating AUTH STATE panel and switch audience.
  // It needs a real preview: a test take without --preview stays in the editor, so it stops here.
  async previewAs({ page, t, run }, { audience }) {
    const label = { authenticated: 'Switch to Authenticated', anonymous: 'Switch to Anonymous' }[audience];
    if (!label) throw new Error('previewAs: audience is "authenticated" or "anonymous"');
    if (run.noPreview) throw new Error('previewAs needs the previewed page: record this test take with --test --preview');
    const handle = page.locator('button.auth-handle');
    await handle.waitFor({ timeout: 20000 }).catch(() => {
      throw new Error('previewAs: no AUTH STATE toggle (not a gated page on aem.page, or the page did not preview)');
    });
    await t.click(handle);
    await t.wait(700);
    const nav = page.waitForURL((u) => u.searchParams.get('auth') === String(audience === 'authenticated'), { timeout: 20000 });
    await t.click(page.getByRole('button', { name: label, exact: true }));
    await nav;
    await page.waitForLoadState('networkidle').catch(() => {});
    await t.restoreCursor();
    await t.wait(800);
  },

  // Open a page of this site (live site or aem.page/aem.live) in the recorded tab.
  // `until: { url, text }` first waits until that URL (same allowed hosts) serves the text, and
  // `fresh` drops the browser cache: use both when showing a page again after a publish.
  // `created: true` visits the preview of the page this take created (instead of `url`); its `until`
  // then needs only `text`.
  async visit({ page, t, spec, run }, {
    url, until, fresh, zoom, created = false,
  }) {
    if (created && !run.pageName) throw new Error('visit: this take created no page');
    const own = created ? `https://main--${spec.site}--${spec.org}.aem.page${spec.folder}/${run.pageName}` : null;
    const target = allowedUrl(spec, own || url);
    // Test takes don't preview or publish, so there is nothing new to wait for.
    if (until && !run.test) await waitServed(t, run, allowedUrl(spec, own || until.url), String(until.text || ''), until.bust !== false);
    if (fresh) await clearCache(page);
    await page.goto(target);
    await page.waitForLoadState('networkidle').catch(() => {});
    await zoomContent(page, zoom, 'visit');
    await t.restoreCursor();
    await t.wait(600);
  },

  // Start the live site signed out, even if the profile holds an old session. Run before `visit`.
  async signedOut({ page, spec }) {
    const host = new URL(spec.siteOrigin).hostname;
    await page.context().clearCookies({ domain: host });
    // The Web SDK and Target (identity, QA mode) set theirs on the parent domain: a new visitor again.
    const parent = host.split('.').slice(-2).join('.');
    if (parent !== host) {
      await page.context().clearCookies({ domain: `.${parent}` });
      await page.context().clearCookies({ domain: `.${host}` });
    }
    // Old copies of signed-in pages in the profile's HTTP cache would otherwise leak into the take.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
  },

  // Click the page's sign-in link, type a display name in the site's demo login form and continue;
  // the form sends the visitor back to the page they came from.
  async signIn({ page, t, spec }, { text, name = 'Alex Rivera' }) {
    const link = page.getByRole('link', { name: text }).first(); // substring: links may carry an icon
    await t.click(link);
    const field = page.getByRole('textbox', { name: 'Display name' });
    await field.waitFor({ timeout: 30000 });
    await t.restoreCursor();
    await t.wait(700);
    await t.click(field);
    await t.type(name, 90);
    await t.wait(400);
    const back = page.waitForURL((u) => !u.pathname.startsWith('/auth/'), { timeout: 30000 });
    await t.click(page.getByRole('button', { name: 'Continue' }));
    await back;
    await page.waitForLoadState('networkidle').catch(() => {});
    if (!(await siteAuthenticated(page, spec.siteOrigin))) throw new Error('signIn: the site does not report a session after the login form');
    await t.restoreCursor();
    await t.wait(800);
  },


  // Open an existing page of the site in the editor (Layout view first, as da.live does).
  // Open a sheet (spreadsheet document, e.g. a form definition) in Experience Workspace's sheet editor.
  async openSheet({ page, t, spec }, { path }) {
    if (!/^(\/[a-z0-9][a-z0-9_-]*)+$/.test(path || '')) throw new Error(`openSheet: invalid path ${JSON.stringify(path)}`);
    await page.goto(`https://da.live/sheet#/${spec.org}/${spec.site}${path}`);
    // The sheet editor keeps hidden tables around: wait for a visible cell with content.
    await page.locator('table td').filter({ hasText: /\S/ }).filter({ visible: true }).first().waitFor({ timeout: 60000 });
    await t.restoreCursor();
    await t.wait(2000);
  },

  // `created: true` reopens the page this take created (e.g. back from its preview to edit again).
  async openPage({ page, t, spec, run }, { path: given, created = false }) {
    const path = created ? `${spec.folder}/${run.pageName}` : given;
    if (created && !run.pageName) throw new Error('openPage: this take created no page');
    if (!/^(\/[a-z0-9][a-z0-9_-]*)+$/.test(path || '')) throw new Error(`openPage: invalid path ${JSON.stringify(path)}`);
    await page.goto(`https://da.live/canvas#/${spec.org}/${spec.site}${path}`);
    await page.getByRole('button', { name: 'Layout', exact: true }).waitFor({ timeout: 60000 });
    await t.restoreCursor();
    await t.wait(2500);
  },

  // Content view: click at the end of the document and type a line (e.g. a heading on a new page).
  // `style` "h1".."h3" then selects the line and picks the heading in the formatting toolbar's
  // block menu (Paragraph › Heading N), as an author does; the editor has no Markdown shortcuts.
  async typeText({ page, t }, { text, style, enter = true }) {
    if (typeof text !== 'string' || !text) throw new Error('typeText: give "text"');
    if (style && !/^h[1-3]$/.test(style)) throw new Error('typeText: style is h1, h2 or h3');
    const doc = page.locator('.ProseMirror').first();
    await doc.waitFor({ timeout: 20000 });
    await t.click(doc);
    await t.press('ControlOrMeta+End');
    await t.wait(300);
    await t.type(text, 80);
    await t.wait(400);
    if (style) {
      const line = doc.getByText(text, { exact: true }).last();
      await line.click({ clickCount: 3 });
      await t.wait(600);
      const menu = page.getByRole('button', { name: 'Paragraph' }).filter({ visible: true }).first();
      await t.click(menu);
      await t.wait(500);
      // The block menu is a listbox: each choice is a button with role "option".
      const label = `Heading ${style[1]}`;
      const item = page.getByRole('option', { name: label, exact: true })
        .or(page.getByRole('button', { name: label, exact: true })).filter({ visible: true }).first();
      await t.click(item);
      await t.wait(500);
      const tag = await doc.getByText(text, { exact: true }).last().evaluate((n) => n.closest('h1,h2,h3,p')?.tagName);
      if (tag !== style.toUpperCase()) throw new Error(`typeText: the line is ${tag}, not ${style}`);
      await t.press('End');
    }
    if (enter) await t.press('Enter');
    await t.wait(700);
  },

  // Media Library dialog (Panels › Media Library): search, open an image's details, optionally show
  // its Metadata tab (References shows first), then Insert into the document at the cursor.
  async pickMedia({ page, t }, { search, name, metadata = false, holdDetails = 2500 }) {
    if (!name) throw new Error('pickMedia: give the image file "name", e.g. com-sun.jpg');
    const before = await page.locator('.ProseMirror img').count();
    const f = page.frameLocator('iframe[src*="/plugins/media-library/"]');
    const box = f.getByRole('combobox', { name: 'Search media' });
    await box.waitFor({ timeout: 30000 });
    if (search) {
      await t.click(box);
      await box.pressSequentially(search, { delay: 110 });
      await t.wait(1500);
    }
    await t.click(f.getByRole('button', { name: `View details for ${name}`, exact: true }).first());
    await f.getByRole('heading', { name, exact: true }).waitFor({ timeout: 20000 });
    await t.wait(holdDetails); // the References tab: every page that uses this image
    if (metadata) {
      await t.click(f.getByRole('button', { name: 'Metadata', exact: true }));
      await t.wait(holdDetails);
    }
    await t.click(f.getByRole('button', { name: 'Insert into document' }));
    await f.locator('body').waitFor({ state: 'detached', timeout: 20000 })
      .catch(() => { throw new Error('pickMedia: the Media Library dialog did not close after Insert'); });
    await t.wait(1200);
    if ((await page.locator('.ProseMirror img').count()) <= before) throw new Error(`pickMedia: ${name} was not inserted`);
  },

  // AEM Assets side panel (open it with openPanel "AEM Assets"), Content view: drags the asset card
  // `name` (file name, e.g. image8.jpg) into the document below its last paragraph. The panel is
  // DA's assets rail: no Select button, assets are dropped. Fails unless one more image arrived.
  async dragAsset({ page, t }, { name, search }) {
    if (!name) throw new Error('dragAsset: give the asset file "name", e.g. image8.jpg');
    const f = page.frameLocator('iframe[src*="CQ-assets-selectors"]');
    if (search) {
      const box = f.getByRole('searchbox').first();
      await t.click(box);
      await box.pressSequentially(search, { delay: 110 });
      await t.press('Enter');
      await t.wait(2500);
    }
    const card = f.getByRole('gridcell', { name: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first();
    await card.waitFor({ timeout: 30000 });
    await card.scrollIntoViewIfNeeded();
    await t.wait(600);
    const before = await page.locator('.ProseMirror img').count();
    const from = await card.boundingBox();
    const to = await page.locator('.ProseMirror > *').last().boundingBox();
    await t.moveTo(Math.round(from.x + from.width / 2), Math.round(from.y + Math.min(70, from.height / 3)));
    await t.wait(300);
    await page.mouse.down();
    await t.moveTo(Math.round(to.x + Math.min(160, to.width / 2)), Math.round(to.y + to.height + 12), 1200);
    await t.wait(300);
    await page.mouse.up();
    // the editor lives in shadow DOM: count with a locator, not document.querySelectorAll
    let dropped = false;
    for (let i = 0; i < 40 && !dropped; i += 1) {
      await t.wait(500);
      dropped = (await page.locator('.ProseMirror img').count()) > before;
    }
    if (!dropped) throw new Error(`dragAsset: ${name} was not dropped into the document`);
    await t.wait(700);
  },

  // Layout view: clicks the `nth` image of the page, Replace image › AEM Assets, picks `name`,
  // Select. Fails unless the image in the page changed.
  async replaceImage({ page, t }, { name, nth = 0, holdDetails = 1800 }) {
    if (!name) throw new Error('replaceImage: give the asset file "name", e.g. image5.jpg');
    const frame = page.frameLocator('iframe[src*="preview.da.live"]');
    const img = frame.locator('main img').nth(nth);
    await img.waitFor({ timeout: 20000 });
    await img.scrollIntoViewIfNeeded();
    const srcBefore = await img.getAttribute('src');
    await t.click(img);
    await t.click(page.getByRole('button', { name: 'Replace image' }));
    await t.wait(500);
    await t.click(page.getByRole('menuitem', { name: 'AEM Assets' }).or(page.getByRole('option', { name: 'AEM Assets' })).first());
    // the side panel may hold a second selector: use the one in the modal
    const f = page.getByRole('dialog').frameLocator('iframe[src*="CQ-assets-selectors"]');
    const card = f.getByRole('gridcell', { name: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first();
    await card.waitFor({ timeout: 30000 });
    await t.click(card);
    await t.wait(holdDetails); // Quick details: path, status, size, color scheme
    await t.click(f.getByRole('button', { name: 'Select', exact: true }));
    let replaced = false;
    for (let i = 0; i < 40 && !replaced; i += 1) {
      await t.wait(500);
      const src = await frame.locator('main img').nth(nth).getAttribute('src').catch(() => srcBefore);
      replaced = src !== srcBefore;
    }
    if (!replaced) throw new Error(`replaceImage: the image was not replaced with ${name}`);
    await t.wait(1500);
  },

  // Prepare menu (…) › Schedule Publish: types a date `days` ahead at `time` (24 h, the browser's
  // time zone) and clicks Schedule, then shows the "Scheduled for …" confirmation and closes the dialog.
  // Any test take (also --test --preview) points at Schedule and closes the dialog: nothing is scheduled.
  async schedulePublish({ page, t, run }, { days = 2, time = '09:00', hold = 2500 }) {
    if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('schedulePublish: "time" is HH:MM, e.g. 09:00');
    await t.click(page.getByRole('button', { name: 'Open prepare menu' }));
    await t.wait(600);
    // by role: the step's own caption shows the words "Schedule Publish" too
    await t.click(page.getByRole('menuitem', { name: 'Schedule Publish' }));
    const input = page.locator('input[type="datetime-local"]').first();
    await input.waitFor({ timeout: 20000 });
    const box = await input.boundingBox();
    await t.clickAt(Math.round(box.x + 24), Math.round(box.y + box.height / 2)); // the year segment
    const d = new Date(Date.now() + days * 864e5);
    const two = (n) => String(n).padStart(2, '0');
    // the year segment takes up to six digits: move on to the month explicitly
    await t.type(String(d.getFullYear()), 110);
    await t.press('ArrowRight');
    await t.type(`${two(d.getMonth() + 1)}${two(d.getDate())}${time.replace(':', '')}`, 110);
    const button = page.getByRole('button', { name: 'Schedule', exact: true });
    for (let i = 0; i < 20 && await button.isDisabled(); i += 1) await t.wait(250);
    const b = await button.boundingBox();
    const at = [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
    const close = async () => {
      await t.wait(hold);
      // the close button is a web component too: click its position, Escape as a fallback
      const x = await page.getByRole('button', { name: /close/i }).last().boundingBox().catch(() => null);
      if (x) await t.clickAt(Math.round(x.x + x.width / 2), Math.round(x.y + x.height / 2));
      else await t.press('Escape');
      for (let i = 0; i < 20 && await input.isVisible().catch(() => false); i += 1) await t.wait(250);
      if (await input.isVisible().catch(() => false)) await t.press('Escape');
      await t.wait(600);
    };
    if (run.test) { await t.moveTo(...at); await close(); return; }
    // Schedule is a web component that Playwright's click never settles on: click with the mouse
    await t.clickAt(...at);
    await page.getByText(/Scheduled for/).first().waitFor({ timeout: 20000 })
      .catch(() => { throw new Error('schedulePublish: no "Scheduled for" confirmation'); });
    await close();
  },

  // Schedule Publish app (da.live/apps/scheduler) for this site: points at the row of the page this
  // take created; with `remove` it clicks that row's Delete (no confirmation) and waits until it is gone.
  // Test takes schedule nothing, so they only show the app.
  async schedulerApp({ page, t, spec, run }, { remove = false, hold = 2500 }) {
    await page.goto(`https://da.live/apps/scheduler#/${spec.org}/${spec.site}`);
    await page.getByRole('heading', { name: 'Schedule Publish' }).waitFor({ timeout: 60000 });
    await t.restoreCursor();
    if (run.test || !run.pageName) { await t.wait(2500); return; }
    const item = page.getByText(`${spec.folder}/${run.pageName}`, { exact: true }).first();
    await item.waitFor({ timeout: 30000 })
      .catch(() => { throw new Error(`schedulerApp: ${spec.folder}/${run.pageName} is not scheduled`); });
    await t.hover(item);
    await t.wait(hold);
    if (!remove) return;
    // Delete buttons sit in shadow DOM: take the one on the same row as the item
    const row = await item.boundingBox();
    const boxes = await page.getByText('Delete', { exact: true }).evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }));
    const del = boxes.find((c) => Math.abs(c.y - (row.y + row.height / 2)) < 40);
    if (!del) throw new Error('schedulerApp: no Delete button on the page\'s row');
    await t.clickAt(Math.round(del.x), Math.round(del.y));
    for (let i = 0; i < 40 && await item.count(); i += 1) await t.wait(250);
    if (await item.count()) throw new Error('schedulerApp: the schedule was not deleted');
    await t.wait(1500);
  },

  // Fragment Picker dialog (Panels › Fragment Picker): search, preview a fragment, Insert.
  async pickFragment({ page, t }, { search, name }) {
    if (!name) throw new Error('pickFragment: give the fragment "name"');
    const f = page.frameLocator('iframe[src*="/plugins/fragments/"]');
    const box = f.getByLabel('Search fragments');
    await box.waitFor({ timeout: 30000 });
    if (search) {
      await t.click(box);
      await box.pressSequentially(search, { delay: 110 });
      await t.wait(900);
    }
    const item = f.getByRole('button', { name: `Preview fragment "${name}"` }).first();
    await t.click(item);
    await t.wait(2500); // the fragment renders in the preview pane
    const insert = f.getByRole('button', { name: /^Insert/ }).first(); // its name changes once a fragment is selected
    await t.click(insert);
    await f.locator('body').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    await t.wait(1200);
  },

  // Coworker on experience.adobe.com. `url` must be a Coworker URL (#/@ccs/coworker/...).
  // Prepare › Send to Adobe Target for the open page or fragment: shows the offer-name dialog,
  // types `name` for a new offer (an existing one keeps its name) and clicks Create offer or
  // Update offer. The page is previewed and sent to Target as an HTML offer. Test takes point at
  // the button and close the dialog without sending.
  async sendToTarget({ page, t, run }, { name, hold = 2200 }) {
    await t.click(page.getByRole('button', { name: 'Open prepare menu' }));
    await t.wait(600);
    await t.click(page.getByRole('menuitem', { name: 'Send to Adobe Target' }));
    const field = page.getByRole('textbox', { name: 'Target Offer name' });
    await field.waitFor({ timeout: 20000 });
    const create = page.getByRole('button', { name: 'Create offer' });
    const update = page.getByRole('button', { name: 'Update offer' });
    await create.or(update).first().waitFor({ timeout: 20000 });
    // The dialog shows Create offer while it still looks up an existing offer: give it a moment
    // to switch to Update offer.
    for (let i = 0; i < 16 && !(await update.isVisible().catch(() => false)); i += 1) await t.wait(500);
    const isNew = !(await update.isVisible().catch(() => false));
    if (isNew) {
      if (!name) throw new Error('sendToTarget: a new offer needs "name"');
      await t.click(field);
      await t.type(name, 45);
    }
    await t.wait(hold);
    const button = isNew ? create : update;
    // Shoelace buttons: click with the mouse at the center.
    const b = await button.boundingBox();
    const at = [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
    if (run.test) {
      await t.moveTo(...at);
      await t.wait(1200);
      await t.press('Escape');
      await t.wait(600);
      return;
    }
    await t.clickAt(...at);
    // The dialog closes once the offer is saved in Target.
    for (let i = 0; i < 60 && await field.isVisible().catch(() => false); i += 1) await t.wait(500);
    if (await field.isVisible().catch(() => false)) throw new Error('sendToTarget: the dialog is still open after 30 s');
    await t.wait(800);
  },

  // Sign the AEM Sidekick in (spec `sidekick: true`). Its token lives in session storage, so every
  // take signs in again; with the profile signed in to Adobe it completes on its own. Run hidden,
  // on a page of the site.
  async sidekickSignIn({ page, t }) {
    const sk = page.locator('aem-sidekick');
    await sk.waitFor({ state: 'attached', timeout: 20000 })
      .catch(() => { throw new Error('sidekickSignIn: no Sidekick on the page (spec needs "sidekick": true)'); });
    const text = () => sidekickText(page);
    for (let i = 0; i < 10 && !(await text()); i += 1) await t.wait(500);
    const signIn = sk.getByRole('button', { name: 'Sign in', exact: true });
    if (await signIn.isVisible().catch(() => false)) await signIn.click();
    for (let i = 0; i < 60; i += 1) {
      if (!/Sign in|Signing in|Loading/.test(await text())) return;
      await t.wait(1000);
    }
    throw new Error('sidekickSignIn: the Sidekick did not finish signing in (sign the profile in to Adobe)');
  },

  // Click a Sidekick toolbar button by its label, e.g. "Update" (preview) or "Publish", and wait
  // until the Sidekick has finished: Update reloads the preview, Publish shows its confirmation.
  // Test takes point at the button and stop.
  async sidekickClick({ page, t, run }, { name, until, timeout = 60000 }) {
    if (!name) throw new Error('sidekickClick: give "name" (the button label, e.g. Update or Publish)');
    const button = page.locator('aem-sidekick').getByRole('button', { name, exact: true });
    await button.waitFor({ timeout: 20000 });
    for (let i = 0; i < 40 && await button.isDisabled().catch(() => false); i += 1) await t.wait(500);
    if (run.test) { await t.moveTo(...await center(button)); await t.wait(1200); return; }
    const before = page.url();
    await t.click(button);
    // `until`: text the page shows once done (e.g. the new page's heading). Otherwise wait for the
    // Sidekick to settle (no progress text) after a reload or its toast.
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await t.wait(1000);
      if (until) {
        if (await page.getByText(until).first().isVisible().catch(() => false)) break;
      } else if (!/ing\.\.\.|ing…/.test(await sidekickText(page)) && (page.url() !== before || Date.now() > deadline - timeout + 4000)) break;
    }
    if (until && !(await page.getByText(until).first().isVisible().catch(() => false))) {
      throw new Error(`sidekickClick: "${until}" did not appear after ${name}`);
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    await t.restoreCursor();
    await t.wait(800);
  },

  async openCoworker({ page, t }, { url = `${COWORKER}/chat` }) {
    if (!String(url).startsWith(`${COWORKER}`)) throw new Error(`openCoworker: ${url} is not a Coworker URL (${COWORKER}/...)`);
    await page.goto(url);
    // Signing in passes through auth.services.adobe.com even with a session: judge only after waiting.
    await coworker(page).getByRole('textbox', { name: 'AI Prompt' }).waitFor({ timeout: 60000 }).catch((e) => {
      if (/auth\.services\.adobe\.com|adobelogin\.com/.test(page.url())) throw new Error('openCoworker: the recorder profile is signed out of experience.adobe.com');
      throw e;
    });
    await t.restoreCursor();
    await t.wait(1500);
  },

  // Delete every chat in Coworker's history (a hidden setup step, so Chats opens empty).
  // It deletes ALL of the signed-in user's chats, test takes included, so it only runs when the
  // person recording opts in with TUTORIAL_CLEAR_COWORKER_CHATS=yes (best on a recording account).
  async coworkerClearChats({ page, t }) {
    if (process.env.TUTORIAL_CLEAR_COWORKER_CHATS !== 'yes') {
      throw new Error('coworkerClearChats deletes every chat in your Coworker history (test takes too). '
        + 'Rerun with TUTORIAL_CLEAR_COWORKER_CHATS=yes if that is fine for this account, or remove the step from the spec.');
    }
    const f = coworker(page);
    await f.getByRole('link', { name: 'Chats', exact: true }).click();
    const more = f.getByRole('button', { name: /^More actions for / });
    // Wait for the history to load: chats, or its empty state.
    await more.first().or(f.getByText('No conversations yet').first()).waitFor({ timeout: 30000 });
    await t.wait(1500);
    for (let i = 0; i < 50; i += 1) {
      const n = await more.count();
      if (!n) break;
      // The last ones are in the history list; the sidebar's copies sit under their rows.
      await t.click(more.last());
      const del = f.getByRole('menuitem', { name: 'Delete' });
      // The list refreshes a moment after a delete: a stale row opens no menu, so look again.
      if (!(await del.waitFor({ timeout: 4000 }).then(() => true, () => false))) { await t.wait(1000); continue; }
      await t.wait(700); // the menu animates in and re-renders its items
      await del.click();
      const dialog = f.locator('[role=dialog],[role=alertdialog]');
      await dialog.first().waitFor({ timeout: 3000 }).catch(() => {});
      if (await dialog.count()) await dialog.getByRole('button', { name: /^Delete/ }).last().click();
      for (let w = 0; w < 20 && await more.count() >= n; w += 1) await t.wait(500);
    }
    if (await more.count()) throw new Error('coworkerClearChats: chats are left in the history');
  },

  // Open a Content Fragment in AEM's Content Fragment editor (Experience Cloud), by its DAM path.
  // The AEM author comes from the spec's "aemAuthor"; `until` is text that shows once it loaded.
  async openCfEditor({ page, t, spec }, { path, until }) {
    if (!spec.aemAuthor) throw new Error('openCfEditor: the spec needs "aemAuthor"');
    if (!/^\/content\/dam(\/[a-z0-9][a-z0-9_-]*)+$/.test(path || '')) throw new Error(`openCfEditor: invalid path ${JSON.stringify(path)}`);
    await page.goto(`https://experience.adobe.com/?repo=${spec.aemAuthor}#/@ccs/aem/cf/editor/editor${path}`);
    // the Experience Cloud shell loads the editor in an iframe: look in every frame
    for (let waited = 0; until; waited += 1000) {
      const shown = await Promise.all(page.frames().map((f) => f.getByText(until).first()
        .isVisible().catch(() => false)));
      if (shown.includes(true)) break;
      if (waited > 90000) throw new Error(`openCfEditor: "${until}" didn't show`);
      await t.wait(1000);
    }
    await t.restoreCursor();
    await t.wait(2000);
  },

  // A control of Coworker's own UI, e.g. "Chats" or "New chat" in its sidebar.
  async coworkerClick({ page, t }, { name }) {
    const f = coworker(page);
    await t.click(f.getByRole('button', { name, exact: true }).or(f.getByRole('link', { name, exact: true })).first());
    await t.wait(1200);
  },

  // Type a prompt into Coworker and wait for the answer. The wait plays back fast-forwarded
  // (about `fast` seconds), then the answer is shown.
  async coworkerAsk({ page, t, run }, { text, fast = 4, typeDelay = 35 }) {
    if (!text) throw new Error('coworkerAsk: give "text"');
    const f = coworker(page);
    const answers = f.getByRole('button', { name: 'Copy message' });
    const before = await answers.count();
    await t.click(f.getByRole('textbox', { name: 'AI Prompt' }));
    await t.type(text, typeDelay);
    await t.wait(500);
    await t.press('Enter');
    // Coworker sometimes asks to confirm with a form (fields filled in, Cancel / Submit) before it acts:
    // show the form, Submit it as filled in, and keep waiting.
    // ...or asks permission for the operations it is about to run: "Approve All" for several,
    // "Approve <tool name>" (a check mark) for one.
    // With several operations a single check mark only selects it: Approve All sends the answer.
    const approveAll = f.getByRole('button', { name: 'Approve All', exact: true });
    const approveOne = f.getByRole('button', { name: /^Approve \S+__/ });
    // ...or, in plan mode, shows its plan as to-dos with Approve / Revise.
    const approvePlan = f.getByRole('button', { name: 'Approve', exact: true });
    const submit = f.getByRole('button', { name: 'Submit', exact: true }).or(approveAll).or(approveOne).or(approvePlan);
    for (let round = 0; round < 8; round += 1) {
      const from = secs(run);
      await settle(t, {
        what: 'coworkerAsk',
        // Its stop control's name only contains "stop"; between tool calls it can pause for several seconds.
        busy: async () => !(await submit.first().isVisible().catch(() => false))
          && ((await answers.count()) <= before || (await f.getByRole('button', { name: /stop/i }).count()) > 0),
        size: () => f.locator('body').evaluate((b) => b.innerText.length),
        quiet: 10000,
        max: 300000,
      });
      (run.fast ||= []).push([from + 1, secs(run) - 1, fast]);
      await t.wait(800);
      if (!(await submit.first().isVisible().catch(() => false))) return;
      await submit.first().scrollIntoViewIfNeeded();
      await t.wait(1800);
      const target = (await approveAll.isVisible().catch(() => false)) ? approveAll
        : (await approveOne.last().isVisible().catch(() => false)) ? approveOne.last()
          : (await approvePlan.last().isVisible().catch(() => false)) ? approvePlan.last() : submit.first();
      // Approving lets Coworker write for real (Target activities, AEM fragments, pages): test takes
      // point at the button and stop there.
      if (run.test) { await t.hover(target); await t.wait(1200); return; }
      await t.click(target);
    }
    throw new Error('coworkerAsk: Coworker kept asking for input');
  },

  // Open a folder of this site in Experience Workspace's file browser, e.g. "/fragments/campaigns".
  async browse({ page, t, spec }, { path }) {
    if (!/^(\/[a-z0-9][a-z0-9_-]*)+$/.test(path || '')) throw new Error(`browse: invalid path ${JSON.stringify(path)}`);
    await page.goto(`https://da.live/#/${spec.org}/${spec.site}${path}`);
    await page.getByRole('button', { name: 'New', exact: true }).waitFor({ timeout: 30000 });
    await t.restoreCursor();
    await t.wait(1500);
  },

  // Open a page listed in the file browser (after `browse`) in the editor.
  async openItem({ page, t }, { name }) {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name || '')) throw new Error(`openItem: invalid name ${JSON.stringify(name)}`);
    // The chat panel on the left can link the same page (e.g. Coworker's answer): use the file list's.
    const links = page.getByRole('link', { name, exact: true });
    const pick = async () => {
      let best = 0; let bx = -1;
      for (let i = 0; i < await links.count(); i += 1) {
        const b = await links.nth(i).boundingBox().catch(() => null);
        if (b && b.x > bx) { bx = b.x; best = i; }
      }
      return links.nth(best);
    };
    const listed = async () => { const b = await (await pick()).boundingBox().catch(() => null); return !!b && b.x > 450; };
    // A page created a moment ago may not be listed yet: reload the folder for up to a minute.
    for (let i = 0; i < 6 && !(await listed()); i += 1) {
      for (let w = 0; w < 10 && !(await listed()); w += 1) await t.wait(500);
      if (!(await listed())) {
        await page.reload();
        await page.getByRole('button', { name: 'New', exact: true }).waitFor({ timeout: 30000 });
        await t.restoreCursor();
      }
    }
    const link = await pick();
    await t.click(link);
    await page.waitForURL(/da\.live\/(canvas|edit)#/, { timeout: 30000 });
    if (/\/edit#/.test(page.url())) await page.goto(page.url().replace('/edit#', '/canvas#'));
    await page.getByRole('button', { name: 'Layout', exact: true }).waitFor({ timeout: 60000 });
    await t.restoreCursor();
    await t.wait(2500);
  },

  // Fill a plugin field at once (no typing): for hidden setup steps, e.g. a long brief.
  async frameFill({ page, t }, { frame, label, text, role = 'textbox' }) {
    if (!label || typeof text !== 'string') throw new Error('frameFill: give "label" and "text"');
    await frameTarget(page, { frame, role, name: label }, 'frameFill').fill(text);
    await t.wait(300);
  },

  // Send the editor chat's draft (e.g. a brief from Workfront's "Copy to chat") and see it through:
  // questions the assistant asks get the option whose text is in `answers` (else the first option),
  // then Submit; write requests are approved (some writes need none: idle + quiet ends it).
  // `append` adds a line to the draft before sending; `text` types a new message instead. Waiting plays back fast-forwarded (about `fast` seconds
  // each time). Test takes stop at the first approval: nothing is written.
  async chatSend({ page, t, run }, { answers = [], fast = 4, hold = 1800, append = '', text = '' }) {
    if (!Array.isArray(answers)) throw new Error('chatSend: "answers" is a list of option texts');
    if (typeof append !== 'string') throw new Error('chatSend: "append" is text');
    const panel = page.getByRole('textbox', { name: /^Ask anything/ });
    if (!(await panel.isVisible())) throw new Error('chatSend: the chat panel is not open');
    // The chat lives in shadow DOM, which body.innerText doesn't include: measure text across shadow roots.
    const chat = { evaluate: () => page.evaluate(() => { let n = 0; const walk = (r) => { r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) { n += (e.shadowRoot.textContent || '').length; walk(e.shadowRoot); } }); }; n += document.body.innerText.length; walk(document); return n; }) };
    const submit = page.getByRole('button', { name: /^Submit/ });
    const approve = page.getByRole('button', { name: /^Approve/ });
    const stop = page.getByRole('button', { name: /^stop/i });
    if (typeof text !== 'string') throw new Error('chatSend: "text" is text');
    if (text) {
      // A new message instead of a draft from a plugin.
      await t.click(panel);
      await t.type(text, 30);
      await t.wait(600);
    }
    if (append) {
      // Add a line to the draft, e.g. to keep the assistant to one deliverable of a longer brief.
      await t.click(panel);
      // Ctrl+End doesn't reach a textarea's end on macOS: place the caret there directly.
      await panel.evaluate((e) => { e.focus(); e.setSelectionRange(e.value.length, e.value.length); e.scrollTop = e.scrollHeight; });
      await t.press('Shift+Enter');
      await t.press('Shift+Enter');
      await t.type(append, 30);
      await t.wait(600);
    }
    const sizeBefore = await chat.evaluate((b) => b.innerText.length).catch(() => -1);
    await t.click(page.getByRole('button', { name: 'Send', exact: true }));
    let from = secs(run);
    const ff = () => { (run.fast ||= []).push([from + 1, secs(run) - 0.5, fast]); };
    const start = Date.now();
    let last = -1;
    let since = Date.now();
    let approved = false;
    while (Date.now() - start < 900000) {
      await t.wait(1500);
      if (await submit.first().isVisible().catch(() => false)) {
        ff();
        await t.wait(hold);
        // The form's questions each list numbered options; pick the first of each, or the one named in answers.
        // One fieldset per question, its options radio labels ("1 Proceed / Write the drafted copy…"):
        // pick the option whose label starts with one of `answers`, else the first.
        const questions = page.locator('fieldset.question-fieldset').filter({ visible: true });
        if (!(await questions.count())) throw new Error('chatSend: no questions in the form');
        for (let q = 0; q < await questions.count(); q += 1) {
          const opts = questions.nth(q).locator('label.question-option');
          if (!(await opts.count())) continue;
          let pickN = 0;
          for (let o = 0; o < await opts.count(); o += 1) {
            const label = ((await opts.nth(o).locator('.question-option-label').textContent()) || '').replace(/^\s*\d+/, '').trim();
            if (answers.some((ans) => label.startsWith(ans))) { pickN = o; break; }
          }
          await t.click(opts.nth(pickN), { pause: 150 });
        }
        await t.wait(600);
        // Submitting lets the assistant go ahead and write: test takes point at it and stop.
        if (run.test) { await t.hover(submit.first()); await t.wait(1200); return; }
        await t.click(submit.first());
        from = secs(run);
        continue;
      }
      if (await approve.isVisible().catch(() => false)) {
        ff();
        await t.wait(hold);
        if (run.test) { await t.hover(approve); await t.wait(1200); return; }
        await t.click(approve);
        approved = true;
        from = secs(run);
        continue;
      }
      const n = await chat.evaluate((b) => b.innerText.length).catch(() => -1);
      // The chat box is disabled while the assistant works (its Send turns into a stop square).
      const working = await panel.isDisabled().catch(() => true);
      if (n !== last || working || await stop.count()) { last = n; since = Date.now(); continue; }
      // Done once the assistant is idle and its answer stopped growing: some writes need no approval.
      const answered = approved || Math.abs(n - sizeBefore) > 200;
      if (answered && Date.now() - since >= 6000) { ff(); await t.wait(800); return; }
    }
    throw new Error('chatSend: the assistant did not finish within 15 minutes');
  },

  // Close the editor's chat panel if the profile left it open (it shows the user's name and last
  // session). Plugins such as Workfront's "Copy to chat" open it again when the story needs it.
  async closeChat({ page, t }) {
    const close = page.getByRole('button', { name: 'Close chat panel', exact: true });
    if (await close.isVisible().catch(() => false)) { await close.click(); await t.wait(800); }
  },

  // Side-panel plugins (e.g. Workfront, opened with openPanel): point at, click or type into an element
  // inside the plugin's iframe. `frame` is part of the plugin URL. Target an element by `role` + `name`
  // (`exact: false` matches part of the name, e.g. a task card) or by visible `text`; `nth` picks a later match.
  async framePoint({ page, t }, step) {
    const el = frameTarget(page, step, 'framePoint');
    await el.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.wait(700);
    await t.hover(el);
  },

  // Test takes only point at controls that deploy, delete, send or activate something.
  async frameClick({ page, t, run }, step) {
    const el = frameTarget(page, step, 'frameClick');
    // Judge the control actually found (a partial name can match "Publish"), not just the spec's words.
    const found = run.test ? await el.evaluate((n) => `${n.getAttribute('aria-label') || ''} ${n.textContent || ''}`).catch(() => '') : '';
    if (run.test && /preview|publish|update|delete|send|activate/i.test(`${step.name || ''} ${step.text || ''} ${found}`)) {
      await el.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await t.hover(el);
      await t.wait(1200);
      return;
    }
    await frameMouseClick(t, el, 'frameClick');
    await t.wait(900);
  },

  // Types `text` into a field of the plugin, found by its label (`label`) like a role+name target.
  async frameType({ page, t }, {
    frame, label, text, role = 'textbox', exact = true, nth = 0,
  }) {
    if (!label || typeof text !== 'string') throw new Error('frameType: give "label" and "text"');
    await frameMouseClick(t, frameTarget(page, {
      frame, role, name: label, exact, nth,
    }, 'frameType'), 'frameType');
    await t.type(text, 70);
    await t.wait(600);
  },

  // Panels › <plugin> for library plugins that open as a full-size dialog (e.g. Request Publish).
  // Unlike openPanel it doesn't press Escape, which would close the dialog.
  async openPlugin(ctx, { name, frame }) {
    const { page, t } = ctx;
    if (!/^[a-z0-9-]+$/.test(frame || '')) throw new Error('openPlugin: "frame" is part of the plugin URL, e.g. "request-for-publish"');
    await ensureToolsPanel(ctx);
    await t.click(page.getByRole('button', { name: 'Panels' }));
    await t.wait(700);
    // Extension options carry an icon in their accessible name, so match by prefix.
    await t.click(page.getByRole('option', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) }).first());
    await page.frameLocator(`iframe[src*="${frame}"]`).locator('body').waitFor({ timeout: 30000 });
    await t.wait(2500);
  },

  // Request Publish dialog: type the note for the approver, then Request Publish.
  // Test takes (run.test, with or without --preview) point at the button and stop: no request, no email.
  async requestPublish({ page, t, run }, { note }) {
    if (typeof note !== 'string' || note.length < 10) throw new Error('requestPublish: give a "note" of 10+ characters');
    const f = page.frameLocator('iframe[src*="request-for-publish"]');
    const box = f.locator('textarea');
    await box.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.wait(900);
    await t.click(box);
    await t.type(note, 45);
    await t.wait(600);
    const submit = f.getByRole('button', { name: 'Request Publish', exact: true });
    if (run.test) { await t.hover(submit); await t.wait(1200); return; }
    // sl-button: its own inner wrapper "intercepts" Playwright's actionability check, so click through it.
    await t.hover(submit);
    await t.wait(350);
    await submit.click({ force: true });
    // The plugin previews the page first, then shows who was notified.
    await f.getByText(/notified|submitted|request (has been )?sent/i).first().waitFor({ timeout: 90000 });
    await t.wait(1500);
  },

  // Apps page › a site app card (e.g. "Manage Publish Requests").
  // With `listOnly`, only opens the Apps page (e.g. behind a title card).
  async openApp({ page, t, spec }, { name, listOnly = false }) {
    if (!page.url().startsWith('https://da.live/apps')) await page.goto(`https://da.live/apps#/${spec.org}/${spec.site}`);
    const title = page.getByText(name, { exact: true }).first();
    await title.waitFor({ timeout: 30000 });
    if (listOnly) { await t.restoreCursor(); await t.wait(800); return; }
    await title.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.restoreCursor();
    await t.wait(1200);
    // App cards (nx-action-card) have an "Open <name>" link. Apps hosted elsewhere open in a new tab
    // (target=_blank), which the recording can't follow: open those in the recorded tab instead.
    const link = page.getByRole('link', { name: `Open ${name}`, exact: true });
    if (await link.count() && await link.first().getAttribute('target') === '_blank') {
      await link.first().evaluate((n) => n.removeAttribute('target'));
      await t.click(link.first());
      await page.waitForLoadState('load');
      await page.waitForLoadState('networkidle').catch(() => {});
      await t.restoreCursor();
      await t.wait(3000);
      return;
    }
    let card = title;
    for (let i = 0; i < 4; i += 1) {
      card = card.locator('xpath=..');
      if (await card.locator('a, button').count()) break;
    }
    const open = card.locator('a, button').last();
    await t.click(await open.count() ? open : title);
    await page.frameLocator('iframe').first().locator('body').waitFor({ timeout: 30000 });
    await t.wait(3500);
  },

  // Publish Request Inbox: open Review on the request for exactly this page path
  // (each request is a details.inbox-item with its path in span.inbox-item-path).
  async reviewRequest({ page, t }, { path }) {
    const f = page.frameLocator('iframe').first();
    const label = f.locator('.inbox-item-path').getByText(path, { exact: true });
    await label.first().waitFor({ timeout: 40000 });
    if ((await label.count()) !== 1) throw new Error(`reviewRequest: ${await label.count()} requests for ${path}`);
    const row = f.locator('details.inbox-item').filter({ has: label });
    const review = row.getByText('Review', { exact: true });
    if ((await review.count()) !== 1) throw new Error('reviewRequest: no single Review link for that request');
    await t.hover(label);
    await t.wait(900);
    await t.click(review);
    await f.getByText('Publish Request Review').waitFor({ timeout: 30000 });
    if (!(await f.getByText(path, { exact: true }).count())) throw new Error(`reviewRequest: review opened for another page than ${path}`);
    await t.wait(1500);
  },

  // Review view: Approve & Publish (publishes the page). Only from the review view of `path`;
  // test takes point at the button and stop.
  async approvePublish({ page, t, run }, { path }) {
    const f = page.frameLocator('iframe').first();
    await f.getByText('Publish Request Review').waitFor({ timeout: 30000 });
    if (!(await f.getByText(path, { exact: true }).count())) throw new Error(`approvePublish: the open review is not for ${path}`);
    const approve = f.getByRole('button', { name: 'Approve & Publish', exact: true });
    if ((await approve.count()) !== 1) throw new Error('approvePublish: expected one "Approve & Publish" button in the review view');
    await approve.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.wait(900);
    if (run.test) { await t.hover(approve); await t.wait(1200); return; }
    await t.hover(approve);
    await t.wait(350);
    await approve.click({ force: true }); // sl-button, see requestPublish
    await f.getByText(/published|approved/i).first().waitFor({ timeout: 90000 });
    await t.wait(1500);
  },

  // Schema Editor app for this site, with one schema picked from its dropdown.
  async openSchema({ page, t, spec }, { schema }) {
    if (!/^[a-z0-9-]+$/.test(schema || '')) throw new Error('openSchema: give the schema id, e.g. "frescopa-app"');
    await page.goto(`https://da.live/apps/schema#/${spec.org}/${spec.site}`);
    const pick = page.locator('select').first();
    await pick.waitFor({ timeout: 40000 });
    await t.restoreCursor();
    await t.wait(1200);
    const ids = await pick.evaluate((s) => [...s.options].map((o) => o.value));
    if (!ids.includes(schema)) throw new Error(`openSchema: no schema "${schema}" (have ${ids.join(', ')})`);
    await t.click(pick, { pause: 300 }).catch(() => {}); // native dropdowns don't render in the video
    await t.press('Escape');
    await pick.selectOption(schema);
    await t.wait(1800);
  },

  // A structured content document in DA's form editor (generated from its schema).
  async openForm({ page, t, spec }, { path }) {
    if (!/^(\/[a-z0-9][a-z0-9_-]*)+$/.test(path || '')) throw new Error(`openForm: invalid path ${JSON.stringify(path)}`);
    await page.goto(`https://da.live/form#/${spec.org}/${spec.site}${path}`);
    await page.getByText('Outline', { exact: true }).first().waitFor({ timeout: 60000 });
    await t.restoreCursor();
    await t.wait(2500);
  },

  // Frescopa Studio (a DA app hosted by this site) on a structured content document.
  // DA asks once per session whether to trust the app; Continue is an sl-button (force click).
  async openStudio({ page, t, spec }, { path }) {
    if (!/^(\/[a-z0-9][a-z0-9_-]*)+$/.test(path || '')) throw new Error(`openStudio: invalid path ${JSON.stringify(path)}`);
    await page.goto(`https://da.live/app/${spec.org}/${spec.site}/tools/frescopa-studio/frescopa-studio#/${spec.org}/${spec.site}${path}`);
    await t.restoreCursor();
    const trust = page.getByRole('button', { name: 'Continue', exact: true });
    if (await trust.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
      await t.hover(trust);
      await t.wait(350);
      await trust.click({ force: true });
    }
    const studio = page.frameLocator('iframe[src*="frescopa-studio"]');
    await studio.locator('#publish').waitFor({ timeout: 60000 });
    await studio.frameLocator('iframe').first().locator('h1').first().waitFor({ timeout: 60000 });
    await t.wait(2500);
  },

  // Studio: replace one field's value (JSON pointer like /data/actions/0/label) and wait for the
  // app preview beside the form to show it.
  async studioEdit({ page, t }, { field, value, shows }) {
    if (!/^(\/[a-zA-Z0-9_-]+)+$/.test(field || '') || typeof value !== 'string' || !value) throw new Error('studioEdit: give "field" (JSON pointer) and "value"');
    const studio = page.frameLocator('iframe[src*="frescopa-studio"]');
    // Same id scheme as Studio's form.js: every character but letters and digits is escaped.
    const id = `field${field.replace(/[^a-z0-9]/gi, (c) => `_${c.charCodeAt(0).toString(16)}_`)}`;
    const input = studio.locator(`[id="${id}"]`);
    await input.waitFor({ timeout: 20000 });
    await input.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await t.wait(900);
    const old = await input.inputValue();
    await t.click(input);
    // Focus and select inside the nested frame directly: a page-level select-all or a click that
    // misses focus would send the typing to the page (spaces scroll it).
    await input.evaluate((n) => { n.focus(); n.select(); });
    await t.wait(400);
    await input.pressSequentially(value, { delay: 90 });
    if ((await input.inputValue()) !== value) throw new Error(`studioEdit: field reads "${await input.inputValue()}", expected "${value}"`);
    // The app beside the form re-renders from the draft: wait until the old value is gone from it.
    const app = studio.frameLocator('iframe').first();
    // Fields that aren't shown as text (a fragment path) name what the app shows instead.
    if (shows) {
      const shown = app.getByText(shows).first();
      await shown.waitFor({ timeout: 30000 });
      await t.wait(600);
      await shown.evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'center' })); // into the phone's view
      await t.wait(1400);
      return;
    }
    if (old && old !== value) {
      await app.getByText(old, { exact: true }).first().waitFor({ state: 'detached', timeout: 20000 });
    }
    await app.getByText(value, { exact: true }).first().waitFor({ timeout: 20000 });
    await t.wait(1200);
  },

  // Studio: Publish (previews, then publishes), then waits until the delivery endpoint serves the
  // edited value, so later steps show the published content. Test takes point at Publish and stop.
  async studioPublish({ page, t, run, spec }, { path, field, value }) {
    if (!/^(\/[a-z0-9][a-z0-9_-]*)+$/.test(path || '')) throw new Error('studioPublish: give the document "path"');
    // Only publish the document the spec names: check the open Studio is on it.
    if (!page.url().endsWith(`#/${spec.org}/${spec.site}${path}`)) throw new Error(`studioPublish: Studio is not open on ${path}`);
    const studio = page.frameLocator('iframe[src*="frescopa-studio"]');
    const publish = studio.locator('#publish');
    // Publish changes a live document, not a test page: never in a test take, even with --preview.
    if (run.test) { await t.hover(publish); await t.wait(1200); return; }
    await t.click(publish);
    await studio.getByText(/^Published /).first().waitFor({ timeout: 90000 });
    await t.wait(1200);
    if (!field) return;
    const url = `https://da-sc.adobeaem.workers.dev/live/${spec.org}/${spec.site}${path}`;
    const at = (obj) => field.split('/').slice(1).reduce((o, k) => (o == null ? o : o[k]), obj);
    for (let i = 0; i < 45; i += 1) {
      const got = await fetch(`${url}?cb=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => at(j)).catch(() => undefined);
      if (got === value) return;
      await t.wait(2000);
    }
    throw new Error(`studioPublish: ${url} still doesn't serve "${value}" at ${field}`);
  },

  // Open the site's app (spec.appUrl) or a structured content document's delivery JSON.
  async openUrl({ page, t, spec, run }, { url, zoom, until, fresh }) {
    const u = new URL(appOrJsonUrl(spec, url));
    if (until && !run.test) await waitServed(t, run, appOrJsonUrl(spec, until.url), String(until.text || ''), until.bust !== false);
    if (fresh) await clearCache(page);
    await page.goto(u.toString());
    await page.waitForLoadState('networkidle').catch(() => {});
    await zoomContent(page, zoom, 'openUrl');
    await t.restoreCursor();
    await t.wait(1500);
  },

  // Move the cursor onto a piece of text in the page (e.g. a value in a JSON response), scrolled to
  // the middle of the screen so the caption doesn't cover it. `nth` picks a later match (0 = first).
  async pointAt({ page, t, run }, { text, nth = 0, role }) {
    if (!text) throw new Error('pointAt: give "text"');
    if (!Number.isInteger(nth) || nth < 0) throw new Error('pointAt: nth must be 0 or more');
    // `role` (e.g. button) tells apart a control from other text with the same words, like a banner link.
    // Skip the recorder's own overlay (#tt-root): the caption often says the same words.
    const all = role ? page.getByRole(role, { name: text }) : page.getByText(text);
    const inPage = () => all.evaluateAll((els) => els.map((n, i) => (n.closest('#tt-root') ? -1 : i)).filter((i) => i >= 0)).catch(() => []);
    let content = await inPage();
    for (let waited = 0; content.length <= nth && waited < (run.test ? 8000 : 20000); waited += 500) {
      await t.wait(500);
      content = await inPage();
    }
    // Test takes don't publish: text that only exists after a publish is skipped there.
    if (content.length <= nth) {
      if (run.test) return;
      throw new Error(`pointAt: "${text}" not found in the page`);
    }
    const el = all.nth(content[nth]);
    await el.waitFor({ timeout: 10000 });
    // Center the text itself, not its element (a JSON response is one big <pre>).
    await el.evaluate((n, w) => {
      n.scrollIntoView({ block: 'center' }); // also scrolls inner scroll containers (app shells)
      const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
        const i = tn.data.indexOf(w);
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(tn, i); r.setEnd(tn, i + w.length);
          window.scrollBy({ top: r.getBoundingClientRect().top - window.innerHeight / 2, behavior: 'smooth' });
          return;
        }
      }
    }, text);
    await t.wait(900);
    const p = await wordPoint(el, text);
    await t.moveTo(p.x, p.y);
    await t.wait(600);
  },

  // Send > Preview & Publish > Publish for the open page or fragment. The site enforces Preflight:
  // a blocked publish fails the take with Preflight's message. Test takes point at Publish and stop.
  async publish({ page, t, run, spec }) {
    const hash = new URL(page.url()).hash; // #/org/site/path of the open document
    const prefix = `#/${spec.org}/${spec.site}`;
    if (!hash.startsWith(`${prefix}/`)) throw new Error('publish: no page of this site is open');
    const docPath = hash.slice(prefix.length);
    const before = await liveModified(spec.org, spec.site, docPath); // must move forward
    await t.click(page.getByRole('button', { name: /^Preview and publish/ }));
    await t.wait(800);
    // The radio's own label covers it (and caption text may read "Preview & Publish" too), so
    // point at the radio and click through.
    const radio = page.getByRole('radio', { name: /^Preview & Publish/ });
    const card = radio.locator('xpath=ancestor::label[1]'); // the visible card; the input itself is hidden
    await t.click((await card.count()) ? card : radio);
    if (!(await radio.isChecked())) await radio.check({ force: true });
    if (!(await radio.isChecked())) throw new Error('publish: could not select Preview & Publish');
    await t.wait(700);
    const go = page.getByRole('button', { name: 'Publish', exact: true });
    if (run.test) { await t.hover(go); await t.wait(1200); await t.press('Escape'); return; }
    await t.click(go);
    // Done when the admin API reports a publish newer than the click; a "Publish failed" dialog
    // (Preflight) fails the take, and so does no publish within 90 seconds.
    const failed = page.getByText('Publish failed').first();
    for (let i = 0; i < 45; i += 1) {
      if (await failed.isVisible().catch(() => false)) {
        const why = await page.getByText(/Preflight found issues/i).allInnerTexts().catch(() => []);
        throw new Error(`publish: ${why.join(' ').slice(0, 200) || 'Publish failed'}`);
      }
      if ((await liveModified(spec.org, spec.site, docPath).catch(() => 0)) > before) {
        await t.press('Escape');
        await t.wait(800);
        return;
      }
      await t.wait(2000);
    }
    throw new Error(`publish: ${docPath} was not published within 90 seconds`);
  },

  // Send > Preview > Update, then show the previewed page in the same tab.
  // With run.noPreview (test takes) it opens the Send menu, points at Update and closes it.
  async preview({ page, t, run }, { confirm = 'Update' } = {}) {
    await t.click(page.getByRole('button', { name: 'Preview and publish' }));
    await t.wait(900);
    await t.hover(page.getByRole('radio').first());
    await t.wait(900);
    if (run.noPreview) {
      await t.hover(page.getByRole('button', { name: confirm }));
      await t.wait(1200);
      await t.press('Escape');
      run.previewUrl = null;
      return;
    }
    const popupP = page.context().waitForEvent('page', { timeout: 60000 });
    const failed = page.getByText('Preview failed').waitFor({ timeout: 60000 })
      .then(() => { throw new Error('Preview failed dialog (preview service error); rerun the take'); });
    await t.click(page.getByRole('button', { name: confirm }));
    const popup = await Promise.race([popupP, failed]);
    await popup.waitForLoadState('domcontentloaded');
    run.previewUrl = popup.url();
    await popup.close();
    await page.goto(run.previewUrl);
    await page.waitForLoadState('networkidle').catch(() => {});
    await t.restoreCursor();
    await t.wait(500);
  },
};
