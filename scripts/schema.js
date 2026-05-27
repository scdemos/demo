import { getMetadata } from './aem.js';

const graph = [];
let scriptEl;

function flush() {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.type = 'application/ld+json';
    document.head.append(scriptEl);
  }
  scriptEl.textContent = json;
}

/**
 * Adds a schema object to the page's LD+JSON @graph.
 * No-ops if an entry with the same @type already exists (prevents duplicates when
 * a server-side schema has been hydrated from the DOM).
 * @param {object} schema - schema.org structured data object (without @context)
 */
export function addSchema(schema) {
  if (!schema?.['@type']) return;
  if (graph.some((s) => s['@type'] === schema['@type'])) return;
  graph.push(schema);
  flush();
}

/**
 * Finds an existing graph entry by @type and merges properties into it.
 * Optionally changes the @type (e.g. WebPage -> FAQPage).
 * @param {string} type - the @type to find in the graph
 * @param {object} updates - properties to merge (including optional @type override)
 */
export function extendSchema(type, updates) {
  const entry = graph.find((s) => s['@type'] === type);
  if (!entry) return;
  Object.assign(entry, updates);
  flush();
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
    name: 'diyFIRE',
    url: 'https://demo.bbird.live',
    logo: 'https://demo.bbird.live/icons/logo.svg',
    description: 'A step-by-step, uniquely Canadian path to financial independence.',
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
  if (template !== 'article') return null;

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

  const date = getMetadata('date');
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
    name: 'diyFIRE',
    logo: {
      '@type': 'ImageObject',
      url: 'https://demo.bbird.live/icons/logo.svg',
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
      schema.startDate = parsed.toISOString().split('T')[0];
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
    name: 'diyFIRE',
    url: 'https://demo.bbird.live',
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

export function initPageSchemas() {
  hydrateFromDOM();

  if (window.location.pathname === '/') {
    addSchema(buildOrganizationSchema());
  }

  const article = buildArticleSchema();
  const event = buildEventSchema();

  // Only emit WebPage when no more specific type applies.
  // FAQ block upgrades WebPage to FAQPage via extendSchema().
  addSchema(article || event || buildWebPageSchema());
}
