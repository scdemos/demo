// CloneIt on Helix 6: a template that keeps its content in the AEM source bus
// (api.aem.live/{org}/sites/{site}/source) is cloned into a new source-bus site.
// The source bus can't copy across sites, so every file is read from the template
// and written to the new site, from the browser with the signed-in user's IMS token.
// No DOM access, so it can be tested on its own.

export const AEM_API = 'https://api.aem.live';

// File types the source bus stores.
const CONTENT_TYPES = {
  html: 'text/html',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
};

// Deleted files; never part of a clone.
const TRASH = '.trash';

/**
 * Whether a site keeps its content in the source bus: content source type `sourcebus`, or a
 * content source url on api.aem.live (helix-api-service treats both as the source bus).
 * @param {object} siteConfig AEM site config
 */
export function isHlx6Config(siteConfig) {
  const source = siteConfig?.content?.source;
  return source?.type === 'sourcebus' || (typeof source?.url === 'string' && source.url.startsWith(`${AEM_API}/`));
}

export function sourceBusUrl(org, site) {
  return `${AEM_API}/${org}/sites/${site}/source`;
}

/** Content source of a new source-bus site: the template's source type, the site's own source bus. */
export function hlx6ContentSource(templateSource, org, site) {
  return { type: templateSource?.type === 'sourcebus' ? 'sourcebus' : 'markup', url: sourceBusUrl(org, site) };
}

function extOf(path) {
  const name = path.split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function contentTypeOf(path) {
  return CONTENT_TYPES[extOf(path)] || 'application/octet-stream';
}

const isText = (path) => ['html', 'json'].includes(extOf(path));

/**
 * Lists every file below the source-bus root, except the trash and the top-level folders (and
 * `{name}.html` pages) in `skipTopLevel`, the same rule as the DA crawl.
 * @param {(folder: string) => Promise<object[]>} listFolder raw entries of a site-relative folder
 *   ('' = root); throws when the listing fails
 * @param {Set<string>} [skipTopLevel]
 * @returns {Promise<string[]>} site-relative file paths, sorted
 */
export async function collectSourceBusFiles(listFolder, skipTopLevel = new Set()) {
  const files = [];
  let folders = [''];
  const join = (a, b) => [a, b].filter(Boolean).join('/');
  while (folders.length) {
    const batch = folders;
    folders = [];
    // the client paces its requests, so a whole level can be listed at once
    const listings = await Promise.all(batch.map((rel) => listFolder(rel)));
    listings.forEach((entries, i) => {
      const rel = batch[i];
      (Array.isArray(entries) ? entries : []).filter((e) => e?.name).forEach((entry) => {
        const isFolder = entry.name.endsWith('/') || entry['content-type'] === 'application/folder';
        const name = entry.name.replace(/\/$/, '');
        if (!rel && (name === TRASH || skipTopLevel.has(isFolder ? name : name.replace(/\.html$/, '')))) return;
        if (isFolder) folders.push(join(rel, name));
        else files.push(join(rel, name));
      });
    });
  }
  return files.sort();
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// src/href/srcset attribute values
const URL_ATTR = /\b(src|href|srcset)=(["'])(.*?)\2/gi;
const ABSOLUTE = /^(https?:)?\/\//i;
// a media bus url's query (delivery params such as width and format), up to a #width= fragment
const MEDIA_QUERY = /^([^?#]*\/media_[0-9a-f]+\.[a-z0-9]+)\?.*?(#width=.*)?$/i;

/**
 * Prepares a template file for the new site.
 * - html: `media_` refs point at the template's aem.page host, without delivery params. The
 *   new site's source bus fetches and stores them when the page is written.
 * - html and json: other links to the template's aem.page/aem.live hosts and its source bus
 *   (e.g. the library's templates sheet) point at the new site.
 * @param {string} text
 * @param {object} opts
 * @param {string} opts.org
 * @param {string} opts.template template site
 * @param {string} opts.site new site
 * @param {string} opts.path site-relative file path, e.g. 'en/index.html'
 */
export function rewriteForNewSite(text, {
  org, template, site, path,
}) {
  const templateHost = new RegExp(`(//[a-z0-9-]+--)${esc(template)}(--${esc(org)}\\.aem\\.(?:page|live)\\b)(?![^\\s"'<>]*/media_)`, 'g');
  const moved = text.replace(templateHost, `$1${site}$2`)
    .replaceAll(`${sourceBusUrl(org, template)}/`, `${sourceBusUrl(org, site)}/`);
  if (extOf(path) !== 'html') return moved;
  const base = `https://main--${template}--${org}.aem.page/${path.replace(/^\/+/, '')}`;
  return moved.replace(URL_ATTR, (full, attr, quote, raw) => {
    let val = raw.trim();
    if (!val.includes('media_')) return full;
    if (!ABSOLUTE.test(val)) {
      try {
        val = new URL(val, base).href;
      } catch {
        return full;
      }
    }
    val = val.replace(MEDIA_QUERY, '$1$2');
    return val === raw ? full : `${attr}=${quote}${val}${quote}`;
  });
}

/**
 * Web paths to preview and publish for the copied files. Paths below a dot folder (`.da`,
 * attachments) are left out: the Helix 6 API refuses them and they aren't served anyway.
 */
export function bulkPaths(files) {
  return files
    .filter((f) => !f.split('/').slice(0, -1).some((s) => s.startsWith('.')))
    .map((f) => (f.endsWith('.html') ? `/${f.slice(0, -5)}`.replace(/(^|\/)index$/, '$1') : `/${f}`));
}

// The Helix 6 API (source bus included) allows 10 requests per second per project
// (https://www.aem.live/docs/limits). Stay below that.
export const CONCURRENCY = 4;
export const MIN_INTERVAL_MS = 125; // at most 8 request starts per second
// Used when the response doesn't say how long to wait. Bursts were answered
// with `x-retry-after: 60`, hence the long tail.
const RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];
const MAX_RETRY_AFTER_MS = 60000;

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Runs tasks with at most `max` in flight and at least `minIntervalMs` between starts.
 * `limit.coolDown(ms)` holds back new starts, e.g. after a 429 (the project's
 * budget is used up, not only this request's), also for tasks already waiting to start.
 */
export function createLimiter(max = CONCURRENCY, minIntervalMs = MIN_INTERVAL_MS, sleep = defaultSleep) {
  let active = 0;
  let nextStart = 0;
  const waiting = [];
  const limit = async (task) => {
    if (active < max) active += 1;
    else await new Promise((resolve) => { waiting.push(resolve); });
    try {
      // check the clock again after each wait: a cool-down may have moved the next start
      while (Date.now() < nextStart) await sleep(nextStart - Date.now());
      nextStart = Date.now() + minIntervalMs;
      return await task();
    } finally {
      // hand the slot to the next waiting task, so nothing slips in between
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
  limit.coolDown = (ms) => {
    nextStart = Math.max(nextStart, Date.now() + ms);
  };
  return limit;
}

function retryAfterMs(resp) {
  const value = resp.headers?.get('x-retry-after') || resp.headers?.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS) : null;
}

/**
 * Retries a request on 429, 503 and network errors. The rate-limit 429 has no CORS
 * headers, so the browser sees a network error (TypeError) instead; `x-retry-after` /
 * `retry-after` are honored when readable. Source writes overwrite, so retrying is safe.
 * @param {() => Promise<Response>} doFetch
 * @returns {Promise<Response>} the last response; throws if the last try had a network error
 */
export async function fetchWithRetry(doFetch, {
  retries = RETRY_DELAYS_MS.length, sleep = defaultSleep, onRetry,
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let resp;
    let error;
    try {
      resp = await doFetch();
    } catch (e) {
      error = e;
    }
    const retryable = error || resp.status === 429 || resp.status === 503;
    if (!retryable) return resp;
    if (attempt >= retries) {
      if (error) throw error;
      return resp;
    }
    const wait = (resp && retryAfterMs(resp)) ?? RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    if (onRetry) onRetry(wait);
    await sleep(wait);
  }
}

/**
 * Helix 6 API client for one site (source bus and bulk jobs), with the user's IMS token.
 * Sends only `Authorization`: with `x-content-source-authorization`, an html write would pass
 * the token on to every image host it fetches from. Requests are paced per site (project).
 */
export function createSourceBusClient({
  org, site, token, fetchFn = (...args) => fetch(...args), concurrency = CONCURRENCY,
  minIntervalMs = MIN_INTERVAL_MS, sleep = defaultSleep,
}) {
  const limit = createLimiter(concurrency, minIntervalMs, sleep);
  // every attempt, retries included, goes through the limiter
  const request = (path, init = {}, retries) => {
    const url = `${AEM_API}/${org}/sites/${site}/${path}`;
    const opts = { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } };
    return fetchWithRetry(() => limit(() => fetchFn(url, opts)), {
      retries, sleep, onRetry: (ms) => limit.coolDown(ms),
    });
  };
  const source = (path, folder = false, init = {}, retries) => {
    let rel = path.replace(/^\/+/, '');
    if (folder && rel && !rel.endsWith('/')) rel = `${rel}/`;
    return request(`source/${rel}`, init, retries);
  };
  const failure = (resp) => ({
    ok: false, status: resp.status, error: resp.headers.get('x-error') || `HTTP ${resp.status}`,
  });

  return {
    /** Raw entries of a site-relative folder; throws when the listing fails. */
    async list(folder) {
      const resp = await source(folder, true);
      if (!resp.ok) throw new Error(`Listing /${folder} failed: ${resp.status} ${resp.headers.get('x-error') || ''}`.trim());
      const body = await resp.json();
      return Array.isArray(body) ? body : [];
    },
    /** html and json as text, anything else as bytes. */
    async read(path) {
      const resp = await source(path);
      if (!resp.ok) return failure(resp);
      if (isText(path)) return { ok: true, text: await resp.text() };
      return { ok: true, bytes: new Uint8Array(await resp.arrayBuffer()) };
    },
    /** Raw body POST; html writes store the images they link. */
    async write(path, body, contentType = contentTypeOf(path)) {
      const resp = await source(path, false, { method: 'POST', body, headers: { 'Content-Type': contentType } });
      return resp.ok ? { ok: true, status: resp.status } : failure(resp);
    },
    /**
     * Waits until the source bus knows a new site: it answers 404 until the site config is
     * there. The root folder of an existing site always answers a HEAD. One deadline for
     * everything: this loop, not the copy's retries, waits out 429, 503 and network errors.
     */
    async waitUntilReady({ timeoutMs = 60000, intervalMs = 2000 } = {}) {
      const until = Date.now() + timeoutMs;
      const signal = AbortSignal.timeout(timeoutMs);
      for (;;) {
        const resp = await source('', true, { method: 'HEAD', signal }, 0).catch((error) => {
          if (signal.aborted) throw new Error(`Source bus for ${org}/${site} not ready after ${timeoutMs / 1000} s`);
          if (!(error instanceof TypeError)) throw error;
          return null;
        });
        if (resp?.ok) return;
        if (resp?.status === 401 || resp?.status === 403) {
          throw new Error(`No access to ${org}/${site} on the source bus (${resp.status})`);
        }
        const delay = Math.max(intervalMs, (resp && retryAfterMs(resp)) || 0);
        if ((resp && ![404, 429, 503].includes(resp.status)) || Date.now() + delay > until) {
          throw new Error(`Source bus for ${org}/${site} not ready: ${resp?.status ?? 'network error'}`);
        }
        await sleep(delay);
      }
    },
    /** Starts a bulk preview (`preview`) or publish (`live`) job on the resource root. */
    startJob(route, body) {
      return request(`${route}/`, {
        method: 'POST',
        body: JSON.stringify({ ...body, forceAsync: true }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    /**
     * Details of a job, by the topic it reports (`preview`, `live-publish`). Throws when they
     * can't be read, or the job failed, was cancelled or expired: a stopped job only has a
     * report of its paths when it ran. A 5xx is the API's hiccup, not the job's: no news yet.
     */
    async jobDetails(job) {
      const resp = await request(`jobs/${job.topic}/${job.name}/details`);
      if (resp.status >= 500) return {};
      if (!resp.ok) throw new Error(`${job.topic} job: ${resp.status} ${resp.headers.get('x-error') || ''}`.trim());
      const details = await resp.json();
      if (details.error || ['cancelled', 'expired'].includes(details.state)) {
        throw new Error(`${job.topic} job: ${details.error || details.state}`);
      }
      return details;
    },
  };
}

/**
 * Copies files from the template to the new site, file by file (read, then write). Text files
 * go through `transform`. Failures are collected, the run goes on.
 * @param {object} opts
 * @param {string[]} opts.files site-relative paths
 * @param {(path: string) => Promise<{ok: boolean, text?: string, bytes?: Uint8Array,
 *   status?: number, error?: string}>} opts.read
 * @param {(path: string, body: string|Uint8Array, contentType: string) =>
 *   Promise<{ok: boolean, status?: number, error?: string}>} opts.write
 * @param {(text: string, path: string) => string} [opts.transform]
 * @param {number} [opts.concurrency] files in flight
 * @param {(done: number, total: number, path: string) => void} [opts.onProgress]
 * @returns {Promise<{copied: string[], failed: {path: string, status?: number, error: string}[]}>}
 */
export async function copyFiles({
  files, read, write, transform = (text) => text, concurrency = CONCURRENCY, onProgress,
}) {
  const copied = [];
  const failed = [];
  let done = 0;
  const copyOne = async (path) => {
    try {
      const src = await read(path);
      if (!src?.ok) {
        failed.push({ path, status: src?.status, error: src?.error || `read failed: ${src?.status}` });
        return;
      }
      const body = src.text !== undefined ? transform(src.text, path) : src.bytes;
      const res = await write(path, body, contentTypeOf(path));
      if (res?.ok) copied.push(path);
      else failed.push({ path, status: res?.status, error: res?.error || `write failed: ${res?.status}` });
    } catch (e) {
      failed.push({ path, error: e?.message || String(e) });
    } finally {
      done += 1;
      if (onProgress) onProgress(done, files.length, path);
    }
  };
  const queue = [...files];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await copyOne(queue.shift());
  }));
  return { copied, failed };
}
