/* eslint-disable */
/* global WebImporter */
/**
 * Parser for cards-plans. Base block: cards (block/v1/block container).
 * Source: https://www.totalwireless.com/m/home (AEM experiencefragment / plan cards)
 * Model (blocks/cards-plans/_cards-plans.json):
 *   cards-plans (container) → cards-plans-item { name (richtext), price (text), features (richtext) }.
 * Container block: each plan card is one row; child properties are columns, so each row has
 * THREE cells matching the item model fields: name, price, features. The features cell holds the
 * feature bullet list plus the Select CTA link. Generated for xwalk: one field hint per cell.
 *
 * Notes:
 * - price is normalised to a clean base per-line amount + "/mo" (block JS reads this and
 *   multiplies by the selected number of lines).
 * - feature bullets are deduped and stripped of trailing "Check footnote…" screen-reader text.
 */
export default function parse(element, { document }) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const cleanFeature = (el) => norm(el.textContent).replace(/\s*Check footnote.*$/i, '').trim();

  let items = [...element.querySelectorAll('[class*="plan-card"]')];
  // Keep only leaf plan cards (avoid wrapper containers nesting other plan cards).
  items = items.filter((el) => !el.querySelector('[class*="plan-card"]'));
  if (!items.length) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const cells = [];
  const seen = new Set();

  items.forEach((item) => {
    const nameEl = item.querySelector('[class*="plan_title"], [class*="plan-title"], h2, h3');
    const name = norm(nameEl && nameEl.textContent);

    // Base per-line price: first dollar amount in the price element + "/mo".
    let price = '';
    const rawPrice = norm(item.querySelector('[class*="plan_price"], [class*="plan-price"]') && item.querySelector('[class*="plan_price"], [class*="plan-price"]').textContent);
    const m = rawPrice.match(/\$\s*\d+(?:\.\d+)?/);
    if (m) price = `${m[0].replace(/\s/, '')}/mo`;

    if (!name && !price) return;

    // Dedupe responsive duplicate cards.
    const key = `${name}|${price}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Cell 1 — name (richtext).
    const nameCell = document.createDocumentFragment();
    nameCell.appendChild(document.createComment(' field:name '));
    const h = document.createElement('h3');
    h.textContent = name;
    nameCell.appendChild(h);

    // Cell 2 — price (text field group). Empty (no hint) if absent.
    const priceCell = document.createDocumentFragment();
    if (price) {
      priceCell.appendChild(document.createComment(' field:price '));
      const p = document.createElement('p');
      p.textContent = price;
      priceCell.appendChild(p);
    }

    // Cell 3 — features (richtext): feature bullet list + Select CTA.
    const featuresCell = document.createDocumentFragment();
    featuresCell.appendChild(document.createComment(' field:features '));
    const featureItems = [...item.querySelectorAll('[class*="zelda-ul"] li, [class*="feature-points"] li, [class*="standard-benefits"] li')]
      .map((li) => cleanFeature(li))
      .filter(Boolean);
    const uniqFeatures = [...new Set(featureItems)];
    if (uniqFeatures.length) {
      const ul = document.createElement('ul');
      uniqFeatures.forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        ul.appendChild(li);
      });
      featuresCell.appendChild(ul);
    }
    // Select / primary action CTA.
    const cta = [...item.querySelectorAll('a[href]')]
      .find((a) => /select|bring your own|shop|choose/i.test(norm(a.textContent)))
      || item.querySelector('a[href]');
    if (cta) {
      const wrap = document.createElement('p');
      const a = document.createElement('a');
      a.setAttribute('href', cta.getAttribute('href'));
      a.textContent = norm(cta.textContent) || 'Select';
      wrap.appendChild(a);
      featuresCell.appendChild(wrap);
    }

    cells.push([nameCell, priceCell, featuresCell]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'cards-plans', cells });
  element.replaceWith(block);
}
