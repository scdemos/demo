#!/usr/bin/env node
/*
 * customer-demo: one-command setup check for the machine and harness (phase 0).
 *
 *   node .skills/customer-demo/scripts/setup-check.mjs [--fix]
 *
 * Checks Node, git, playwright-core + Chromium, the AEM CLI, Lighthouse reachability and the
 * optional tokens the scripts use. Prints the exact command to fix each gap. With --fix it installs
 * the browser tooling into a local cache (~/.cache/customer-demo), never into the repo's
 * package.json / package-lock.json.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const fix = process.argv.includes('--fix');
const CACHE = path.join(os.homedir(), '.cache', 'customer-demo');
const rows = [];
const add = (ok, item, detail, howTo = '') => rows.push({ ok, item, detail, howTo });
const sh = (cmd) => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }).toString().trim(); } catch { return null; }
};

function resolvePlaywright() {
  for (const base of [process.cwd(), CACHE]) {
    try { return createRequire(path.join(base, 'noop.js')).resolve('playwright-core'); } catch { /* next */ }
  }
  return null;
}

const major = Number(process.versions.node.split('.')[0]);
add(major >= 18, 'Node ≥ 18', process.version, 'install Node 20 LTS (nvm install 20)');
add(!!sh('git --version'), 'git', sh('git --version') || 'missing', 'install git');
add(!!sh('git ls-remote https://github.com/scdemos/demo HEAD'), 'GitHub reachable', 'scdemos/demo', 'check network / VPN');

let pw = resolvePlaywright();
if (!pw && fix) {
  fs.mkdirSync(CACHE, { recursive: true });
  if (!fs.existsSync(path.join(CACHE, 'package.json'))) fs.writeFileSync(path.join(CACHE, 'package.json'), '{"private":true}');
  sh(`npm i --prefix "${CACHE}" --no-save --silent playwright-core@1`);
  pw = resolvePlaywright();
}
add(!!pw, 'playwright-core', pw ? 'resolvable' : 'missing', `node setup-check.mjs --fix  (or: npm i --prefix ${CACHE} playwright-core@1)`);

// the browser build must match this playwright-core version (a different chromium-* folder isn't enough)
let exe = null;
if (pw) {
  const { chromium } = await import(pathToFileURL(pw).href).then((m) => m.default || m);
  exe = chromium.executablePath();
  if (!fs.existsSync(exe) && fix) sh(`node "${path.join(path.dirname(pw), 'cli.js')}" install chromium`);
}
const hasBrowser = !!exe && fs.existsSync(exe);
add(hasBrowser, 'Chromium (matching playwright-core)', hasBrowser ? path.basename(path.dirname(path.dirname(path.dirname(exe)))) : (exe || 'unknown'), 'node setup-check.mjs --fix');

const aem = sh('aem --version') || sh('npx --no-install aem --version');
add(!!aem, 'AEM CLI (aem up)', aem || 'missing', 'npm i -g @adobe/aem-cli');
add(!!sh('npm view lighthouse@12 version'), 'Lighthouse (npx lighthouse@12)', 'reachable via npx', 'npm registry access needed');

// sign-in: the integrated browser's da.live tab covers DA + AEM Admin (scripts/browser/site-tab.js);
// tokens in the environment are only for headless runs
const headless = !!(process.env.DA_TOKEN || process.env.AEM_ADMIN_TOKEN);
add(headless, 'Headless tokens (optional)', headless ? 'set (never printed)' : 'not set: fine, sign in to da.live in the integrated browser instead',
  'only for harnesses without a browser: DA_TOKEN (da.live IMS token) or AEM_ADMIN_TOKEN');

rows.forEach((r) => console.log(`${r.ok ? '✅' : (r.item.includes('optional') ? '⚠️ ' : '❌')} ${r.item.padEnd(32)} ${r.detail}${r.ok ? '' : `\n   → ${r.howTo}`}`));
const blocking = rows.filter((r) => !r.ok && !r.item.includes('optional'));
console.log(blocking.length ? `\n${blocking.length} blocking gap(s). Run with --fix for the browser tooling.` : '\nready');
process.exitCode = blocking.length ? 1 : 0;
