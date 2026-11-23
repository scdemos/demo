/*
 * tutorial-screencast: load playwright-core from the skill cache (~/.cache/tutorial-screencast,
 * installed by `setup.mjs`), so the site repo never needs package.json changes.
 */
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const CACHE = path.join(os.homedir(), '.cache', 'tutorial-screencast');
export const PROFILE = process.env.TUTORIAL_PROFILE || path.join(CACHE, 'profile');

export async function loadChromium() {
  try {
    const resolved = createRequire(path.join(CACHE, 'noop.js')).resolve('playwright-core');
    const mod = await import(pathToFileURL(resolved).href);
    return mod.chromium || mod.default.chromium;
  } catch {
    console.error('playwright-core missing: run `node .skills/tutorial-screencast/scripts/setup.mjs`.');
    process.exit(2);
    return null;
  }
}

const requireFromCache = () => createRequire(path.join(CACHE, 'noop.js'));

/**
 * ffmpeg or ffprobe: the one on PATH if there is one, else the static build setup.mjs installs into
 * the cache (ffmpeg-static / ffprobe-static), so teammates need no Homebrew or admin rights.
 */
export function tool(name) {
  try { execFileSync('which', [name], { stdio: 'ignore' }); return name; } catch { /* use the cached build */ }
  try {
    const req = requireFromCache();
    const bin = name === 'ffmpeg' ? req('ffmpeg-static') : req('ffprobe-static').path;
    if (bin) return bin;
  } catch { /* not installed */ }
  throw new Error(`${name} missing: run \`node .skills/tutorial-screencast/scripts/setup.mjs\``);
}

/** The DA auth helper's CLI, installed into the cache by setup.mjs (run with node, not npx). */
export function daAuthCli() {
  // Its package "exports" hide the CLI from require.resolve, so use the file path.
  return path.join(CACHE, 'node_modules', 'da-auth-helper', 'src', 'cli.js');
}
