/* eslint-disable no-console */

// CloneIt: copy baseline DA + AEM config to a new repoless site (init → cloneSite → worker).

const ORG = 'scdemos';
const BASELINE_SITE = 'demo';
const CODE_OWNER = 'scdemos';
const CODE_REPO = 'demo';
const CLONEIT_WORKER_URL = 'https://demo.bbird.live/cloneit/';
const CLONEIT_WORKER_ERROR_SOURCE = 'cloneit-worker';

// Paths must stay aligned with workers/cloneit_token isAllowedProxyPath().
const Paths = {
  helixSiteJson: (site) => `/config/${ORG}/sites/${site}.json`,
  helixQueryYaml: (site) => `/config/${ORG}/sites/${site}/content/query.yaml`,
  daList: (repo, basePath = '') => {
    const part = basePath ? (basePath.startsWith('/') ? basePath : `/${basePath}`) : '';
    return `/list/${ORG}/${repo}${part}`;
  },
  daConfig: (org, repo) => `/config/${org}/${repo}`,
  daCopyFromBaseline: (sourcePath) => `/copy/${ORG}/${BASELINE_SITE}/${sourcePath}`,
  daSource: (site, cleanPath) => `/source/${ORG}/${site}/${cleanPath}`,
};

async function ensureWorkerReady() {
  const response = await fetch(CLONEIT_WORKER_URL, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Worker: ${response.status}`);
  }
  const data = await response.json().catch(() => ({}));
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Worker did not return an access token');
  }
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
    headers: { 'Content-Type': 'application/json' },
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

const API = {
  AEM_CONFIG: 'https://admin.hlx.page/config',
};

const app = {
  workerReady: false,
};

const SITE_NAME_MAX_LENGTH = 50;
const RESERVED_NAMES = ['admin', 'api', 'config', 'main', 'live', 'preview', 'status', 'job'];

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

function validateSiteName(name) {
  const trimmed = (name || '').trim().toLowerCase();
  if (!trimmed) return { valid: false, error: 'Site name is required' };
  if (trimmed.length > SITE_NAME_MAX_LENGTH) {
    return { valid: false, error: `Site name must be ${SITE_NAME_MAX_LENGTH} characters or less` };
  }
  const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!pattern.test(trimmed)) {
    return { valid: false, error: 'Use lowercase letters, numbers, and hyphens only' };
  }
  if (trimmed === BASELINE_SITE) {
    return { valid: false, error: 'Cannot clone to the same site name' };
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
  const { daConfigCopied = false, queryIndex = {} } = options;
  const {
    copied: queryIndexCopied = false,
    verified: queryIndexVerified = false,
    skippedNoBaseline = false,
    error: queryIndexError = null,
  } = queryIndex;

  const plainLines = [];
  plainLines.push(`DA content: ${ORG}/${BASELINE_SITE}/ → ${ORG}/${siteName}/`);
  if (daConfigCopied) plainLines.push('DA config copied');
  plainLines.push('AEM site config created');

  const queryYamlUrl = `${API.AEM_CONFIG}/${ORG}/sites/${siteName}/content/query.yaml`;
  let queryLine = '';
  if (skippedNoBaseline) {
    queryLine = `<li>Query index (<code>query.yaml</code>): skipped — baseline <code>${BASELINE_SITE}</code> has no <code>query.yaml</code> in Admin API (nothing to copy)</li>`;
    plainLines.push(`Query index (query.yaml): skipped — baseline ${BASELINE_SITE} has no query.yaml in Admin API`);
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
  plainLines.push(`Content: content.da.live/${ORG}/${siteName}/`);

  const html = `
    <li>DA content: <code>${ORG}/${BASELINE_SITE}/</code> → <code>${ORG}/${siteName}/</code></li>
    ${daConfigCopied ? '<li>DA config copied</li>' : ''}
    <li>AEM site config created</li>
    ${queryLine}
    <li>Content: <code>content.da.live/${ORG}/${siteName}/</code></li>
  `;

  return { html, plainLines };
}

function buildDetailsClipboardText(siteName, siteUrl, daUrl, githubUrl, plainLines) {
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
  const bulkHint = document.querySelector('.bulk-hint');
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

async function fetchBaselineConfig() {
  const response = await cloneitProcessFetch('helix', Paths.helixSiteJson(BASELINE_SITE));
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

function buildNewSiteConfig(baselineConfig, newSiteName) {
  const now = new Date().toISOString();

  const config = {
    version: baselineConfig.version ?? 1,
    name: newSiteName,
    created: now,
    lastModified: now,
    content: {
      source: {
        type: 'markup',
        url: `https://content.da.live/${ORG}/${newSiteName}/`,
      },
    },
    code: baselineConfig.code
      ? { ...baselineConfig.code, owner: CODE_OWNER, repo: CODE_REPO }
      : {
        owner: CODE_OWNER,
        repo: CODE_REPO,
        source: { type: 'github', url: `https://github.com/${CODE_OWNER}/${CODE_REPO}` },
      },
  };

  if (baselineConfig.sidekick && Object.keys(baselineConfig.sidekick).length > 0) {
    config.sidekick = { ...baselineConfig.sidekick };
  }
  if (baselineConfig.headers && Object.keys(baselineConfig.headers).length > 0) {
    config.headers = { ...baselineConfig.headers };
  }

  return config;
}

async function createAemSiteConfig(newSiteName, config) {
  const response = await cloneitProcessFetch('helix', Paths.helixSiteJson(newSiteName), {
    method: 'PUT',
    body: JSON.stringify(config),
    contentType: 'application/json',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create AEM site config: ${response.status} ${response.statusText} - ${text}`);
  }
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : {};
}

async function fetchBaselineQueryIndex() {
  const response = await cloneitProcessFetch('helix', Paths.helixQueryYaml(BASELINE_SITE));
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

function rewriteDaConfigForNewSite(configJson, newSiteName) {
  const baselineRef = `${ORG}/${BASELINE_SITE}`;
  const newRef = `${ORG}/${newSiteName}`;
  return configJson.replace(new RegExp(baselineRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newRef);
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

async function listDaFolder(basePath = '') {
  const response = await cloneitProcessFetch('da', Paths.daList(BASELINE_SITE, basePath));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list DA folder: ${response.status} ${response.statusText} - ${text}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : (data.sources || []);
}

async function collectAllFilePaths(basePath = '', files = []) {
  const items = await listDaFolder(basePath);
  const prefix = `${ORG}/${BASELINE_SITE}`;

  for (const item of items) {
    const isFile = item.lastModified != null && (item.ext || /\.(html|json|png|jpg|jpeg|gif|svg|webp|pdf)$/i.test(item.name || ''));
    const isFolder = !item.ext && !item.lastModified && item.name && item.name !== '.DS_Store';
    const skipFolder = isFolder && (
      item.name === 'drafts'
      || item.name === 'demo-docs'
      || isExcludedLocaleFolderName(item.name)
    );

    if (skipFolder) continue;

    if (isFile) {
      const itemPath = (item.path || '').replace(/^\/+/, '');
      const relPath = itemPath.startsWith(prefix)
        ? itemPath.slice(prefix.length).replace(/^\/+/, '')
        : (basePath ? `${basePath}/${item.name}` : (item.name || itemPath));
      const normalized = relPath || item.name;
      if (pathStartsWithExcludedLocale(normalized)) continue;
      files.push(normalized);
    } else if (isFolder) {
      const subPath = basePath ? `${basePath}/${item.name}` : item.name;
      await collectAllFilePaths(subPath, files);
    }
  }
  return files;
}

async function copyDaFile(sourcePath, newSiteName) {
  const response = await cloneitProcessFetch('da', Paths.daCopyFromBaseline(sourcePath), {
    method: 'POST',
    form: { destination: `/${ORG}/${newSiteName}/${sourcePath}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to copy ${sourcePath}: ${response.status} ${response.statusText} - ${text}`);
  }
  return response;
}

async function copyDaFolder(newSiteName, onProgress) {
  const files = await collectAllFilePaths();
  if (files.length === 0) {
    throw new Error('No files found in baseline DA folder');
  }

  for (let i = 0; i < files.length; i += 1) {
    if (onProgress) onProgress(i + 1, files.length, files[i]);
    await copyDaFile(files[i], newSiteName);
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

async function cloneSite(siteName) {
  if (!app.workerReady) {
    showToast('CloneIt worker is not ready. Refresh the page or check worker configuration.', 'error');
    return;
  }

  setButtonLoading(true);
  hideResult();

  const filesEl = document.getElementById('progress-files');
  if (filesEl) filesEl.innerHTML = '';

  try {
    setProgress(true, 5, 'Checking if site name is available…', null, 'Checking', '');
    const [aemExists, daExists] = await Promise.all([
      siteExistsInAem(siteName),
      folderExistsInDa(siteName),
    ]);

    if (aemExists) {
      throw new Error(
        `Site "${siteName}" already exists in AEM. Choose a different name or delete the existing site first.`,
      );
    }
    if (daExists) {
      throw new Error(
        `Folder "${ORG}/${siteName}" already exists in DA. Choose a different name or remove the existing folder first.`,
      );
    }

    setProgress(true, 8, 'Creating DA folder…', null, 'Setup', '');
    const indexContent = getDefaultIndexHtml(siteName);
    await createDaSource(siteName, 'index.html', indexContent);

    setProgress(true, 10, 'Copying DA config…', null, 'Setup', '');
    let daConfigCopied = false;
    const daConfigContent = await fetchDaConfig(ORG, BASELINE_SITE);
    if (daConfigContent?.trim()) {
      try {
        const rewrittenConfig = rewriteDaConfigForNewSite(daConfigContent, siteName);
        await createDaConfig(ORG, siteName, rewrittenConfig);
        daConfigCopied = true;
      } catch (configErr) {
        console.warn('DA config copy skipped:', configErr);
      }
    }

    setProgress(true, 15, 'Discovering files…', null, 'Discovering', '');
    let copiedFiles = [];
    try {
      copiedFiles = await copyDaFolder(siteName, (current, total, fileName) => {
        const pct = 15 + Math.floor((current / total) * 25);
        setProgress(true, pct, fileName, fileName, 'Copying', `${current} / ${total}`);
      });
    } catch (copyError) {
      setProgress(true, 35, 'Copy failed, updating index.html…', null, 'Fallback', '');
      await createDaSource(siteName, 'index.html', indexContent);
      copiedFiles = ['index.html'];
    }

    setProgress(true, 50, 'Fetching baseline config…', null, 'Configuring', '');
    const baselineConfig = await fetchBaselineConfig();

    setProgress(true, 70, 'Creating site config…', null, 'Configuring', '');
    const newConfig = buildNewSiteConfig(baselineConfig, siteName);
    await createAemSiteConfig(siteName, newConfig);

    const queryIndex = {
      copied: false,
      verified: false,
      skippedNoBaseline: false,
      error: null,
    };
    const queryYaml = await fetchBaselineQueryIndex();
    if (!queryYaml?.trim()) {
      queryIndex.skippedNoBaseline = true;
    } else {
      setProgress(true, 85, 'Copying query index config…', null, 'Configuring', '');
      try {
        await createQueryIndex(siteName, queryYaml);
        queryIndex.copied = true;
        setProgress(true, 88, 'Verifying query index (query.yaml)…', null, 'Configuring', '');
        queryIndex.verified = await verifyQueryIndexAfterCreate(siteName);
        if (!queryIndex.verified) {
          console.warn('Query index GET verification failed after upload; Admin API may still be propagating.');
        }
      } catch (queryErr) {
        queryIndex.error = queryErr.message || String(queryErr);
        console.warn('Query index copy failed:', queryErr);
      }
    }

    setProgress(true, 100, 'Done', null, 'Done', '');
    const contentPaths = daPathsToApiPaths(copiedFiles);
    showResult(true, siteName, null, {
      codeConfig: newConfig.code,
      contentPaths,
      daConfigCopied,
      queryIndex,
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
      const { value } = validateSiteName(siteInput.value);
      if (previewEl) previewEl.textContent = value || 'yoursite';
      if (cloneBtn) cloneBtn.disabled = !value;
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
      const { valid, value, error } = validateSiteName(siteInput?.value);
      if (!valid) {
        showToast(error, 'error');
        return;
      }
      cloneSite(value);
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

  const siteInput = document.getElementById('site-name-input');
  const cloneBtn = document.getElementById('clone-btn');
  if (siteInput) siteInput.focus();
  if (cloneBtn) cloneBtn.disabled = true;
  setCloneStep(1);

  try {
    await ensureWorkerReady();
    app.workerReady = true;
    showToast('CloneIt is ready. Enter a site name to clone the demo site.', 'success');
  } catch (error) {
    console.error('Init failed:', error);
    showToast('CloneIt worker unavailable. Check ALLOWED_ORIGINS and deployment.', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
