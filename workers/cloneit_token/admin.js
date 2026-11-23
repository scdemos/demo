// Demo Admin routes (tools/demo-admin): list CloneIt demos and delete one, a step at a time.
// The app drives the steps in DELETE_STEPS order and shows each result; every step is safe to run again.
// Only demo admins may call these: DA decides, with the caller's own token, whether they can write the
// whole org (the permissions sheet's /+** row). Work is done with the technical account and GitHub token.
// A site is deleted only when it is a CloneIt demo: its own scdemos repo tagged customer-demo, code from
// that repo, content in content.da.live/<org>/<site>/. Other sites (the template, repoless clones, MSM
// sites, sites sharing another site's content) are refused.

const DA_ORIGIN = 'https://admin.da.live';
const SITE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const JOB_RE = /^job-[a-z0-9-]+$/i;
const BULK_MAX = 1000;
const DEMO_TOPIC = 'customer-demo';

export const DELETE_STEPS = ['scan', 'unpublish', 'unpreview', 'permissions', 'content', 'site', 'repo'];

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const list = (v) => String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const orgOf = (env) => env.ORG || 'scdemos';
const templateOf = (env) => (env.TEMPLATE_REPO || `${orgOf(env)}/demo`).split('/')[1];
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

export function isProtected(site, env) {
  return site === templateOf(env) || list(env.PROTECTED_SITES).includes(site);
}

/** Throws unless DA says the caller can write the whole org (x-da-actions: /=read,write on the org listing). */
export async function assertDemoAdmin(userToken, env, fetchImpl = fetch) {
  const res = await fetchImpl(`${DA_ORIGIN}/list/${orgOf(env)}`, { headers: { Authorization: `Bearer ${userToken}` } });
  const [path, actions = ''] = String(res.headers.get('x-da-actions') || '').split('=');
  if (!res.ok || path !== '/' || !actions.split(',').includes('write')) throw fail('demo_admins_only', 403);
}

const requesterOf = (description) => /\(requested by ([^()\s]+)\)$/.exec(String(description || '').trim())?.[1] || '';

/** CloneIt demos: scdemos repos tagged customer-demo, newest first, protected sites left out. */
export async function listClones(env, gh) {
  const org = orgOf(env);
  const clones = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await gh(`/search/repositories?q=${encodeURIComponent(`org:${org} topic:${DEMO_TOPIC}`)}&per_page=100&page=${page}`);
    if (!res.ok) throw fail(`github_search_failed_${res.status}`, 502);
    const items = res.json?.items || [];
    items.forEach((r) => {
      const site = String(r.name || '').toLowerCase();
      if (!SITE_RE.test(site) || isProtected(site, env)) return;
      clones.push({
        site,
        requester: requesterOf(r.description),
        created: r.created_at,
        updated: r.pushed_at,
        repoUrl: r.html_url,
        liveUrl: `https://main--${site}--${org}.aem.live/`,
      });
    });
    if (items.length < 100) break;
  }
  return clones.sort((a, b) => String(b.created).localeCompare(String(a.created)));
}

/**
 * Proves `site` is a CloneIt demo we may delete. Returns { config } (null once the site config is gone).
 * Once the repo is gone only the repo step may run (it then has nothing left to do).
 */
export async function assertClone(site, step, env, { gh, adminFetch }) {
  const org = orgOf(env);
  if (!SITE_RE.test(site || '') || site.length > 50) throw fail('invalid_site_name');
  if (isProtected(site, env)) throw fail('site_is_protected', 403);
  const repo = await gh(`/repos/${org}/${site}`);
  if (repo.status === 404) {
    if (step === 'repo') return { config: null, repoGone: true };
    throw fail('not_a_cloneit_demo', 403);
  }
  if (!repo.ok) throw fail(`repo_read_failed_${repo.status}`, 502);
  const topics = await gh(`/repos/${org}/${site}/topics`);
  if (!(topics.json?.names || []).includes(DEMO_TOPIC)) throw fail('not_a_cloneit_demo', 403);
  const res = await adminFetch('helix', `/config/${org}/sites/${site}.json`);
  if (res.status === 404) return { config: null };
  if (!res.ok) throw fail(`site_config_read_failed_${res.status}`, 502);
  const config = await res.json();
  const source = String(config?.content?.source?.url || '').replace(/\/?$/, '/');
  const { owner, repo: codeRepo } = config?.code || {};
  // a site that shows another folder's content (e.g. the template's) must never be unpublished from here
  if (source !== `https://content.da.live/${org}/${site}/`) throw fail('content_source_not_the_demo_folder', 409);
  if (owner !== org || codeRepo !== site) throw fail('code_not_the_demo_repo', 409);
  return { config };
}

const helixBase = (env, site) => `/${orgOf(env)}/${site}/main`;

async function startBulk(adminFetch, path, body) {
  const res = await adminFetch('helix', path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw fail(`bulk_job_failed_${res.status}${res.headers.get('x-error') ? `: ${res.headers.get('x-error')}` : ''}`, 502);
  const { job } = await res.json();
  return { topic: job.topic, name: job.name };
}

/** Paths the status job found with a preview (or live) version, skipping redirects from the redirects sheet. */
async function scannedPaths(env, site, job, field, adminFetch) {
  if (!JOB_RE.test(String(job || ''))) throw fail('scan_job_required');
  const res = await adminFetch('helix', `/job${helixBase(env, site)}/status/${job}/details`);
  if (!res.ok) throw fail(`scan_job_read_failed_${res.status}`, 502);
  const details = await res.json();
  if (details.state !== 'stopped') throw fail('scan_not_finished', 409);
  const redirect = field === 'publish' ? 'publishConfigRedirectLocation' : 'previewConfigRedirectLocation';
  return (details.data?.resources || [])
    .filter((r) => r[`${field}LastModified`] && !r[redirect])
    .map((r) => r.path);
}

async function removeBulk(env, site, job, kind, adminFetch) {
  const paths = await scannedPaths(env, site, job, kind === 'live' ? 'publish' : 'preview', adminFetch);
  const jobs = [];
  for (let i = 0; i < paths.length; i += BULK_MAX) {
    jobs.push(await startBulk(adminFetch, `/${kind}${helixBase(env, site)}/*`, { paths: paths.slice(i, i + BULK_MAX), delete: true }));
  }
  return { count: paths.length, jobs };
}

/** Drops the permissions rows that belong to the site (/<site>/CONFIG, /<site>/**, …); every other row stays. */
export function withoutSiteRows(orgConfig, site) {
  const sheet = orgConfig?.permissions;
  if (!Array.isArray(sheet?.data)) throw fail('org_config_has_no_permissions_sheet', 502);
  const mine = (r) => String(r.path || '').trim().toLowerCase().startsWith(`/${site}/`);
  const removed = sheet.data.filter(mine);
  if (!removed.length) return { config: null, removed };
  const data = sheet.data.filter((r) => !mine(r));
  return { config: { ...orgConfig, permissions: { ...sheet, data, total: data.length, limit: data.length } }, removed };
}

async function removePermissions(env, site, adminFetch, wait) {
  const path = `/config/${orgOf(env)}/`;
  const read = async () => {
    const res = await adminFetch('da', path);
    if (!res.ok) throw fail(`org_config_read_failed_${res.status}`, 502);
    return res.text();
  };
  let removed = [];
  // DA config has no conditional write: re-read just before writing and start over if anything changed
  // (CloneIt may be granting someone at the same time), then re-read after writing to check our rows are gone
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const before = await read();
    const next = withoutSiteRows(JSON.parse(before), site);
    if (!next.config) return { removed: removed.map((r) => r.path) };
    if (attempt === 3) break;
    if (await read() !== before) {
      await wait(500);
    } else {
      if (!removed.length) ({ removed } = next);
      const form = new FormData();
      form.append('config', JSON.stringify(next.config));
      const put = await adminFetch('da', path, { method: 'POST', body: form });
      if (!put.ok) throw fail(`org_config_write_failed_${put.status}`, 502);
      await wait(500);
    }
  }
  throw fail('org_config_write_not_confirmed', 502);
}

/** Deletes the site's DA folder; DA deletes a page of keys per call and answers 206 while more remain. */
async function removeContent(env, site, adminFetch) {
  const path = `/source/${orgOf(env)}/${site}`;
  for (let i = 0; i < 200; i += 1) {
    const res = await adminFetch('da', path, { method: 'DELETE' });
    if (res.status === 204 || res.status === 404) return { deleted: true };
    if (res.status !== 206) throw fail(`content_delete_failed_${res.status}`, 502);
  }
  return { deleted: false, more: true };
}

/** Runs one delete step for `site`. */
export async function deleteCloneStep({ site, step, job }, env, { gh, adminFetch }, wait = sleep) {
  if (!DELETE_STEPS.includes(step)) throw fail('invalid_step');
  const { config, repoGone } = await assertClone(site, step, env, { gh, adminFetch });
  const org = orgOf(env);
  // without a site config the site serves nothing: there is nothing left to scan, unpublish or unpreview
  if (['scan', 'unpublish', 'unpreview'].includes(step) && !config) return { step, skipped: 'site_config_gone' };
  if (step === 'scan') {
    return { step, job: await startBulk(adminFetch, `/status${helixBase(env, site)}/*`, { paths: ['/*'], select: ['preview', 'live'] }) };
  }
  if (step === 'unpublish') return { step, ...(await removeBulk(env, site, job, 'live', adminFetch)) };
  if (step === 'unpreview') return { step, ...(await removeBulk(env, site, job, 'preview', adminFetch)) };
  if (step === 'permissions') return { step, ...(await removePermissions(env, site, adminFetch, wait)) };
  if (step === 'content') return { step, ...(await removeContent(env, site, adminFetch)) };
  if (step === 'site') {
    if (!config) return { step, skipped: 'site_config_gone' };
    const res = await adminFetch('helix', `/config/${org}/sites/${site}.json`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw fail(`site_config_delete_failed_${res.status}`, 502);
    return { step, deleted: true };
  }
  // step === 'repo'
  if (repoGone) return { step, skipped: 'repo_gone' };
  const res = await gh(`/repos/${org}/${site}`, { method: 'DELETE' });
  if (res.status === 403) throw fail(`github_repo_delete_forbidden${res.json?.message ? `: ${res.json.message}` : ''}`, 502);
  if (!res.ok && res.status !== 404) throw fail(`github_repo_delete_failed_${res.status}`, 502);
  return { step, deleted: true };
}

/** State of a bulk job started by a delete step. */
export async function jobState({ site, topic, name }, env, { gh, adminFetch }) {
  if (!['status', 'live-remove', 'preview-remove', 'live', 'preview'].includes(topic) || !JOB_RE.test(String(name || ''))) throw fail('invalid_job');
  await assertClone(site, 'scan', env, { gh, adminFetch });
  const res = await adminFetch('helix', `/job${helixBase(env, site)}/${topic}/${name}`);
  if (!res.ok) throw fail(`job_read_failed_${res.status}`, 502);
  const j = await res.json();
  return { state: j.state, progress: j.progress || null };
}
