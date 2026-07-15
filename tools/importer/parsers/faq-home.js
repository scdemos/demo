/* eslint-disable */
/* global WebImporter */
/**
 * Parser for faq-home. Base block: faq (block/v1/block container).
 * Source: https://www.totalwireless.com/m/home (AEM experiencefragment / accordion)
 * Model (blocks/faq-home/_faq-home.json):
 *   faq-home (container) → faq-home-item { question (richtext), answer (richtext) }.
 * Container block: each accordion item is one row with TWO cells: question, answer.
 * Generated for xwalk: one field hint per cell.
 *
 * The accordion header renders the question twice (visible label + trigger) plus a caret
 * icon glyph, so the question text is cleaned of caret noise and de-duplicated.
 * A leading section heading ("FAQs") is emitted as default content before the block.
 */
export default function parse(element, { document }) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const clean = (s) => {
    let t = norm(s).replace(/(?:up|down)-caret icon/ig, ' ').replace(/\s+/g, ' ').trim();
    if (t.length) {
      // De-duplicate an exactly-doubled string ("X X" or "XX").
      const h = Math.floor(t.length / 2);
      const a = t.slice(0, h).trim();
      const b = t.slice(h).trim();
      if (a && a === b) return a;
      const half = t.slice(0, Math.ceil(t.length / 2)).trim();
      if (t === half + half) return half;
    }
    return t;
  };

  // Find accordion items; keep the leaf filter using the SAME selector to avoid
  // false-positive matches on nested module classes (e.g. accordion-item-header-module…).
  let itemSel = '[class*="accordionItem___"]';
  let items = [...element.querySelectorAll(itemSel)];
  if (!items.length) { itemSel = '[class*="accordion-item"]'; items = [...element.querySelectorAll(itemSel)]; }
  if (!items.length) { itemSel = '[class*="faq__field"]'; items = [...element.querySelectorAll(itemSel)]; }
  if (!items.length) { items = [...element.querySelectorAll('details')]; itemSel = null; }
  if (itemSel) items = items.filter((el) => !el.querySelector(itemSel));
  if (!items.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const cells = [];
  const seen = new Set();

  items.forEach((item) => {
    const qEl = item.querySelector('[class*="accordionItemHeader"], [class*="accordion-item-header"], [class*="Header"], summary, button, h3, h4');
    const aEl = item.querySelector('[class*="accordionDetailContent"], [class*="accordionItemDetail"], [class*="accordion-item-detail"], [class*="Detail"], [class*="content"], [class*="panel"]');

    const question = clean(qEl && qEl.textContent);
    const answer = norm(aEl && aEl.textContent);

    if (!question || seen.has(question)) return;
    seen.add(question);

    // Cell 1 — question (richtext).
    const qCell = document.createDocumentFragment();
    qCell.appendChild(document.createComment(' field:question '));
    const qp = document.createElement('p');
    qp.textContent = question;
    qCell.appendChild(qp);

    // Cell 2 — answer (richtext).
    const aCell = document.createDocumentFragment();
    aCell.appendChild(document.createComment(' field:answer '));
    if (answer) {
      const ap = document.createElement('p');
      ap.textContent = answer;
      aCell.appendChild(ap);
    }

    cells.push([qCell, aCell]);
  });

  const leadHeading = [...element.querySelectorAll('h1, h2')].find((h) => norm(h.textContent));

  const block = WebImporter.Blocks.createBlock(document, { name: 'faq-home', cells });

  if (leadHeading && !seen.has(clean(leadHeading.textContent))) {
    const h = document.createElement(leadHeading.tagName.toLowerCase());
    h.textContent = norm(leadHeading.textContent);
    element.replaceWith(h, block);
  } else {
    element.replaceWith(block);
  }
}
