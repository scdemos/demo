/**
 * Product Grid block.
 *
 * Authoring: add a link to a product index JSON in the block.
 *   | product-grid                              |
 *   | /products/tools/index.json                |
 *
 * Fetches the index, resolves image URLs, and renders a responsive product card grid.
 */

import { createOptimizedPicture } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

/**
 * Fetch and return the data array from a product index JSON.
 * @param {string} url - Absolute URL to the index JSON.
 * @returns {Promise<Array>}
 */
async function fetchProductIndex(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`product-grid: index fetch failed (${resp.status})`);
  const json = await resp.json();
  return json?.data ?? [];
}

/**
 * Resolve a possibly-relative image path against the index URL.
 * e.g. "./media_abc.jpg" + "/products/tools/index.json" → "/products/tools/media_abc.jpg"
 * @param {string} image
 * @param {string} indexUrl
 * @returns {string}
 */
function resolveImage(image, indexUrl) {
  if (!image) return '';
  try {
    return new URL(image, new URL(indexUrl, window.location.origin)).pathname;
  } catch {
    return image;
  }
}

/**
 * Format a price string as Canadian dollars.
 * @param {string} price
 * @returns {string}
 */
function formatPrice(price) {
  const num = parseFloat(price);
  return Number.isFinite(num) ? `CA$${num.toFixed(2)}` : price;
}

/**
 * Build a single product card <li>.
 * @param {{ sku: string, url: string, title: string, price: string, image: string }} product
 * @param {string} indexUrl - Used to resolve relative image paths.
 * @returns {HTMLLIElement}
 */
function buildCard(product, indexUrl) {
  const li = createTag('li', { class: 'product-grid-item' });
  const link = createTag('a', { href: product.url, class: 'product-grid-link' });

  // Image
  if (product.image) {
    const src = resolveImage(product.image, indexUrl);
    const picture = createOptimizedPicture(src, product.title || '', false, [
      { width: '400' },
      { media: '(min-width: 900px)', width: '600' },
    ]);
    link.append(createTag('div', { class: 'product-grid-image' }, picture));
  }

  // Body: title + price
  const body = createTag('div', { class: 'product-grid-body' });
  body.append(createTag('p', { class: 'product-grid-title' }, product.title || product.sku));
  if (product.price) {
    body.append(createTag('p', { class: 'product-grid-price' }, formatPrice(product.price)));
  }
  link.append(body);

  li.append(link);
  return li;
}

export default async function decorate(block) {
  // Read the authored index URL — works as a hyperlink or plain text path.
  const anchor = block.querySelector('a[href]');
  const text = block.textContent.trim();
  const indexUrl = anchor
    ? anchor.href // DOM href is always absolute; browser resolves relative links
    : new URL(text, window.location.origin).href;

  if (!indexUrl) return;

  // Clear authored content and show loading state
  block.textContent = '';
  block.setAttribute('aria-busy', 'true');

  try {
    const products = await fetchProductIndex(indexUrl);

    if (!products.length) {
      block.append(createTag('p', { class: 'product-grid-empty' }, 'No products found.'));
      return;
    }

    const ul = createTag('ul', { class: 'product-grid-list' });
    products.forEach((product) => ul.append(buildCard(product, indexUrl)));
    block.append(ul);
  } catch {
    block.append(createTag('p', { class: 'product-grid-empty' }, 'Unable to load products right now.'));
  } finally {
    block.removeAttribute('aria-busy');
  }
}
