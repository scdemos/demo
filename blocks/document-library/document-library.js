/**
 * Document Library block.
 *
 * Authoring:
 *   | document-library                                                          |
 *   | Folder  | https://adobe.sharepoint.com/sites/siteName/Shared%20Documents |
 *   | Title   | Team Documentation                                              |
 *
 * Single-row shorthand also accepted:
 *   | document-library                                                          |
 *   | https://adobe.sharepoint.com/sites/siteName/Shared%20Documents           |
 *
 * For local development, point Folder at a JSON file that matches
 * { files: [{Name, ServerRelativeUrl, TimeLastModified, Length}], folders: [...] }.
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

/**
 * Decompose a SharePoint URL into siteUrl + folderPath.
 * Returns null for non-SharePoint URLs (treated as direct JSON endpoints).
 * @param {string} href
 * @returns {{ siteUrl: string, folderPath: string, origin: string } | null}
 */
function parseSharePointUrl(href) {
  try {
    const u = new URL(href);
    if (!u.hostname.includes('sharepoint.com')) return null;
    const siteMatch = u.pathname.match(/^(\/sites\/[^/]+)/i);
    if (!siteMatch) return null;
    const siteUrl = `${u.origin}${siteMatch[1]}`;
    // Decode first so encodeURIComponent later doesn't double-encode (e.g. %20 → %2520)
    let folderPath = decodeURIComponent(u.pathname).replace(/\/Forms\/[^/]*$/i, '');
    // RootFolder query param overrides when navigating inside a library
    const rootFolder = u.searchParams.get('RootFolder');
    if (rootFolder) folderPath = decodeURIComponent(rootFolder);
    return { siteUrl, folderPath, origin: u.origin };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchSharePointItems(siteUrl, folderPath) {
  // Encode each path segment individually so slashes are preserved (not encoded as %2F)
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
    const err = new Error('auth');
    err.isAuthError = true;
    throw err;
  }
  if (!fRes.ok) throw new Error(`SharePoint API error: ${fRes.status}`);

  const [filesJson, foldersJson] = await Promise.all([
    fRes.json(),
    dRes.ok ? dRes.json() : Promise.resolve({ value: [] }),
  ]);
  return { files: filesJson.value ?? [], folders: foldersJson.value ?? [] };
}

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
    createTag('a', {
      class: 'dl-name',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, folder.Name),
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
    createTag('a', {
      class: 'dl-name',
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer',
    }, file.Name),
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
// Config parsing
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

  const sp = parseSharePointUrl(rawHref);
  const origin = sp ? sp.origin : window.location.origin;

  block.textContent = '';
  block.setAttribute('aria-busy', 'true');

  // ── Shell ──────────────────────────────────────────────────────────────
  const header = createTag('div', { class: 'dl-header' });
  if (titleText) {
    header.append(createTag('h3', { class: 'dl-title' }, titleText));
  }

  const list = createTag('ul', { class: 'dl-list', role: 'list' });
  const statusEl = createTag('p', { class: 'dl-status' }, 'Loading documents…');

  block.append(header, buildColHeaders(), list, statusEl);

  // ── Fetch & render ─────────────────────────────────────────────────────
  try {
    const data = sp
      ? await fetchSharePointItems(sp.siteUrl, sp.folderPath)
      : await fetchJsonItems(rawHref);

    statusEl.remove();
    const { files = [], folders = [] } = data;

    if (!files.length && !folders.length) {
      block.append(createTag('p', { class: 'dl-status' }, 'No documents found.'));
      return;
    }

    folders.forEach((f) => list.append(buildFolderRow(f, origin)));
    files.forEach((f) => list.append(buildFileRow(f, origin)));
  } catch (err) {
    list.remove();
    statusEl.textContent = '';
    // TypeError = network/CORS failure; isAuthError = 401/403 from SharePoint
    const msg = err.isAuthError
      ? 'Sign in to SharePoint to view these documents.'
      : 'Unable to reach SharePoint — open it in a new tab to authenticate, then reload.';
    statusEl.append(
      `${msg} `,
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
