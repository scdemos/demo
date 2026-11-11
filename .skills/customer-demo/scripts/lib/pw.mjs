/*
 * customer-demo: load playwright-core from the repo or from the setup-check cache
 * (~/.cache/customer-demo, installed by `setup-check.mjs --fix`), so scripts never need
 * package.json changes.
 */
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function loadChromium() {
  for (const base of [process.cwd(), path.join(os.homedir(), '.cache', 'customer-demo')]) {
    try {
      const resolved = createRequire(path.join(base, 'noop.js')).resolve('playwright-core');
      // eslint-disable-next-line no-await-in-loop
      const mod = await import(pathToFileURL(resolved).href);
      return mod.chromium || mod.default.chromium;
    } catch { /* try next */ }
  }
  console.error('playwright-core missing: run `node .skills/customer-demo/scripts/setup-check.mjs --fix`.');
  process.exit(2);
  return null;
}

export const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
