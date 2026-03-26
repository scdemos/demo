/* eslint-disable no-console */

/**
 * CloneIt - Clone demo site to create a new repoless AEM site
 * Uses AEM Admin API and DA Admin API with token from DA SDK
 */

import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const ORG = 'scdemos';
const BASELINE_SITE = 'demo';
const CODE_OWNER = 'scdemos';
const CODE_REPO = 'demo';

const API = {
  AEM_CONFIG: 'https://admin.hlx.page/config',
  DA_SOURCE: 'https://admin.da.live/source',
  DA_COPY: 'https://admin.da.live/copy',
  DA_LIST: 'https://admin.da.live/list',
  DA_CONFIG: 'https://admin.da.live/config',
};

const app = {
  token: null,
};

const SITE_NAME_MAX_LENGTH = 50;
const RESERVED_NAMES = ['admin', 'api', 'config', 'main', 'live', 'preview', 'status', 'job'];

/** Locale / language folder segments — not cloned (e.g. /en/, /fr/blog/…). */
const LOCALE_EXCLUDED_FOLDER_NAMES = new Set([
  'ar', 'bg', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'ko',
  'lt', 'lv', 'ms', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'uk', 'vi', 'zh',
  'en-gb', 'en-us', 'pt-br', 'zh-cn', 'zh-tw',
]);

function isExcludedLocaleFolderName(name) {
  if (!name || typeof name !== 'string') return false;
  return LOCALE_EXCLUDED_FOLDER_NAMES.has(name.toLowerCase());
}

/** True if relative path starts with a locale segment (e.g. en/index.html). */
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

function setProgress(visible, percent, text, fileName, phase, count) {
  const container = document.getElementById('progress-container');
  const fill = document.getElementById('progress-fill');
  const textEl = document.getElementById('progress-text');
  const filesEl = document.getElementById('progress-files');
  const phaseEl = document.getElementById('progress-phase');
  const countEl = document.getElementById('progress-count');
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
 * @param {boolean} success
 * @param {string} siteName
 * @param {string|null} errorMessage
 * @param {object} [options]
 * @param {object} [options.codeConfig]
 * @param {string[]} [options.contentPaths]
 * @param {boolean} [options.daConfigCopied]
 * @param {object} [options.queryIndex] copied, verified, skippedNoBaseline, error
 */
function showResult(success, siteName, errorMessage, options = {}) {
  const container = document.getElementById('result-container');
  const successCard = document.getElementById('result-success');
  const errorCard = document.getElementById('result-error');
  if (!container) return;

  const {
    codeConfig,
    contentPaths = [],
    daConfigCopied = false,
    queryIndex = {},
  } = options;

  const {
    copied: queryIndexCopied = false,
    verified: queryIndexVerified = false,
    skippedNoBaseline = false,
    error: queryIndexError = null,
  } = queryIndex;

  container.style.display = 'block';
  if (success) {
    successCard.style.display = 'block';
    errorCard.style.display = 'none';

    const code = codeConfig || { owner: CODE_OWNER, repo: CODE_REPO };
    const githubUrl = code.source?.url || `https://github.com/${code.owner}/${code.repo}`;

    let queryLine = '';
    if (skippedNoBaseline) {
      queryLine = `<li>Query index (<code>query.yaml</code>): skipped — baseline <code>${BASELINE_SITE}</code> has no <code>query.yaml</code> in Admin API (nothing to copy)</li>`;
    } else if (queryIndexError) {
      queryLine = `<li class="result-summary-warn">Query index (<code>query.yaml</code>): <strong>not copied</strong> — ${escapeHtml(queryIndexError)}</li>`;
    } else if (queryIndexCopied && queryIndexVerified) {
      queryLine = `<li>Query index (<code>query.yaml</code>): copied and <strong>verified</strong> (GET after upload)</li>`;
    } else if (queryIndexCopied && !queryIndexVerified) {
      queryLine = `<li class="result-summary-warn">Query index (<code>query.yaml</code>): upload reported OK but <strong>verification failed</strong> (GET still empty after retries). Check Admin API or re-upload <code>query.yaml</code> for <code>${ORG}/${siteName}</code> — <a href="${API.AEM_CONFIG}/${ORG}/sites/${siteName}/content/query.yaml" target="_blank" rel="noopener noreferrer">direct link</a></li>`;
    } else {
      queryLine = `<li>Query index (<code>query.yaml</code>): not configured</li>`;
    }

    const summaryList = document.getElementById('result-summary-list');
    if (summaryList) {
      const daConfigItem = daConfigCopied ? '<li>DA config copied</li>' : '';
      summaryList.innerHTML = `
        <li>DA content: <code>${ORG}/${BASELINE_SITE}/</code> → <code>${ORG}/${siteName}/</code></li>
        ${daConfigItem}
        <li>AEM site config created</li>
        ${queryLine}
        <li>Content: <code>content.da.live/${ORG}/${siteName}/</code></li>
      `;
    }

    const siteUrl = `https://main--${siteName}--${ORG}.aem.page`;
    const daUrl = `https://da.live/edit#/${ORG}/${siteName}`;

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

    const handoffEl = document.getElementById('result-handoff-text');
    if (handoffEl) {
      handoffEl.textContent = buildHandoffText(siteName, githubUrl);
    }

    // Bulk actions: store paths, show buttons, reset state
    app.lastClonedSite = siteName;
    app.contentPaths = contentPaths;
    app.lastHandoffText = buildHandoffText(siteName, githubUrl);
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
      ? 'Copies all content URLs (pages, images, SVGs, etc.) to clipboard – paste in the DA Bulk app to preview or publish.'
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

async function siteExistsInAem(token, siteName) {
  const url = `${API.AEM_CONFIG}/${ORG}/sites/${siteName}.json`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

/**
 * Check if DA folder has content. Returns true only if folder exists AND has at least one item.
 * DA List API returns 200 with [] for non-existent repos, so we treat empty as "doesn't exist".
 */
async function folderExistsInDa(token, siteName) {
  const url = `${API.DA_LIST}/${ORG}/${siteName}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return false;
  const data = await response.json();
  const items = Array.isArray(data) ? data : (data.sources || data.children || []);
  return items.length > 0;
}

async function fetchBaselineConfig(token) {
  const url = `${API.AEM_CONFIG}/${ORG}/sites/${BASELINE_SITE}.json`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

async function createAemSiteConfig(token, newSiteName, config) {
  const url = `${API.AEM_CONFIG}/${ORG}/sites/${newSiteName}.json`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create AEM site config: ${response.status} ${response.statusText} - ${text}`);
  }
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : {};
}

/**
 * Fetch index config (query.yaml) from baseline site.
 * @see https://admin.hlx.page/config/{org}/sites/{site}/content/query.yaml
 */
async function fetchBaselineQueryIndex(token) {
  const url = `${API.AEM_CONFIG}/${ORG}/sites/${BASELINE_SITE}/content/query.yaml`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.text();
}

/**
 * GET query.yaml for a site (same Admin API path used after PUT).
 */
async function fetchSiteQueryIndex(token, siteName) {
  const url = `${API.AEM_CONFIG}/${ORG}/sites/${siteName}/content/query.yaml`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const text = await response.text();
  return text?.trim() ? text : null;
}

/**
 * After PUT, confirm query.yaml is readable (retries for propagation lag).
 * @returns {Promise<boolean>}
 */
async function verifyQueryIndexAfterCreate(token, siteName, maxAttempts = 6, delayMs = 700) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const body = await fetchSiteQueryIndex(token, siteName);
    if (body != null && body.trim().length > 0) return true;
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

/**
 * Create or update index config (query.yaml) for new site.
 * PUT creates; if 409 (already exists), retry with POST to update.
 * @see https://www.aem.live/docs/admin.html#tag/indexConfig
 */
async function createQueryIndex(token, newSiteName, yamlContent) {
  const url = `${API.AEM_CONFIG}/${ORG}/sites/${newSiteName}/content/query.yaml`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'text/yaml',
  };

  let response = await fetch(url, { method: 'PUT', headers, body: yamlContent });
  if (response.status === 409) {
    response = await fetch(url, { method: 'POST', headers, body: yamlContent });
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create query index config: ${response.status} ${response.statusText} - ${text}`);
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Plain-text block for email / Slack handoff.
 */
function buildHandoffText(siteName, githubUrl) {
  const preview = `https://main--${siteName}--${ORG}.aem.page`;
  const da = `https://da.live/edit#/${ORG}/${siteName}`;
  return `Preview URL: ${preview}
DA content: ${da}
Code: ${githubUrl}`;
}

function getDefaultIndexHtml(siteName) {
  return `<body><header></header><main>
  <h1>Welcome to ${siteName}</h1>
  <p>Your new site has been created. Edit this page in <a href="https://da.live/edit#/${ORG}/${siteName}">Document Authoring</a>.</p>
</main><footer></footer></body>`;
}

/**
 * Fetch DA config from baseline repo (repo root).
 * @see https://opensource.adobe.com/da-admin/#tag/Config/operation/getConfig
 */
async function fetchDaConfig(token, org, repo) {
  const url = `${API.DA_CONFIG}/${org}/${repo}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.text();
}

/**
 * Rewrite config JSON: replace baseline org/repo with new site (e.g. library paths, app paths).
 */
function rewriteDaConfigForNewSite(configJson, newSiteName) {
  const baselineRef = `${ORG}/${BASELINE_SITE}`;
  const newRef = `${ORG}/${newSiteName}`;
  return configJson.replace(new RegExp(baselineRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newRef);
}

/**
 * Create DA config for new repo.
 * Uses form field 'config' (not 'data') per docs.da.live. Path '' for repo root.
 * @see https://docs.da.live/developers/api/config
 */
async function createDaConfig(token, org, repo, content) {
  const url = `${API.DA_CONFIG}/${org}/${repo}`;
  const formData = new FormData();
  formData.append('config', content);

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create DA config: ${response.status} ${response.statusText} - ${text}`);
  }
}

/**
 * List children of a DA folder. Returns array of { path, name, ext, lastModified }.
 * @see https://admin.da.live/list/{org}/{repo}/{path}
 */
async function listDaFolder(token, basePath = '') {
  const pathPart = basePath ? (basePath.startsWith('/') ? basePath : `/${basePath}`) : '';
  const url = `${API.DA_LIST}/${ORG}/${BASELINE_SITE}${pathPart}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list DA folder: ${response.status} ${response.statusText} - ${text}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : (data.sources || []);
}

/**
 * Recursively collect all file paths from the baseline DA repo.
 * Files have ext and lastModified; folders do not.
 */
async function collectAllFilePaths(token, basePath = '', files = []) {
  const items = await listDaFolder(token, basePath);
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
      await collectAllFilePaths(token, subPath, files);
    }
  }
  return files;
}

/**
 * Copy a single file from baseline to new site using DA Copy API.
 * @see https://opensource.adobe.com/da-admin/#tag/Copy
 */
async function copyDaFile(token, sourcePath, newSiteName) {
  const url = `${API.DA_COPY}/${ORG}/${BASELINE_SITE}/${sourcePath}`;
  const formData = new FormData();
  formData.append('destination', `/${ORG}/${newSiteName}/${sourcePath}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to copy ${sourcePath}: ${response.status} ${response.statusText} - ${text}`);
  }
  return response;
}

/**
 * Copy full content from baseline DA folder to new site folder.
 * Uses List API to discover all files, then Copy API per file (DA Copy does not recurse).
 * @returns {Promise<string[]>} List of copied file paths (e.g. index.html, blog/foo.html)
 */
async function copyDaFolder(token, newSiteName, onProgress) {
  const files = await collectAllFilePaths(token);
  if (files.length === 0) {
    throw new Error('No files found in baseline DA folder');
  }

  for (let i = 0; i < files.length; i += 1) {
    if (onProgress) onProgress(i + 1, files.length, files[i]);
    await copyDaFile(token, files[i], newSiteName);
  }
  return files;
}

/**
 * Convert DA file paths to Admin API paths for bulk preview/publish.
 * Includes all content: HTML pages (index.html → /, others → /path/without/ext),
 * plus assets (SVG, PNG, JPG, etc.) as /path/to/file.ext
 */
function daPathsToApiPaths(daFiles) {
  return daFiles.map((f) => {
    if (f.endsWith('.html')) {
      const withoutExt = f.slice(0, -5);
      return withoutExt === 'index' ? '/' : `/${withoutExt}`;
    }
    return `/${f}`.replace(/\/+/g, '/');
  });
}

async function createDaSource(token, siteName, path, content) {
  const cleanPath = (path.startsWith('/') ? path.slice(1) : path).replace(/\/+/g, '/');
  const url = `${API.DA_SOURCE}/${ORG}/${siteName}/${cleanPath}`;

  const formData = new FormData();
  const blob = new Blob([content], { type: path.endsWith('.json') ? 'application/json' : 'text/html' });
  formData.append('data', blob);

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create DA source: ${response.status} ${response.statusText} - ${text}`);
  }
  return response;
}

async function cloneSite(siteName) {
  const { token } = app;
  if (!token) {
    showToast('Please open this app from DA to authenticate', 'error');
    return;
  }

  setButtonLoading(true);
  hideResult();

  const filesEl = document.getElementById('progress-files');
  if (filesEl) filesEl.innerHTML = '';

  try {
    setProgress(true, 5, 'Checking if site name is available…', null, 'Checking', '');
    const [aemExists, daExists] = await Promise.all([
      siteExistsInAem(token, siteName),
      folderExistsInDa(token, siteName),
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
    await createDaSource(token, siteName, 'index.html', indexContent);

    setProgress(true, 10, 'Copying DA config…', null, 'Setup', '');
    let daConfigCopied = false;
    const daConfigContent = await fetchDaConfig(token, ORG, BASELINE_SITE);
    if (daConfigContent?.trim()) {
      try {
        const rewrittenConfig = rewriteDaConfigForNewSite(daConfigContent, siteName);
        await createDaConfig(token, ORG, siteName, rewrittenConfig);
        daConfigCopied = true;
      } catch (configErr) {
        console.warn('DA config copy skipped:', configErr);
      }
    }

    setProgress(true, 15, 'Discovering files…', null, 'Discovering', '');
    let copiedFiles = [];
    try {
      copiedFiles = await copyDaFolder(token, siteName, (current, total, fileName) => {
        const pct = 15 + Math.floor((current / total) * 25);
        setProgress(true, pct, fileName, fileName, 'Copying', `${current} / ${total}`);
      });
    } catch (copyError) {
      setProgress(true, 35, 'Copy failed, updating index.html…', null, 'Fallback', '');
      await createDaSource(token, siteName, 'index.html', indexContent);
      copiedFiles = ['index.html'];
    }

    setProgress(true, 50, 'Fetching baseline config…', null, 'Configuring', '');
    const baselineConfig = await fetchBaselineConfig(token);

    setProgress(true, 70, 'Creating site config…', null, 'Configuring', '');
    const newConfig = buildNewSiteConfig(baselineConfig, siteName);
    await createAemSiteConfig(token, siteName, newConfig);

    const queryIndex = {
      copied: false,
      verified: false,
      skippedNoBaseline: false,
      error: null,
    };
    const queryYaml = await fetchBaselineQueryIndex(token);
    if (!queryYaml?.trim()) {
      queryIndex.skippedNoBaseline = true;
    } else {
      setProgress(true, 85, 'Copying query index config…', null, 'Configuring', '');
      try {
        await createQueryIndex(token, siteName, queryYaml);
        queryIndex.copied = true;
        setProgress(true, 88, 'Verifying query index (query.yaml)…', null, 'Configuring', '');
        queryIndex.verified = await verifyQueryIndexAfterCreate(token, siteName);
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

  const copyHandoffBtn = document.getElementById('copy-handoff-btn');
  if (copyHandoffBtn) {
    copyHandoffBtn.addEventListener('click', () => {
      const text = app.lastHandoffText || document.getElementById('result-handoff-text')?.textContent;
      if (!text) {
        showToast('Nothing to copy yet.', 'error');
        return;
      }
      navigator.clipboard.writeText(text).then(
        () => showToast('Handoff copied to clipboard.', 'success'),
        () => showToast('Could not copy — select the text manually.', 'error'),
      );
    });
  }
}

async function init() {
  try {
    const { token } = await DA_SDK;
    app.token = token;

    setupEventListeners();

    const siteInput = document.getElementById('site-name-input');
    const cloneBtn = document.getElementById('clone-btn');
    if (siteInput) siteInput.focus();
    if (cloneBtn) cloneBtn.disabled = true;

    showToast('CloneIt is ready. Enter a site name to clone the demo site.', 'success');
  } catch (error) {
    console.error('Init failed:', error);
    showToast('Failed to initialize. Open from DA for authentication.', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
