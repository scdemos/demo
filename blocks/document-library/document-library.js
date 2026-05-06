/**
 * Document Library block — displays files from a SharePoint document library.
 *
 * Authoring (key-value rows):
 *   | document-library |                                                          |
 *   | Folder           | https://adobe.sharepoint.com/sites/site/Shared%20Docs  |
 *   | Title            | Team Documentation                                       |
 *   | Client ID        | <Azure AD app client ID (GUID)>                         |
 *   | Tenant           | adobe.com  (optional, defaults to "common")              |
 *
 * Clicking "Sign in with Microsoft" opens a small popup so the user stays on
 * the page.  On success the popup closes and files load automatically.
 *
 * Without "Client ID" the block falls back to the SharePoint REST API with
 * credentials:include, which only works when SharePoint has CORS configured for
 * the requesting origin.
 *
 * For local dev, point Folder at a JSON file:
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
// PKCE / OAuth
// ---------------------------------------------------------------------------

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE = 'https://login.microsoftonline.com';
const TOKEN_KEY = 'dl-oauth-token';
const PKCE_KEY = 'dl-oauth-pkce';

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach((b) => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const verifier = base64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64urlEncode(hash) };
}

function getStoredToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, expiry } = JSON.parse(raw);
    if (Date.now() >= expiry) { sessionStorage.removeItem(TOKEN_KEY); return null; }
    return token;
  } catch { return null; }
}

// Write to a specific storage — popup uses window.opener.sessionStorage so the
// parent window receives the token without a full page reload.
function writeToken(storage, token, expiresIn) {
  try {
    storage.setItem(TOKEN_KEY, JSON.stringify({
      token,
      expiry: Date.now() + (expiresIn - 60) * 1000,
    }));
  } catch { /* ignore quota errors */ }
}

async function buildAuthUrl(clientId, tenant) {
  const { verifier, challenge } = await generatePKCE();
  const state = base64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  // Store PKCE in our own sessionStorage; the popup reads it via window.opener
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, redirectUri }));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid Files.Read.All Sites.Read.All',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTH_BASE}/${tenant}/oauth2/v2.0/authorize?${params}`;
}

// Exchange the auth code for a token.
// targetStorage: where to write the resulting token (own sessionStorage or parent's).
async function exchangeCode(clientId, targetStorage) {
  const u = new URL(window.location.href);
  const code = u.searchParams.get('code');
  const returnedState = u.searchParams.get('state');
  if (!code || !returnedState) return false;

  // Read PKCE from own sessionStorage (popup reads from window.opener below)
  let pkce;
  try {
    // When running in the popup, the PKCE was stored by the parent window
    const pkceStorage = (window.opener && window.opener !== window)
      ? window.opener.sessionStorage
      : sessionStorage;
    pkce = JSON.parse(pkceStorage.getItem(PKCE_KEY) ?? 'null');
    pkceStorage.removeItem(PKCE_KEY);
  } catch { return false; }

  if (!pkce || pkce.state !== returnedState) return false;

  // Clean the auth params from the URL
  u.searchParams.delete('code');
  u.searchParams.delete('state');
  u.searchParams.delete('session_state');
  window.history.replaceState({}, '', u.toString());

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: pkce.redirectUri,
    code_verifier: pkce.verifier,
  });

  const res = await fetch(`${AUTH_BASE}/common/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) return false;
  const json = await res.json();
  writeToken(targetStorage, json.access_token, json.expires_in ?? 3600);
  return true;
}

// ---------------------------------------------------------------------------
// Graph API
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
    sessionStorage.removeItem(TOKEN_KEY);
    const err = new Error('auth'); err.isAuthError = true; throw err;
  }
  if (!res.ok) throw new Error(`Graph API error: ${res.status}`);

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
// SharePoint REST API (fallback without client-id)
// ---------------------------------------------------------------------------

async function fetchSharePointItems(siteUrl, folderPath) {
  const encodedPath = folderPath.split('/').map((s) => encodeURIComponent(s)).join('/');
  const apiBase = `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${encodedPath}')`;
  const opts = {
    credentials: 'include',
    headers: { Accept: 'application/json;odata=nometadata' },
  };
  const sel = '$select=Name,TimeLastModified,Length,ServerRelativeUrl&$orderby=Name';

  const [fRes, dRes] = await Promise.all([
    fetch(`${apiBase}/Files?${sel}&$top=5000`, opts),
    fetch(`${apiBase}/Folders?${sel}&$filter=Name ne 'Forms'&$top=500`, opts),
  ]);

  if (fRes.status === 401 || fRes.status === 403) {
    const err = new Error('auth'); err.isAuthError = true; throw err;
  }
  if (!fRes.ok) throw new Error(`SharePoint REST API error: ${fRes.status}`);

  const [filesJson, foldersJson] = await Promise.all([
    fRes.json(),
    dRes.ok ? dRes.json() : Promise.resolve({ value: [] }),
  ]);
  return { files: filesJson.value ?? [], folders: foldersJson.value ?? [] };
}

// ---------------------------------------------------------------------------
// Direct JSON (local dev)
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

  // ── Popup mode: this page was opened as the OAuth redirect target ─────────
  // Exchange the code, write the token to the parent's sessionStorage, close.
  if (clientId && window.opener && window.opener !== window) {
    const hasCode = new URLSearchParams(window.location.search).has('code');
    if (hasCode) {
      try {
        await exchangeCode(clientId, window.opener.sessionStorage);
      } catch { /* ignore */ }
      window.close();
      return;
    }
  }

  // ── Shell ──────────────────────────────────────────────────────────────────
  block.textContent = '';
  block.setAttribute('aria-busy', 'true');

  const header = createTag('div', { class: 'dl-header' });
  if (titleText) header.append(createTag('h3', { class: 'dl-title' }, titleText));

  const list = createTag('ul', { class: 'dl-list', role: 'list' });
  const statusEl = createTag('p', { class: 'dl-status' }, 'Loading documents…');

  block.append(header, buildColHeaders(), list, statusEl);

  // ── Render helper (called after successful auth or direct fetch) ───────────
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

  // ── Sign-in button (shown when clientId is set but no token yet) ──────────
  function showSignIn(msg) {
    list.remove();
    statusEl.textContent = '';
    if (msg) statusEl.append(`${msg} `);
    const btn = createTag('button', { class: 'dl-signin button', type: 'button' }, 'Sign in with Microsoft');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const authUrl = await buildAuthUrl(clientId, tenant);
      // Open a popup so the user stays on this page
      const popup = window.open(authUrl, 'dl-auth', 'width=520,height=650,resizable=yes,scrollbars=yes');
      if (!popup) {
        // Popup blocked — fall back to full-page redirect
        window.location.href = authUrl;
        return;
      }
      // Poll until popup closes, then look for the token
      const timer = setInterval(async () => {
        if (popup.closed) {
          clearInterval(timer);
          const token = getStoredToken();
          if (token) {
            block.removeAttribute('aria-busy');
            try {
              const data = await (sp ? fetchGraphItems(token, sp) : fetchJsonItems(rawHref));
              statusEl.remove();
              block.append(buildColHeaders(), list);
              renderItems(data);
            } catch {
              statusEl.textContent = 'Sign-in succeeded but loading files failed. Please reload.';
            }
          } else {
            btn.disabled = false;
          }
        }
      }, 400);
    });
    statusEl.append(btn);
    block.removeAttribute('aria-busy');
  }

  // ── Fetch & render ─────────────────────────────────────────────────────────
  try {
    let data;

    if (clientId) {
      // PKCE OAuth + Graph API
      let token = getStoredToken();

      // Redirect-flow callback: page reloaded after Microsoft redirected back
      if (!token && new URLSearchParams(window.location.search).has('code')) {
        await exchangeCode(clientId, sessionStorage);
        token = getStoredToken();
      }

      if (!token) { showSignIn(); return; }
      data = await fetchGraphItems(token, sp);
    } else if (sp) {
      data = await fetchSharePointItems(sp.siteUrl, sp.folderPath);
    } else {
      data = await fetchJsonItems(rawHref);
    }

    renderItems(data);
  } catch (err) {
    if (err.isAuthError && clientId) {
      showSignIn('Session expired.');
      return;
    }
    list.remove();
    statusEl.textContent = '';
    const msg = err.isAuthError
      ? 'Access denied. Add a "Client ID" config row to enable Microsoft sign-in, or '
      : 'Unable to load documents. ';
    statusEl.append(
      msg,
      createTag('a', {
        class: 'button',
        href: rawHref,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, 'Open in SharePoint'),
    );
  } finally {
    block.removeAttribute('aria-busy');
  }
}
