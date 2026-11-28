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
// one row per backup, reset or demo delete; it stays put when the backup is replaced or restored
const OPS = `${BACKUP}/demo-admin-operations.json`;
const OPS_MAX = 200;
// top-level folders the backup leaves out (and reset leaves alone)
const SKIP = new Set(['drafts']);
// pages and sheets are previewed and published; media is served from DA
const PUBLISHABLE = new Set(['html', 'json']);
const BULK_MAX = 1000;
const params = new URLSearchParams(window.location.search);
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
const PREVIEW_RE = /^[a-z][a-z0-9-]{0,43}$/;

/**
 * ?worker=<branch> uses that branch's Preview of the worker (tools/cloneit/README.md, "Branch Previews").
 * ?worker=<url> is honored only for local testing: a page served locally talking to a local worker.
 */
function workerUrl() {
  const fallback = 'https://demo.bbird.live/cloneit';
  const preview = params.get('worker') || '';
  if (PREVIEW_RE.test(preview)) return `https://${preview}-demo-cloneit-token.aem-poc-lab.workers.dev/cloneit`;
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

const TRY_AGAIN = 'Try again in a few minutes. If it keeps failing, report code';
const MESSAGES = {
  sign_in_required: 'Open this page from da.live while signed in with your Adobe account.',
  token_not_accepted: 'Open this page from da.live while signed in with your Adobe account.',
  token_invalid: 'Your Adobe sign-in expired. Reload the page.',
  user_not_allowed: 'Only demo admins can use this page.',
  demo_admins_only: 'Only demo admins can use this page.',
  no_backup: 'There\'s no backup yet. Back up the demo first.',
  site_is_protected: 'This site is protected and can\'t be deleted.',
  not_a_cloneit_demo: 'This site wasn\'t created with CloneIt, so it can\'t be deleted here.',
  content_source_not_the_demo_folder: 'This site shares content with another site, so it can\'t be deleted here.',
  code_not_the_demo_repo: 'This site isn\'t set up like a CloneIt demo, so it can\'t be deleted here.',
  invalid_site_name: 'That isn\'t a valid demo name.',
};
// errors without their own message, by prefix
const KINDS = [
  ['github_repo_delete', 'Couldn\'t delete the GitHub repo.'],
  ['github_', 'Couldn\'t reach GitHub.'],
  ['org_config_', 'Couldn\'t update the permissions.'],
  ['content_delete', 'Couldn\'t delete the demo\'s content.'],
  ['site_config', 'Couldn\'t update the site settings.'],
  ['bulk_job', 'Couldn\'t start publishing changes.'],
  ['scan_', 'Couldn\'t check the demo\'s pages.'],
  ['job_read', 'Couldn\'t check the demo\'s pages.'],
];
/** A message an admin can act on; unexpected errors keep a short code to pass on. */
function say(error) {
  const code = String(error || '');
  if (MESSAGES[code]) return MESSAGES[code];
  const kind = KINDS.find(([prefix]) => code.startsWith(prefix));
  if (kind) return `${kind[1]} ${TRY_AGAIN} ${code.split(':')[0]}.`;
  // the app's own errors are already sentences
  if (/\s/.test(code)) return code;
  return `Something went wrong. ${TRY_AGAIN} ${code || 'unknown'}.`;
}
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

/**
 * Runs an operation with its progress list and adds a row to the operations log. `fn(step, notes)` returns
 * { result, comments } (default ok); `notes` collects what got done, so a stopped run still says how far it got.
 */
async function run(logId, fn, { action, target }) {
  if (busy) return;
  lock(true);
  const step = progress(logId);
  const notes = [];
  let row;
  try {
    const out = await fn(step, notes);
    row = { result: out?.result || 'ok', comments: out?.comments ?? notes.filter(Boolean).join(' ') };
  } catch (e) {
    step(`Stopped: ${say(e.message)}`)(`Stopped: ${say(e.message)}`, 'fail');
    row = { result: 'stopped', comments: [...notes.filter(Boolean), `Stopped: ${say(e.message)}`].join(' ') };
  }
  if (!await logOperation({ action, target, ...row })) {
    step('Couldn\'t add this to the operations log')('Couldn\'t add this to the operations log', 'fail');
  }
  lock(false);
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

/** Every file under `path`, skipping the SKIP folders at the top; `folders` collects the folders. */
async function daWalk(path, top = true, folders = []) {
  const files = [];
  const items = await daList(path);
  for (const item of items) {
    if (item.ext) files.push(item);
    else if (!(top && SKIP.has(item.name))) {
      folders.push(item);
      files.push(...await daWalk(item.path, false, folders));
    }
  }
  return files;
}

/** Creates an empty folder (DA keeps a folder that has no files as a marker of its own). */
async function daCreateFolder(path) {
  const res = await da(`/source${path}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Couldn't create the folder ${path} (${res.status})`);
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
 * What to copy at the top of `path`: its folders and files (minus SKIP), plus the contents of the hidden
 * folders: `.da` (product settings such as comments and translation) and the `.<page>` folders where DA
 * keeps the images of top-level pages. DA hides those folders from listings and treats a dotted name as a
 * single file, so their contents are copied item by item. The backup's own files (its details and the
 * operations log) are never removed or restored.
 */
async function topItems(path) {
  const items = (await daList(path)).filter((i) => i.ext || !SKIP.has(i.name));
  const hidden = await daList(`${path}/.da`);
  for (const page of items.filter((i) => i.ext === 'html')) {
    hidden.push(...await daList(`${path}/.${page.name}`));
  }
  return [...items, ...hidden].filter((i) => i.path !== OPS);
}
const rel = (path, root) => path.slice(root.length) || '/';
const isHidden = (path, root) => rel(path, root).split('/').some((part) => part.startsWith('.'));

/**
 * Every file backup and reset handle under `root`, including `.da` and the hidden `.<page>` image folder
 * of every page (DA hides those folders from listings, so each one is listed by name). `folders`
 * collects the folders under `root` that DA lists.
 */
async function allFiles(root, folders = []) {
  const files = await daWalk(root, true, folders);
  files.push(...await daWalk(`${root}/.da`, false));
  const imageFolders = files.filter((f) => f.ext === 'html')
    .map((f) => `${f.path.slice(0, f.path.lastIndexOf('/'))}/.${f.name}`);
  for (let i = 0; i < imageFolders.length; i += 10) {
    const found = await Promise.all(imageFolders.slice(i, i + 10)
      .map((folder) => daWalk(folder, false)));
    files.push(...found.flat());
  }
  return files.filter((f) => f.path !== INFO && f.path !== OPS);
}

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

/**
 * Adds a row to the top of the operations log. Writes are conditional on the version that was read
 * (If-Match, or If-None-Match for a new log), so two admins logging at once can't overwrite each other:
 * the one that loses re-reads and tries again.
 */
async function logOperation(row) {
  const entry = {
    date: new Date().toISOString(), by: email, action: row.action, target: row.target, result: row.result, comments: row.comments,
  };
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // start a new log only when there is none; any other read problem must not overwrite the history
      const res = await da(`/source${OPS}`);
      if (!res.ok && res.status !== 404) return false;
      const sheet = res.ok ? await res.json() : { data: [] };
      // browsers get the log compressed, and DA marks the ETag of a compressed response as weak
      // (W/"…"); If-Match only accepts the strong form, so drop the prefix
      const etag = res.headers.get('ETag')?.replace(/^W\//, '');
      if (!Array.isArray(sheet?.data) || (res.ok && !etag)) return false;
      const data = [entry, ...sheet.data].slice(0, OPS_MAX);
      const form = new FormData();
      form.append('data', new Blob([JSON.stringify({
        total: data.length, limit: data.length, offset: 0, data, ':type': 'sheet',
      })], { type: 'application/json' }));
      const put = await da(`/source${OPS}`, {
        method: 'POST',
        body: form,
        headers: res.ok ? { 'If-Match': etag } : { 'If-None-Match': '*' },
      });
      if (put.ok) return true;
      if (put.status !== 412) return false;
      await sleep(300 + Math.random() * 700);
    }
  } catch {
    // fall through: the operation itself is done, only its log row is missing
  }
  return false;
}

/* ---------- preview and publish ---------- */

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
    if (job?.state === 'stopped') {
      if (!p?.failed) return [];
      // the paths that failed, from the job's per-page results
      const dr = await helix(`${links.self.replace(HELIX, '')}/details`);
      const details = dr.ok ? await dr.json() : null;
      const failed = (details?.data?.resources || []).filter((r) => r.status >= 400)
        .map((r) => ({ path: r.path, status: r.status }));
      return failed.length ? failed : body.paths.map((path) => ({ path, status: 0 }));
    }
  }
  throw new Error(`${label} is still running. Check again in a few minutes.`);
}

/**
 * Runs a bulk job over `paths` and retries the pages that failed once (failures are usually a page
 * timing out). Returns { retried, failed }: the first failures with their status, the paths that still failed.
 */
async function bulkPaths(kind, paths, update, label, extra = {}) {
  const run = async (list, text) => {
    const failed = [];
    for (let i = 0; i < list.length; i += BULK_MAX) {
      failed.push(...await bulk(kind, { paths: list.slice(i, i + BULK_MAX), ...extra }, update, text));
    }
    return failed;
  };
  const retried = await run(paths, label);
  if (!retried.length) return { retried, failed: [] };
  update(`${label}: retrying ${retried.length} pages`);
  await sleep(5000);
  const failed = (await run(retried.map((f) => f.path), `${label} (retry)`)).map((f) => f.path);
  return { retried, failed };
}

/** For the log: what was retried (with the first error status) and what still failed. */
function retryComment(what, { retried, failed }) {
  if (!retried.length) return '';
  const list = retried.map((f) => `${f.path}${f.status ? ` (${f.status})` : ''}`).join(', ');
  const outcome = failed.length ? `Still failing after the retry: ${failed.join(', ')}.` : 'All worked on the retry.';
  return `${what} failed at first and was retried for ${list}. ${outcome}`;
}

/** Web path of a DA file: /en/index.html → /en/, /en/press.html → /en/press, sheets keep .json. */
function webPath(file) {
  const path = rel(file.path, ROOT).replace(/\.html$/, '');
  return path.endsWith('/index') ? path.slice(0, -'index'.length) : path;
}

/* ---------- backup ---------- */

/**
 * How the demo and the backup differ, by each file's path in the demo. A DA copy is dated when it's
 * made, so a demo file that isn't newer than its backup copy hasn't been edited since that copy:
 * the two are the same without looking. A newer one may only have been saved again or restored
 * (both change the date, not the content), so those are `edited` and still need contentChanged().
 * Folders are compared too, as a folder can be there without any files.
 * @param {Object[]} demo the demo's files, from allFiles(ROOT)
 * @param {Object[]} saved the backup's files, from allFiles(BACKUP)
 * @param {Object[]} [demoFolders] the demo's folders
 * @param {Object[]} [savedFolders] the backup's folders
 * @returns {Object} `onlyDemo` and `onlyBackup` files, demo files `edited` after their backup copy,
 *   and `foldersOnlyDemo` and `foldersOnlyBackup`
 */
function compare(demo, saved, demoFolders = [], savedFolders = []) {
  const backedUp = new Map(saved.map((f) => [rel(f.path, BACKUP), f]));
  const inDemo = new Set(demo.map((f) => rel(f.path, ROOT)));
  const backedUpFolders = new Set(savedFolders.map((f) => rel(f.path, BACKUP)));
  const demoFolderPaths = new Set(demoFolders.map((f) => rel(f.path, ROOT)));
  return {
    onlyDemo: demo.filter((f) => !backedUp.has(rel(f.path, ROOT))),
    onlyBackup: saved.filter((f) => !inDemo.has(rel(f.path, BACKUP))),
    edited: demo.filter((f) => {
      const copy = backedUp.get(rel(f.path, ROOT));
      return copy && !(copy.lastModified >= f.lastModified);
    }),
    foldersOnlyDemo: demoFolders.filter((f) => !backedUpFolders.has(rel(f.path, ROOT))),
    foldersOnlyBackup: savedFolders.filter((f) => !demoFolderPaths.has(rel(f.path, BACKUP))),
  };
}

// files copied, removed or compared at once
const BACKUP_PARALLEL = 4;

/**
 * Runs `fn` on every item, a few at a time; `report(done)` after each one. When one fails, the
 * others started with it still finish before the error is passed on, so nothing keeps changing
 * the demo or the backup after the run stops.
 */
async function inBatches(items, fn, report) {
  let done = 0;
  for (let i = 0; i < items.length; i += BACKUP_PARALLEL) {
    const results = await Promise.allSettled(items.slice(i, i + BACKUP_PARALLEL).map(async (item) => {
      await fn(item);
      done += 1;
      report(done);
    }));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
  }
}

/** Whether a demo file and its backup copy have the same content, byte for byte. */
async function sameContent(file) {
  const path = rel(file.path, ROOT);
  const [a, b] = await Promise.all([`${ROOT}${path}`, `${BACKUP}${path}`].map(async (p) => {
    const res = await da(`/source${p}`);
    if (!res.ok) throw new Error(`Couldn't read ${p} (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }));
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** The demo files of `edited` whose content differs from their backup copy. */
async function contentChanged(edited, report) {
  const changed = [];
  await inBatches(edited, async (f) => {
    if (!await sameContent(f)) changed.push(f);
  }, report);
  return changed;
}

/** The outermost of `folders`: removing a folder removes the folders in it. */
const outermost = (folders, root) => folders.filter((f) => !folders
  .some((other) => other !== f && rel(f.path, root).startsWith(`${rel(other.path, root)}/`)));

/**
 * Brings the backup up to date with the demo. By default it copies only what's new or changed.
 * `full` rebuilds it: removes the previous backup and copies every folder again. DA leaves files
 * with more than one dot in their name (photo.v2.jpg) out of its listings, so only a folder copy
 * picks them up. The image folders of top-level pages (and .da) can only be copied file by file,
 * so even a rebuild misses such files there.
 */
async function backup(step, notes, { full = false } = {}) {
  let s = step('Comparing the demo with the backup');
  const demoFolders = [];
  const demo = await allFiles(ROOT, demoFolders);
  if (!demo.length && !demoFolders.length) throw new Error('The demo is empty, so there\'s nothing to back up.');
  const savedFolders = [];
  const diff = compare(demo, await allFiles(BACKUP, savedFolders), demoFolders, savedFolders);
  // a full backup copies everything anyway, so it doesn't need to look inside edited files
  const changed = full ? [] : await contentChanged(diff.edited, (done) => {
    s(`Comparing ${done} of ${diff.edited.length} edited files`);
  });
  const copy = [...diff.onlyDemo, ...changed];
  const remove = diff.onlyBackup;
  const same = demo.length - copy.length;
  s(full
    ? `${demo.length} files in the demo`
    : `${copy.length} files to copy, ${remove.length} to remove, ${same} unchanged`, 'done');

  if (full) {
    s = step('Removing the previous backup');
    const previous = await topItems(BACKUP);
    let deleted = 0;
    try {
      await inBatches(previous, (item) => daDelete(item.path), (done) => {
        deleted = done;
        s(`Removed ${done} of ${previous.length} folders and files`);
      });
    } finally {
      notes.push(deleted === previous.length
        ? 'Removed the previous backup.'
        : `Removed ${deleted} of ${previous.length} folders and files of the previous backup.`);
    }
    s('Removed the previous backup', 'done');

    s = step('Copying the whole demo');
    const items = await topItems(ROOT);
    let copiedItems = 0;
    try {
      await inBatches(items, (item) => daCopy(item.path, `${BACKUP}${rel(item.path, ROOT)}`), (done) => {
        copiedItems = done;
        s(`Copied ${done} of ${items.length} folders and files`);
      });
    } finally {
      if (copiedItems) notes.push(`Copied ${copiedItems} of ${items.length} folders and files.`);
    }
    s('Copied the demo', 'done');
  } else {
    s = step('Copying what changed');
    let copied = 0;
    try {
      await inBatches(copy, (f) => daCopy(f.path, `${BACKUP}${rel(f.path, ROOT)}`), (done) => {
        copied = done;
        s(`Copied ${done} of ${copy.length}`);
      });
    } finally {
      // a stopped backup keeps what it copied: backing up again copies only the rest
      if (copied) notes.push(`Copied ${copied} of ${copy.length} new or changed files.`);
    }
    s(copy.length ? `Copied ${copy.length} files` : 'Nothing changed', 'done');
  }

  // a full backup removed the previous one already
  const stale = full ? [] : remove;
  s = step('Removing what the demo no longer has');
  const removed = [];
  const removeFile = async (f) => {
    await daDelete(f.path);
    removed.push(rel(f.path, BACKUP));
  };
  const report = () => s(`Removed ${removed.length} of ${stale.length}`);
  try {
    // pages last: a page's images are found through the page, so if a run stops, the next one
    // still finds the images of a page it couldn't finish removing
    await inBatches(stale.filter((f) => f.ext !== 'html'), removeFile, report);
    await inBatches(stale.filter((f) => f.ext === 'html'), removeFile, report);
  } finally {
    if (removed.length) notes.push(`Removed ${removed.length} files the demo no longer has: ${removed.join(', ')}.`);
  }
  // then the folders the demo no longer has (with anything DA doesn't list in them)
  const gone = full ? [] : outermost(diff.foldersOnlyBackup, BACKUP);
  const dropped = [];
  try {
    await inBatches(gone, async (f) => {
      await daDelete(f.path);
      dropped.push(rel(f.path, BACKUP));
    }, () => s(`Removed ${dropped.length} of ${gone.length} folders`));
  } finally {
    if (dropped.length) notes.push(`Removed ${dropped.length} folders the demo no longer has: ${dropped.join(', ')}.`);
  }
  s(stale.length || gone.length ? `Removed ${stale.length} files and ${gone.length} folders` : 'Nothing to remove', 'done');

  // folders the demo has with no files in them: looked up after the removals, as removing the
  // last file of a backup folder removes that folder too
  if (!full) {
    const nowFolders = [];
    await allFiles(BACKUP, nowFolders);
    const missing = compare([], [], demoFolders, nowFolders).foldersOnlyDemo;
    if (missing.length) {
      s = step('Adding folders');
      await inBatches(missing, (f) => daCreateFolder(`${BACKUP}${rel(f.path, ROOT)}`), (done) => {
        s(`Added ${done} of ${missing.length}`);
      });
      notes.push(`Added ${missing.length} folders: ${missing.map((f) => rel(f.path, ROOT)).join(', ')}.`);
      s(`Added ${missing.length} folders`, 'done');
    }
  }

  s = step('Checking the backup');
  const checkedFolders = [];
  const left = compare(demo, await allFiles(BACKUP, checkedFolders), demoFolders, checkedFolders);
  // every copy just made is newer than its demo file, so none of them should still count as edited
  const copied = new Set(copy.map((f) => f.path));
  const notCopied = left.edited.filter((f) => copied.has(f.path));
  const missing = left.onlyDemo.length + left.foldersOnlyDemo.length + notCopied.length;
  const extra = left.onlyBackup.length + left.foldersOnlyBackup.length;
  if (missing || extra) {
    throw new Error(`The backup doesn't match the demo yet (${missing} missing, ${extra} extra). Back up again.`);
  }
  const info = { created: new Date().toISOString(), by: email, files: String(demo.length) };
  await writeBackupInfo(info);
  s(`Backup ready: ${demo.length} files`, 'done');
  showBackupInfo(info);
  return {
    comments: full
      ? `Full backup of ${demo.length} files.`
      : `Backed up ${demo.length} files: copied ${copy.length} new or changed, removed ${remove.length}, ${same} unchanged.`,
  };
}

/* ---------- reset ---------- */

/**
 * The page to preview and publish again when a demo file changes: the page itself, or for an image in
 * a page's hidden `.<page>` folder, that page (it only picks up the image when it's previewed again).
 * Returns '' for files that aren't served as pages (.da settings, media of the demo's own media folders).
 */
function pageOf(path) {
  const parts = path.split('/');
  const hidden = parts.findIndex((part) => part.startsWith('.'));
  if (hidden === -1) return /\.(html|json)$/.test(path) ? webPath({ path: `${ROOT}${path}` }) : '';
  if (parts[hidden] === '.da') return '';
  const page = `${parts.slice(0, hidden).join('/')}/${parts[hidden].slice(1)}.html`;
  return webPath({ path: `${ROOT}${page}` });
}

/** Whether the live version of `page` is older than `lastModified` (ms), the DA date of a file it shows. */
async function liveIsOlder(page, lastModified) {
  const res = await helix(`/status/${ORG}/${SITE}/main${page}`);
  if (!res.ok) return true;
  const { preview, live } = await res.json();
  // when it was last previewed, and published after that (not the page's own date: a restored image is
  // newer than its page); a publish without a fresh preview only republishes the old preview.
  // The Admin API dates to the second.
  const previewed = Date.parse(preview?.lastModified || '');
  return preview?.status !== 200 || live?.status !== 200
    || !(previewed >= Math.floor(lastModified / 1000) * 1000)
    || !(Date.parse(live.lastModified || '') >= previewed);
}

/** Previews then publishes `pages`, or with `remove`, unpublishes then unpreviews them. */
async function publishPages(pages, step, notes, { remove = false } = {}) {
  if (!pages.length) return [];
  const runs = remove
    ? [['live', 'Unpublishing'], ['preview', 'Unpreviewing']]
    : [['preview', 'Previewing'], ['live', 'Publishing']];
  const failed = new Set();
  for (const [kind, label] of runs) {
    // a page whose preview failed isn't published: that would only publish its old preview again
    const todo = remove ? pages : pages.filter((p) => !failed.has(p));
    if (!todo.length) break;
    const s = step(label);
    const out = await bulkPaths(kind, todo, s, label, remove ? { delete: true } : {});
    out.failed.forEach((p) => failed.add(p));
    s(`${label}: ${todo.length - out.failed.length} of ${todo.length}`, out.failed.length ? 'fail' : 'done');
    notes.push(`${label}: ${todo.length - out.failed.length} of ${todo.length}.`, retryComment(label, out));
  }
  return [...failed];
}

/**
 * Puts the demo back to the backup. Only what differs is touched: files the demo lost or changed
 * since the backup are copied back (over the demo's file, so a page keeps its document ID and its
 * comments), files added since are removed, and only those pages are published or taken offline again.
 * When nothing differs there is nothing to do. Republishing every page is a separate action.
 */
async function reset(step, notes) {
  let s = step('Checking the backup');
  const info = await readBackupInfo();
  if (!info) throw new Error('no_backup');
  const savedFolders = [];
  const saved = await allFiles(BACKUP, savedFolders);
  if (!saved.length && !savedFolders.length) throw new Error('no_backup');
  s(`Backup from ${new Date(info.created).toLocaleString()}`, 'done');

  s = step('Comparing the demo with the backup');
  const demoFolders = [];
  let demo = await allFiles(ROOT, demoFolders);
  // backups made before .da was included have none: leave the demo's .da alone then
  if (!saved.some((f) => rel(f.path, BACKUP).startsWith('/.da/'))) {
    demo = demo.filter((f) => !rel(f.path, ROOT).startsWith('/.da/'));
  }
  const diff = compare(demo, saved, demoFolders, savedFolders);
  const changed = await contentChanged(diff.edited, (done) => {
    s(`Comparing ${done} of ${diff.edited.length} edited files`);
  });
  const restore = [...diff.onlyBackup.map((f) => rel(f.path, BACKUP)), ...changed.map((f) => rel(f.path, ROOT))];
  // files with the backup's content but a newer date were restored by an earlier reset (or saved again):
  // their page is published again when its live version is older than the file, e.g. when that reset
  // stopped before publishing, or a page failed to publish
  const changedPaths = new Set(changed.map((f) => f.path));
  const same = diff.edited.filter((f) => !changedPaths.has(f.path) && pageOf(rel(f.path, ROOT)));
  const stalePages = new Set();
  await inBatches(same, async (f) => {
    const page = pageOf(rel(f.path, ROOT));
    if (await liveIsOlder(page, f.lastModified)) stalePages.add(page);
  }, (done) => s(`Checking ${done} of ${same.length} published pages`));
  const added = diff.onlyDemo;
  const addedFolders = outermost(diff.foldersOnlyDemo, ROOT);
  // empty folders of the backup; folders with files come back with their files
  const emptyFolders = diff.foldersOnlyBackup.map((f) => rel(f.path, BACKUP))
    .filter((folder) => !restore.some((path) => path.startsWith(`${folder}/`)));
  const todo = restore.length + added.length + addedFolders.length + emptyFolders.length + stalePages.size;
  s(todo
    ? `${restore.length} files to restore, ${added.length} files and ${addedFolders.length} folders added since the backup${stalePages.size ? `, ${stalePages.size} pages to publish again` : ''}`
    : `${demo.length} files, all the same as the backup`, 'done');
  if (!todo) {
    step('The demo already matches the backup')('The demo already matches the backup', 'done');
    return { comments: `The demo already matched the backup from ${info.created}: nothing to restore, publish or remove.` };
  }
  notes.push(`Reset to the backup from ${info.created}.`);

  if (restore.length) {
    s = step('Restoring');
    let restored = 0;
    try {
      await inBatches(restore, (path) => daCopy(`${BACKUP}${path}`, `${ROOT}${path}`), (done) => {
        restored = done;
        s(`Restored ${done} of ${restore.length}`);
      });
    } finally {
      if (restored) notes.push(`Restored ${restored} of ${restore.length} files: ${restore.join(', ')}.`);
    }
    s(`Restored ${restore.length} files`, 'done');
  }

  if (added.length || addedFolders.length) {
    s = step('Removing what was added since the backup');
    const removed = [];
    const removeFile = async (f) => {
      await daDelete(f.path);
      removed.push(rel(f.path, ROOT));
    };
    const report = () => s(`Removed ${removed.length} of ${added.length + addedFolders.length}`);
    try {
      // pages last, then folders: a page's images are found through the page, so a stopped run
      // still finds the images of a page it couldn't finish removing
      await inBatches(added.filter((f) => f.ext !== 'html'), removeFile, report);
      await inBatches(added.filter((f) => f.ext === 'html'), removeFile, report);
      await inBatches(addedFolders, removeFile, report);
    } finally {
      if (removed.length) notes.push(`Removed ${removed.length} files and folders added since the backup: ${removed.join(', ')}.`);
    }
    s(`Removed ${added.length} files and ${addedFolders.length} folders`, 'done');
  }

  // the backup's empty folders, looked up after the removals: removing the last file of a folder
  // removes that folder too
  if (savedFolders.length) {
    const nowFolders = [];
    await allFiles(ROOT, nowFolders);
    const missing = compare([], [], nowFolders, savedFolders).foldersOnlyBackup;
    if (missing.length) {
      s = step('Adding folders');
      await inBatches(missing, (f) => daCreateFolder(`${ROOT}${rel(f.path, BACKUP)}`), (done) => {
        s(`Added ${done} of ${missing.length}`);
      });
      notes.push(`Added ${missing.length} empty folders: ${missing.map((f) => rel(f.path, BACKUP)).join(', ')}.`);
      s(`Added ${missing.length} folders`, 'done');
    }
  }

  // keep going when some pages fail, so the rest is still published; report them at the end
  const republish = [...new Set([...restore.map(pageOf).filter(Boolean), ...stalePages])];
  const restoredPages = new Set(republish);
  // pages whose DA page was added since the backup go offline (pages that were live without a DA page
  // before the backup, e.g. fragments used by Target offers, are left alone)
  const offline = [...new Set(added.map((f) => rel(f.path, ROOT))
    .filter((path) => PUBLISHABLE.has(path.split('.').pop()) && !isHidden(`${ROOT}${path}`, ROOT))
    .map((path) => webPath({ path: `${ROOT}${path}` })))]
    .filter((page) => !restoredPages.has(page));
  const problems = await publishPages(republish, step, notes);
  const stillOnline = await publishPages(offline, step, notes, { remove: true });

  const advice = [];
  if (problems.length) advice.push(`These pages didn't preview or publish, even on retry: ${problems.join(', ')}. Publish them from Experience Workspace, or reset again.`);
  // their DA pages are gone, so another reset won't find them: name them
  if (stillOnline.length) advice.push(`These added pages may still be online: ${stillOnline.join(', ')}. Unpublish them with Sidekick.`);
  const end = advice.length ? `Reset finished with problems. ${advice.join(' ')}` : 'The demo matches the backup';
  step(end)(end, advice.length ? 'fail' : 'done');
  return { result: advice.length ? 'problems' : 'ok' };
}

/**
 * Previews and publishes every page and sheet of the demo (except drafts). For when the published site
 * drifted without any change in DA, e.g. a page was unpublished with Sidekick; a reset doesn't do it.
 */
async function republishAll(step, notes) {
  const s = step('Listing pages');
  const pages = (await daWalk(ROOT)).filter((f) => PUBLISHABLE.has(f.ext)).map(webPath);
  s(`${pages.length} pages and sheets`, 'done');
  const problems = await publishPages(pages, step, notes);
  const end = problems.length
    ? `Finished with problems. These pages didn't preview or publish, even on retry: ${problems.join(', ')}.`
    : `Published all ${pages.length} pages and sheets`;
  step(end)(end, problems.length ? 'fail' : 'done');
  return { result: problems.length ? 'problems' : 'ok' };
}

/**
 * The full reset (the reset before it compared anything): copies every top-level folder of the backup
 * over the demo, removes the files added since, and previews and publishes every page. It's slow, and
 * it's the only way to restore files DA doesn't list, such as images with more than one dot in their
 * name, which only a full backup picks up.
 */
async function fullReset(step, notes) {
  let s = step('Checking the backup');
  const info = await readBackupInfo();
  if (!info) throw new Error('no_backup');
  const items = (await topItems(BACKUP)).filter((i) => i.path !== INFO);
  if (!items.length) throw new Error('no_backup');
  s(`Backup from ${new Date(info.created).toLocaleString()}`, 'done');

  // Copy the backup over the demo instead of deleting it first: a page that's overwritten keeps its
  // document ID, so its comments (stored by ID in .da) stay attached. Then remove what the backup doesn't have.
  s = step('Comparing the demo with the backup');
  const current = await allFiles(ROOT);
  const saved = new Set((await allFiles(BACKUP)).map((f) => rel(f.path, BACKUP)));
  // backups made before .da was included have none: leave the demo's .da alone then
  const hasDa = [...saved].some((path) => path.startsWith('/.da/'));
  const extra = current.filter((f) => !saved.has(rel(f.path, ROOT))
    && (hasDa || !rel(f.path, ROOT).startsWith('/.da/')));
  // pages added since the backup are taken offline later (pages that were live without a DA page
  // before the backup, e.g. fragments used by Target offers, are left alone)
  const before = current.filter((f) => PUBLISHABLE.has(f.ext) && !isHidden(f.path, ROOT)).map(webPath);
  s(`${extra.length} files added since the backup`, 'done');

  s = step('Restoring');
  for (const item of items) {
    s(`Restoring ${rel(item.path, BACKUP)}`);
    await daCopy(item.path, `${ROOT}${rel(item.path, BACKUP)}`);
  }
  s('Restored the backup', 'done');
  notes.push(`Restored the backup from ${info.created}.`);

  s = step('Removing files added since the backup');
  for (const file of extra) {
    s(`Removing ${rel(file.path, ROOT)}`);
    await daDelete(file.path);
  }
  s(extra.length ? `Removed ${extra.length} files` : 'Nothing to remove', 'done');
  if (extra.length) notes.push(`Removed ${extra.length} files added since the backup: ${extra.map((f) => rel(f.path, ROOT)).join(', ')}.`);

  s = step('Listing pages');
  const pages = (await daWalk(ROOT)).filter((f) => PUBLISHABLE.has(f.ext)).map(webPath);
  s(`${pages.length} pages and sheets`, 'done');

  // keep going when some pages fail, so the rest of the demo is still published; report them at the end
  s = step('Previewing');
  const preview = await bulkPaths('preview', pages, s, 'Previewing');
  s(`Previewed ${pages.length - preview.failed.length} of ${pages.length}`, preview.failed.length ? 'fail' : 'done');
  notes.push(`Previewed ${pages.length - preview.failed.length} of ${pages.length} pages and sheets.`, retryComment('Preview', preview));

  s = step('Publishing');
  const publish = await bulkPaths('live', pages, s, 'Publishing');
  s(`Published ${pages.length - publish.failed.length} of ${pages.length}`, publish.failed.length ? 'fail' : 'done');
  notes.push(`Published ${pages.length - publish.failed.length} of ${pages.length} pages and sheets.`, retryComment('Publish', publish));
  const problems = [...new Set([...preview.failed, ...publish.failed])];

  s = step('Unpublishing pages added since the backup');
  const restored = new Set(pages);
  const stale = before.filter((p) => !restored.has(p));
  let removalFailed = [];
  if (stale.length) {
    notes.push(`Pages added since the backup: ${stale.join(', ')}.`);
    const unpublished = await bulkPaths('live', stale, s, 'Unpublishing added pages', { delete: true });
    notes.push(retryComment('Unpublishing', unpublished));
    const unpreviewed = await bulkPaths('preview', stale, s, 'Unpreviewing added pages', { delete: true });
    notes.push(retryComment('Unpreviewing', unpreviewed));
    removalFailed = [...new Set([...unpublished.failed, ...unpreviewed.failed])];
  }
  if (removalFailed.length) s(`Couldn't unpublish ${removalFailed.length} of ${stale.length} added pages`, 'fail');
  else s(stale.length ? `Unpublished ${stale.length} added pages` : 'No added pages', 'done');
  const advice = [];
  if (problems.length) advice.push(`These pages didn't preview or publish, even on retry: ${problems.join(', ')}. Publish them from Experience Workspace, or reset again.`);
  // their DA pages are gone, so another reset won't find them: name them
  if (removalFailed.length) advice.push(`These added pages may still be online: ${removalFailed.join(', ')}. Unpublish them with Sidekick.`);
  const end = advice.length ? `Reset finished with problems. ${advice.join(' ')}` : 'The demo matches the backup';
  step(end)(end, problems.length || removalFailed.length ? 'fail' : 'done');
  return { result: problems.length || removalFailed.length ? 'problems' : 'ok' };
}

/* ---------- CloneIt demos ---------- */

async function worker(path, body = {}) {
  const res = await fetch(`${WORKER}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `http_${res.status}`);
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

async function deleteClone(site, step, notes) {
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
    notes.push(`${label}: ${r.count || 0} pages.`);
  }

  s = step('Removing its permissions');
  const perms = await call('permissions');
  s(perms.removed?.length ? `Removed permissions for ${perms.removed.join(', ')}` : 'No permissions to remove', 'done');
  notes.push(perms.removed?.length ? `Removed permissions for ${perms.removed.join(', ')}.` : 'No permissions to remove.');

  s = step('Deleting its content');
  let more = true;
  for (let i = 0; i < 20 && more; i += 1) {
    ({ more } = await call('content'));
  }
  if (more) throw new Error(`/${ORG}/${site} still has content. Try the delete again.`);
  s(`Deleted /${ORG}/${site}`, 'done');
  notes.push('Deleted its content.');

  s = step('Deleting the site');
  await call('site');
  s('Deleted the site', 'done');
  notes.push('Deleted the site.');

  s = step('Deleting the GitHub repo');
  await call('repo');
  s(`Deleted ${ORG}/${site}`, 'done');
  notes.push('Deleted the GitHub repo.');
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
        await run('clone-log', (step, notes) => deleteClone(c.site, step, notes), { action: 'delete demo', target: c.site });
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
    text: 'The backup is updated to match the demo as it is now.',
    action: 'Back up',
  });
  if (yes) run('backup-log', backup, { action: 'backup', target: SITE });
});

$('backup-full').addEventListener('click', async () => {
  const yes = await confirmAction({
    title: 'Make a full backup?',
    text: 'The previous backup is removed and every folder of the demo is copied again, so this takes longer than a regular backup. It also picks up files DA doesn\'t list, such as images with more than one dot in their name (except on top-level pages).',
    action: 'Back up everything',
  });
  if (yes) run('backup-log', (step, notes) => backup(step, notes, { full: true }), { action: 'full backup', target: SITE });
});

$('reset').addEventListener('click', async () => {
  const info = await readBackupInfo();
  if (!info) { progress('reset-log')(say('no_backup'))(say('no_backup'), 'fail'); return; }
  const yes = await confirmAction({
    title: 'Reset the demo?',
    text: `Everything that changed since the backup from ${new Date(info.created).toLocaleString()} is put back and published again, and pages added since are removed. Those changes are lost. Drafts stay as they are.`,
    typed: SITE,
    action: 'Reset demo',
  });
  if (yes) run('reset-log', reset, { action: 'reset', target: SITE });
});

$('reset-full').addEventListener('click', async () => {
  const info = await readBackupInfo();
  if (!info) { progress('reset-log')(say('no_backup'))(say('no_backup'), 'fail'); return; }
  const yes = await confirmAction({
    title: 'Make a full reset?',
    text: `Every folder of the backup from ${new Date(info.created).toLocaleString()} is copied over the demo, files added since are removed, and every page is published again. This takes much longer than a regular reset. Use it when files DA doesn't list, such as images with more than one dot in their name, need to come back.`,
    typed: SITE,
    action: 'Full reset',
  });
  if (yes) run('reset-log', fullReset, { action: 'full reset', target: SITE });
});

$('republish').addEventListener('click', async () => {
  const yes = await confirmAction({
    title: 'Republish every page?',
    text: 'Every page and sheet of the demo (except drafts) is previewed and published again as it is in DA now. This takes a few minutes.',
    action: 'Republish',
  });
  if (yes) run('reset-log', republishAll, { action: 'republish all', target: SITE });
});

init();
