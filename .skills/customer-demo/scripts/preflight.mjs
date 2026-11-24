#!/usr/bin/env node
/*
 * customer-demo preflight. Zero dependencies (Node 18+).
 *
 * Usage:
 *   node .skills/customer-demo/scripts/preflight.mjs \
 *     --source https://www.customer.com/path \
 *     --repo https://github.com/<owner>/<repo> \
 *     --da <org>/<site> \
 *     [--branch main] [--wait <seconds>]
 *
 * --wait polls until AEM Code Sync serves code on aem.page (or the timeout passes).
 *
 * Optional env: GITHUB_TOKEN (falls back to `gh auth token`), DA_TOKEN (IMS token for admin.da.live).
 * Prints a checklist and a JSON summary; exits 1 when a blocker is found.
 */
import { execSync } from 'node:child_process';
import process from 'node:process';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BASE_PREVIEW = 'https://main--demo--scdemos.aem.page';
const CODE_SYNC_INSTALL = 'https://github.com/apps/aem-code-sync/installations/new';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function parseRepo(value = '') {
  const m = value.trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function parseDa(value = '') {
  const m = value.trim().replace(/^https:\/\/da\.live\/#\//, '').match(/^([\w-]+)\/([\w-]+)/);
  return m ? { org: m[1], site: m[2] } : null;
}

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

async function get(url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow' });
    return { status: res.status, ok: res.ok, res };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

const results = [];
const add = (id, status, message, fix) => results.push({
  id, status, message, ...(fix ? { fix } : {}),
});

async function checkSource(source) {
  if (!source) { add('source', 'blocker', 'Missing --source customer URL'); return; }
  const r = await get(source);
  if (r.ok) add('source', 'ok', `Customer site reachable over plain HTTP (${r.status})`);
  else if ([401, 403, 429, 503].includes(r.status)) {
    add('source', 'warn', `Customer site returned ${r.status}; likely bot protection (Akamai/Cloudflare)`, 'Scrape with a real browser (playwright-cli / browser-probe skill) or fall back to EMA submit_auto_migration.');
  } else add('source', 'warn', `Customer site returned ${r.status || r.error}`);
}

async function checkBase() {
  const r = await get(`${BASE_PREVIEW}/scripts/aem.js`);
  add('base', r.ok ? 'ok' : 'warn', `Base site scdemos/demo ${r.ok ? 'reachable' : `returned ${r.status}`}`);
}

async function checkRepo(repoArg, branch, waitSeconds) {
  const repo = parseRepo(repoArg);
  if (!repo) { add('repo', 'blocker', 'Missing or invalid --repo (expected https://github.com/<owner>/<repo>)'); return null; }
  const token = githubToken();
  const headers = token ? { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } : { accept: 'application/vnd.github+json' };
  const r = await get(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, headers);
  if (r.status === 404) {
    add('repo', 'blocker', `Repo ${repo.owner}/${repo.repo} not found${token ? '' : ' (no GitHub token; private repos look like 404)'}`, `Create it empty at https://github.com/new (owner: ${repo.owner}), or authenticate with \`gh auth login\`.`);
    return repo;
  }
  if (!r.ok) { add('repo', 'warn', `GitHub API returned ${r.status}`); return repo; }
  const data = await r.res.json();
  const empty = data.size === 0;
  const canPush = data.permissions ? data.permissions.push : undefined;
  add('repo', canPush === false ? 'blocker' : 'ok', `Repo ${data.full_name} exists (${empty ? 'empty' : 'has content'}, ${data.private ? 'private' : 'public'})${canPush === undefined ? '' : `, push=${canPush}`}`,
    canPush === false ? 'Ask the repo owner for write access.' : undefined);
  if (!empty) add('repo-content', 'warn', 'Destination repo is not empty. Seeding will create a branch + PR instead of pushing to main.');

  // Code Sync: once the app is installed, the Config Service creates the site and aem.page serves code.
  const codeUrl = `https://${branch}--${repo.repo}--${repo.owner}.aem.page/scripts/aem.js`;
  let code = await get(codeUrl);
  const deadline = Date.now() + (Number(waitSeconds) || 0) * 1000;
  if (!code.ok && Date.now() < deadline) {
    console.log(`⏳ Waiting for AEM Code Sync on ${repo.owner}/${repo.repo}. Install: ${CODE_SYNC_INSTALL}`);
    while (!code.ok && Date.now() < deadline) {
      await sleep(15000);
      code = await get(codeUrl);
    }
  }
  if (code.ok) add('code-sync', 'ok', 'AEM Code Sync active (aem.page serves code)');
  else if (empty) add('code-sync', 'pending', 'Cannot verify Code Sync until code is pushed', `Install AEM Code Sync on ${repo.owner}/${repo.repo}: ${CODE_SYNC_INSTALL}`);
  else add('code-sync', 'blocker', `aem.page returned ${code.status} for code; AEM Code Sync app is probably not installed`, `Open ${CODE_SYNC_INSTALL} → select ${repo.owner} → add ${repo.repo} → Install, then re-run.`);
  return repo;
}

async function checkDa(daArg) {
  const da = parseDa(daArg);
  if (!da) { add('da', 'blocker', 'Missing or invalid --da (expected <org>/<site>)'); return null; }
  if (!process.env.DA_TOKEN) {
    add('da', 'manual', `DA ${da.org}/${da.site}: no DA_TOKEN; verify with DA MCP da_list_sources(org: "${da.org}", repo: "${da.site}")`);
    return da;
  }
  const r = await get(`https://admin.da.live/list/${da.org}/${da.site}`, { authorization: `Bearer ${process.env.DA_TOKEN}` });
  if (r.ok) {
    const items = await r.res.json();
    add('da', 'ok', `DA ${da.org}/${da.site} accessible (${items.length} items)`);
    if (items.length) add('da-content', 'warn', 'Destination DA folder is not empty; existing documents with the same path will be overwritten.');
  } else add('da', r.status === 401 || r.status === 403 ? 'blocker' : 'warn', `admin.da.live list returned ${r.status}`, 'Sign in at https://da.live and make sure you have write access to the org.');
  return da;
}

const args = parseArgs(process.argv.slice(2));
const branch = args.branch || 'main';
await checkSource(args.source);
await checkBase();
const repo = await checkRepo(args.repo, branch, args.wait);
const da = await checkDa(args.da);

const icon = {
  ok: '✅', warn: '⚠️ ', blocker: '⛔', pending: '⏳', manual: '👉',
};
results.forEach((r) => {
  console.log(`${icon[r.status]} ${r.id.padEnd(13)} ${r.message}`);
  if (r.fix) console.log(`   ↳ ${r.fix}`);
});
const summary = {
  installUrl: CODE_SYNC_INSTALL,
  repo,
  da,
  branch, source: args.source || null, blockers: results.filter((r) => r.status === 'blocker').length, results,
};
if (repo) {
  summary.previewUrl = `https://${branch}--${repo.repo}--${repo.owner}.aem.page/`;
  summary.liveUrl = `https://${branch}--${repo.repo}--${repo.owner}.aem.live/`;
}
if (da) summary.daUrl = `https://da.live/#/${da.org}/${da.site}`;
console.log(`\n${JSON.stringify(summary, null, 2)}`);
process.exit(summary.blockers ? 1 : 0);
