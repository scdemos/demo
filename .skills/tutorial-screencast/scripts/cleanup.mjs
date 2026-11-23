#!/usr/bin/env node
/*
 * tutorial-screencast: delete test-take pages (names containing "-test-") from the tutorial pages folder.
 *
 *   node .skills/tutorial-screencast/scripts/cleanup.mjs          list what would be deleted
 *   node .skills/tutorial-screencast/scripts/cleanup.mjs --yes    delete them
 *
 * Test takes never click Update, so these pages have no preview copy. A page that does have one is
 * skipped and reported: unpublish it in da.live (select it, Delete, tick "Unpublish items").
 */
import { list, remove, isPreviewed } from './lib/da.mjs';
import { loadDefaults, checkName, checkFolder } from './lib/spec.mjs';

const spec = loadDefaults();
checkName(spec.org, 'org');
checkName(spec.site, 'site');
checkFolder(spec.folder, 'folder');
const yes = process.argv.includes('--yes');

const items = await list(spec.org, spec.site, spec.folder);
const tests = items.filter((i) => i.ext === 'html' && /-test-\d+$/.test(i.name));
const report = { deleted: [], wouldDelete: [], skippedPreviewed: [] };
for (const item of tests) {
  const p = `${spec.folder}/${item.name}.html`;
  if (await isPreviewed(spec.org, spec.site, p)) report.skippedPreviewed.push(p);
  else if (yes) { await remove(spec.org, spec.site, p); report.deleted.push(p); } else report.wouldDelete.push(p);
}
console.log(JSON.stringify(report, null, 2));
