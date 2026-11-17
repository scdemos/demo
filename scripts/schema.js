import { getMetadata } from './aem.js';
import { getMarket } from './shared.js';

const graph = [];
let scriptEl;
let initialized = false;

function flush() {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.type = 'application/ld+json';
    document.head.append(scriptEl);
  }
  scriptEl.textContent = json;
}

function getCanonicalUrl() {
  return document.querySelector('link[rel="canonical"]')?.href || window.location.href;
}

function getAbsoluteUrl(value) {
  if (!value) return '';
  try {
    return new URL(value, window.location.origin).href;
  } catch {
    return '';
  }
}

function buildOrganizationSchema() {
  return {
    '@type': 'Organization',
    name: 'Frescopa',
    url: window.location.origin,
    logo: `${window.location.origin}/icons/logo.svg`,
    description: 'Frescopa brings products, services, experiences and membership together for customers in markets worldwide.',
    sameAs: [],
  };
}

function buildWebPageSchema() {
  const schema = {
    '@type': 'WebPage',
    name: document.title,
    url: getCanonicalUrl(),
  };

  const description = getMetadata('description');
  if (description) schema.description = description;

  return schema;
}

function buildArticleSchema() {
  const template = getMetadata('template');
  const hasByline = getMetadata('author') && (getMetadata('date') || getMetadata('published'));
  if (template !== 'article' && !hasByline) return null;

  const schema = {
    '@type': 'Article',
    headline: document.title,
    url: getCanonicalUrl(),
  };

  const description = getMetadata('description');
  if (description) schema.description = description;

  const image = getMetadata('og:image');
  if (image) schema.image = getAbsoluteUrl(image);

  const author = getMetadata('author');
  if (author) schema.author = { '@type': 'Person', name: author };

  const date = getMetadata('date') || getMetadata('published');
  if (date) {
    const parsed = new Date(String(date).trim());
    if (!Number.isNaN(parsed.getTime())) {
      schema.datePublished = parsed.toISOString();
    }
  }

  const keywords = getMetadata('keywords');
  if (keywords) schema.keywords = keywords;

  schema.publisher = {
    '@type': 'Organization',
    name: 'Frescopa',
    logo: {
      '@type': 'ImageObject',
      url: `${window.location.origin}/icons/logo.svg`,
    },
  };

  return schema;
}

function isEventPage() {
  const keywords = getMetadata('keywords');
  if (!keywords) return false;
  const list = keywords.split(',').map((k) => k.trim());
  return list.includes('events') && window.location.pathname !== '/events';
}

function buildEventSchema() {
  if (!isEventPage()) return null;

  const schema = {
    '@type': 'Event',
    name: document.title,
    url: getCanonicalUrl(),
  };

  const description = getMetadata('description');
  if (description) schema.description = description;

  const image = getMetadata('og:image');
  if (image) schema.image = getAbsoluteUrl(image);

  const date = getMetadata('date');
  if (date) {
    const parsed = new Date(String(date).trim());
    if (!Number.isNaN(parsed.getTime())) {
      [schema.startDate] = parsed.toISOString().split('T');
    }
  }

  schema.eventStatus = 'https://schema.org/EventScheduled';

  const location = getMetadata('location');
  if (location) {
    schema.location = {
      '@type': 'Place',
      name: location,
      address: getMetadata('address') || location,
    };
  }

  schema.organizer = {
    '@type': 'Organization',
    name: 'Frescopa',
    url: window.location.origin,
  };

  return schema;
}

function hydrateFromDOM() {
  const existing = document.head.querySelector('script[type="application/ld+json"]');
  if (!existing) return;
  try {
    const data = JSON.parse(existing.textContent);
    const entries = data['@graph'] ? data['@graph'] : [data];
    entries.forEach((entry) => { if (entry?.['@type']) graph.push(entry); });
    scriptEl = existing;
  } catch { /* ignore malformed */ }
}

/** Adds a schema to the graph unless an entry with the same @type and @id/name exists. */
function pushSchema(schema) {
  if (!schema?.['@type']) return;
  const key = (s) => s['@id'] || s.name || '';
  if (graph.some((s) => s['@type'] === schema['@type'] && key(s) === key(schema))) return;
  graph.push(schema);
  flush();
}

/**
 * Seeds the graph with any server-rendered LD+JSON plus the page-level schema.
 * Idempotent; also runs on the first addSchema/extendSchema call so blocks can use the
 * API in any order relative to page decoration.
 */
export function initPageSchemas() {
  if (initialized) return;
  initialized = true;
  hydrateFromDOM();

  if (window.location.pathname === getMarket().root || window.location.pathname === '/') {
    pushSchema(buildOrganizationSchema());
  }

  // Only emit WebPage when no more specific type applies.
  // FAQ block upgrades WebPage to FAQPage via extendSchema().
  pushSchema(buildArticleSchema() || buildEventSchema() || buildWebPageSchema());
}

/**
 * Adds a schema object to the page's LD+JSON @graph.
 * No-ops if an entry with the same @type and @id/name already exists (prevents duplicates when
 * a server-side schema has been hydrated from the DOM).
 * @param {object} schema - schema.org structured data object (without @context)
 */
export function addSchema(schema) {
  // inside <aem-embed> the page is someone else's: leave its structured data alone
  if (window.hlx?.suppressLoadPage) return;
  initPageSchemas();
  pushSchema(schema);
}

/**
 * Finds an existing graph entry by @type and merges properties into it.
 * Optionally changes the @type (e.g. WebPage -> FAQPage).
 * @param {string} type - the @type to find in the graph
 * @param {object} updates - properties to merge (including optional @type override)
 */
export function extendSchema(type, updates) {
  if (window.hlx?.suppressLoadPage) return;
  initPageSchemas();
  const entry = graph.find((s) => s['@type'] === type);
  if (!entry) return;
  Object.assign(entry, updates);
  flush();
}
