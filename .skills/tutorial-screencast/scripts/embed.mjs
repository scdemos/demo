#!/usr/bin/env node
/*
 * tutorial-screencast: point a page's embed block at a tutorial video.
 *
 *   node .skills/tutorial-screencast/scripts/embed.mjs specs/<slug>.json --page /demo-docs/<page> [--index n | --after-section n] [--dry-run]
 *
 * Replaces the link inside the chosen embed block (default: the only one) with the spec's video
 * (<videoBase><uploadFolder>/<slug>.mp4). With no embed block on the page it adds one as its own
 * section (like demo-docs/index), after section --after-section (default 1). Saves the page and reads
 * it back; the original HTML is backed up to out/backups/. It never previews or publishes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getSource, putSource } from './lib/da.mjs';
import {
  SKILL, loadSpec, checkFolder, positiveInt, escapeHtml,
} from './lib/spec.mjs';

const args = process.argv.slice(2);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const specArg = args.find((a) => a.endsWith('.json'));
if (!specArg || !opt('--page')) {
  console.error('usage: embed.mjs <spec.json> --page /folder/page [--index n | --after-section n] [--dry-run]');
  process.exit(1);
}
const spec = loadSpec(specArg);
const pagePath = `${checkFolder(opt('--page').replace(/\.html$/, ''), '--page')}.html`;
const video = `${spec.videoBase}${spec.uploadFolder}/${spec.slug}.mp4`; // all parts validated by loadSpec
const html = await getSource(spec.org, spec.site, pagePath);

// End offset (exclusive) of the <div> element that opens at `start`, counting nested divs.
function divEnd(source, start) {
  let depth = 0;
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = start;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  throw new Error('unbalanced <div> in page HTML');
}

// Embed blocks, each with the first link *inside that block* (or none).
const embeds = [];
for (const m of html.matchAll(/<div class="embed(?:\s[^"]*)?">/g)) {
  const end = divEnd(html, m.index);
  const inner = html.slice(m.index, end);
  const a = /<a href="([^"]*)"[^>]*>[\s\S]*?<\/a>/.exec(inner);
  embeds.push({
    start: m.index, end, link: a ? { start: m.index + a.index, length: a[0].length, href: a[1] } : null,
  });
}

const link = `<a href="${escapeHtml(video)}">${escapeHtml(video)}</a>`;
let updated;
let report;

if (!embeds.length) {
  // Top-level sections are the direct <div> children of <main>.
  const mainOpen = html.indexOf('<main>');
  if (mainOpen < 0) throw new Error(`no <main> in ${pagePath}`);
  const sections = [];
  const skipSpace = (i) => i + (/^\s*/.exec(html.slice(i))[0].length);
  for (let i = skipSpace(mainOpen + '<main>'.length); html.startsWith('<div', i);) {
    const end = divEnd(html, i);
    sections.push(end);
    i = skipSpace(end);
  }
  if (!sections.length) throw new Error(`could not find sections in ${pagePath}`);
  const after = positiveInt(opt('--after-section'), '--after-section', 1);
  if (after > sections.length) throw new Error(`--after-section ${after}: the page has ${sections.length} sections`);
  const block = `<div><div class="embed"><div><div><p>${link}</p></div></div></div></div>`;
  updated = html.slice(0, sections[after - 1]) + block + html.slice(sections[after - 1]);
  report = { page: pagePath, added: `new embed section after section ${after} of ${sections.length}`, to: video };
} else {
  const index = positiveInt(opt('--index'), '--index', embeds.length === 1 ? 1 : undefined);
  if (!index || index > embeds.length) {
    console.error(`${pagePath} has ${embeds.length} embed blocks; choose one with --index:`);
    embeds.forEach((e, i) => console.error(`  ${i + 1}: ${e.link ? e.link.href : '(empty)'}`));
    process.exit(1);
  }
  const target = embeds[index - 1];
  if (target.link?.href === video) {
    console.log(JSON.stringify({ unchanged: true, page: pagePath, to: video }));
    process.exit(0);
  }
  if (target.link) {
    updated = html.slice(0, target.link.start) + link + html.slice(target.link.start + target.link.length);
  } else {
    // Empty embed block: replace the whole block with a filled one, keeping its class (e.g. "embed 600px").
    const open = /<div class="[^"]*">/.exec(html.slice(target.start))[0];
    updated = `${html.slice(0, target.start)}${open}<div><div><p>${link}</p></div></div></div>${html.slice(target.end)}`;
  }
  report = { page: pagePath, embed: index, from: target.link ? target.link.href : '(empty)', to: video };
}
report.edit = `https://da.live/edit#/${spec.org}/${spec.site}${pagePath.replace(/\.html$/, '')}`;

if (args.includes('--dry-run')) {
  console.log(JSON.stringify({ dryRun: true, ...report }));
  process.exit(0);
}

const backups = path.join(SKILL, 'out', 'backups');
mkdirSync(backups, { recursive: true });
const backup = path.join(backups, `${pagePath.replace(/[/.]/g, '_')}-${Date.now()}.html`);
writeFileSync(backup, html);
// Read-modify-write: stop if someone edited the page since we read it (re-run to retry).
if ((await getSource(spec.org, spec.site, pagePath)) !== html) {
  console.error(`${pagePath} changed while adding the video: nothing saved, run the command again.`);
  process.exit(1);
}
await putSource(spec.org, spec.site, pagePath, updated);
const saved = await getSource(spec.org, spec.site, pagePath);
if (!saved.includes(`href="${escapeHtml(video)}"`)) throw new Error(`saved page does not contain the new link; original is in ${backup}`);
console.log(JSON.stringify({ ok: true, ...report, backup }));
