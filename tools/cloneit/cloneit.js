/* eslint-disable no-console */

// CloneIt: create a demo (init → cloneSite → worker). Every demo gets its own repo scdemos/<site>
// (created by the worker from scdemos/demo and added to AEM Code Sync) and its own DA folder with the
// demo content, config and index, previewed and published. Customizing it with the customer-demo AI
// skill is an optional next step.
// A template on Helix 6 (content in the AEM source bus) gives a clone on Helix 6: see source.js.

import {
  isHlx6Config,
  hlx6ContentSource,
  createSourceBusClient,
  collectSourceBusFiles,
  copyFiles,
  rewriteForNewSite,
  bulkPaths,
} from './source.js';

const ORG = 'scdemos';
const CODE_OWNER = 'scdemos';
const CODE_REPO = 'demo';
const DEFAULT_WORKER_URL = 'https://demo.bbird.live/cloneit/';
// ?worker=<branch> points the app at that branch's Preview of the worker (see README, "Branch Previews"),
// ?worker=http://localhost:8787 at a local `wrangler dev` worker (localhost only)
const PREVIEW_RE = /^[a-z][a-z0-9-]{0,43}$/;
function resolveWorkerUrl() {
  const override = new URLSearchParams(window.location.search).get('worker');
  if (override && PREVIEW_RE.test(override)) return `https://${override}-demo-cloneit-token.aem-poc-lab.workers.dev/cloneit/`;
  if (override && /^http:\/\/localhost:\d+\/?$/.test(override)) return override.endsWith('/') ? override : `${override}/`;
  return DEFAULT_WORKER_URL;
}
const CLONEIT_WORKER_URL = resolveWorkerUrl();
// every demo starts from the base demo site (content + code); the customer-demo skill replaces the content.
const BASELINE_SITE = 'demo';
// opened in DA from demo-hlx6 (demo's Helix 6 copy), CloneIt clones that site's content instead;
// opened from any other site (every demo repo carries this tool), it still clones demo
const HLX6_TEMPLATE = 'demo-hlx6';
const TEMPLATE_SITES = [BASELINE_SITE, HLX6_TEMPLATE];
const GH_USER_KEY = 'cloneit.githubUser';
const GH_USER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const REGISTRY = { site: 'demo-registry', path: 'demos.json' };
const CLONEIT_WORKER_ERROR_SOURCE = 'cloneit-worker';

const DA_SDK_URL = 'https://da.live/nx/utils/sdk.js';

/** User-facing messages (avoid scattering literals). */
const UI = {
  toastSdkFailed:
    'Sign in to Document Authoring and open CloneIt from DA, then refresh.',
  toastReady: 'CloneIt is ready. Enter a site name and your GitHub username to start.',
  resultReady: 'Your repository, site and DA folder are ready. Demo it as is, or make it look like the customer with the customer-demo AI skill.',
  resultReadyHlx6: 'Your repository and Helix 6 site are ready. Demo it as is, or make it look like the customer with the customer-demo AI skill.',
};

// Paths must stay aligned with workers/cloneit_token isAllowedProxyPath().
const Paths = {
  helixSiteJson: (site) => `/config/${ORG}/sites/${site}.json`,
  helixQueryYaml: (site) => `/config/${ORG}/sites/${site}/content/query.yaml`,
  daList: (repo, basePath = '') => {
    const part = basePath ? (basePath.startsWith('/') ? basePath : `/${basePath}`) : '';
    return `/list/${ORG}/${repo}${part}`;
  },
  daConfig: (org, repo) => `/config/${org}/${repo}`,
  daCopyFromBaseline: (baselineSite, sourcePath) => `/copy/${ORG}/${baselineSite}/${sourcePath}`,
  daSource: (site, cleanPath) => `/source/${ORG}/${site}/${cleanPath}`,
  helixCode: (site, path = '*') => `/code/${ORG}/${site}/main/${path}`,
  helixBulk: (topic, site) => `/${topic}/${ORG}/${site}/main/*`,
  helixJob: (site, topic, job) => `/job/${ORG}/${site}/main/${topic}/${job}/details`,
};

/** The worker requires the caller's own IMS token (from the DA SDK) on every request. */
function authHeaders(extra = {}) {
  return app.imsToken ? { ...extra, Authorization: `Bearer ${app.imsToken}` } : extra;
}

async function ensureWorkerReady() {
  const response = await fetch(`${CLONEIT_WORKER_URL}whoami`, { method: 'POST', headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Worker: ${response.status}`);
  }
  app.userEmail = data.email || '';
  app.standaloneAvailable = !!data.standalone;
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

async function cloneitProcessFetch(kind, path, opts = {}) {
  const response = await fetch(`${CLONEIT_WORKER_URL}cloneprocess`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      kind,
      path,
      method: opts.method || 'GET',
      body: opts.body,
      contentType: opts.contentType,
      form: opts.form,
      file: opts.file,
    }),
  });
  const ct = response.headers.get('Content-Type') || '';
  if (!response.ok && ct.includes('application/json')) {
    const err = await response.clone().json().catch(() => ({}));
    if (err?.source === CLONEIT_WORKER_ERROR_SOURCE && typeof err.error === 'string') {
      throw new Error(err.error);
    }
  }
  return response;
}

function wait(ms) {
  return new Promise((r) => { setTimeout(r, ms); });
}

const API = {
  AEM_CONFIG: 'https://admin.hlx.page/config',
};

const app = {
  workerReady: false,
  sdkReady: false,
  imsToken: '',
  userEmail: '',
  standaloneAvailable: false,
  baselineSite: BASELINE_SITE,
};

const SITE_NAME_MAX_LENGTH = 50;
const RESERVED_NAMES = ['admin', 'api', 'config', 'main', 'live', 'preview', 'status', 'job'];

// the base demo's working folders; everything else (/en, /de, /media, …) is copied
const SKIPPED_FOLDERS = new Set(['drafts', 'demo-docs']);

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const messageEl = toast?.querySelector('.toast-message');
  if (!toast || !messageEl) return;
  messageEl.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 5000);
}

/** The site to clone: the site CloneIt is opened from when it's a template, else demo. */
function templateSite(repo) {
  return TEMPLATE_SITES.includes(repo) ? repo : BASELINE_SITE;
}

/** Loads the DA SDK for the signed-in user's IMS token (the worker requires it on every call). */
async function initDaSdk() {
  try {
    const { default: DA_SDK } = await import(DA_SDK_URL);
    // outside a DA context the SDK never resolves: fail fast with a clear message
    const sdk = await Promise.race([DA_SDK, wait(8000).then(() => { throw new Error('no_da_context'); })]);
    app.imsToken = sdk.token || '';
    app.sdkReady = !!app.imsToken;
    app.baselineSite = templateSite(sdk.context?.repo);
  } catch (e) {
    console.error('DA SDK unavailable:', e);
    app.sdkReady = false;
  }
}

function validateSiteName(name, baselineSite) {
  const trimmed = (name || '').trim().toLowerCase();
  if (!trimmed) return { valid: false, error: 'Site name is required' };
  if (trimmed.length > SITE_NAME_MAX_LENGTH) {
    return { valid: false, error: `Site name must be ${SITE_NAME_MAX_LENGTH} characters or less` };
  }
  const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!pattern.test(trimmed)) {
    return { valid: false, error: 'Use lowercase letters, numbers, and hyphens only' };
  }
  const base = (baselineSite || '').trim().toLowerCase();
  if (base && trimmed === base) {
    return { valid: false, error: 'Cannot use the same name as the template site' };
  }
  if (RESERVED_NAMES.includes(trimmed)) {
    return { valid: false, error: `"${trimmed}" is a reserved name` };
  }
  return { valid: true, value: trimmed };
}

function setCloneStep(step) {
  const stepper = document.getElementById('cloneit-stepper');
  const main = document.getElementById('cloneit-main');
  if (stepper) {
    stepper.dataset.step = String(step);
    stepper.querySelectorAll('.cloneit-steps-step').forEach((el) => {
      const n = Number(el.dataset.stepIndex, 10);
      el.removeAttribute('aria-current');
      if (n === step) el.setAttribute('aria-current', 'step');
    });
  }
  if (main) {
    main.dataset.step = String(step);
  }

  if (step === 2) {
    document.getElementById('progress-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (step === 3) {
    document.getElementById('result-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setProgress(visible, percent, text, fileName, phase, count) {
  const container = document.getElementById('progress-container');
  const fill = document.getElementById('progress-fill');
  const textEl = document.getElementById('progress-text');
  const filesEl = document.getElementById('progress-files');
  const phaseEl = document.getElementById('progress-phase');
  const countEl = document.getElementById('progress-count');
  if (visible) setCloneStep(2);
  if (container) container.style.display = visible ? 'block' : 'none';
  if (fill) fill.style.width = `${percent}%`;
  if (textEl) textEl.textContent = text || '';
  if (phaseEl && phase != null) phaseEl.textContent = phase;
  if (countEl && count != null) countEl.textContent = count;
  if (filesEl && fileName) {
    const item = document.createElement('div');
    item.className = 'progress-file-item';
    item.textContent = fileName;
    filesEl.appendChild(item);
    filesEl.scrollTop = filesEl.scrollHeight;
  }
  if (filesEl && !visible) filesEl.innerHTML = '';
}

function setButtonLoading(loading) {
  const btn = document.getElementById('clone-btn');
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const loadingEl = btn.querySelector('.btn-loading');
  btn.disabled = loading;
  btn.setAttribute('aria-busy', loading ? 'true' : 'false');
  if (text) text.style.display = loading ? 'none' : 'inline';
  if (loadingEl) loadingEl.style.display = loading ? 'inline-flex' : 'none';
}

/**
 * @returns {{ html: string, plainLines: string[] }}
 */
function buildResultSummaryHtmlAndPlainLines(siteName, options) {
  const {
    daConfigCopied = false,
    queryIndex = {},
    baselineSite: baselineSiteOpt = '',
    codeSynced = true,
    publish = null,
    copyFailed = [],
    permissions = null,
    hlx6 = false,
    overlaySkipped = false,
  } = options;
  const baselineSite = baselineSiteOpt || '—';
  const contentLabel = hlx6 ? 'Content (source bus)' : 'DA content';
  const {
    copied: queryIndexCopied = false,
    verified: queryIndexVerified = false,
    skippedNoBaseline = false,
    error: queryIndexError = null,
    buildError: indexBuildError = null,
  } = queryIndex;

  const plainLines = [];
  plainLines.push(`${contentLabel}: ${ORG}/${baselineSite}/ → ${ORG}/${siteName}/`);
  if (daConfigCopied) plainLines.push('DA config copied');
  plainLines.push('AEM site config created');

  const queryYamlUrl = `${API.AEM_CONFIG}/${ORG}/sites/${siteName}/content/query.yaml`;
  let queryLine = '';
  if (skippedNoBaseline) {
    queryLine = `<li>Query index (<code>query.yaml</code>): skipped — baseline <code>${escapeHtml(baselineSite)}</code> has no <code>query.yaml</code> in Admin API (nothing to copy)</li>`;
    plainLines.push(`Query index (query.yaml): skipped — baseline ${baselineSite} has no query.yaml in Admin API`);
  } else if (queryIndexError) {
    queryLine = `<li class="result-summary-warn">Query index (<code>query.yaml</code>): <strong>not copied</strong> — ${escapeHtml(queryIndexError)}</li>`;
    plainLines.push(`Query index (query.yaml): not copied — ${queryIndexError}`);
  } else if (queryIndexCopied && indexBuildError) {
    queryLine = `<li class="result-summary-warn">Query index (<code>query.yaml</code>): copied, but <strong>the index wasn't built</strong> — ${escapeHtml(indexBuildError)}</li>`;
    plainLines.push(`Query index (query.yaml): copied, but the index wasn't built — ${indexBuildError}`);
  } else if (queryIndexCopied && queryIndexVerified) {
    queryLine = `<li>Query index (<code>query.yaml</code>): copied and <strong>verified</strong></li>`;
    plainLines.push('Query index (query.yaml): copied and verified');
  } else if (queryIndexCopied && !queryIndexVerified) {
    queryLine = `<li class="result-summary-warn">Query index (<code>query.yaml</code>): upload reported OK but <strong>verification failed</strong> (GET still empty after retries). Check Admin API or re-upload <code>query.yaml</code> for <code>${ORG}/${siteName}</code> — <a href="${queryYamlUrl}" target="_blank" rel="noopener noreferrer">direct link</a></li>`;
    plainLines.push(`Query index (query.yaml): verification failed — ${queryYamlUrl}`);
  } else {
    queryLine = `<li>Query index (<code>query.yaml</code>): not configured</li>`;
    plainLines.push('Query index (query.yaml): not configured');
  }

  const extra = [];
  if (copyFailed.length) {
    extra.push([`<strong>${copyFailed.length} file${copyFailed.length === 1 ? '' : 's'} couldn't be copied</strong>: ${copyFailed.map((f) => `<code>${escapeHtml(f)}</code>`).join(', ')}`, `Not copied: ${copyFailed.join(', ')}`]);
  }
  extra.push([`Own repository <code>${ORG}/${escapeHtml(siteName)}</code>, added to AEM Code Sync`, `Own repository ${ORG}/${siteName}, added to AEM Code Sync`]);
  if (!codeSynced) extra.push(['<strong>Code sync still running</strong>: the site may show unstyled for a minute', 'Code sync still running']);
  if (overlaySkipped) {
    extra.push(['<strong>Pages generated by the template\'s content overlay</strong> (e.g. <code>json2html</code> event pages) were not copied', 'Pages generated by the template\'s content overlay were not copied']);
  }
  if (publish?.error) {
    extra.push([`<strong>Automatic preview/publish failed</strong> (${escapeHtml(publish.error)}): use Bulk Preview/Publish below`, `Automatic preview/publish failed: ${publish.error}`]);
  } else if (publish) {
    const failed = publish.failed?.length ? `, ${publish.failed.length} not published (see below)` : '';
    extra.push([`Previewed and published ${publish.published} pages and assets${escapeHtml(failed)}`, `Published ${publish.published}${failed}`]);
  }
  if (permissions?.siteRole) {
    // Helix 6: the site config's roles decide who can edit, not the DA permissions sheet
    const joined = permissions.joined || [];
    const team = joined.length ? `, and added to <code>${escapeHtml(baselineSite)}</code> roles <code>${joined.map(escapeHtml).join('</code>, <code>')}</code>` : '';
    extra.push([`You can edit the demo's content and config (<code>${escapeHtml(permissions.email)}</code>: <code>${escapeHtml(permissions.siteRole)}</code> role on the new site${team})`, `Edit access for ${permissions.email}: ${permissions.siteRole} role on the new site${joined.length ? `; added to ${baselineSite} roles ${joined.join(', ')}` : ''}`]);
    if (permissions.error) {
      extra.push([`<strong>Not added to the <code>${escapeHtml(baselineSite)}</code> team roles</strong> (${escapeHtml(permissions.error)}): ask an scdemos admin`, `Not added to the ${baselineSite} team roles: ${permissions.error}`]);
    }
  } else if (permissions?.error) {
    extra.push([`<strong>Edit access not added</strong> (${escapeHtml(permissions.error)}): ask an scdemos admin for write on <code>/${escapeHtml(siteName)}/CONFIG</code> and <code>/${escapeHtml(siteName)}/**</code>`, `Edit access not added: ${permissions.error}`]);
  } else if (permissions) {
    const shared = (permissions.joined || []).length ? `, and added to <code>${permissions.joined.map(escapeHtml).join('</code>, <code>')}</code>` : '';
    extra.push([`You can edit the demo's content and config in DA (<code>${escapeHtml(permissions.email)}</code>: write on <code>/${escapeHtml(siteName)}/CONFIG</code> and <code>/${escapeHtml(siteName)}/**</code>${shared})`, `Edit access in DA for ${permissions.email}: /${siteName}/CONFIG and /${siteName}/**${(permissions.joined || []).length ? `; added to ${permissions.joined.join(', ')}` : ''}`]);
  }
  extra.forEach(([, plain]) => plainLines.push(plain));
  const extraHtml = extra.map(([html]) => `<li>${html}</li>`).join('');

  const adminLine = '';

  const html = `
    <li>${contentLabel}: <code>${ORG}/${escapeHtml(baselineSite)}/</code> → <code>${ORG}/${siteName}/</code></li>
    ${daConfigCopied ? '<li>DA config copied</li>' : ''}
    <li>AEM site config created</li>
    ${adminLine}
    ${queryLine}
    ${extraHtml}
  `;

  return { html, plainLines };
}

function buildDetailsClipboardText(siteName, siteUrl, daUrl, githubUrl, plainLines) {
  const next = app.lastPrompt && document.getElementById('ai-handoff')?.hidden === false
    ? ['', 'Next (in VS Code / Claude Code, in the repo):', app.lastPrompt] : [];
  return [
    `Site: ${siteName}`,
    '',
    'Summary:',
    ...plainLines.map((line) => `• ${line}`),
    '',
    'Links:',
    `AEM preview: ${siteUrl}`,
    `Document Authoring: ${daUrl}`,
    `Code repository: ${githubUrl}`,
    ...next,
  ].join('\n');
}

function showResult(success, siteName, errorMessage, options = {}) {
  const container = document.getElementById('result-container');
  const successCard = document.getElementById('result-success');
  const errorCard = document.getElementById('result-error');
  if (!container) return;

  setCloneStep(3);

  const {
    codeConfig,
    contentPaths = [],
  } = options;

  container.style.display = 'block';
  if (success) {
    successCard.style.display = 'block';
    errorCard.style.display = 'none';

    const code = codeConfig || { owner: CODE_OWNER, repo: CODE_REPO };
    const githubUrl = code.source?.url || `https://github.com/${code.owner}/${code.repo}`;

    const { html, plainLines } = buildResultSummaryHtmlAndPlainLines(siteName, options);
    const summaryList = document.getElementById('result-summary-list');
    if (summaryList) summaryList.innerHTML = html;

    const siteUrl = `https://main--${siteName}--${ORG}.aem.page`;
    const daUrl = `https://da.live/#/${ORG}/${siteName}`;

    const siteLink = document.getElementById('result-site-link');
    const daLink = document.getElementById('result-da-link');
    const githubLink = document.getElementById('result-github-link');
    if (siteLink) {
      siteLink.href = siteUrl;
      const urlEl = document.getElementById('result-site-url');
      if (urlEl) urlEl.textContent = siteUrl;
    }
    if (daLink) {
      daLink.href = daUrl;
      const urlEl = document.getElementById('result-da-url');
      if (urlEl) urlEl.textContent = daUrl;
    }
    if (githubLink) {
      githubLink.href = githubUrl;
      const urlEl = document.getElementById('result-github-url');
      if (urlEl) urlEl.textContent = githubUrl;
    }

    const sub = document.getElementById('result-sub');
    if (sub) {
      sub.textContent = options.hlx6 ? UI.resultReadyHlx6 : UI.resultReady;
    }
    const handoff = document.getElementById('ai-handoff');
    if (handoff) {
      handoff.hidden = false;
      const prompt = `/customer-demo ${options.customerSite || '<customer website URL>'}`;
      app.lastPrompt = prompt;
      const promptEl = document.getElementById('ai-handoff-prompt');
      if (promptEl) promptEl.textContent = prompt;
      const vscode = document.getElementById('open-vscode-link');
      if (vscode) vscode.href = `vscode://vscode.git/clone?url=${encodeURIComponent(`https://github.com/${ORG}/${siteName}.git`)}`;
    }

    // automatic publish: only fall back to the manual Bulk app when it failed as a whole
    const pub = options.publish;
    const bulk = document.getElementById('bulk-actions');
    if (bulk) bulk.hidden = !pub?.error;
    const fails = document.getElementById('publish-failures');
    if (fails) {
      const list = pub?.failed || [];
      fails.hidden = !list.length;
      const summary = document.getElementById('publish-failures-summary');
      if (summary) summary.textContent = `${list.length} item${list.length === 1 ? '' : 's'} couldn't be published`;
      const ul = document.getElementById('publish-failures-list');
      if (ul) ul.innerHTML = list.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('');
    }

    app.lastClonedSite = siteName;
    app.contentPaths = contentPaths;
    app.lastDetailsCopyText = buildDetailsClipboardText(siteName, siteUrl, daUrl, githubUrl, plainLines);
    updateBulkActionButtons();
  } else {
    successCard.style.display = 'none';
    errorCard.style.display = 'block';
    const msgEl = document.getElementById('result-error-message');
    if (msgEl) msgEl.textContent = (errorMessage || 'An unknown error occurred');
    // not in the demo's GitHub group: point to the Access App in a modal that stays until closed
    if (options.signUp) {
      const modal = document.getElementById('signup-modal');
      modal?.classList.remove('hidden');
      modal?.querySelector('.modal-cta')?.focus();
    }
  }
}

function hideResult() {
  const container = document.getElementById('result-container');
  if (container) container.style.display = 'none';
}

function updateBulkActionButtons() {
  const bulkBtn = document.getElementById('bulk-btn');
  const bulkHint = document.querySelector('#bulk-actions .bulk-hint');
  const hasPaths = app.contentPaths && app.contentPaths.length > 0;

  if (bulkBtn) bulkBtn.disabled = !hasPaths;
  if (bulkHint) {
    bulkHint.textContent = hasPaths
      ? 'Use the DA Bulk app below to preview/publish all content. All content URLs (pages, images, SVGs) should be available in the clipboard.'
      : 'No content. No files were copied.';
  }
}

function buildBulkUrls(siteName, paths) {
  const base = `https://main--${siteName}--${ORG}.aem.page`;
  return paths.map((p) => (p === '/' ? `${base}/` : `${base}${p}`));
}

function showBulkModal(urlCount) {
  const modal = document.getElementById('bulk-modal');
  const messageEl = document.getElementById('bulk-modal-message');
  if (messageEl) messageEl.textContent = `${urlCount} URL(s) have been copied to your clipboard.`;
  if (modal) modal.classList.remove('hidden');
}

function openBulkAppWithUrls(siteName, paths) {
  const urls = buildBulkUrls(siteName, paths);
  const urlsText = urls.join('\n');

  navigator.clipboard.writeText(urlsText).then(
    () => showBulkModal(urls.length),
    () => showToast('Could not copy to clipboard. Open Bulk app and add URLs manually.', 'error'),
  );
}

function handleBulkAction() {
  if (!app.lastClonedSite || !app.contentPaths?.length) {
    showToast('Clone a site first to get content paths', 'error');
    return;
  }
  openBulkAppWithUrls(app.lastClonedSite, app.contentPaths);
}

/** The site config stored for a name; null when there is none. A config it can't read counts as one. */
async function findSiteInAem(siteName) {
  const response = await cloneitProcessFetch('helix', Paths.helixSiteJson(siteName));
  return response.ok ? (await response.json().catch(() => ({}))) ?? {} : null;
}

async function folderExistsInDa(siteName) {
  const response = await cloneitProcessFetch('da', Paths.daList(siteName));
  if (!response.ok) return false;
  const data = await response.json();
  const items = Array.isArray(data) ? data : (data.sources || data.children || []);
  return items.length > 0;
}

async function fetchBaselineConfig(baselineSite) {
  const response = await cloneitProcessFetch('helix', Paths.helixSiteJson(baselineSite));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch baseline config: ${response.status} ${response.statusText} - ${text}`);
  }
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('Baseline config returned empty response');
  }
  return JSON.parse(text);
}

/**
 * Final pass on the cloned site config before PUT. Strip baseline-only fields, fixups for new site, etc.
 * @param {Record<string, unknown>} config
 */
function cleanupSiteConfig(config) {
  if (config.sidekick && typeof config.sidekick === 'object') {
    delete config.sidekick.previewHost;
    delete config.sidekick.liveHost;
  }
}

/** Rewrites strings in a JSON-able value that point at the baseline site. */
function rewriteBaselineRefs(value, baselineSite, newSiteName) {
  const json = JSON.stringify(value)
    .split(`${ORG}/${baselineSite}/`).join(`${ORG}/${newSiteName}/`)
    .split(`main--${baselineSite}--${ORG}`).join(`main--${newSiteName}--${ORG}`);
  return JSON.parse(json);
}

/**
 * Site config for the new site: content from its DA folder, code from its own repo.
 * Roles: the requester as admin, *@adobe.com author/publish,
 * plus the template's technical accounts so automation (bulk preview/publish) keeps working.
 * Helix 6 template: content from the new site's source bus, and the DA config (which a Helix 6
 * site keeps in `editor.da`) rewritten for the new site. On Helix 6 the roles also decide who
 * can edit content, so there is no *@adobe.com author/publish: the requester and the template's
 * admins are admin.
 */
function buildNewSiteConfig(baselineConfig, newSiteName, opts = {}) {
  const { userEmail = '', baselineSite = '' } = opts;
  const hlx6 = isHlx6Config(baselineConfig);
  const now = new Date().toISOString();
  const codeRepo = newSiteName;
  const config = {
    version: baselineConfig.version ?? 1,
    name: newSiteName,
    created: now,
    lastModified: now,
    content: {
      source: hlx6
        ? hlx6ContentSource(baselineConfig.content.source, ORG, newSiteName)
        : { type: 'markup', url: `https://content.da.live/${ORG}/${newSiteName}/` },
    },
    code: {
      ...(baselineConfig.code || {}),
      owner: CODE_OWNER,
      repo: codeRepo,
      source: { type: 'github', url: `https://github.com/${CODE_OWNER}/${codeRepo}` },
    },
  };

  if (baselineConfig.sidekick && Object.keys(baselineConfig.sidekick).length > 0) {
    config.sidekick = rewriteBaselineRefs(baselineConfig.sidekick, baselineSite, newSiteName);
  }
  if (baselineConfig.headers && Object.keys(baselineConfig.headers).length > 0) {
    config.headers = { ...baselineConfig.headers };
  }
  if (baselineConfig.robots?.txt) {
    // never point a demo's robots.txt at the template's sitemap host
    config.robots = { txt: `${baselineConfig.robots.txt.replace(/^Sitemap:.*$/gim, '').trim()}\n` };
  }
  if (baselineConfig.public && Object.keys(baselineConfig.public).length > 0) {
    const pub = rewriteBaselineRefs(baselineConfig.public, baselineSite, newSiteName);
    // products come from the template's Edge Commerce catalog: keep the new site's product routing on it
    const bus = baselineConfig.public.mixerConfig?.backends?.adobe_productbus;
    if (bus && pub.mixerConfig?.backends?.adobe_productbus) pub.mixerConfig.backends.adobe_productbus = { ...bus };
    // content mappings into another program's DAM are template-specific
    delete pub.paths;
    delete pub.xwalk;
    config.public = pub;
  }

  const baseRoles = baselineConfig.access?.admin?.role || {};
  const admins = new Set([userEmail, ...(hlx6 ? baseRoles.admin || [] : [])].filter(Boolean));
  const role = hlx6
    ? { admin: [...admins] }
    : { admin: [...admins], author: ['*@adobe.com'], publish: ['*@adobe.com'] };
  Object.entries(baseRoles).forEach(([name, members]) => {
    (members || []).filter((m) => /@techacct\.adobe\.com$/i.test(m)).forEach((m) => {
      role[name] = [...new Set([...(role[name] || []), m])];
    });
  });
  if (role.admin.length) config.access = { admin: { role } };

  const daConfig = hlx6 && baselineConfig.editor?.da;
  if (daConfig) {
    // apps that take the site as query parameters (`?org=scdemos&site=demo-hlx6`) open the new site
    const appSite = new RegExp(`([?&]org=${ORG}&site=)${baselineSite}(?=[&#"]|$)`, 'g');
    const editor = JSON.stringify(daConfig).replace(appSite, `$1${newSiteName}`);
    config.editor = { da: JSON.parse(rewriteDaConfigForNewSite(editor, newSiteName, baselineSite, userEmail)) };
  }

  cleanupSiteConfig(config);
  return config;
}

/**
 * AEM Code Sync sets up a new repo with a default site config that has its content in DA. On Helix 6
 * it can come before or after ours: on ci-hlx6-1126 it replaced ours 350 ms after the PUT.
 */
function isCodeSyncDefault(config, siteName) {
  return config?.content?.source?.url === `https://content.da.live/${ORG}/${siteName}/`;
}

/** The stored site config, read up to 3 times: `{ status, config }`, config null when unreadable. */
async function readSiteConfig(siteName) {
  let response;
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    response = await cloneitProcessFetch('helix', Paths.helixSiteJson(siteName));
    if (response.ok) return { status: response.status, config: await response.json().catch(() => null) };
    // eslint-disable-next-line no-await-in-loop
    if (i < 2) await wait(1000);
  }
  return { status: response.status, config: null };
}

/**
 * `createOnly`: never replace a config that exists already (the PUT answers 409), except AEM Code
 * Sync's default for the new repo.
 */
async function createAemSiteConfig(newSiteName, config, { createOnly = false } = {}) {
  let response = await cloneitProcessFetch('helix', Paths.helixSiteJson(newSiteName), {
    method: 'PUT',
    body: JSON.stringify(config),
    contentType: 'application/json',
  });
  if (response.status === 409 && createOnly) {
    const stored = await readSiteConfig(newSiteName);
    if (!isCodeSyncDefault(stored.config, newSiteName)) {
      const found = stored.config ? `content: ${stored.config.content?.source?.url}` : `read: ${stored.status}`;
      throw new Error(`A site config for ${ORG}/${newSiteName} exists already (${found}).`);
    }
  }
  if (response.status === 409) {
    // AEM Code Sync may have created a default config for the new repo already; replace it with ours
    response = await cloneitProcessFetch('helix', Paths.helixSiteJson(newSiteName), {
      method: 'POST',
      body: JSON.stringify(config),
      contentType: 'application/json',
    });
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create AEM site config: ${response.status} ${response.statusText} - ${text}`);
  }
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : {};
}

async function fetchBaselineQueryIndex(baselineSite) {
  const response = await cloneitProcessFetch('helix', Paths.helixQueryYaml(baselineSite));
  if (!response.ok) return null;
  return response.text();
}

async function fetchSiteQueryIndex(siteName) {
  const response = await cloneitProcessFetch('helix', Paths.helixQueryYaml(siteName));
  if (!response.ok) return null;
  const text = await response.text();
  return text?.trim() ? text : null;
}

async function verifyQueryIndexAfterCreate(siteName, maxAttempts = 6, delayMs = 700) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const body = await fetchSiteQueryIndex(siteName);
    if (body != null && body.trim().length > 0) return true;
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

async function createQueryIndex(newSiteName, yamlContent) {
  const path = Paths.helixQueryYaml(newSiteName);
  let response = await cloneitProcessFetch('helix', path, {
    method: 'PUT',
    body: yamlContent,
    contentType: 'text/yaml',
  });
  if (response.status === 409) {
    response = await cloneitProcessFetch('helix', path, {
      method: 'POST',
      body: yamlContent,
      contentType: 'text/yaml',
    });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const xError = response.headers.get('x-error') || '';
    const detail = [text, xError].filter(Boolean).join(' — ') || response.statusText;
    throw new Error(`Failed to create query index config: ${response.status} — ${detail}`);
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchDaConfig(org, repo) {
  const response = await cloneitProcessFetch('da', Paths.daConfig(org, repo));
  if (!response.ok) return null;
  return response.text();
}

/**
 * Rewrites every DA config sheet for the new site (same rules as the customer-demo skill's
 * da-config.mjs): baseline references → new site, and publish approvers → the requester only, so the
 * template's approvers never get emails about this demo.
 */
function rewriteDaConfigForNewSite(configJson, newSiteName, baselineSite, userEmail = '') {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rewritten = configJson
    .replace(new RegExp(`${esc(`${ORG}/${baselineSite}`)}(?![a-z0-9-])`, 'g'), `${ORG}/${newSiteName}`)
    .replace(new RegExp(esc(`main--${baselineSite}--${ORG}`), 'g'), `main--${newSiteName}--${ORG}`);
  let cfg;
  try { cfg = JSON.parse(rewritten); } catch { return rewritten; }
  const sheet = cfg['publish-workflow-config'];
  const approvers = userEmail ? [{ pattern: '/*', approvers: userEmail, cc: '', notifyonreject: 'true' }] : [];
  if (sheet && Array.isArray(sheet.data)) {
    sheet.data = approvers;
    sheet.total = sheet.data.length;
    sheet.limit = sheet.data.length;
  } else if (Array.isArray(sheet)) {
    // Helix 6 `editor.da`: each sheet is its array of rows
    cfg['publish-workflow-config'] = approvers;
  }
  return JSON.stringify(cfg);
}

async function createDaConfig(org, repo, content) {
  const response = await cloneitProcessFetch('da', Paths.daConfig(org, repo), {
    method: 'POST',
    form: { config: content },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create DA config: ${response.status} ${response.statusText} - ${text}`);
  }
}

async function listDaFolder(basePath, baselineSite) {
  const response = await cloneitProcessFetch('da', Paths.daList(baselineSite, basePath));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list DA folder: ${response.status} ${response.statusText} - ${text}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : (data.sources || []);
}

async function collectAllFilePaths(basePath, files, baselineSite) {
  const bp = basePath === undefined || basePath === null ? '' : basePath;
  const fileList = files || [];
  const items = await listDaFolder(bp, baselineSite);
  const prefix = `${ORG}/${baselineSite}`;

  for (const item of items) {
    const isFile = item.lastModified != null && (item.ext || /\.(html|json|png|jpg|jpeg|gif|svg|webp|pdf)$/i.test(item.name || ''));
    const isFolder = !item.ext && !item.lastModified && item.name && item.name !== '.DS_Store';
    // only top-level working folders are skipped, not e.g. /en/drafts
    if (!bp && SKIPPED_FOLDERS.has(isFolder ? item.name : (item.name || '').replace(/\.html$/, ''))) continue;

    if (isFile) {
      const itemPath = (item.path || '').replace(/^\/+/, '');
      const relPath = itemPath.startsWith(prefix)
        ? itemPath.slice(prefix.length).replace(/^\/+/, '')
        : (bp ? `${bp}/${item.name}` : (item.name || itemPath));
      fileList.push(relPath || item.name);

      if (item.ext === 'html') {
        const hiddenFolder = `.${item.name}`;
        const hiddenPath = bp ? `${bp}/${hiddenFolder}` : hiddenFolder;
        let hiddenItems = [];
        try {
          hiddenItems = await listDaFolder(hiddenPath, baselineSite);
        } catch {
          hiddenItems = [];
        }
        if (hiddenItems.length > 0) {
          await collectAllFilePaths(hiddenPath, fileList, baselineSite);
        }
      }
    } else if (isFolder) {
      const subPath = bp ? `${bp}/${item.name}` : item.name;
      await collectAllFilePaths(subPath, fileList, baselineSite);
    }
  }
  return fileList;
}

/**
 * Copied pages and sheets keep absolute links to the template's DA content (images in /media/, hidden
 * per-page asset folders, …). That content needs a sign-in, so the new site's preview can't load it:
 * point every such link at the new site's copy instead. Absolute links to the template's aem.page and
 * aem.live hosts are pointed at the new site's too.
 */
async function rewriteBaselineContentRefs(sourcePath, newSiteName, baselineSite) {
  const response = await cloneitProcessFetch('da', Paths.daSource(newSiteName, sourcePath));
  if (!response.ok) return;
  const original = await response.text();
  // DA content links, and absolute links to the template's aem.page and aem.live hosts. aem.network links
  // stay: that's where the products every demo shows live (the template's Edge Commerce catalog).
  const rewritten = original
    .split(`https://content.da.live/${ORG}/${baselineSite}/`).join(`https://content.da.live/${ORG}/${newSiteName}/`)
    .replace(new RegExp(`(//[a-z0-9-]+--)${baselineSite}(--${ORG}\\.aem\\.(?:page|live)\\b)`, 'g'), `$1${newSiteName}$2`);
  if (rewritten === original) return;
  await createDaSource(newSiteName, sourcePath, rewritten);
}

async function copyDaFile(sourcePath, newSiteName, baselineSite) {
  const response = await cloneitProcessFetch('da', Paths.daCopyFromBaseline(baselineSite, sourcePath), {
    method: 'POST',
    form: { destination: `/${ORG}/${newSiteName}/${sourcePath}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to copy ${sourcePath}: ${response.status} ${response.statusText} - ${text}`);
  }

  if (/\.(html|json)$/.test(sourcePath)) {
    await rewriteBaselineContentRefs(sourcePath, newSiteName, baselineSite);
  }

  return response;
}

async function copyDaFolder(newSiteName, baselineSite, onProgress) {
  const files = await collectAllFilePaths('', [], baselineSite);
  if (files.length === 0) {
    throw new Error('No files found in baseline DA folder');
  }
  const copied = [];
  const failed = [];

  // one failing file shouldn't stop the rest of the site from being copied
  for (let i = 0; i < files.length; i += 1) {
    if (onProgress) onProgress(i + 1, files.length, files[i]);
    try {
      await copyDaFile(files[i], newSiteName, baselineSite);
      copied.push(files[i]);
    } catch (e) {
      console.warn(e);
      failed.push(files[i]);
    }
  }
  return { copied, failed };
}

function daPathsToApiPaths(daFiles) {
  return daFiles.map((f) => {
    if (f.endsWith('.html')) {
      // index.html → folder URL: "index.html" → "/", "en/index.html" → "/en/"
      return `/${f.slice(0, -5)}`.replace(/(^|\/)index$/, '$1');
    }
    return `/${f}`.replace(/\/+/g, '/');
  });
}

async function createDaSource(siteName, path, content) {
  const cleanPath = (path.startsWith('/') ? path.slice(1) : path).replace(/\/+/g, '/');
  const response = await cloneitProcessFetch('da', Paths.daSource(siteName, cleanPath), {
    method: 'POST',
    file: {
      field: 'data',
      filename: cleanPath.split('/').pop() || 'index.html',
      base64: utf8ToBase64(content),
      contentType: path.endsWith('.json') ? 'application/json' : 'text/html',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create DA source: ${response.status} ${response.statusText} - ${text}`);
  }
  return response;
}


async function workerPost(path, body) {
  const response = await fetch(`${CLONEIT_WORKER_URL}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || `${path}: ${response.status}`), { status: response.status, data });
  }
  return data;
}

/** Site name text → slug: "Acme Investments, Inc." → "acme-investments-inc". */
function slugFromName(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SITE_NAME_MAX_LENGTH).replace(/-+$/, '');
}

/** "manulifeim.com/institutional/tw/en" → "https://manulifeim.com/institutional/tw/en"; '' when not a web URL. */
function normalizeCustomerUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return '';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

/** Suggested site name from the customer's domain: "https://www.manulifeim.com/..." → "manulifeim". */
function siteNameFromUrl(raw) {
  const href = normalizeCustomerUrl(raw);
  if (!href) return '';
  const labels = new URL(href).hostname.toLowerCase().replace(/^(www\d?|m)\./, '').split('.');
  labels.pop();
  // second-level public suffixes such as .co.uk / .com.au
  if (labels.length > 1 && /^(co|com|org|net|gov|ac|edu)$/.test(labels[labels.length - 1])) labels.pop();
  return slugFromName(labels[labels.length - 1] || '');
}

/** The worker creates scdemos/<site>, adds it to AEM Code Sync and makes the requester admin. */
async function provisionRepo(siteName, githubUser) {
  try {
    return await workerPost('standalone', { site: siteName, githubUser });
  } catch (e) {
    // a demo repo from an earlier, interrupted run (e.g. Code Sync was added later by an admin): continue with it
    if (e.status === 409 && e.message === 'repo_exists') {
      try {
        return await workerPost('standalone', { site: siteName, githubUser, resume: true });
      } catch (e2) {
        if (e2.status === 409) throw new Error(`Repository ${ORG}/${siteName} already exists and wasn't created by CloneIt. Change the site name (e.g. add -2) and try again.`);
        throw e2;
      }
    }
    if (e.status === 403 && /github_user_not_in/.test(e.message)) {
      throw Object.assign(
        new Error(`GitHub user "${githubUser}" isn't in the demo's GitHub group yet. Sign up with the Access App first.`),
        { signUp: true },
      );
    }
    throw e;
  }
}

/** Full code sync (the template commit predates Code Sync membership), then wait until code is served. */
async function waitForCodeSync(siteName, onTick) {
  await cloneitProcessFetch('helix', Paths.helixCode(siteName), { method: 'POST' }).catch(() => {});
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await cloneitProcessFetch('helix', Paths.helixCode(siteName, 'scripts/aem.js'));
    if (r.ok) return true;
    if (onTick) onTick(i);
    // eslint-disable-next-line no-await-in-loop
    await wait(3000);
  }
  return false;
}

/**
 * Bulk jobs through the Admin API with the worker's technical account (DA sites). Same methods as
 * the source bus client, which runs them on the Helix 6 API for source-bus sites.
 */
function adminBulk(siteName) {
  return {
    startJob: (route, body) => cloneitProcessFetch('helix', Paths.helixBulk(route, siteName), {
      method: 'POST',
      body: JSON.stringify(body),
      contentType: 'application/json',
    }),
    jobDetails: async (job) => (await cloneitProcessFetch('helix', Paths.helixJob(siteName, job.topic, job.name)))
      .json().catch(() => ({})),
  };
}

/**
 * Bulk preview (topic preview) or publish (topic publish) through the Admin API, or the Helix 6
 * API for a source-bus site; waits for the job.
 */
async function runBulkJob(siteName, topic, paths, onTick, bulk = adminBulk(siteName)) {
  const route = topic === 'publish' ? 'live' : 'preview';
  const response = await bulk.startJob(route, { paths, forceUpdate: true });
  if (!response.ok) throw new Error(`${route}: ${response.status} ${response.headers.get('x-error') || ''}`.trim());
  const { job } = await response.json();
  for (let i = 0; i < 180; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await wait(2000);
    // eslint-disable-next-line no-await-in-loop
    const d = await bulk.jobDetails(job);
    // the job reports progress while it runs (processed of total); if not, the UI shows "in bulk…"
    if (onTick) onTick(d.progress?.processed ?? null, d.progress?.total ?? paths.length);
    if (d.state === 'stopped') {
      const res = d.data?.resources || [];
      return {
        okPaths: res.filter((x) => x.status === 200).map((x) => x.path),
        failed: res.filter((x) => x.status !== 200).map((x) => ({ path: x.path, status: x.status })),
      };
    }
  }
  throw new Error(`${route} job did not finish in time`);
}

async function runBulkInChunks(siteName, topic, paths, onPhase, bulk) {
  const okPaths = [];
  const failed = [];
  for (let i = 0; i < paths.length; i += 400) {
    if (onPhase) onPhase(topic, i, paths.length);
    // eslint-disable-next-line no-await-in-loop
    const r = await runBulkJob(siteName, topic, paths.slice(i, i + 400), (processed) => {
      if (onPhase && processed != null) onPhase(topic, i + processed, paths.length);
    }, bulk);
    okPaths.push(...r.okPaths);
    failed.push(...r.failed);
  }
  return { okPaths, failed };
}

/**
 * Preview everything (one retry for transient 5xx), then publish only what previewed. Files in hidden
 * DA attachment folders (`/.name/…`) are previewed but never published: the live tier doesn't serve them.
 */
async function previewAndPublish(siteName, paths, onPhase, bulk) {
  const preview = await runBulkInChunks(siteName, 'preview', paths, onPhase, bulk);
  const transient = preview.failed.filter((f) => f.status >= 500).map((f) => f.path);
  if (transient.length) {
    const retry = await runBulkInChunks(siteName, 'preview', transient, onPhase, bulk);
    preview.okPaths.push(...retry.okPaths);
    preview.failed = [...preview.failed.filter((f) => f.status < 500), ...retry.failed];
  }
  const publishable = preview.okPaths.filter((p) => !/(^|\/)\.[^/]+\//.test(p));
  const live = await runBulkInChunks(siteName, 'publish', publishable, onPhase, bulk);
  return {
    previewed: preview.okPaths.length,
    published: live.okPaths.length,
    failed: [...preview.failed.map((f) => `preview ${f.path} (${f.status})`), ...live.failed.map((f) => `publish ${f.path} (${f.status})`)],
  };
}

/** Audit log: one row per created demo in DA scdemos/demo-registry/demos.json (best effort). */
async function recordInRegistry(row) {
  try {
    const path = Paths.daSource(REGISTRY.site, REGISTRY.path);
    const r = await cloneitProcessFetch('da', path);
    let sheet = { total: 0, limit: 0, offset: 0, data: [], ':type': 'sheet' };
    if (r.ok) {
      const j = await r.json().catch(() => null);
      if (Array.isArray(j?.data)) sheet = j;
      else if (Array.isArray(j?.data?.data)) sheet = j.data;
    }
    sheet.data.push(row);
    sheet.total = sheet.data.length;
    sheet.limit = sheet.data.length;
    await createDaSource(REGISTRY.site, REGISTRY.path, JSON.stringify(sheet));
  } catch (e) {
    console.warn('Registry write skipped:', e);
  }
}

/**
 * Helix 6 template: the new site's config comes first (the source bus answers 404 for a site
 * without one, and its admin role lets the requester write), then every file is read from the
 * template's source bus and written to the new site's, with the requester's own token.
 */
async function cloneToSourceBus(siteName, baselineSite, baselineConfig) {
  setProgress(true, 15, 'Creating site config…', null, 'Configuring', '');
  const newConfig = buildNewSiteConfig(baselineConfig, siteName, { userEmail: app.userEmail, baselineSite });
  await createAemSiteConfig(siteName, newConfig, { createOnly: true });
  const template = createSourceBusClient({ org: ORG, site: baselineSite, token: app.imsToken });
  const sourceBus = createSourceBusClient({ org: ORG, site: siteName, token: app.imsToken });
  setProgress(true, 17, 'Waiting for the new site…', null, 'Configuring', '');
  await sourceBus.waitUntilReady();

  setProgress(true, 18, 'Discovering files…', null, 'Discovering', '');
  const files = await collectSourceBusFiles((folder) => template.list(folder), SKIPPED_FOLDERS);
  if (!files.length) throw new Error(`No files found in ${ORG}/${baselineSite}.`);
  const { copied, failed } = await copyFiles({
    files,
    read: (path) => template.read(path),
    write: (path, body, contentType) => sourceBus.write(path, body, contentType),
    transform: (text, path) => rewriteForNewSite(text, {
      org: ORG, template: baselineSite, site: siteName, path,
    }),
    onProgress: (current, total, fileName) => {
      const pct = 18 + Math.floor((current / total) * 32);
      setProgress(true, pct, fileName, fileName, 'Copying', `${current} / ${total}`);
    },
  });
  failed.forEach((f) => console.warn(`Not copied: ${f.path} (${f.status ?? ''} ${f.error})`));
  if (!copied.length) throw new Error(`No content could be copied from ${ORG}/${baselineSite}.`);
  // Code Sync's default may have replaced our config after the PUT. Write ours again before the
  // query index and preview, which go to the content bus of the config in place.
  if (isCodeSyncDefault(await findSiteInAem(siteName), siteName)) {
    setProgress(true, 50, 'Restoring site config…', 'AEM Code Sync replaced the site config, writing it again', 'Configuring', '');
    await createAemSiteConfig(siteName, newConfig);
  }
  return {
    newConfig, sourceBus, copied, failed: failed.map((f) => f.path),
  };
}

async function cloneSite(siteName, opts = {}) {
  const { baselineSite } = app;
  const { githubUser = '', customerSite = '' } = opts;
  if (!app.workerReady) {
    showToast('CloneIt worker is not ready. Sign in to da.live and refresh.', 'error');
    return;
  }
  setButtonLoading(true);
  hideResult();
  const filesEl = document.getElementById('progress-files');
  if (filesEl) filesEl.innerHTML = '';
  let repo = null;

  try {
    setProgress(true, 3, 'Checking if site name is available…', null, 'Checking', '');
    // the template's config says where its content is: a DA folder, or the source bus (Helix 6)
    const baselineConfig = await fetchBaselineConfig(baselineSite);
    const hlx6 = isHlx6Config(baselineConfig);
    const [existingSite, daExists] = await Promise.all([findSiteInAem(siteName), !hlx6 && folderExistsInDa(siteName)]);
    // second run: AEM Code Sync may have created a default config for this repo already.
    // Helix 6 never resumes: a config with this repo can belong to a finished demo, and its
    // source files would be overwritten. Nor does a DA clone take over a Helix 6 site.
    const resumable = !hlx6 && existingSite?.code?.repo === siteName && !isHlx6Config(existingSite);
    if (existingSite && !resumable) {
      throw new Error(`A demo named "${siteName}" already exists. Change the site name (e.g. "${siteName}-2") and try again.`);
    }
    if (daExists) {
      throw new Error(`A DA folder "${ORG}/${siteName}" already exists. Change the site name (e.g. "${siteName}-2") and try again.`);
    }

    setProgress(true, 5, `Creating repository ${ORG}/${siteName}…`, null, 'Repository', '');
    repo = await provisionRepo(siteName, githubUser);
    (repo.steps || []).forEach((st) => setProgress(true, 8, st, `GitHub: ${st}`, 'Repository', ''));
    if (!repo.codeSync?.added) {
      throw new Error(`Repository created, but it couldn't be added to AEM Code Sync (${repo.codeSync?.reason}). Ask an scdemos admin to add ${ORG}/${siteName} to AEM Code Sync, then run CloneIt again with the same name.`);
    }

    let copiedFiles;
    let copyFailed;
    let daConfigCopied = false;
    let newConfig;
    let sourceBus = null;
    if (hlx6) {
      ({
        newConfig, sourceBus, copied: copiedFiles, failed: copyFailed,
      } = await cloneToSourceBus(siteName, baselineSite, baselineConfig));
      daConfigCopied = !!newConfig.editor?.da;
    } else {
      setProgress(true, 15, 'Discovering files…', null, 'Discovering', '');
      ({ copied: copiedFiles, failed: copyFailed } = await copyDaFolder(siteName, baselineSite, (current, total, fileName) => {
        const pct = 15 + Math.floor((current / total) * 35);
        setProgress(true, pct, fileName, fileName, 'Copying', `${current} / ${total}`);
      }));
      if (!copiedFiles.length) throw new Error(`No content could be copied from ${ORG}/${baselineSite}.`);

      setProgress(true, 52, 'Copying DA config (all sheets)…', null, 'Setup', '');
      const daConfigContent = await fetchDaConfig(ORG, baselineSite);
      if (daConfigContent?.trim()) {
        try {
          await createDaConfig(ORG, siteName, rewriteDaConfigForNewSite(daConfigContent, siteName, baselineSite, app.userEmail));
          daConfigCopied = true;
        } catch (configErr) {
          console.warn('DA config copy skipped:', configErr);
        }
      }

      setProgress(true, 60, 'Creating site config…', null, 'Configuring', '');
      newConfig = buildNewSiteConfig(baselineConfig, siteName, {
        userEmail: app.userEmail, baselineSite,
      });
      await createAemSiteConfig(siteName, newConfig);
    }

    const queryIndex = { copied: false, verified: false, skippedNoBaseline: false, error: null };
    const queryYaml = await fetchBaselineQueryIndex(baselineSite);
    if (!queryYaml?.trim()) {
      queryIndex.skippedNoBaseline = true;
    } else {
      setProgress(true, 64, 'Copying query index config…', null, 'Configuring', '');
      try {
        await createQueryIndex(siteName, queryYaml);
        queryIndex.copied = true;
        queryIndex.verified = await verifyQueryIndexAfterCreate(siteName);
      } catch (queryErr) {
        queryIndex.error = queryErr.message || String(queryErr);
        console.warn('Query index copy failed:', queryErr);
      }
    }

    setProgress(true, 68, 'Syncing code to AEM…', null, 'Code sync', '');
    const codeSynced = await waitForCodeSync(siteName, (i) => setProgress(true, 68, `Waiting for AEM Code Sync… (${(i + 1) * 3}s)`, null, 'Code sync', ''));

    const contentPaths = hlx6 ? bulkPaths(copiedFiles) : daPathsToApiPaths(copiedFiles);
    let publish = null;
    try {
      let lastPhase = '';
      publish = await previewAndPublish(siteName, contentPaths, (topic, done, total) => {
        const verb = topic === 'preview' ? 'Previewing' : 'Publishing';
        const [from, to] = topic === 'preview' ? [72, 86] : [86, 99];
        const pct = done ? from + Math.floor((Math.min(done, total) / total) * (to - from)) : from;
        // AEM runs these as one bulk job: show its progress when reported, otherwise just "in bulk"
        const first = !done && lastPhase !== topic;
        lastPhase = topic;
        setProgress(true, pct, `${verb} ${total} pages and assets in bulk…`, first ? `${verb} in bulk (one AEM job)…` : null, topic === 'preview' ? 'Preview' : 'Publish', done ? `${Math.min(done, total)} / ${total}` : '');
      }, sourceBus || undefined);
    } catch (pubErr) {
      console.warn('Bulk preview/publish failed:', pubErr);
      publish = { error: pubErr.message || String(pubErr) };
    }

    // a Helix 6 bulk publish only updates the sitemap index, not the indexes in query.yaml
    if (hlx6 && queryIndex.copied && publish?.published) {
      setProgress(true, 99, 'Building the query index…', null, 'Index', '');
      try {
        const resp = await sourceBus.startJob('index', { paths: ['/*'] });
        if (!resp.ok) throw new Error(`${resp.status} ${resp.headers.get('x-error') || ''}`.trim());
      } catch (indexErr) {
        console.warn('Query index not built:', indexErr);
        queryIndex.buildError = indexErr.message || String(indexErr);
      }
    }

    // write access for the requester to the demo's DA content and config (org permissions sheet).
    // On Helix 6 the DA sheet plays no part: the admin role in the new site config grants it, and the
    // worker adds the requester to the template's team roles.
    let permissions = null;
    setProgress(true, 99, hlx6 ? 'Adding you to the template team…' : 'Giving you edit access in DA…', null, 'Permissions', '');
    try {
      permissions = await workerPost('permissions', hlx6 ? { site: siteName, template: baselineSite } : { site: siteName });
    } catch (permErr) {
      console.warn('Permissions not added:', permErr);
      permissions = { error: permErr.message || String(permErr) };
    }
    if (hlx6) permissions = { email: app.userEmail, siteRole: 'admin', ...permissions };

    await recordInRegistry({
      date: new Date().toISOString(),
      site: siteName,
      template: baselineSite,
      customer: customerSite,
      requester: app.userEmail,
      repo: `https://github.com/${ORG}/${siteName}`,
    });

    setProgress(true, 100, 'Done', null, 'Done', '');
    showResult(true, siteName, null, {
      codeConfig: newConfig.code,
      contentPaths,
      daConfigCopied,
      queryIndex,
      baselineSite,
      repo,
      codeSynced,
      publish,
      customerSite,
      copyFailed,
      permissions,
      hlx6,
      // only stored source files are copied; the clone gets no content overlay
      overlaySkipped: hlx6 && !!baselineConfig.content?.overlay,
    });
    showToast(`Site ${siteName} created successfully!`, 'success');
  } catch (error) {
    console.error('Clone failed:', error);
    showResult(false, siteName, error.message, { signUp: !!error.signUp });
    showToast(error.message, 'error');
  } finally {
    setButtonLoading(false);
    setProgress(false);
  }
}

/** The customer site is optional; '' when empty, null when typed but not a web URL. */
function getCustomerSite() {
  const raw = (document.getElementById('customer-site-input')?.value || '').trim();
  if (!raw) return '';
  return normalizeCustomerUrl(raw) || null;
}

function getGithubUser() {
  return (document.getElementById('github-user-input')?.value || '').trim();
}

/** Without the worker's GitHub token, demos can't be created: say so instead of failing later. */
function applyAvailability() {
  const note = document.getElementById('unavailable-note');
  if (note) note.hidden = !app.workerReady || !app.sdkReady || app.standaloneAvailable;
}

/** Opened from the Helix 6 template, the page shows its texts ([data-hlx6]) instead of the DA ones ([data-da]). */
function applyTemplate() {
  const hlx6 = app.baselineSite === HLX6_TEMPLATE;
  document.querySelectorAll('[data-hlx6]').forEach((el) => { el.hidden = !hlx6; });
  document.querySelectorAll('[data-da]').forEach((el) => { el.hidden = hlx6; });
}

function updateCloneButtonState() {
  const cloneBtn = document.getElementById('clone-btn');
  const siteInput = document.getElementById('site-name-input');
  const { value } = validateSiteName(siteInput?.value || '', app.baselineSite);
  // the requester's GitHub username is required: they become admin of the new repo
  const ghOk = GH_USER_RE.test(getGithubUser());
  const urlOk = getCustomerSite() !== null;
  if (cloneBtn) {
    cloneBtn.disabled = !app.workerReady || !app.sdkReady || !app.standaloneAvailable || !value || !ghOk || !urlOk;
  }
}

function setupEventListeners() {
  const siteInput = document.getElementById('site-name-input');
  const cloneBtn = document.getElementById('clone-btn');
  const previewEl = document.getElementById('site-preview');
  const helpBtn = document.getElementById('help-btn');
  const modal = document.getElementById('help-modal');
  const modalClose = modal?.querySelector('.modal-close');
  const toastClose = document.querySelector('#toast .toast-close');

  if (siteInput) {
    siteInput.addEventListener('input', () => {
      const { value } = validateSiteName(siteInput.value, app.baselineSite);
      if (previewEl) previewEl.textContent = value || 'acme-investments';
      updateCloneButtonState();
    });
    siteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cloneBtn?.click();
      }
    });
  }

  if (cloneBtn) {
    cloneBtn.addEventListener('click', () => {
      const { valid, value, error } = validateSiteName(siteInput?.value, app.baselineSite);
      if (!valid) {
        showToast(error, 'error');
        return;
      }
      const customerSite = getCustomerSite();
      if (customerSite === null) {
        showToast('Enter a valid customer website URL (e.g. https://www.acme-investments.com/en) or leave it empty', 'error');
        return;
      }
      const gh = getGithubUser();
      if (!GH_USER_RE.test(gh)) {
        showToast('Enter your GitHub username: you become admin of the new repo.', 'error');
        return;
      }
      try { localStorage.setItem(GH_USER_KEY, gh); } catch { /* storage unavailable */ }
      cloneSite(value, { githubUser: gh, customerSite });
    });
  }

  if (helpBtn && modal) {
    helpBtn.addEventListener('click', () => modal.classList.remove('hidden'));
  }
  if (modalClose && modal) {
    modalClose.addEventListener('click', () => modal.classList.add('hidden'));
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  const bulkModal = document.getElementById('bulk-modal');
  const bulkModalClose = bulkModal?.querySelector('.modal-close');
  if (bulkModalClose && bulkModal) {
    bulkModalClose.addEventListener('click', () => bulkModal.classList.add('hidden'));
  }
  if (bulkModal) {
    bulkModal.addEventListener('click', (e) => {
      if (e.target === bulkModal) bulkModal.classList.add('hidden');
    });
  }

  const signupModal = document.getElementById('signup-modal');
  if (signupModal) {
    // closed with its button, a click outside or Escape: focus goes back to the site name field
    const closeSignup = () => {
      signupModal.classList.add('hidden');
      document.getElementById('site-name-input')?.focus();
    };
    signupModal.querySelector('.modal-close')?.addEventListener('click', closeSignup);
    signupModal.addEventListener('click', (e) => {
      if (e.target === signupModal) closeSignup();
    });
    signupModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSignup();
      // keep Tab inside the dialog: it has two controls, the close button and the link
      if (e.key === 'Tab') {
        const items = [...signupModal.querySelectorAll('.modal-close, .modal-cta')];
        const i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal-overlay:not(.hidden)');
      if (openModal) openModal.classList.add('hidden');
    }
  });

  if (toastClose) {
    toastClose.addEventListener('click', () => {
      document.getElementById('toast')?.classList.add('hidden');
    });
  }

  const bulkBtn = document.getElementById('bulk-btn');
  if (bulkBtn) bulkBtn.addEventListener('click', handleBulkAction);

  document.getElementById('github-user-input')?.addEventListener('input', updateCloneButtonState);

  // the site name is suggested from the customer site until the SC edits it; clearing it resumes the suggestion
  const customerInput = document.getElementById('customer-site-input');
  if (customerInput && siteInput) {
    let siteEdited = false;
    siteInput.addEventListener('input', (e) => {
      if (e.isTrusted) siteEdited = siteInput.value.trim() !== '';
    });
    customerInput.addEventListener('input', () => {
      if (!siteEdited) {
        siteInput.value = siteNameFromUrl(customerInput.value);
        siteInput.dispatchEvent(new Event('input'));
      }
      updateCloneButtonState();
    });
    customerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cloneBtn?.click();
      }
    });
  }

  document.getElementById('copy-prompt-btn')?.addEventListener('click', () => {
    if (!app.lastPrompt) return;
    navigator.clipboard.writeText(app.lastPrompt).then(
      () => showToast('Prompt copied. Paste it in Copilot or Claude Code inside the repo.', 'success'),
      () => showToast('Could not copy. Select the prompt text instead.', 'error'),
    );
  });

  const copyDetailsBtn = document.getElementById('copy-details-btn');
  if (copyDetailsBtn) {
    copyDetailsBtn.addEventListener('click', () => {
      const text = app.lastDetailsCopyText;
      if (!text) {
        showToast('Nothing to copy yet.', 'error');
        return;
      }
      navigator.clipboard.writeText(text).then(
        () => showToast('Details copied to clipboard.', 'success'),
        () => showToast('Could not copy — select text in your browser.', 'error'),
      );
    });
  }

}

async function init() {
  setupEventListeners();

  const customerInput = document.getElementById('customer-site-input');
  const cloneBtn = document.getElementById('clone-btn');
  if (customerInput) customerInput.focus();
  if (cloneBtn) cloneBtn.disabled = true;
  setCloneStep(1);
  // remembered from the last own-repo request on this browser
  const ghInput = document.getElementById('github-user-input');
  try { if (ghInput && !ghInput.value) ghInput.value = localStorage.getItem(GH_USER_KEY) || ''; } catch { /* storage unavailable */ }

  // the DA SDK provides the signed-in user's IMS token, which the worker needs on every call
  await initDaSdk();
  applyTemplate();
  try {
    await ensureWorkerReady();
    app.workerReady = true;
  } catch (error) {
    console.error('Init failed:', error);
    showToast(/sign_in|token|user_not_allowed/.test(error.message)
      ? 'Sign in to da.live with your Adobe account and open CloneIt from DA.'
      : 'CloneIt worker unavailable. Check ALLOWED_ORIGINS and deployment.', 'error');
  }
  if (!app.sdkReady) showToast(UI.toastSdkFailed, 'error');
  applyAvailability();
  updateCloneButtonState();
  if (app.workerReady && app.sdkReady && app.standaloneAvailable) {
    showToast(UI.toastReady, 'success');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
