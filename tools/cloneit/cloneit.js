/* eslint-disable no-console */

// CloneIt: create a demo (init → cloneSite → worker). Every demo gets its own repo scdemos/<site>
// (created by the worker from scdemos/demo and added to AEM Code Sync) and its own DA folder with the
// demo content, config and index, previewed and published. Customizing it with the customer-demo AI
// skill is an optional next step.

const ORG = 'scdemos';
const CODE_OWNER = 'scdemos';
const CODE_REPO = 'demo';
const DEFAULT_WORKER_URL = 'https://demo.bbird.live/cloneit/';
// ?worker=http://localhost:8787 points the app at a local `wrangler dev` worker (localhost only)
function resolveWorkerUrl() {
  const override = new URLSearchParams(window.location.search).get('worker');
  if (override && /^http:\/\/localhost:\d+\/?$/.test(override)) return override.endsWith('/') ? override : `${override}/`;
  return DEFAULT_WORKER_URL;
}
const CLONEIT_WORKER_URL = resolveWorkerUrl();
// every demo starts from the base demo site (content + code); the customer-demo skill replaces the content
const BASELINE_SITE = 'demo';
const GH_USER_KEY = 'cloneit.githubUser';
const GH_USER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const REGISTRY = { site: 'demo-registry', path: 'demos.json' };
const CLONEIT_WORKER_ERROR_SOURCE = 'cloneit-worker';

const DA_SDK_URL = 'https://da.live/nx/utils/sdk.js';

/** User-facing messages (avoid scattering literals). */
const UI = {
  toastSdkFailed:
    'Sign in to Document Authoring and open CloneIt from DA, then refresh.',
  toastReady: 'CloneIt is ready. Enter the customer site and your GitHub username to start.',
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
};

const SITE_NAME_MAX_LENGTH = 50;
const RESERVED_NAMES = ['admin', 'api', 'config', 'main', 'live', 'preview', 'status', 'job'];

// base-demo working folders that a new demo shouldn't inherit
const SKIPPED_FOLDERS = new Set(['drafts', 'demo-docs', 'demo-slides']);

const LOCALE_EXCLUDED_FOLDER_NAMES = new Set([
  'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'ko',
  'lt', 'lv', 'ms', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'uk', 'vi', 'zh',
  'en-gb', 'en-us', 'pt-br', 'zh-cn', 'zh-tw',
]);

function isExcludedLocaleFolderName(name) {
  if (!name || typeof name !== 'string') return false;
  return LOCALE_EXCLUDED_FOLDER_NAMES.has(name.toLowerCase());
}

function pathStartsWithExcludedLocale(relPath) {
  if (!relPath) return false;
  const first = relPath.split('/').filter(Boolean)[0];
  return isExcludedLocaleFolderName(first);
}

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

/** Loads the DA SDK for the signed-in user's IMS token (the worker requires it on every call). */
async function initDaSdk() {
  try {
    const { default: DA_SDK } = await import(DA_SDK_URL);
    // outside a DA context the SDK never resolves: fail fast with a clear message
    const sdk = await Promise.race([DA_SDK, wait(8000).then(() => { throw new Error('no_da_context'); })]);
    app.imsToken = sdk.token || '';
    app.sdkReady = !!app.imsToken;
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
  } = options;
  const baselineSite = baselineSiteOpt || '—';
  const {
    copied: queryIndexCopied = false,
    verified: queryIndexVerified = false,
    skippedNoBaseline = false,
    error: queryIndexError = null,
  } = queryIndex;

  const plainLines = [];
  plainLines.push(`DA content: ${ORG}/${baselineSite}/ → ${ORG}/${siteName}/`);
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
  extra.push([`Own repository <code>${ORG}/${escapeHtml(siteName)}</code>, added to AEM Code Sync`, `Own repository ${ORG}/${siteName}, added to AEM Code Sync`]);
  if (!codeSynced) extra.push(['<strong>Code sync still running</strong>: the site may show unstyled for a minute', 'Code sync still running']);
  if (publish?.error) {
    extra.push([`<strong>Automatic preview/publish failed</strong> (${escapeHtml(publish.error)}): use Bulk Preview/Publish below`, `Automatic preview/publish failed: ${publish.error}`]);
  } else if (publish) {
    const failed = publish.failed?.length ? `, ${publish.failed.length} not published (see below)` : '';
    extra.push([`Previewed and published ${publish.published} pages and assets${escapeHtml(failed)}`, `Published ${publish.published}${failed}`]);
  }
  extra.forEach(([, plain]) => plainLines.push(plain));
  const extraHtml = extra.map(([html]) => `<li>${html}</li>`).join('');

  const adminLine = '';

  const html = `
    <li>DA content: <code>${ORG}/${escapeHtml(baselineSite)}/</code> → <code>${ORG}/${siteName}/</code></li>
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
      sub.textContent = 'Your repository, site and DA folder are ready. Demo it as is, or make it look like the customer with the customer-demo AI skill.';
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

async function siteExistsInAem(siteName) {
  const response = await cloneitProcessFetch('helix', Paths.helixSiteJson(siteName));
  return response.ok;
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
 */
function buildNewSiteConfig(baselineConfig, newSiteName, opts = {}) {
  const { userEmail = '', baselineSite = '' } = opts;
  const now = new Date().toISOString();
  const codeRepo = newSiteName;
  const config = {
    version: baselineConfig.version ?? 1,
    name: newSiteName,
    created: now,
    lastModified: now,
    content: {
      source: { type: 'markup', url: `https://content.da.live/${ORG}/${newSiteName}/` },
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
    // content mappings into another program's DAM are template-specific
    delete pub.paths;
    delete pub.xwalk;
    config.public = pub;
  }

  const admins = new Set([userEmail].filter(Boolean));
  const role = { admin: [...admins], author: ['*@adobe.com'], publish: ['*@adobe.com'] };
  const baseRoles = baselineConfig.access?.admin?.role || {};
  Object.entries(baseRoles).forEach(([name, members]) => {
    (members || []).filter((m) => /@techacct\.adobe\.com$/i.test(m)).forEach((m) => {
      role[name] = [...new Set([...(role[name] || []), m])];
    });
  });
  if (role.admin.length) config.access = { admin: { role } };

  cleanupSiteConfig(config);
  return config;
}

async function createAemSiteConfig(newSiteName, config) {
  let response = await cloneitProcessFetch('helix', Paths.helixSiteJson(newSiteName), {
    method: 'PUT',
    body: JSON.stringify(config),
    contentType: 'application/json',
  });
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

function getDefaultIndexHtml(siteName) {
  return `<body><header></header><main>
  <h1>Welcome to ${siteName}</h1>
  <p>Your new site has been created. Edit this page in <a href="https://da.live/#/${ORG}/${siteName}">Document Authoring</a>.</p>
</main><footer></footer></body>`;
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
  if (sheet && Array.isArray(sheet.data)) {
    sheet.data = userEmail ? [{ pattern: '/*', approvers: userEmail, cc: '', notifyonreject: 'true' }] : [];
    sheet.total = sheet.data.length;
    sheet.limit = sheet.data.length;
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
    const skipFolder = isFolder && (
      SKIPPED_FOLDERS.has(item.name)
      || isExcludedLocaleFolderName(item.name)
    );

    if (skipFolder) continue;

    if (isFile) {
      const itemPath = (item.path || '').replace(/^\/+/, '');
      const relPath = itemPath.startsWith(prefix)
        ? itemPath.slice(prefix.length).replace(/^\/+/, '')
        : (bp ? `${bp}/${item.name}` : (item.name || itemPath));
      const normalized = relPath || item.name;
      if (pathStartsWithExcludedLocale(normalized)) continue;
      fileList.push(normalized);

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

function isHiddenAssetPath(path) {
  return path.split('/')[0].startsWith('.');
}

async function rewriteKnownHiddenAssetRefs(sourcePath, newSiteName, baselineSite, hiddenAssetPaths) {
  if (hiddenAssetPaths.length === 0) return;
  const response = await cloneitProcessFetch('da', Paths.daSource(newSiteName, sourcePath));
  if (!response.ok) return;
  const original = await response.text();
  let rewritten = original;
  hiddenAssetPaths.forEach((assetPath) => {
    const from = `https://content.da.live/${ORG}/${baselineSite}/${assetPath}`;
    const to = `https://content.da.live/${ORG}/${newSiteName}/${assetPath}`;
    rewritten = rewritten.split(from).join(to);
  });
  if (rewritten === original) return;
  await createDaSource(newSiteName, sourcePath, rewritten);
}

async function copyDaFile(sourcePath, newSiteName, baselineSite, hiddenAssetPaths) {
  const response = await cloneitProcessFetch('da', Paths.daCopyFromBaseline(baselineSite, sourcePath), {
    method: 'POST',
    form: { destination: `/${ORG}/${newSiteName}/${sourcePath}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to copy ${sourcePath}: ${response.status} ${response.statusText} - ${text}`);
  }

  if (sourcePath.endsWith('.html')) {
    await rewriteKnownHiddenAssetRefs(sourcePath, newSiteName, baselineSite, hiddenAssetPaths);
  }

  return response;
}

async function copyDaFolder(newSiteName, baselineSite, onProgress) {
  const files = await collectAllFilePaths('', [], baselineSite);
  if (files.length === 0) {
    throw new Error('No files found in baseline DA folder');
  }
  const hiddenAssetPaths = files.filter(isHiddenAssetPath);

  for (let i = 0; i < files.length; i += 1) {
    if (onProgress) onProgress(i + 1, files.length, files[i]);
    await copyDaFile(files[i], newSiteName, baselineSite, hiddenAssetPaths);
  }
  return files;
}

function daPathsToApiPaths(daFiles) {
  return daFiles.map((f) => {
    if (f.endsWith('.html')) {
      const withoutExt = f.slice(0, -5);
      return withoutExt === 'index' ? '/' : `/${withoutExt}`;
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
      throw new Error(`GitHub user "${githubUser}" isn't a member of scdemos. Check the spelling, or ask an scdemos admin to add you.`);
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

/** Bulk preview (topic preview) or publish (topic publish) through the Admin API; waits for the job. */
async function runBulkJob(siteName, topic, paths, onTick) {
  const route = topic === 'publish' ? 'live' : 'preview';
  const response = await cloneitProcessFetch('helix', Paths.helixBulk(route, siteName), {
    method: 'POST',
    body: JSON.stringify({ paths, forceUpdate: true }),
    contentType: 'application/json',
  });
  if (!response.ok) throw new Error(`${route}: ${response.status} ${response.headers.get('x-error') || ''}`.trim());
  const { job } = await response.json();
  for (let i = 0; i < 180; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await wait(2000);
    // eslint-disable-next-line no-await-in-loop
    const d = await (await cloneitProcessFetch('helix', Paths.helixJob(siteName, topic, job.name))).json().catch(() => ({}));
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

async function runBulkInChunks(siteName, topic, paths, onPhase) {
  const okPaths = [];
  const failed = [];
  for (let i = 0; i < paths.length; i += 400) {
    if (onPhase) onPhase(topic, i, paths.length);
    // eslint-disable-next-line no-await-in-loop
    const r = await runBulkJob(siteName, topic, paths.slice(i, i + 400), (processed) => {
      if (onPhase && processed != null) onPhase(topic, i + processed, paths.length);
    });
    okPaths.push(...r.okPaths);
    failed.push(...r.failed);
  }
  return { okPaths, failed };
}

/**
 * Preview everything (one retry for transient 5xx), then publish only what previewed. Files in hidden
 * DA attachment folders (`/.name/…`) are previewed but never published: the live tier doesn't serve them.
 */
async function previewAndPublish(siteName, paths, onPhase) {
  const preview = await runBulkInChunks(siteName, 'preview', paths, onPhase);
  const transient = preview.failed.filter((f) => f.status >= 500).map((f) => f.path);
  if (transient.length) {
    const retry = await runBulkInChunks(siteName, 'preview', transient, onPhase);
    preview.okPaths.push(...retry.okPaths);
    preview.failed = [...preview.failed.filter((f) => f.status < 500), ...retry.failed];
  }
  const publishable = preview.okPaths.filter((p) => !/(^|\/)\.[^/]+\//.test(p));
  const live = await runBulkInChunks(siteName, 'publish', publishable, onPhase);
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

async function cloneSite(siteName, opts = {}) {
  const baselineSite = BASELINE_SITE;
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
    const [aemExists, daExists] = await Promise.all([siteExistsInAem(siteName), folderExistsInDa(siteName)]);
    // second run: AEM Code Sync may have created a default config for this repo already
    const resumable = aemExists && (await fetchBaselineConfig(siteName).catch(() => ({}))).code?.repo === siteName;
    if (aemExists && !resumable) {
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

    setProgress(true, 10, 'Creating DA folder…', null, 'Setup', '');
    const indexContent = getDefaultIndexHtml(siteName);
    await createDaSource(siteName, 'index.html', indexContent);

    setProgress(true, 12, 'Copying DA config (all sheets)…', null, 'Setup', '');
    let daConfigCopied = false;
    const daConfigContent = await fetchDaConfig(ORG, baselineSite);
    if (daConfigContent?.trim()) {
      try {
        await createDaConfig(ORG, siteName, rewriteDaConfigForNewSite(daConfigContent, siteName, baselineSite, app.userEmail));
        daConfigCopied = true;
      } catch (configErr) {
        console.warn('DA config copy skipped:', configErr);
      }
    }

    setProgress(true, 15, 'Discovering files…', null, 'Discovering', '');
    let copiedFiles = [];
    try {
      copiedFiles = await copyDaFolder(siteName, baselineSite, (current, total, fileName) => {
        const pct = 15 + Math.floor((current / total) * 35);
        setProgress(true, pct, fileName, fileName, 'Copying', `${current} / ${total}`);
      });
    } catch (copyError) {
      setProgress(true, 45, 'Copy failed, updating index.html…', null, 'Fallback', '');
      await createDaSource(siteName, 'index.html', indexContent);
      copiedFiles = ['index.html'];
    }

    setProgress(true, 55, 'Fetching baseline config…', null, 'Configuring', '');
    const baselineConfig = await fetchBaselineConfig(baselineSite);
    setProgress(true, 60, 'Creating site config…', null, 'Configuring', '');
    const newConfig = buildNewSiteConfig(baselineConfig, siteName, {
      userEmail: app.userEmail, baselineSite,
    });
    await createAemSiteConfig(siteName, newConfig);

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

    const contentPaths = daPathsToApiPaths(copiedFiles);
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
      });
    } catch (pubErr) {
      console.warn('Bulk preview/publish failed:', pubErr);
      publish = { error: pubErr.message || String(pubErr) };
    }

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
    });
    showToast(`Site ${siteName} created successfully!`, 'success');
  } catch (error) {
    console.error('Clone failed:', error);
    showResult(false, siteName, error.message);
    showToast(error.message, 'error');
  } finally {
    setButtonLoading(false);
    setProgress(false);
  }
}

function getGithubUser() {
  return (document.getElementById('github-user-input')?.value || '').trim();
}

/** Without the worker's GitHub token, demos can't be created: say so instead of failing later. */
function applyAvailability() {
  const note = document.getElementById('unavailable-note');
  if (note) note.hidden = !app.workerReady || !app.sdkReady || app.standaloneAvailable;
}

function updateCloneButtonState() {
  const cloneBtn = document.getElementById('clone-btn');
  const siteInput = document.getElementById('site-name-input');
  const { value } = validateSiteName(siteInput?.value || '', BASELINE_SITE);
  // the requester's GitHub username is required: they become admin of the new repo
  const ghOk = GH_USER_RE.test(getGithubUser());
  const urlOk = !!normalizeCustomerUrl(document.getElementById('customer-site-input')?.value);
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
      const { value } = validateSiteName(siteInput.value, BASELINE_SITE);
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
      const { valid, value, error } = validateSiteName(siteInput?.value, BASELINE_SITE);
      if (!valid) {
        showToast(error, 'error');
        return;
      }
      const customerSite = normalizeCustomerUrl(document.getElementById('customer-site-input')?.value);
      if (!customerSite) {
        showToast('Enter the customer website URL, e.g. https://www.acme-investments.com/en', 'error');
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
