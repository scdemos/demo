/**
 * Document Library block — displays files/folders from a SharePoint document library.
 * Uses MSAL.js for silent SSO; authenticated users see files without any prompt.
 *
 * Authoring (key-value rows):
 *   | document-library |                                                         |
 *   | Folder    | https://adobe.sharepoint.com/sites/site/Shared%20Docs        |
 *   | Title     | Team Documentation                                             |
 *   | Client ID | <Azure AD application (client) ID>                            |
 *   | Tenant    | adobe.com  (optional, defaults to "common")                   |
 *
 * Local dev: point Folder at a JSON file
 *   { files: [{Name, ServerRelativeUrl, TimeLastModified, Length}], folders:[…] }
 */

import { createTag } from '../../scripts/shared.js';

// ---------------------------------------------------------------------------
// File-type helpers
// ---------------------------------------------------------------------------

const FILE_TYPES = {
  pdf: ['pdf'],
  word: ['doc', 'docx'],
  excel: ['xls', 'xlsx', 'csv'],
  ppt: ['ppt', 'pptx'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'],
  video: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
  code: ['js', 'ts', 'css', 'html', 'json', 'xml', 'py', 'java', 'rb', 'md', 'sh'],
};

function getFileType(name) {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return Object.keys(FILE_TYPES).find((t) => FILE_TYPES[t].includes(ext)) ?? 'generic';
}

function formatSize(bytesStr) {
  const n = Number(bytesStr);
  if (!n || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function formatModified(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// SharePoint URL parser
// ---------------------------------------------------------------------------

function parseSharePointUrl(href) {
  try {
    const u = new URL(href);
    if (!u.hostname.includes('sharepoint.com')) return null;
    const siteMatch = u.pathname.match(/^(\/sites\/[^/]+)/i);
    if (!siteMatch) return null;
    const siteUrl = `${u.origin}${siteMatch[1]}`;
    let folderPath = decodeURIComponent(u.pathname).replace(/\/Forms\/[^/]*$/i, '');
    const rootFolder = u.searchParams.get('RootFolder');
    if (rootFolder) folderPath = decodeURIComponent(rootFolder);
    return { siteUrl, folderPath, origin: u.origin };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// MSAL loader
// ---------------------------------------------------------------------------

const MSAL_CDN = 'https://alcdn.msauth.net/browser/3.26.1/js/msal-browser.min.js';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPES = ['Files.Read.All', 'Sites.Read.All'];

let msalLoadPromise = null;

function loadMsal() {
  if (typeof window.msal !== 'undefined') return Promise.resolve(window.msal);
  if (msalLoadPromise) return msalLoadPromise;
  msalLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MSAL_CDN;
    s.async = true;
    s.onload = () => resolve(window.msal);
    s.onerror = () => reject(new Error('MSAL failed to load'));
    document.head.append(s);
  });
  return msalLoadPromise;
}

async function createMsalClient(clientId, tenant) {
  const msalLib = await loadMsal();
  const pca = new msalLib.PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenant || 'common'}`,
      redirectUri: `${window.location.origin}${window.location.pathname}`,
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
    system: { loggerOptions: { logLevel: 3 } },
  });
  await pca.initialize();
  return pca;
}

// Attempt silent SSO — works without any user interaction if already signed in to Microsoft.
async function acquireTokenSilently(pca) {
  const scopes = GRAPH_SCOPES;
  const accounts = pca.getAllAccounts();

  // Try cached account first (fastest path)
  if (accounts.length) {
    try {
      const r = await pca.acquireTokenSilent({ scopes, account: accounts[0] });
      return r.accessToken;
    } catch { /* fall through */ }
  }

  // Try SSO silent via existing browser session (Office 365, Outlook, etc.)
  try {
    const r = await pca.ssoSilent({ scopes });
    return r.accessToken;
  } catch { /* fall through */ }

  return null;
}

// ---------------------------------------------------------------------------
// Microsoft Graph API
// ---------------------------------------------------------------------------

async function fetchGraphItems(token, sp) {
  const hostname = sp.origin.replace('https://', '');
  const siteMatch = sp.folderPath.match(/^(\/sites\/[^/]+)/i);
  if (!siteMatch) throw new Error('Cannot determine SharePoint site path');

  const sitePath = siteMatch[1];
  const afterSite = sp.folderPath.slice(sitePath.length);
  const subfolderPath = afterSite.split('/').filter(Boolean).slice(1).join('/');

  const siteRef = encodeURIComponent(`${hostname}:${sitePath}:`);
  const driveBase = `${GRAPH_BASE}/sites/${siteRef}/drive`;
  const childrenUrl = subfolderPath
    ? `${driveBase}/root:/${encodeURI(subfolderPath)}:/children`
    : `${driveBase}/root/children`;

  const res = await fetch(
    `${childrenUrl}?$select=name,size,lastModifiedDateTime,webUrl,file,folder&$top=5000&$orderby=name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 401) {
    const err = new Error('auth'); err.isAuthError = true; throw err;
  }
  if (!res.ok) throw new Error(`Graph error: ${res.status}`);

  const { value: items = [] } = await res.json();
  return {
    files: items.filter((i) => i.file).map((i) => ({
      Name: i.name,
      Length: String(i.size ?? 0),
      TimeLastModified: i.lastModifiedDateTime,
      ServerRelativeUrl: i.webUrl,
    })),
    folders: items.filter((i) => i.folder).map((i) => ({
      Name: i.name,
      TimeLastModified: i.lastModifiedDateTime,
      ServerRelativeUrl: i.webUrl,
    })),
  };
}

// ---------------------------------------------------------------------------
// Direct JSON (local dev / mock)
// ---------------------------------------------------------------------------

async function fetchJsonItems(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
  const json = await res.json();
  return { files: json.files ?? json.value ?? [], folders: json.folders ?? [] };
}

// ---------------------------------------------------------------------------
// DOM builders
// ---------------------------------------------------------------------------

function buildIcon(type, ext) {
  const el = createTag('span', { class: `dl-icon dl-icon-${type}`, 'aria-hidden': 'true' });
  if (type !== 'folder') el.dataset.ext = ext.toUpperCase().slice(0, 4);
  return el;
}

function resolveUrl(serverRelativeUrl, origin) {
  if (!serverRelativeUrl) return '#';
  if (serverRelativeUrl.startsWith('http')) return serverRelativeUrl;
  return `${origin}${serverRelativeUrl}`;
}

function buildFolderRow(folder, origin) {
  const url = resolveUrl(folder.ServerRelativeUrl, origin);
  const li = createTag('li', { class: 'dl-item dl-item-folder' });
  li.append(
    buildIcon('folder', ''),
    createTag('a', { class: 'dl-name', href: url, target: '_blank', rel: 'noopener noreferrer' }, folder.Name),
    createTag('span', { class: 'dl-date' }, formatModified(folder.TimeLastModified)),
    createTag('span', { class: 'dl-size' }, '—'),
    createTag('span', { class: 'dl-download' }),
  );
  return li;
}

function buildFileRow(file, origin) {
  const url = resolveUrl(file.ServerRelativeUrl, origin);
  const ext = file.Name.includes('.') ? file.Name.split('.').pop() : '';
  const li = createTag('li', { class: 'dl-item dl-item-file' });
  li.append(
    buildIcon(getFileType(file.Name), ext),
    createTag('a', { class: 'dl-name', href: url, target: '_blank', rel: 'noopener noreferrer' }, file.Name),
    createTag('span', { class: 'dl-date' }, formatModified(file.TimeLastModified)),
    createTag('span', { class: 'dl-size' }, formatSize(file.Length)),
    createTag('a', {
      class: 'dl-download',
      href: url,
      download: '',
      'aria-label': `Download ${file.Name}`,
      title: 'Download',
    }, '↓'),
  );
  return li;
}

function buildColHeaders() {
  const row = createTag('div', { class: 'dl-col-headers', 'aria-hidden': 'true' });
  row.innerHTML = `
    <span class="dl-col dl-col-icon"></span>
    <span class="dl-col dl-col-name">Name</span>
    <span class="dl-col dl-col-date">Modified</span>
    <span class="dl-col dl-col-size">Size</span>
    <span class="dl-col dl-col-dl"></span>
  `;
  return row;
}

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

function readConfig(block) {
  const config = {};
  [...block.querySelectorAll(':scope > div')].forEach((row) => {
    const cells = [...row.querySelectorAll(':scope > div')];
    if (cells.length === 2) {
      const key = cells[0].textContent.trim().toLowerCase().replace(/\s+/g, '-');
      config[key] = cells[1];
    } else if (cells.length === 1 && !config.folder) {
      config.folder = cells[0];
    }
  });
  return config;
}

// ---------------------------------------------------------------------------
// Block entry point
// ---------------------------------------------------------------------------

export default async function decorate(block) {
  const config = readConfig(block);
  const folderCell = config.folder ?? config['folder-url'];
  if (!folderCell) return;

  const anchor = folderCell.querySelector('a[href]');
  const rawHref = anchor ? anchor.href : folderCell.textContent.trim();
  const titleText = config.title?.textContent?.trim() ?? '';
  const clientId = config['client-id']?.textContent?.trim() ?? '';
  const tenant = config.tenant?.textContent?.trim() || 'common';

  const sp = parseSharePointUrl(rawHref);
  const origin = sp ? sp.origin : window.location.origin;

  // ── Shell ──────────────────────────────────────────────────────────────────
  block.textContent = '';
  block.setAttribute('aria-busy', 'true');

  const header = createTag('div', { class: 'dl-header' });
  if (titleText) header.append(createTag('h3', { class: 'dl-title' }, titleText));

  const list = createTag('ul', { class: 'dl-list', role: 'list' });
  const statusEl = createTag('p', { class: 'dl-status' }, 'Loading…');

  block.append(header, buildColHeaders(), list, statusEl);

  // Populate list with items, remove status placeholder
  function renderItems(data) {
    statusEl.remove();
    const { files = [], folders = [] } = data;
    if (!files.length && !folders.length) {
      block.append(createTag('p', { class: 'dl-status' }, 'No documents found.'));
      return;
    }
    folders.forEach((f) => list.append(buildFolderRow(f, origin)));
    files.forEach((f) => list.append(buildFileRow(f, origin)));
  }

  // Render a "Sign in with Microsoft" button; on click use MSAL popup (redirect fallback)
  function showSignIn(pca, message) {
    list.remove();
    statusEl.textContent = '';
    if (message) statusEl.append(`${message} `);
    const btn = createTag('button', { class: 'dl-signin button', type: 'button' }, 'Sign in with Microsoft');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const result = await pca.acquireTokenPopup({ scopes: GRAPH_SCOPES });
        const data = await fetchGraphItems(result.accessToken, sp);
        statusEl.remove();
        block.append(buildColHeaders(), list);
        block.removeAttribute('aria-busy');
        renderItems(data);
      } catch (popupErr) {
        if (popupErr.errorCode === 'popup_window_error') {
          // Popup blocked — fall back to redirect
          await pca.acquireTokenRedirect({ scopes: GRAPH_SCOPES });
        } else {
          btn.disabled = false;
          statusEl.textContent = 'Sign-in failed. Please try again.';
        }
      }
    });
    statusEl.append(btn);
    block.removeAttribute('aria-busy');
  }

  // ── No clientId: direct fetch (JSON mock or unauthenticated REST) ──────────
  if (!clientId) {
    try {
      const data = sp
        ? await (async () => {
          const encodedPath = sp.folderPath.split('/').map((s) => encodeURIComponent(s)).join('/');
          const apiBase = `${sp.siteUrl}/_api/web/GetFolderByServerRelativeUrl('${encodedPath}')`;
          const opts = { credentials: 'include', headers: { Accept: 'application/json;odata=nometadata' } };
          const sel = '$select=Name,TimeLastModified,Length,ServerRelativeUrl&$orderby=Name';
          const [fRes, dRes] = await Promise.all([
            fetch(`${apiBase}/Files?${sel}&$top=5000`, opts),
            fetch(`${apiBase}/Folders?${sel}&$filter=Name ne 'Forms'&$top=500`, opts),
          ]);
          if (!fRes.ok) { const e = new Error('auth'); e.isAuthError = fRes.status === 401 || fRes.status === 403; throw e; }
          const [fj, dj] = await Promise.all([fRes.json(), dRes.ok ? dRes.json() : Promise.resolve({ value: [] })]);
          return { files: fj.value ?? [], folders: dj.value ?? [] };
        })()
        : await fetchJsonItems(rawHref);
      renderItems(data);
    } catch (err) {
      list.remove();
      statusEl.textContent = '';
      const msg = err.isAuthError
        ? 'Access denied. Add a "Client ID" config row to enable SSO, or '
        : 'Unable to load documents. ';
      statusEl.append(msg, createTag('a', { class: 'button', href: rawHref, target: '_blank', rel: 'noopener noreferrer' }, 'Open in SharePoint'));
    }
    block.removeAttribute('aria-busy');
    return;
  }

  // ── MSAL SSO path ──────────────────────────────────────────────────────────
  let pca;
  try {
    pca = await createMsalClient(clientId, tenant);
  } catch {
    statusEl.textContent = 'Unable to initialize authentication. Check the Client ID config.';
    block.removeAttribute('aria-busy');
    return;
  }

  // Handle redirect callback (user returning from Microsoft login page)
  let redirectToken = null;
  try {
    const redirectResult = await pca.handleRedirectPromise();
    redirectToken = redirectResult?.accessToken ?? null;
  } catch { /* ignore */ }

  // Try silent SSO (uses existing Microsoft session — no UI needed)
  const token = redirectToken ?? await acquireTokenSilently(pca);

  if (token) {
    try {
      const data = await (sp ? fetchGraphItems(token, sp) : fetchJsonItems(rawHref));
      renderItems(data);
    } catch (err) {
      if (err.isAuthError) {
        showSignIn(pca, 'Session expired.');
      } else {
        list.remove();
        statusEl.textContent = 'Files loaded but an error occurred. ';
        statusEl.append(createTag('a', { href: rawHref, target: '_blank', rel: 'noopener noreferrer' }, 'Open in SharePoint'));
      }
    }
    block.removeAttribute('aria-busy');
    return;
  }

  // Silent SSO failed — show sign-in button
  showSignIn(pca);
}
