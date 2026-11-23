#!/usr/bin/env node
/*
 * tutorial-screencast: upload a finished MP4 to the spec's uploadFolder on da.live and verify it.
 *
 *   node .skills/tutorial-screencast/scripts/upload.mjs specs/<slug>.json [--replace]
 *
 * Uploads out/<slug>.mp4 as <uploadFolder>/<slug>.mp4, then reads it back and compares bytes.
 * Refuses to overwrite an existing video unless --replace is passed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { exists, upload } from './lib/da.mjs';
import { SKILL, loadSpec } from './lib/spec.mjs';

const specArg = process.argv.slice(2).find((a) => a.endsWith('.json'));
if (!specArg) { console.error('usage: upload.mjs <spec.json> [--replace]'); process.exit(1); }
const spec = loadSpec(specArg);

const file = path.join(SKILL, 'out', `${spec.slug}.mp4`);
const target = `${spec.uploadFolder}/${spec.slug}.mp4`;
if (!process.argv.includes('--replace') && await exists(spec.org, spec.site, target)) {
  console.error(`${target} already exists. Pass --replace to overwrite it.`);
  process.exit(1);
}
// Edge Delivery serves MP4s up to 36 MB (about 2 minutes at 300 KB/s).
const MAX_MP4 = 36 * 1024 * 1024;
const data = readFileSync(file);
if (data.length > MAX_MP4) {
  console.error(`${file} is ${(data.length / 1048576).toFixed(1)} MB; Edge Delivery serves MP4s up to 36 MB. Shorten the take or re-encode with a higher CRF.`);
  process.exit(1);
}
const bytes = await upload(spec.org, spec.site, target, data, 'video/mp4');
console.log(JSON.stringify({
  ok: true, uploaded: target, bytes, browse: `https://da.live/#/${spec.org}/${spec.site}${spec.uploadFolder}`,
}));
