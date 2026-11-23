/*
 * tutorial-screencast: load and validate a tutorial spec (merged over specs/_defaults.json).
 * Every name and path that ends up in a file path or a DA URL is checked here, so a spec can't
 * point deletes or writes outside the skill's out/ folder or the configured site.
 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const NAME = /^[a-z0-9][a-z0-9-]{0,99}$/; // slugs, page names, org, site
const FOLDER = /^(\/[a-z0-9][a-z0-9_-]*)+$/; // /demo-docs/media
const HOST = /^https:\/\/[a-z0-9.-]+$/; // https://main--demo--scdemos.aem.page

export function check(value, re, what) {
  if (typeof value !== 'string' || !re.test(value)) throw new Error(`invalid ${what}: ${JSON.stringify(value)}`);
  return value;
}
export const checkName = (v, what) => check(v, NAME, what);
export const checkFolder = (v, what) => check(v, FOLDER, what);

/**
 * Who is recording: TUTORIAL_USER, else the OS user name, as a folder-safe name. Each teammate's
 * tutorial pages go to their own drafts folder ("{user}" in specs/_defaults.json), so cleanup.mjs
 * never deletes someone else's test takes.
 */
export function tutorialUser() {
  const raw = process.env.TUTORIAL_USER || os.userInfo().username;
  const name = String(raw).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return checkName(name, 'TUTORIAL_USER (or OS user name)');
}

/** specs/_defaults.json with "{user}" filled in. */
export function loadDefaults() {
  const defaults = JSON.parse(readFileSync(path.join(SKILL, 'specs', '_defaults.json'), 'utf8'));
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === 'string' && value.includes('{user}')) defaults[key] = value.replaceAll('{user}', tutorialUser());
  }
  return defaults;
}

export function loadSpec(arg) {
  const file = [arg, path.join(SKILL, arg), path.join(SKILL, 'specs', arg)].find((c) => {
    try { readFileSync(c); return true; } catch { return false; }
  });
  if (!file) throw new Error(`spec not found: ${arg}`);
  const spec = {
    ...loadDefaults(),
    ...JSON.parse(readFileSync(file, 'utf8')),
  };
  checkName(spec.org, 'org');
  checkName(spec.site, 'site');
  checkName(spec.slug, 'slug');
  // 80, not 100: test takes add "-test-MMDDHHmm" (14 characters).
  if (spec.page !== undefined) check(spec.page, /^[a-z0-9][a-z0-9-]{0,79}$/, 'page');
  checkFolder(spec.folder, 'folder');
  checkFolder(spec.uploadFolder, 'uploadFolder');
  check(spec.videoBase, HOST, 'videoBase');
  if (spec.siteOrigin !== undefined) check(spec.siteOrigin, HOST, 'siteOrigin');
  if (spec.aemAuthor !== undefined) check(spec.aemAuthor, /^author-p[0-9]+-e[0-9]+\.adobeaemcloud\.com$/, 'aemAuthor');
  if (spec.appUrl !== undefined) check(spec.appUrl, /^https:\/\/[a-z0-9.-]+(\/[a-z0-9_-]+)*\/$/, 'appUrl');
  if (!Number.isFinite(spec.maxSeconds) || spec.maxSeconds <= 0) throw new Error('invalid maxSeconds');
  return spec;
}

// Positive whole number from a CLI option, or the fallback when the option is absent.
export function positiveInt(value, what, fallback) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${what} must be a whole number of 1 or more`);
  return Number(value);
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
