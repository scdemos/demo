#!/usr/bin/env node
/*
 * tutorial-screencast: record one tutorial from a JSON spec.
 *
 *   node .skills/tutorial-screencast/scripts/record.mjs specs/<slug>.json [--test] [--debug] [--page <name>]
 *
 * --test   test take: page name gets a "-test-<time>" suffix, Send > Update is not clicked
 *          (nothing gets previewed), output goes to out/test/.
 * --debug  save a screenshot after every step to out/debug/<slug>/.
 * --page   override the page name from the spec.
 * Specs that edit live documents list them in "restoreAfterTest" (DA paths ending in .html):
 * a test take backs them up first and puts them back afterwards, so the real take starts from
 * the same content and makes the same change for real.
 * Prints one JSON line: { video, contactSheet, seconds, page, previewUrl }.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startRecording, finishRecording, contactSheet, duration } from './lib/recorder.mjs';
import { actions, OWN_HOLD } from './lib/ew-actions.mjs';
import {
  exists, isPreviewed, getSource, putSource, repreview, previewModified,
} from './lib/da.mjs';
import {
  SKILL, loadSpec, checkName, escapeHtml,
} from './lib/spec.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const specArg = args.find((a) => a.endsWith('.json'));
if (!specArg) {
  console.error('usage: record.mjs <spec.json> [--test] [--debug] [--page <name>]');
  process.exit(1);
}
const spec = loadSpec(specArg);
const test = flag('--test');
const debug = flag('--debug');
const stamp = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '');
// Tutorials that create a page get a fresh name; tutorials that only show existing pages have none.
const createsPage = spec.steps.some((st) => st.do === 'createPage');
if (createsPage && !spec.page) throw new Error('spec has a createPage step but no "page" name');
const pageName = createsPage
  ? checkName(opt('--page') || (test ? `${spec.page}-test-${stamp}` : spec.page), 'page name')
  : undefined;

// A reused page name can flash the old page's content in the editor, so insist on a fresh one.
const pagePath = createsPage ? `${spec.folder}/${pageName}.html` : undefined;
if (createsPage && await exists(spec.org, spec.site, pagePath)) {
  console.error(`Page ${pagePath} already exists. Pick a new name (spec "page" or --page).`);
  process.exit(1);
}
if (createsPage && await isPreviewed(spec.org, spec.site, pagePath)) {
  console.error(`${pageName} was previewed before and still has a preview copy. Pick a new name.`);
  process.exit(1);
}

const outDir = path.join(SKILL, 'out', test ? 'test' : '');
const debugDir = path.join(SKILL, 'out', 'debug', spec.slug);
mkdirSync(outDir, { recursive: true });
if (debug) mkdirSync(debugDir, { recursive: true });

// Caption text: **bold**, plus {page} and {previewHost} placeholders.
// Spec text is escaped first, so only **bold** becomes markup.
const render = (text, run) => escapeHtml(text)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\{page\}/g, escapeHtml(run.pageName || ''))
  .replace(/\{previewHost\}/g, run.previewUrl ? escapeHtml(new URL(run.previewUrl).host) : 'the preview site (test take)');

// Test takes autosave their edits to live documents (DA has no undo for that): back them up now.
const restore = test ? (spec.restoreAfterTest || []) : [];
if (!Array.isArray(restore) || restore.some((p) => typeof p !== 'string' || !/^(\/[a-z0-9][a-z0-9_-]*)+\.html$/.test(p))) {
  throw new Error('restoreAfterTest: list DA paths like "/en/app/experience.html"');
}
const backups = [];
for (const p of restore) {
  const html = await getSource(spec.org, spec.site, p);
  const file = path.join(SKILL, 'out', 'backups', `test-${spec.slug}${p.replace(/\//g, '_')}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  backups.push({ p, html, previewed: await previewModified(spec.org, spec.site, p) });
}

const rawRoot = path.join(SKILL, 'out', '.raw');
// `headed`: sites that keep the sign-in in cookies (experience.adobe.com) need a visible browser:
// headless Chromium can't decrypt the profile's cookies on macOS (da.live keeps its token in localStorage).
if (spec.headed !== undefined && typeof spec.headed !== 'boolean') throw new Error('headed must be true or false');
// `sidekick`: load the AEM Sidekick extension (always a visible browser).
if (spec.sidekick !== undefined && typeof spec.sidekick !== 'boolean') throw new Error('sidekick must be true or false');
// `consentBanner`: the live site shows its cookie banner (it hides from browsers that report automation).
if (spec.consentBanner !== undefined && typeof spec.consentBanner !== 'boolean') throw new Error('consentBanner must be true or false');
const rec = await startRecording({
  rawDir: path.join(rawRoot, spec.slug), rawRoot, headless: !spec.headed, sidekick: !!spec.sidekick, consentBanner: !!spec.consentBanner,
});
const run = { startedAt: rec.startedAt, pageName, test, noPreview: test && !flag('--preview') };
const ctx = { page: rec.page, t: rec.t, spec, run };
// Test takes submit forms in dry-run mode: the demo's form endpoint (workers/contact_us) answers
// as usual but doesn't forward the submission (no Slack message from a rehearsal).
if (test) {
  const formEndpoint = (u) => u.origin === new URL(spec.siteOrigin).origin && u.pathname.startsWith('/contact-us');
  await rec.page.context().route(formEndpoint, (route) => route.continue({
    headers: { ...route.request().headers(), 'x-dry-run': '1' },
  }));
  // Checkout (workers/orders) would create a real Edge Commerce order and a Slack message: test takes
  // answer it here with a pretend order shaped like the worker's, so the confirmation still shows.
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Accept, x-dry-run' };
  await rec.page.context().route('https://demo.bbird.live/orders', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let items = [];
    try { items = (req.postDataJSON()?.items || []).filter((i) => i && Number(i.quantity) > 0); } catch { /* empty order */ }
    const currency = items[0]?.currency || 'USD';
    const total = items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        delivered: false,
        order: {
          id: `TEST${Date.now().toString(36).toUpperCase().slice(-4)}`,
          createdAt: new Date().toISOString(),
          total: total.toFixed(2),
          currency,
          items: items.map(({
            sku, name, quantity, price,
          }) => ({
            sku, name, quantity, price,
          })),
        },
      }),
    });
  });
}
let failed = null;

try {
  const override = spec.steps.find((st) => (st.do === 'openFolder' && st.folder) || (st.do === 'createPage' && st.name));
  if (override) throw new Error(`"${override.do}" takes no folder/name: set "folder" in _defaults.json and "page" in the spec`);
  for (const [i, step] of spec.steps.entries()) {
    const action = actions[step.do];
    if (!action) throw new Error(`step ${i + 1}: unknown action "${step.do}"`);
    // `hidden: true`: setup the viewer doesn't need to see (e.g. preparing demo data); cut from the video.
    const hiddenFrom = step.hidden ? (Date.now() - run.startedAt) / 1000 : null;
    if (step.hidden && step.caption !== undefined) throw new Error(`step ${i + 1}: a hidden step has no caption`);
    if (step.caption !== undefined) {
      const badge = step.n ? `<span class="n">${escapeHtml(step.n)}</span>` : '';
      await rec.t.caption(step.caption ? badge + render(step.caption, run) : '');
      await rec.t.wait(step.captionLead ?? 400);
    }
    await action(ctx, step);
    if (step.hold && !OWN_HOLD.has(step.do)) await rec.t.wait(step.hold);
    if (hiddenFrom !== null) (run.cuts ||= []).push([hiddenFrom - 0.5, (Date.now() - run.startedAt) / 1000 + 0.5]);
    if (debug) await rec.page.screenshot({ path: path.join(debugDir, `${String(i + 1).padStart(2, '0')}-${step.do}.png`) });
  }
} catch (e) {
  failed = e;
  if (debug) await rec.page.screenshot({ path: path.join(debugDir, 'error.png') }).catch(() => {});
}

const video = path.join(outDir, `${spec.slug}.mp4`);
// Restore even when closing the browser or encoding fails (finishRecording closes the browser first).
let encoded = true;
try {
  await finishRecording(rec, video, { trimStart: run.trimStart || 0, cuts: run.cuts || [], fast: run.fast || [] });
} catch (e) {
  encoded = false;
  failed ||= new Error(`encoding the video: ${e.message}`);
  await rec.ctx.close().catch(() => {}); // make sure no editor is left to autosave over the restore
}
// The browser is closed now, so no editor can autosave over the restore.
// Put back only documents that changed, and keep what they held just before (the take's edit, or
// in the worst case a colleague's edit made during the take) next to the backup, so nothing is lost.
const restored = [];
for (const { p, html, previewed } of backups) {
  try {
    const now = await getSource(spec.org, spec.site, p);
    if (now === html) continue;
    writeFileSync(path.join(SKILL, 'out', 'backups', `test-${spec.slug}${p.replace(/\//g, '_')}.before-restore`), now);
    await putSource(spec.org, spec.site, p, html);
    if ((await getSource(spec.org, spec.site, p)) !== html) throw new Error('the saved source differs from the backup');
    // Tools such as the Experimentation panel preview the page they change: when the take changed the
    // preview, preview it again so it matches the restored source too. Leave untouched previews alone.
    if ((await previewModified(spec.org, spec.site, p)) !== previewed) await repreview(spec.org, spec.site, p);
    restored.push(p);
  } catch (e) { failed ||= new Error(`restoring ${p}: ${e.message} (backup in out/backups/)`); }
}

const sheet = encoded ? contactSheet(video, video.replace(/\.mp4$/, '.contact.png')) : null;
const seconds = encoded ? Math.round(duration(video)) : null;
if (!failed && encoded && seconds > spec.maxSeconds) failed = new Error(`video is ${seconds}s, over the ${spec.maxSeconds}s limit: shorten holds or drop a step`);
const result = {
  ok: !failed, error: failed?.message, video, contactSheet: sheet, seconds, page: pagePath, previewUrl: run.previewUrl,
  ...(restored.length ? { restored } : {}),
};
console.log(JSON.stringify(result));
process.exit(failed ? 1 : 0);
