/*
 * tutorial-screencast: small Experience Workspace (DA) API helpers on admin.da.live.
 * Token handling follows the da-auth skill: reuse ~/.aem/da-token.json, else run the helper.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { daAuthCli } from './pw.mjs';

const ADMIN = 'https://admin.da.live';

export function daToken() {
  try {
    const { access_token: token, expires_at: exp } = JSON.parse(readFileSync(path.join(os.homedir(), '.aem', 'da-token.json'), 'utf8'));
    if (token && exp && exp - 60000 > Date.now()) return token;
  } catch { /* fall through to the helper */ }
  // The helper setup.mjs installs, run with node (npx exited silently here). It signs in through the
  // browser when needed (messages on stderr) and prints the token on stdout, which we keep to ourselves.
  let token = '';
  try {
    token = execFileSync(process.execPath, [daAuthCli(), 'token'], { stdio: ['inherit', 'pipe', 'inherit'] })
      .toString().trim().split('\n').pop();
  } catch { /* reported below */ }
  if (!token) throw new Error('No DA token: run `node .skills/tutorial-screencast/scripts/setup.mjs`, then retry (it opens an Adobe sign-in if needed).');
  return token;
}

const auth = () => ({ Authorization: `Bearer ${daToken()}` });

// org/site/path → "/source/org/site/path"
// Paths are site-relative files like /demo-docs/media/x.mp4: no "..", no query, no encoded or odd characters.
const SAFE_PATH = /^(\/[a-z0-9][a-z0-9._-]*)+$/;
export function sourceUrl(org, site, p) {
  if (!/^[a-z0-9-]+$/.test(org) || !/^[a-z0-9-]+$/.test(site)) throw new Error(`invalid org/site: ${org}/${site}`);
  if (!SAFE_PATH.test(p) || p.split('/').includes('..')) throw new Error(`invalid DA path: ${JSON.stringify(p)}`);
  return `${ADMIN}/source/${org}/${site}${p}`;
}

// 200 → true, 404 → false, anything else (401, 403, 429, 5xx) is an error: never guess "absent".
function presence(r, what) {
  if (r.status === 200) return true;
  if (r.status === 404) return false;
  throw new Error(`${what}: HTTP ${r.status}; cannot tell whether it exists`);
}

export async function exists(org, site, p) {
  return presence(await fetch(sourceUrl(org, site, p), { method: 'HEAD', headers: auth() }), `check ${p}`);
}

export async function list(org, site, folder) {
  sourceUrl(org, site, folder); // same validation
  const r = await fetch(`${ADMIN}/list/${org}/${site}${folder}`, { headers: auth() });
  if (!r.ok) throw new Error(`list ${folder}: HTTP ${r.status}`);
  return r.json();
}

export async function upload(org, site, p, bytes, type) {
  const form = new FormData();
  form.append('data', new Blob([bytes], { type }), path.basename(p));
  const r = await fetch(sourceUrl(org, site, p), { method: 'PUT', headers: auth(), body: form });
  if (!r.ok) throw new Error(`upload ${p}: HTTP ${r.status} ${await r.text()}`);
  // Read it back and compare bytes, so "uploaded" means the stored file is the one we made.
  const back = Buffer.from(await (await fetch(sourceUrl(org, site, p), { headers: auth() })).arrayBuffer());
  if (!back.equals(Buffer.from(bytes))) throw new Error(`upload ${p}: stored file differs (${back.length} vs ${bytes.length} bytes)`);
  return back.length;
}

export async function remove(org, site, p) {
  const r = await fetch(sourceUrl(org, site, p), { method: 'DELETE', headers: auth() });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${p}: HTTP ${r.status}`);
}

// Public check: has this path ever been previewed? (A previewed page needs unpublishing, not just deleting.)
export async function isPreviewed(org, site, p) {
  sourceUrl(org, site, p); // same validation
  const url = `https://main--${site}--${org}.aem.page${p.replace(/\.html$/, '')}`;
  return presence(await fetch(url, { method: 'HEAD', redirect: 'manual' }), `preview check ${p}`);
}

export async function getSource(org, site, p) {
  const r = await fetch(sourceUrl(org, site, p), { headers: auth() });
  if (!r.ok) throw new Error(`get ${p}: HTTP ${r.status}`);
  return r.text();
}

export async function putSource(org, site, p, html) {
  const form = new FormData();
  form.append('data', new Blob([html], { type: 'text/html' }), path.basename(p));
  const r = await fetch(sourceUrl(org, site, p), { method: 'PUT', headers: auth(), body: form });
  if (!r.ok) throw new Error(`save ${p}: HTTP ${r.status} ${await r.text()}`);
}

/** Preview `p` (DA path ending in .html) again, e.g. after restoring its source. */
export async function repreview(org, site, p) {
  sourceUrl(org, site, p); // same validation
  const page = p.replace(/\.html$/, '');
  const r = await fetch(`https://admin.hlx.page/preview/${org}/${site}/main${page}`, { method: 'POST', headers: auth() });
  if (!r.ok) throw new Error(`preview ${page}: HTTP ${r.status}`);
}

/** When `p` (DA path ending in .html) was last previewed, from the admin status API; 0 if never. */
export async function previewModified(org, site, p) {
  sourceUrl(org, site, p); // same validation
  const page = p.replace(/\.html$/, '');
  const r = await fetch(`https://admin.hlx.page/status/${org}/${site}/main${page}`, { headers: auth() });
  if (!r.ok) throw new Error(`status ${page}: HTTP ${r.status}`);
  const { preview } = await r.json();
  return preview?.lastModified ? Date.parse(preview.lastModified) : 0;
}

/** When `p` (site path, no extension) was last published, from the admin status API; 0 if never. */
export async function liveModified(org, site, p) {
  if (!/^(\/[a-z0-9][a-z0-9_-]*)+$/.test(p)) throw new Error(`invalid page path ${JSON.stringify(p)}`);
  const r = await fetch(`https://admin.hlx.page/status/${org}/${site}/main${p}`, { headers: auth() });
  if (!r.ok) throw new Error(`status ${p}: HTTP ${r.status}`);
  const { live } = await r.json();
  return live?.lastModified ? Date.parse(live.lastModified) : 0;
}
