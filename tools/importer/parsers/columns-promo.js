/* eslint-disable */
/* global WebImporter */
/**
 * Parser for columns-promo. Base block: columns (core/franklin/components/columns).
 * Source: https://www.totalwireless.com/m/home (AEM experiencefragment / split-banner)
 * Model (blocks/columns-promo/_columns-promo.json): columns block, 2 columns, 1 row.
 * Columns blocks use DEFAULT CONTENT ONLY — no field-hint comments (per hinting rules).
 * Library convention: name row + a content row with one cell per column; extra rows must
 * keep the same column count. Here: 1 content row, 2 cells (one per promo tile).
 *
 * Each source ".splitbanner-custom__section" is one promo tile (column): image + heading
 * + supporting text + CTA.
 */
export default function parse(element, { document }) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const isText = (el) => el
    && !el.querySelector('button, svg, img, input')
    && norm(el.textContent).length > 0;

  // Identify the column tiles. Prefer the authored split-banner sections; fall back to
  // direct grid columns for cross-page resilience.
  let sections = [...element.querySelectorAll('[class*="splitbanner-custom__section"]')];
  if (sections.length < 2) {
    const grid = element.querySelector('.aem-Grid');
    if (grid) {
      sections = [...grid.children].filter((c) => c.classList.contains('aem-GridColumn') && norm(c.textContent));
    }
  }
  if (!sections.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const columnCells = sections.map((section) => {
    const cell = [];
    const seenText = new Set();

    // Image (first unique per column).
    const seenImg = new Set();
    let image = null;
    section.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const k = src.split('?')[0];
      if (src && !seenImg.has(k)) { seenImg.add(k); if (!image) image = img; }
    });
    if (image) cell.push(image);

    // Heading.
    let heading = [...section.querySelectorAll('h1, h2, h3, h4')].find((h) => norm(h.textContent));
    if (heading) seenText.add(norm(heading.textContent));

    // Paragraphs (deduped, non-CTA).
    const paras = [];
    [...section.querySelectorAll('p')].forEach((p) => {
      if (!isText(p) || p.querySelector('a')) return;
      const t = norm(p.textContent);
      if (seenText.has(t)) return;
      seenText.add(t);
      paras.push(t);
    });
    if (!heading && paras.length) {
      heading = document.createElement('h2');
      heading.textContent = paras.shift();
    }
    if (heading) cell.push(heading);
    paras.forEach((t) => {
      const p = document.createElement('p');
      p.textContent = t;
      cell.push(p);
    });

    // CTA links (deduped).
    const seenCta = new Set();
    section.querySelectorAll('a[href]').forEach((a) => {
      const t = norm(a.textContent);
      const key = `${a.getAttribute('href')}|${t}`;
      if (t && !seenCta.has(key)) {
        seenCta.add(key);
        const wrap = document.createElement('p');
        const na = document.createElement('a');
        na.setAttribute('href', a.getAttribute('href'));
        na.textContent = t;
        wrap.appendChild(na);
        cell.push(wrap);
      }
    });

    return cell;
  });

  // Single content row, one cell per column (no field hints — columns block).
  const cells = [columnCells];

  const block = WebImporter.Blocks.createBlock(document, { name: 'columns-promo', cells });
  element.replaceWith(block);
}
