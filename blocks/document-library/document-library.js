/**
 * Document Library block — POSTs to an Azure Logic App to list SharePoint files.
 *
 * Authoring (key-value row):
 *   | document-library |                  |
 *   | Folder           | Shared Documents |
 *
 * The Logic App receives: { "folder": "Shared Documents" }
 * Expected response (any of these shapes are handled):
 *   - Array of items
 *   - { value: [...items] }
 *   - { files: [...], folders: [...] }
 */

import { createTag } from '../../scripts/shared.js';

const ENDPOINT = 'https://defaultfa7b1b5a7b34438794aed2c178dece.e1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/7cf1dd3c93b243bda49882aaf73aa9da/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=QCJox8uNJ8MQGi9Ma-djzuk33tJXJ6NeTflW7gPboSg';

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

function formatSize(bytes) {
  const n = Number(bytes);
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
// Response normalizer — handles common Logic App / SharePoint return shapes
// ---------------------------------------------------------------------------

function normalizeItem(raw) {
  // Prefer LinkingUri (fully encoded absolute URL) for clickable/download links
  const url = raw.LinkingUri || raw.LinkingUrl || raw.webUrl || raw.url || raw.link || raw.FileRef
    || (raw.ServerRelativeUrl ? `https://adobe.sharepoint.com${raw.ServerRelativeUrl}` : '#');
  return {
    Name: raw.Name || raw.name || raw.FileLeafRef || '',
    Length: String(raw.Length || raw.size || raw.File_x0020_Size || raw.fileSize || 0),
    TimeLastModified: raw.TimeLastModified || raw.lastModifiedDateTime || raw.Modified || raw.modified || '',
    ServerRelativeUrl: url,
    isFolder: !!(raw.folder || raw.isFolder || raw.FSObjType === 1 || raw.type === 'folder'),
  };
}

function parseResponse(raw) {
  let items = [];
  let folderItems = [];

  // SharePoint OData REST format: { d: { results: [...] } }
  if (raw.d && Array.isArray(raw.d.results)) {
    items = raw.d.results;
  } else if (Array.isArray(raw)) {
    items = raw;
  } else if (raw.files || raw.folders) {
    items = raw.files || [];
    folderItems = raw.folders || [];
  } else if (Array.isArray(raw.value)) {
    items = raw.value;
  } else if (raw.body && Array.isArray(raw.body.value)) {
    items = raw.body.value;
  }

  const normalized = items.map(normalizeItem);
  const normalizedFolders = folderItems.map((f) => ({ ...normalizeItem(f), isFolder: true }));

  return {
    files: normalized.filter((i) => !i.isFolder),
    folders: [...normalizedFolders, ...normalized.filter((i) => i.isFolder)],
  };
}

// ---------------------------------------------------------------------------
// DOM builders
// ---------------------------------------------------------------------------

function buildIcon(type, ext) {
  const el = createTag('span', { class: `dl-icon dl-icon-${type}`, 'aria-hidden': 'true' });
  if (type !== 'folder') el.dataset.ext = ext.toUpperCase().slice(0, 4);
  return el;
}

function buildFolderRow(folder) {
  const url = folder.ServerRelativeUrl;
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

function buildFileRow(file) {
  const url = file.ServerRelativeUrl;
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
      config[key] = cells[1].textContent.trim();
    }
  });
  return config;
}

// ---------------------------------------------------------------------------
// Block entry point
// ---------------------------------------------------------------------------

export default async function decorate(block) {
  const config = readConfig(block);
  const folder = config.folder || 'Shared Documents';

  block.textContent = '';
  block.setAttribute('aria-busy', 'true');

  const list = createTag('ul', { class: 'dl-list', role: 'list' });
  const statusEl = createTag('p', { class: 'dl-status' }, 'Loading…');

  block.append(buildColHeaders(), list, statusEl);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });

    if (!res.ok) throw new Error(`Request failed: ${res.status}`);

    const raw = await res.json();
    const { files, folders } = parseResponse(raw);

    statusEl.remove();

    if (!files.length && !folders.length) {
      block.append(createTag('p', { class: 'dl-status' }, 'No documents found.'));
    } else {
      folders.forEach((f) => list.append(buildFolderRow(f)));
      files.forEach((f) => list.append(buildFileRow(f)));
    }
  } catch {
    statusEl.textContent = 'Unable to load documents. Please try again later.';
  }

  block.removeAttribute('aria-busy');
}
