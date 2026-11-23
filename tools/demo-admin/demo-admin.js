// Demo admin app (opened from da.live, demo admins only).
// Backup and reset run here with the admin's own Adobe token: DA (admin.da.live) copies and deletes,
// the Admin API (admin.hlx.page) previews and publishes. Deleting a CloneIt demo goes through the
// CloneIt worker, whose technical account administers every demo site.
const DA_SDK_URL = 'https://da.live/nx/utils/sdk.js';
const DA = 'https://admin.da.live';
const HELIX = 'https://admin.hlx.page';
const ORG = 'scdemos';
const SITE = 'demo';
const ROOT = `/${ORG}/${SITE}`;
const BACKUP = `${ROOT}/.backup`;
const INFO = `${BACKUP}/backup-info.json`;
// top-level folders the backup leaves out (and reset leaves alone)
const SKIP = new Set(['drafts']);
// pages and sheets are previewed and published; media is served from DA
const PUBLISHABLE = new Set(['html', 'json']);
const BULK_MAX = 1000;
const params = new URLSearchParams(window.location.search);
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/** ?worker= is honored only for local testing: a page served locally talking to a local worker. */
function workerUrl() {
  const fallback = 'https://demo.bbird.live/cloneit';
  if (!LOCAL_HOSTS.includes(window.location.hostname)) return fallback;
  try {
    const u = new URL(params.get('worker') || '');
    if (u.protocol !== 'http:' || !LOCAL_HOSTS.includes(u.hostname) || u.username || u.password) return fallback;
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return fallback;
  }
}
const WORKER = workerUrl();

const MESSAGES = {
  sign_in_required: 'Open this page from da.live while signed in with your Adobe account.',
  token_invalid: 'Your Adobe sign-in expired. Reload the page.',
  demo_admins_only: 'Only demo admins can use this page.',
  no_backup: 'There\'s no backup yet. Back up the demo first.',
  site_is_protected: 'This site is protected and can\'t be deleted here.',
  not_a_cloneit_demo: 'This isn\'t a CloneIt demo.',
  content_source_not_the_demo_folder: 'This site shows another folder\'s content, so it isn\'t deleted here.',
  code_not_the_demo_repo: 'This site doesn\'t run on its own repo, so it isn\'t deleted here.',
};
const say = (code) => MESSAGES[code] || code;
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

let token = '';
let email = '';
let busy = false;

/* ---------- small UI helpers ---------- */

function setStatus(text, error = false) {
  const el = $('status');
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('error', error);
}

/** A progress list: step(text) adds a line and returns a function that updates it. */
function progress(id) {
  const ol = $(id);
  ol.replaceChildren();
  ol.hidden = false;
  return (text) => {
    const li = document.createElement('li');
    li.textContent = text;
    ol.append(li);
    return (next, state = '') => {
      li.textContent = next;
      li.className = state;
    };
  };
}

/** Asks for confirmation; with `typed`, the admin has to type it first. Resolves true on confirm. */
function confirmAction({
  title, text, typed = '', action,
}) {
  const dialog = $('confirm');
  const input = $('confirm-input');
  const ok = $('confirm-ok');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-label').textContent = typed ? `Type ${typed} to confirm` : '';
  $('confirm-label').hidden = !typed;
  input.hidden = !typed;
  input.value = '';
  ok.textContent = action;
  ok.className = typed ? 'danger' : '';
  ok.disabled = !!typed;
  input.oninput = () => { ok.disabled = input.value.trim() !== typed; };
  // Enter in the field confirms (the form's first button is Cancel)
  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!ok.disabled) ok.click();
  };
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

function lock(on) {
  busy = on;
  document.querySelectorAll('#tools button').forEach((b) => { b.disabled = on; });
}

async function run(logId, fn) {
  if (busy) return;
  lock(true);
  const step = progress(logId);
  try {
    await fn(step);
  } catch (e) {
    step(`Stopped: ${say(e.message)}`)(`Stopped: ${say(e.message)}`, 'fail');
  } finally {
    lock(false);
  }
}

/* ---------- DA ---------- */

function da(path, init = {}) {
  return fetch(`${DA}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
}

async function daList(path) {
  const items = [];
  let next = '';
  do {
    const res = await da(`/list${path}`, next ? { headers: { 'da-continuation-token': next } } : {});
    if (!res.ok) throw new Error(`Couldn't list ${path} (${res.status})`);
    items.push(...await res.json());
    next = res.headers.get('da-continuation-token') || '';
  } while (next);
  return items;
}

/** Every file under `path`, skipping the SKIP folders at the top. */
async function daWalk(path, top = true) {
  const files = [];
  const items = await daList(path);
  for (const item of items) {
    if (item.ext) files.push(item);
    else if (!(top && SKIP.has(item.name))) files.push(...await daWalk(item.path, false));
  }
  return files;
}

/** Copies a file or a whole folder; DA copies a batch per call and answers 206 while more remain. */
async function daCopy(from, to) {
  let cont = '';
  for (let i = 0; i < 500; i += 1) {
    const form = new FormData();
    form.append('destination', to);
    if (cont) form.append('continuation-token', cont);
    const res = await da(`/copy${from}`, { method: 'POST', body: form });
    if (res.status === 206) {
      cont = (await res.json()).continuationToken;
    } else if (res.ok) {
      return;
    } else {
      throw new Error(`Couldn't copy ${from} (${res.status})`);
    }
  }
  throw new Error(`Copying ${from} didn't finish`);
}

/** Deletes a file or a whole folder; DA deletes a batch per call and answers 206 while more remain. */
async function daDelete(path) {
  for (let i = 0; i < 500; i += 1) {
    const res = await da(`/source${path}`, { method: 'DELETE' });
    if (res.status === 204 || res.status === 404 || res.status === 200) return;
    if (res.status !== 206) throw new Error(`Couldn't delete ${path} (${res.status})`);
  }
  throw new Error(`Deleting ${path} didn't finish`);
}

/**
 * What to copy at the top of `path`: its folders and files (minus SKIP), plus the files in the hidden
 * `.<page>` folders where DA keeps the images of top-level pages. DA hides those folders from listings
 * and treats a dotted name as a single file, so their files are copied one by one.
 */
async function topItems(path) {
  const items = (await daList(path)).filter((i) => i.ext || !SKIP.has(i.name));
  const hidden = [];
  for (const page of items.filter((i) => i.ext === 'html')) {
    hidden.push(...await daList(`${path}/.${page.name}`));
  }
  return [...items, ...hidden];
}
const rel = (path, root) => path.slice(root.length) || '/';

async function readBackupInfo() {
  const res = await da(`/source${INFO}`);
  if (!res.ok) return null;
  const sheet = await res.json().catch(() => null);
  return sheet?.data?.[0] || null;
}

async function writeBackupInfo(info) {
  const sheet = {
    total: 1, limit: 1, offset: 0, data: [info], ':type': 'sheet',
  };
  const form = new FormData();
  form.append('data', new Blob([JSON.stringify(sheet)], { type: 'application/json' }));
  const res = await da(`/source${INFO}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Couldn't save the backup details (${res.status})`);
}

function showBackupInfo(info) {
  $('backup-info').textContent = info
    ? `Last backup: ${new Date(info.created).toLocaleString()} by ${info.by}, ${info.files} files.`
    : 'No backup yet.';
}

/* ---------- Admin API ---------- */

function helix(path, init = {}) {
  return fetch(`${HELIX}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-content-source-authorization': `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

/** Starts a bulk job and waits for it; update(text) shows its progress. Returns the stopped job. */
async function bulk(kind, body, update, label) {
  const res = await helix(`/${kind}/${ORG}/${SITE}/main/*`, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${label} didn't start (${res.status}${res.headers.get('x-error') ? `: ${res.headers.get('x-error')}` : ''})`);
  const { links } = await res.json();
  for (let i = 0; i < 900; i += 1) {
    await sleep(2000);
    const jr = await helix(links.self.replace(HELIX, ''));
    const job = jr.ok ? await jr.json() : null;
    const p = job?.progress;
    if (p) update(`${label}: ${p.processed} of ${p.total}`);
    if (job?.state === 'stopped') return job;
  }
  throw new Error(`${label} is still running. Check it later in the Admin API jobs.`);
}

async function bulkPaths(kind, paths, update, label, extra = {}) {
  let failed = 0;
  for (let i = 0; i < paths.length; i += BULK_MAX) {
    const chunk = paths.slice(i, i + BULK_MAX);
    const job = await bulk(kind, { paths: chunk, ...extra }, update, label);
    failed += job.progress?.failed || 0;
  }
  return failed;
}

/** Web path of a DA file: /en/index.html → /en/, /en/press.html → /en/press, sheets keep .json. */
function webPath(file) {
  const path = rel(file.path, ROOT).replace(/\.html$/, '');
  return path.endsWith('/index') ? path.slice(0, -'index'.length) : path;
}

/* ---------- backup ---------- */

async function backup(step) {
  let s = step('Reading the demo');
  const items = await topItems(ROOT);
  if (!items.length) throw new Error('The demo is empty, so there\'s nothing to back up.');
  s(`Found ${items.length} folders and files`, 'done');

  s = step('Removing the previous backup');
  for (const item of await topItems(BACKUP)) {
    s(`Removing the previous backup: ${rel(item.path, BACKUP)}`);
    await daDelete(item.path);
  }
  s('Removed the previous backup', 'done');

  s = step('Copying');
  for (const item of items) {
    s(`Copying ${rel(item.path, ROOT)}`);
    await daCopy(item.path, `${BACKUP}${rel(item.path, ROOT)}`);
  }
  s('Copied the demo', 'done');

  s = step('Checking the backup');
  const copied = await daWalk(BACKUP, false);
  const info = { created: new Date().toISOString(), by: email, files: String(copied.length) };
  await writeBackupInfo(info);
  s(`Backup ready: ${copied.length} files`, 'done');
  showBackupInfo(info);
}

/* ---------- reset ---------- */

async function reset(step) {
  let s = step('Checking the backup');
  const info = await readBackupInfo();
  if (!info) throw new Error('no_backup');
  const items = (await topItems(BACKUP)).filter((i) => i.path !== INFO);
  if (!items.length) throw new Error('no_backup');
  s(`Backup from ${new Date(info.created).toLocaleString()}`, 'done');

  // pages added since the backup: in the demo now, not in the backup (pages that were already
  // live without a DA page before the backup, e.g. fragments used by Target offers, are left alone)
  s = step('Listing the current pages');
  const before = (await daWalk(ROOT)).filter((f) => PUBLISHABLE.has(f.ext)).map(webPath);
  s(`${before.length} pages and sheets now`, 'done');

  s = step('Removing the current demo');
  for (const item of await topItems(ROOT)) {
    s(`Removing ${rel(item.path, ROOT)}`);
    await daDelete(item.path);
  }
  s('Removed the current demo', 'done');

  s = step('Restoring');
  for (const item of items) {
    s(`Restoring ${rel(item.path, BACKUP)}`);
    await daCopy(item.path, `${ROOT}${rel(item.path, BACKUP)}`);
  }
  s('Restored the backup', 'done');

  s = step('Listing pages');
  const pages = (await daWalk(ROOT)).filter((f) => PUBLISHABLE.has(f.ext)).map(webPath);
  s(`${pages.length} pages and sheets`, 'done');

  // keep going when some pages fail, so the rest of the demo is still published; report them at the end
  let problems = 0;
  s = step('Previewing');
  let failed = await bulkPaths('preview', pages, s, 'Previewing');
  problems += failed;
  s(`Previewed ${pages.length - failed} of ${pages.length}`, failed ? 'fail' : 'done');

  s = step('Publishing');
  failed = await bulkPaths('live', pages, s, 'Publishing');
  problems += failed;
  s(`Published ${pages.length - failed} of ${pages.length}`, failed ? 'fail' : 'done');

  s = step('Unpublishing pages added since the backup');
  const restored = new Set(pages);
  const stale = before.filter((p) => !restored.has(p));
  failed = 0;
  if (stale.length) {
    failed += await bulkPaths('live', stale, s, 'Unpublishing added pages', { delete: true });
    failed += await bulkPaths('preview', stale, s, 'Unpreviewing added pages', { delete: true });
  }
  problems += failed;
  if (failed) s(`Couldn't unpublish ${failed} of ${stale.length} added pages`, 'fail');
  else s(stale.length ? `Unpublished ${stale.length} added pages` : 'No added pages', 'done');
  const end = problems
    ? `Reset finished with ${problems} failed pages. Check them in the Admin API job details, or reset again.`
    : 'The demo matches the backup';
  step(end)(end, problems ? 'fail' : 'done');
}

/* ---------- CloneIt demos ---------- */

async function worker(path, body = {}) {
  const res = await fetch(`${WORKER}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function waitWorkerJob(site, job, update, label) {
  for (let i = 0; i < 900; i += 1) {
    await sleep(2000);
    const st = await worker('admin/job', { site, topic: job.topic, name: job.name });
    if (st.progress) update(`${label}: ${st.progress.processed} of ${st.progress.total}`);
    if (st.state === 'stopped') {
      // stop before anything is deleted for good if pages are still out there
      if (st.progress?.failed) throw new Error(`${label}: ${st.progress.failed} pages failed. Try the delete again.`);
      return st;
    }
  }
  throw new Error(`${label} is still running. Try the delete again later.`);
}

async function deleteClone(site, step) {
  const call = (name, extra = {}) => worker('admin/delete', { site, step: name, ...extra });

  let s = step('Finding its pages');
  const scan = await call('scan');
  if (scan.job) await waitWorkerJob(site, scan.job, s, 'Finding its pages');
  s('Found its pages', 'done');

  for (const [name, label] of [['unpublish', 'Unpublishing'], ['unpreview', 'Unpreviewing']]) {
    s = step(label);
    const r = scan.job ? await call(name, { job: scan.job.name }) : { count: 0, jobs: [] };
    for (const job of r.jobs || []) {
      await waitWorkerJob(site, job, s, label);
    }
    s(`${label}: ${r.count || 0} pages`, 'done');
  }

  s = step('Removing its permissions');
  const perms = await call('permissions');
  s(perms.removed?.length ? `Removed permissions for ${perms.removed.join(', ')}` : 'No permissions to remove', 'done');

  s = step('Deleting its content');
  let more = true;
  for (let i = 0; i < 20 && more; i += 1) {
    ({ more } = await call('content'));
  }
  if (more) throw new Error(`/${ORG}/${site} still has content. Try the delete again.`);
  s(`Deleted /${ORG}/${site}`, 'done');

  s = step('Deleting the site');
  await call('site');
  s('Deleted the site', 'done');

  s = step('Deleting the GitHub repo');
  await call('repo');
  s(`Deleted ${ORG}/${site}`, 'done');
  step(`${site} is deleted`)(`${site} is deleted`, 'done');
}

function cell(content) {
  const td = document.createElement('td');
  if (typeof content === 'string') td.textContent = content;
  else td.append(content);
  return td;
}

function linkTo(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  return a;
}

async function loadClones() {
  const status = $('clones-status');
  const table = $('clones');
  try {
    const { clones } = await worker('admin/clones');
    const rows = clones.map((c) => {
      const tr = document.createElement('tr');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'danger small';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete ${c.site}`);
      del.disabled = busy;
      del.addEventListener('click', async () => {
        const yes = await confirmAction({
          title: `Delete ${c.site}?`,
          text: `This unpublishes ${c.site}, deletes its content, site and GitHub repo, and can't be undone.`,
          typed: c.site,
          action: 'Delete demo',
        });
        if (!yes) return;
        await run('clone-log', (step) => deleteClone(c.site, step));
        loadClones();
      });
      tr.append(
        cell(linkTo(c.liveUrl, c.site)),
        cell(c.requester || '—'),
        cell(c.created ? new Date(c.created).toLocaleDateString() : '—'),
        cell(del),
      );
      return tr;
    });
    table.tBodies[0].replaceChildren(...rows);
    table.hidden = !rows.length;
    status.textContent = rows.length ? `${rows.length} demos` : 'No CloneIt demos.';
  } catch (e) {
    status.textContent = `Couldn't load the demos: ${say(e.message)}`;
  }
}

/* ---------- start ---------- */

async function isDemoAdmin() {
  const res = await da(`/list/${ORG}`);
  const [path, actions = ''] = String(res.headers.get('x-da-actions') || '').split('=');
  return res.ok && path === '/' && actions.split(',').includes('write');
}

async function init() {
  try {
    const { default: DA_SDK } = await import(DA_SDK_URL);
    const sdk = await Promise.race([DA_SDK, new Promise((_, no) => { setTimeout(() => no(new Error('sign_in_required')), 8000); })]);
    token = sdk.token || '';
    if (!token) throw new Error('sign_in_required');
    if (!await isDemoAdmin()) throw new Error('demo_admins_only');
    ({ email } = await worker('whoami'));
    showBackupInfo(await readBackupInfo());
    setStatus('');
    $('tools').hidden = false;
    loadClones();
  } catch (e) {
    setStatus(say(e.message), true);
  }
}

$('backup').addEventListener('click', async () => {
  const yes = await confirmAction({
    title: 'Back up the demo?',
    text: 'This replaces the previous backup.',
    action: 'Back up',
  });
  if (yes) run('backup-log', backup);
});

$('reset').addEventListener('click', async () => {
  const info = await readBackupInfo();
  if (!info) { progress('reset-log')(say('no_backup'))(say('no_backup'), 'fail'); return; }
  const yes = await confirmAction({
    title: 'Reset the demo?',
    text: `Everything in the demo except drafts is replaced with the backup from ${new Date(info.created).toLocaleString()}, then published. Changes since then are lost.`,
    typed: SITE,
    action: 'Reset demo',
  });
  if (yes) run('reset-log', reset);
});

init();
