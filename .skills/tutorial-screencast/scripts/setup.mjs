#!/usr/bin/env node
/*
 * tutorial-screencast: one-time setup and sign-in check.
 *
 *   node .skills/tutorial-screencast/scripts/setup.mjs           install/check tools, check sign-in
 *   node .skills/tutorial-screencast/scripts/setup.mjs --login   open a browser window to sign in to da.live
 *   node .skills/tutorial-screencast/scripts/setup.mjs --login coworker
 *                                     sign in to Coworker (experience.adobe.com) for Coworker specs
 *
 * Installs playwright-core and its Chromium into ~/.cache/tutorial-screencast (never the repo) and keeps
 * the signed-in browser profile there too.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { CACHE, PROFILE } from './lib/pw.mjs';

const login = process.argv.includes('--login');

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: CACHE, ...opts });

mkdirSync(CACHE, { recursive: true });
if (!existsSync(path.join(CACHE, 'package.json'))) writeFileSync(path.join(CACHE, 'package.json'), '{"private":true}\n');
// Everything a teammate needs goes into the cache, never the repo, and needs no admin rights:
// Playwright and its Chromium, the DA auth helper, and ffmpeg/ffprobe when they aren't on PATH.
const onPath = (bin) => { try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch { return false; } };
// [module name, what npm installs]. The DA auth helper comes as a GitHub tarball, not "github:…":
// that form needs git, which can fail (e.g. an x86_64 Node with arm64-only Xcode command line tools).
const want = [
  ['playwright-core', 'playwright-core'],
  ['da-auth-helper', 'https://codeload.github.com/adobe-rnd/da-auth-helper/tar.gz/main'],
];
if (!onPath('ffmpeg')) want.push(['ffmpeg-static', 'ffmpeg-static']);
if (!onPath('ffprobe')) want.push(['ffprobe-static', 'ffprobe-static']);
const missing = want.filter(([name]) => !existsSync(path.join(CACHE, 'node_modules', name))).map(([, spec]) => spec);
if (missing.length) {
  console.log(`Installing into ${CACHE}: ${missing.join(', ')}`);
  sh('npm', ['install', '--no-audit', '--no-fund', ...missing]);
}
const { tool } = await import('./lib/pw.mjs');
for (const bin of ['ffmpeg', 'ffprobe']) execFileSync(tool(bin), ['-version'], { stdio: 'ignore' });
sh('node', [path.join('node_modules', 'playwright-core', 'cli.js'), 'install', 'chromium']);

const { loadChromium } = await import('./lib/pw.mjs');
const chromium = await loadChromium();
// Signed out, da.live redirects to auth.services.adobe.com; signed in, the folder shows its New button.
const { loadDefaults } = await import('./lib/spec.mjs');
const defaults = loadDefaults();
const url = `https://da.live/#/${defaults.org}/${defaults.site}${defaults.uploadFolder}`;
const signedIn = (page, timeout) => page.getByRole('button', { name: 'New', exact: true })
  .waitFor({ timeout }).then(() => true, () => false);

// Coworker keeps its sign-in in cookies that headless runs clear (this script's own check too), so
// sign it in right before recording a Coworker spec. The account needs Coworker access in the org.
if (login && process.argv[process.argv.indexOf('--login') + 1] === 'coworker') {
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: null, args: ['--window-size=1440,960'] });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://experience.adobe.com/#/@ccs/coworker/chat');
  console.log('Sign in to Coworker in the window that opened (waiting up to 15 minutes)…');
  const ok = await page.frameLocator('iframe[src*="coworker-ui"]').getByRole('textbox', { name: 'AI Prompt' })
    .waitFor({ timeout: 15 * 60 * 1000 }).then(() => true, () => false);
  await page.waitForTimeout(3000);
  await ctx.close();
  console.log(ok ? 'SIGNED_IN_COWORKER' : 'NOT_SIGNED_IN_COWORKER');
  process.exit(ok ? 0 : 1);
}

if (login) {
  // A real window without a forced viewport: forced viewports make headed windows sluggish.
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: null, args: ['--window-size=1440,960'] });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(url);
  console.log('Sign in to da.live in the window that opened (waiting up to 15 minutes)…');
  const ok = await signedIn(page, 15 * 60 * 1000);
  await page.waitForTimeout(3000);
  await ctx.close();
  console.log(ok ? 'SIGNED_IN' : 'NOT_SIGNED_IN');
  process.exit(ok ? 0 : 1);
}

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(url);
const ok = await signedIn(page, 20000);
await ctx.close();
console.log(ok ? 'READY: tools installed, signed in to da.live' : 'NOT_SIGNED_IN: run setup.mjs --login');
process.exit(ok ? 0 : 1);
