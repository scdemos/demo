/* eslint-disable */
/* global WebImporter */
/**
 * Parser for product-grid-picks. Base block: product-grid.
 * Source: https://www.totalwireless.com/m/home (AEM experiencefragment / product carousel picks)
 * Model (blocks/product-grid-picks/_product-grid-picks.json):
 *   product-grid-picks { index (aem-content) } — a link to a product index JSON. The block JS
 *   fetches the index and renders a curated product-pick row (image, name, price, Select CTA).
 *
 * This is an index-driven block: the authored content is a single link to a product index.
 * The source page renders hardcoded product cards, but the EDS block is data-driven, so the
 * parser emits ONE row with ONE cell containing the index link (field:index). We derive the
 * index path from the section's "shop all" CTA, defaulting to a conventional products index.
 * Generated for xwalk: field hint on the index cell.
 *
 * A leading section heading ("All the best phones, all in one place") and its shop-all CTA are
 * emitted as default content before the block.
 */
export default function parse(element, { document }) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Section heading + "shop all" CTA (default content preceding the block).
  const heading = [...element.querySelectorAll('h1, h2, h3')].find((h) => norm(h.textContent));
  const shopAll = [...element.querySelectorAll('a[href]')]
    .find((a) => /shop all|all phones|view all|see all/i.test(norm(a.textContent)));

  // Derive the product index path. Prefer a JSON index if one is linked; otherwise map the
  // shop-all destination to a conventional query-index path, defaulting to phones.
  let indexPath = '/products/phones/index.json';
  const jsonLink = [...element.querySelectorAll('a[href]')]
    .find((a) => /\.json(\?|$)/i.test(a.getAttribute('href') || ''));
  if (jsonLink) {
    indexPath = jsonLink.getAttribute('href');
  } else if (shopAll) {
    try {
      const p = new URL(shopAll.getAttribute('href'), 'https://www.totalwireless.com').pathname;
      indexPath = `${p.replace(/\/$/, '')}/index.json`.replace(/^\/+/, '/');
    } catch { /* keep default */ }
  }

  // Row 1 (content) — index (aem-content field): a link to the product index JSON.
  const indexCell = document.createDocumentFragment();
  indexCell.appendChild(document.createComment(' field:index '));
  const a = document.createElement('a');
  a.setAttribute('href', indexPath);
  a.textContent = indexPath;
  indexCell.appendChild(a);

  const cells = [[indexCell]];
  const block = WebImporter.Blocks.createBlock(document, { name: 'product-grid-picks', cells });

  // Emit heading + shop-all CTA as default content before the block.
  const before = [];
  if (heading) {
    const h = document.createElement(heading.tagName.toLowerCase());
    h.textContent = norm(heading.textContent);
    before.push(h);
  }
  if (shopAll) {
    const p = document.createElement('p');
    const link = document.createElement('a');
    link.setAttribute('href', shopAll.getAttribute('href'));
    link.textContent = norm(shopAll.textContent);
    p.appendChild(link);
    before.push(p);
  }

  if (before.length) {
    element.replaceWith(...before, block);
  } else {
    element.replaceWith(block);
  }
}
