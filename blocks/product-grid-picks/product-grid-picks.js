/**
 * Product Grid Picks block.
 *
 * Authoring: add a link to a product index JSON in the block.
 *   | product-grid-picks                        |
 *   | /products/phones/index.json               |
 *
 * Fetches the index, resolves image URLs, and renders a curated product pick row.
 */

import { createOptimizedPicture } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

async function fetchProductIndex(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`product-grid-picks: index fetch failed (${resp.status})`);
  const json = await resp.json();
  return json?.data ?? [];
}

function resolveImage(image, indexUrl) {
  if (!image) return '';
  try {
    return new URL(image, new URL(indexUrl, window.location.origin)).pathname;
  } catch {
    return image;
  }
}

function formatPrice(price) {
  const num = parseFloat(price);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : price;
}

function buildCard(product, indexUrl) {
  const li = createTag('li', { class: 'product-grid-picks-item' });
  const link = createTag('a', { href: product.url, class: 'product-grid-picks-link' });

  if (product.badge) {
    link.append(createTag('span', { class: 'product-grid-picks-badge' }, product.badge));
  }

  if (product.image) {
    const src = resolveImage(product.image, indexUrl);
    const picture = createOptimizedPicture(src, product.title || '', false, [
      { width: '400' },
      { media: '(min-width: 900px)', width: '600' },
    ]);
    link.append(createTag('div', { class: 'product-grid-picks-image' }, picture));
  }

  const body = createTag('div', { class: 'product-grid-picks-body' });
  body.append(createTag('p', { class: 'product-grid-picks-title' }, product.title || product.sku));
  if (product.price) {
    body.append(createTag('p', { class: 'product-grid-picks-price' }, formatPrice(product.price)));
  }
  body.append(createTag('span', { class: 'product-grid-picks-cta' }, 'Select'));
  link.append(body);

  li.append(link);
  return li;
}

export default async function decorate(block) {
  const anchor = block.querySelector('a[href]');
  const text = block.textContent.trim();
  const indexUrl = anchor
    ? anchor.href
    : new URL(text, window.location.origin).href;

  if (!indexUrl) return;

  block.textContent = '';
  block.setAttribute('aria-busy', 'true');

  try {
    const products = await fetchProductIndex(indexUrl);

    if (!products.length) {
      block.append(createTag('p', { class: 'product-grid-picks-empty' }, 'No products found.'));
      return;
    }

    const ul = createTag('ul', { class: 'product-grid-picks-list' });
    products.forEach((product) => ul.append(buildCard(product, indexUrl)));
    block.append(ul);
  } catch {
    block.append(createTag('p', { class: 'product-grid-picks-empty' }, 'Unable to load products right now.'));
  } finally {
    block.removeAttribute('aria-busy');
  }
}
