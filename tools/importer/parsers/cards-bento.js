/* eslint-disable */
/* global WebImporter */
/**
 * Parser for cards-bento. Base block: cards (block/v1/block container).
 * Source: https://www.totalwireless.com/m/home (AEM experiencefragment / bento-box cards)
 * Model (blocks/cards-bento/_cards-bento.json):
 *   cards-bento (container) → cards-bento-item { image (reference), imageAlt (collapsed), text (richtext) }.
 * Library convention: each card row has TWO cells — cell 1 = image (image/imageAlt),
 * cell 2 = text (leading label paragraph, heading, description, CTA link). Empty cell still present.
 *
 * Each ".bento-box-card" is one card: optional image + eyebrow label + title + description + CTA.
 * A leading section heading ("Get more with Total Wireless") is emitted as default content.
 */
export default function parse(element, { document }) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Exact card containers: class token "bento-box-card" (not the __image/__content/-wrapper variants).
  let items = [...element.querySelectorAll('[class~="bento-box-card"]')];
  if (!items.length) {
    // Fallback: leaf elements whose class merely contains the token.
    items = [...element.querySelectorAll('[class*="bento-box-card"]')]
      .filter((el) => !el.querySelector('[class*="bento-box-card"]'));
  }
  if (!items.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const cells = [];
  const usedHeadings = new Set();
  const seen = new Set();

  items.forEach((item) => {
    const seenImg = new Set();
    let image = null;
    item.querySelectorAll('img').forEach((img) => {
      const k = (img.getAttribute('src') || '').split('?')[0];
      if (k && !seenImg.has(k)) { seenImg.add(k); if (!image) image = img; }
    });

    const eyebrow = item.querySelector('[class*="eyebrow"]');
    const headingEl = [...item.querySelectorAll('h1, h2, h3, h4, h5, h6')].find((h) => norm(h.textContent))
      || item.querySelector('[class*="card-title"]');
    const descEl = item.querySelector('[class*="description"]');
    const link = item.querySelector('a[href]');

    const eyebrowText = norm(eyebrow && eyebrow.textContent);
    const headingText = norm(headingEl && headingEl.textContent);
    const descText = norm(descEl && descEl.textContent);

    if (!headingText && !eyebrowText && !image) return;

    // Dedupe responsive duplicates.
    const key = `${eyebrowText}|${headingText}|${descText}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (headingText) usedHeadings.add(headingText);

    // Cell 1 — image (reference). Empty cell (no hint) if no image.
    const imageCell = document.createDocumentFragment();
    if (image) {
      imageCell.appendChild(document.createComment(' field:image '));
      imageCell.appendChild(image);
    }

    // Cell 2 — text (richtext): eyebrow label, heading, description, CTA.
    const textCell = document.createDocumentFragment();
    textCell.appendChild(document.createComment(' field:text '));
    if (eyebrowText && eyebrowText !== headingText) {
      const p = document.createElement('p');
      p.textContent = eyebrowText;
      textCell.appendChild(p);
    }
    if (headingText) {
      const h = document.createElement(headingEl && /^H[1-6]$/.test(headingEl.tagName) ? headingEl.tagName.toLowerCase() : 'h3');
      h.textContent = headingText;
      textCell.appendChild(h);
    }
    if (descText && descText !== headingText) {
      const p = document.createElement('p');
      p.textContent = descText;
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

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-bento', cells });

  if (leadHeading) {
    const h = document.createElement(leadHeading.tagName.toLowerCase());
    h.textContent = norm(leadHeading.textContent);
    element.replaceWith(h, block);
  } else {
    element.replaceWith(block);
  }
}
