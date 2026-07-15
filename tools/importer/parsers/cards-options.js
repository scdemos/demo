/* eslint-disable */
/* global WebImporter */
/**
 * Parser for cards-options. Base block: cards (block/v1/block container).
 * Source: https://www.totalwireless.com/m/home (AEM experiencefragment)
 * Model (blocks/cards-options/_cards-options.json):
 *   cards-options (container) → cards-options-item { image (reference), imageAlt (collapsed), text (richtext) }.
 * Library convention: each card row has TWO cells — cell 1 = image (image/imageAlt),
 * cell 2 = text (title/description/CTA). An empty cell must still be present.
 *
 * Cross-page resilience: instance A uses ".tilelet-section" (icon-forward heading-only options),
 * instance B uses nested ".content-card-wrapper" contact cards (eyebrow label + copy + CTA).
 * The item finder tries several card container patterns and keeps only leaf items.
 * A leading section heading (e.g. "How would you like to start?") is emitted as default content.
 */
export default function parse(element, { document }) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const findItems = (root) => {
    const sels = ['[class*="tilelet-section"]', '[class*="content-card-wrapper"]', '[class*="card-wrapper"]'];
    for (const s of sels) {
      let found = [...root.querySelectorAll(s)];
      // Keep only leaf items (no nested item of the same selector inside).
      found = found.filter((el) => !el.querySelector(s));
      found = found.filter((el) => el.querySelector('h1,h2,h3,h4,h5,h6') || el.querySelector('[class*="eyebrow"], [class*="title"]'));
      if (found.length >= 2) return found;
    }
    return [...root.querySelectorAll('li')].filter((el) => el.querySelector('h1,h2,h3,h4,h5,h6'));
  };

  const items = findItems(element);
  if (!items.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const cells = [];
  const usedHeadings = new Set();
  const seenRows = new Set();

  items.forEach((item) => {
    // Optional icon/image.
    const seenImg = new Set();
    let image = null;
    item.querySelectorAll('img').forEach((img) => {
      const k = (img.getAttribute('src') || '').split('?')[0];
      if (k && !seenImg.has(k)) { seenImg.add(k); if (!image) image = img; }
    });

    const headingEl = [...item.querySelectorAll('h1, h2, h3, h4, h5, h6')].find((h) => norm(h.textContent));
    const eyebrowEl = item.querySelector('[class*="eyebrow"]');
    const titleEl = item.querySelector('[class*="card-title"], [class*="headline"]');
    const descEl = item.querySelector('[class*="description"]');
    const link = item.querySelector('a[href]');

    const label = norm((headingEl && headingEl.textContent) || (eyebrowEl && eyebrowEl.textContent));
    let body = norm((descEl && descEl.textContent) || (titleEl && titleEl.textContent));
    if (body === label) body = '';

    // Dedupe responsive duplicate cards.
    const rowKey = `${label}|${body}`;
    if (seenRows.has(rowKey)) return;
    seenRows.add(rowKey);
    if (label) usedHeadings.add(label);

    // Cell 1 — image (reference). Empty cell if no icon.
    const imageCell = document.createDocumentFragment();
    if (image) {
      imageCell.appendChild(document.createComment(' field:image '));
      imageCell.appendChild(image);
    }

    // Cell 2 — text (richtext): heading, optional description, optional CTA link.
    const textCell = document.createDocumentFragment();
    textCell.appendChild(document.createComment(' field:text '));
    if (label) {
      const h = document.createElement(headingEl ? headingEl.tagName.toLowerCase() : 'h3');
      h.textContent = label;
      textCell.appendChild(h);
    }
    if (body) {
      const p = document.createElement('p');
      p.textContent = body;
      textCell.appendChild(p);
    }
    if (link) {
      const wrap = document.createElement('p');
      const a = document.createElement('a');
      a.setAttribute('href', link.getAttribute('href'));
      a.textContent = norm(link.textContent) || 'Learn more';
      wrap.appendChild(a);
      textCell.appendChild(wrap);
    }

    cells.push([imageCell, textCell]);
  });

  const leadHeading = [...element.querySelectorAll('h1, h2')]
    .find((h) => norm(h.textContent) && !usedHeadings.has(norm(h.textContent)));

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-options', cells });

  if (leadHeading) {
    const h = document.createElement(leadHeading.tagName.toLowerCase());
    h.textContent = norm(leadHeading.textContent);
    element.replaceWith(h, block);
  } else {
    element.replaceWith(block);
  }
}
