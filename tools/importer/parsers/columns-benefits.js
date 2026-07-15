/* eslint-disable */
/* global WebImporter */
/**
 * Parser for columns-benefits. Base block: columns (core/franklin/components/columns).
 * Source: https://www.totalwireless.com/m/home (AEM experiencefragment / feature-banner)
 * Model (blocks/columns-benefits/_columns-benefits.json): columns block, 5 columns, 1 row.
 * Columns blocks use DEFAULT CONTENT ONLY — no field-hint comments (per hinting rules).
 * Library convention: name row + a content row with one cell per column.
 *
 * Source: an intro line ("Pick any plan and get:") followed by 5 icon+label benefit items
 * (".feature-banner__icon-item" = icon image + label). Output: one row, one cell per benefit
 * (5 columns). The intro line is emitted as default content immediately before the block.
 */
export default function parse(element, { document }) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Benefit items: prefer the authored icon-item containers; fall back to grouping images.
  let items = [...element.querySelectorAll('[class*="feature-banner__icon-item"]')];
  if (!items.length) {
    const seen = new Set();
    element.querySelectorAll('img').forEach((img) => {
      const key = (img.getAttribute('src') || '').split('?')[0];
      if (key && !seen.has(key)) { seen.add(key); items.push(img.closest('div') || img); }
    });
  }
  if (!items.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const columnCells = items.map((item) => {
    const cell = [];
    // Icon image.
    const img = item.querySelector('img');
    if (img) cell.push(img);
    // Label text (icon-text container or the item's text; fall back to alt).
    const labelEl = item.querySelector('[class*="icon-text"]') || item;
    let label = norm(labelEl.textContent);
    if (!label && img) label = norm(img.getAttribute('alt'));
    if (label) {
      const p = document.createElement('p');
      p.textContent = label;
      cell.push(p);
    }
    return cell;
  });

  // Intro line as default content preceding the columns block (not a column itself).
  const usedLabels = new Set(
    columnCells.flatMap((c) => c.map((n) => (n.textContent ? norm(n.textContent) : ''))),
  );
  const introEl = [...element.querySelectorAll('h1, h2, h3, h4, p')]
    .find((el) => {
      const t = norm(el.textContent);
      return t && !el.querySelector('img') && !usedLabels.has(t);
    });

  const cells = [columnCells];
  const block = WebImporter.Blocks.createBlock(document, { name: 'columns-benefits', cells });

  if (introEl) {
    const intro = document.createElement('p');
    intro.textContent = norm(introEl.textContent);
    element.replaceWith(intro, block);
  } else {
    element.replaceWith(block);
  }
}
