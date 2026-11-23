#!/usr/bin/env node
/*
 * tutorial-screencast: create a demo-docs usecase page and list it in the usecase catalog.
 *
 *   node .skills/tutorial-screencast/scripts/page.mjs create /demo-docs/usecases/<name> <file.html>
 *   node .skills/tutorial-screencast/scripts/page.mjs showcase /demo-docs/usecases/<name> \
 *        --section "Content Use Cases" --usecase "Short use-case name" --title "Link text" [--after "/demo-docs/usecases/<other>"] [--dry-run]
 *
 * create   saves the HTML as a new page; refuses to overwrite an existing one.
 * showcase adds a row (use-case | link) to a section table of /demo-docs/usecase-showcase, after the row
 *          linking --after or at the end of the section; backs the page up to out/backups/ first and
 *          does nothing if the page is already listed.
 * Preview both pages in da.live afterwards (Send › Preview › Update), like any other page.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { exists, getSource, putSource } from './lib/da.mjs';
import { SKILL, escapeHtml } from './lib/spec.mjs';

const defaults = JSON.parse(readFileSync(path.join(SKILL, 'specs', '_defaults.json'), 'utf8'));
const { org, site } = defaults;
const [cmd, page] = process.argv.slice(2);
const opt = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
const PAGE = /^\/demo-docs\/usecases\/[a-z0-9][a-z0-9-]*$/;
const CATALOG = '/demo-docs/usecase-showcase.html';

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: page.mjs create /demo-docs/usecases/<name> <file.html>\n'
    + '       page.mjs showcase /demo-docs/usecases/<name> --section "<h3 text>" --usecase "<name>" --title "<link text>" [--after <page>]');
  process.exit(1);
}

if (!PAGE.test(page || '')) usage(`page must look like /demo-docs/usecases/<name>, got ${JSON.stringify(page)}`);

if (cmd === 'create') {
  const file = process.argv[4];
  if (!file) usage('give the HTML file to save');
  const html = readFileSync(file, 'utf8');
  if (!/<main>[\s\S]*<h1>/.test(html)) usage('the HTML needs a <main> with an <h1> (see references/usecase-page.md)');
  if (await exists(org, site, `${page}.html`)) {
    console.error(`${page} already exists: edit it in da.live instead of overwriting it.`);
    process.exit(1);
  }
  // DA has no create-only write: check again right before saving to keep the window small.
  if (await exists(org, site, `${page}.html`)) {
    console.error(`${page} was just created by someone else: not overwriting it.`);
    process.exit(1);
  }
  await putSource(org, site, `${page}.html`, html);
  console.log(JSON.stringify({ ok: true, created: page, edit: `https://da.live/canvas#/${org}/${site}${page}` }));
} else if (cmd === 'showcase') {
  const section = opt('--section');
  const usecase = opt('--usecase');
  const title = opt('--title');
  const after = opt('--after');
  if (!section || !usecase || !title) usage('--section, --usecase and --title are required');
  if (after && !PAGE.test(after)) usage('--after must be a /demo-docs/usecases/<name> page');
  const html = await getSource(org, site, CATALOG);
  if (html.includes(`href="${page}"`) || html.includes(`${page}"`)) {
    console.log(JSON.stringify({ ok: true, alreadyListed: page }));
    process.exit(0);
  }
  // A section is an <h3> and its table; each link row ends with "</ul></div></div>" (list, cell, row).
  const head = html.indexOf(`<h3>${escapeHtml(section)}</h3>`);
  if (head < 0) usage(`no section "${section}" in ${CATALOG}`);
  const next = html.indexOf('<h3>', head + 4);
  const stop = next < 0 ? html.length : next;
  const ROW_END = '</ul></div></div>';
  let at;
  if (after) {
    const link = html.indexOf(`${after}"`, head);
    if (link < 0 || link > stop) usage(`no row linking ${after} in "${section}"`);
    at = html.indexOf(ROW_END, link) + ROW_END.length;
  } else {
    at = html.lastIndexOf(ROW_END, stop);
    if (at < head) usage(`"${section}" has no rows to add after`);
    at += ROW_END.length;
  }
  const row = `<div><div><p>${escapeHtml(usecase)}</p></div><div><ul><li><a href="${page}">${escapeHtml(title)}</a></li></ul></div></div>`;
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, before: html.slice(Math.max(0, at - 160), at), row, after: html.slice(at, at + 80) }, null, 1));
    process.exit(0);
  }
  const backup = path.join(SKILL, 'out', 'backups', `usecase-showcase.${Date.now()}.html`);
  mkdirSync(path.dirname(backup), { recursive: true });
  writeFileSync(backup, html);
  // Read-modify-write: stop if someone changed the catalog since we read it (re-run to retry).
  if ((await getSource(org, site, CATALOG)) !== html) {
    console.error(`${CATALOG} changed while adding the row: nothing saved, run the command again.`);
    process.exit(1);
  }
  await putSource(org, site, CATALOG, html.slice(0, at) + row + html.slice(at));
  const saved = await getSource(org, site, CATALOG);
  if (!saved.includes(`href="${page}"`)) throw new Error('the row is not in the saved catalog');
  console.log(JSON.stringify({ ok: true, listed: page, section, backup, edit: `https://da.live/canvas#/${org}/${site}/demo-docs/usecase-showcase` }));
} else {
  usage();
}
