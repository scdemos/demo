/* eslint-disable */
/* global WebImporter */
/**
 * Parser for teaser-promo. Base block: teaser.
 * Source: https://www.totalwireless.com/m/home (AEM experiencefragment / cta-banner-with-pictogram)
 * Model (blocks/teaser-promo/_teaser-promo.json): image (reference), imageAlt (collapsed), text (richtext).
 * Single promotional tile: image + heading + supporting text + CTA link.
 * 1 column, 3 rows (name, image, text). Generated for xwalk: field hints per cell.
 */
export default function parse(element, { document }) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const isText = (el) => el
    && !el.querySelector('button, svg, img, input')
    && norm(el.textContent).length > 0;

  const seenText = new Set();

  let heading = [...element.querySelectorAll('h1, h2, h3, h4')].find((h) => norm(h.textContent));
  if (heading) seenText.add(norm(heading.textContent));

  const paras = [];
  [...element.querySelectorAll('p')].forEach((p) => {
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

  const ctas = [];
  const seenCta = new Set();
  element.querySelectorAll('a[href]').forEach((a) => {
    const t = norm(a.textContent);
    const key = `${a.getAttribute('href')}|${t}`;
    if (t && !seenCta.has(key)) {
      seenCta.add(key);
      ctas.push({ href: a.getAttribute('href'), text: t });
    }
  });

  const seenImg = new Set();
  let image = null;
  element.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    const k = src.split('?')[0];
    if (src && !seenImg.has(k)) {
      seenImg.add(k);
      if (!image) image = img;
    }
  });

  if (!heading && !paras.length && !ctas.length && !image) {
    element.replaceWith(...element.childNodes);
    return;
  }

  const cells = [];

  // Content row 1 – image (reference). imageAlt collapses into <img alt>.
  const imageCell = document.createDocumentFragment();
  imageCell.appendChild(document.createComment(' field:image '));
  if (image) imageCell.appendChild(image);
  cells.push([imageCell]);

  // Content row 2 – text (richtext): heading, supporting text and CTA link.
  const textCell = document.createDocumentFragment();
  textCell.appendChild(document.createComment(' field:text '));
  if (heading) textCell.appendChild(heading);
  paras.forEach((t) => {
    const p = document.createElement('p');
    p.textContent = t;
    textCell.appendChild(p);
  });
  ctas.forEach((c) => {
    const wrap = document.createElement('p');
    const a = document.createElement('a');
    a.setAttribute('href', c.href);
    a.textContent = c.text;
    wrap.appendChild(a);
    textCell.appendChild(wrap);
  });
  cells.push([textCell]);

  const block = WebImporter.Blocks.createBlock(document, { name: 'teaser-promo', cells });
  element.replaceWith(block);
}
