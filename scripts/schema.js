import { getMetadata } from './aem.js';

/**
 * Injects a JSON-LD script element into the document head.
 * Uses data-schema-type to prevent duplicate injection of the same type.
 * @param {object} schema - schema.org structured data object
 * @returns {HTMLScriptElement|null}
 */
export function injectJsonLd(schema) {
  const type = schema?.['@type'];
  if (!type) return null;

  const existing = document.head.querySelector(`script[data-schema-type="${type}"]`);
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.schemaType = type;
  script.textContent = JSON.stringify(schema);
  document.head.append(script);
  return script;
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
    '@context': 'https://schema.org',
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
    '@context': 'https://schema.org',
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
    '@context': 'https://schema.org',
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
    '@context': 'https://schema.org',
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

  schema.organizer = {
    '@type': 'Organization',
    name: 'diyFIRE',
    url: 'https://demo.bbird.live',
  };

  return schema;
}

export function initPageSchemas() {
  if (window.location.pathname === '/') {
    injectJsonLd(buildOrganizationSchema());
  }

  injectJsonLd(buildWebPageSchema());

  const article = buildArticleSchema();
  if (article) injectJsonLd(article);

  const event = buildEventSchema();
  if (event) injectJsonLd(event);
}
