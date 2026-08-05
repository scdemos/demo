import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  createTag,
  fetchQueryIndexAll,
  getAuthoredLinks,
  normalizePath,
  resolveArticlesFromIndex,
  isUE,
} from '../../scripts/shared.js';

function buildLinksCard(article) {
  const href = normalizePath(article.path);
  const li = createTag('li');
  const link = createTag('a', { href, class: 'cards-card-link' });

  if (article.image) {
    const imageDiv = createTag('div', { class: 'cards-card-image' });
    imageDiv.append(createOptimizedPicture(article.image, article.title || '', false, [{ width: '750' }]));
    link.append(imageDiv);
  }

  const body = createTag('div', { class: 'cards-card-body' });
  body.append(createTag('p', {}, createTag('strong', {}, article.title || href)));
  if (article.description) {
    body.append(createTag('p', {}, article.description));
  }
  link.append(body);
  li.append(link);

  return li;
}

/**
 * Decorate "cards links" variant: fetch index, match paths, render cards.
 */
async function decorateLinks(block) {
  const authoredLinks = getAuthoredLinks(block);
  if (!authoredLinks.length) {
    block.textContent = '';
    block.append(createTag('p', { class: 'cards-links-empty' }, 'No links provided.'));
    return;
  }

  let indexRows = [];
  try {
    indexRows = await fetchQueryIndexAll();
  } catch {
    indexRows = [];
  }

  const articles = resolveArticlesFromIndex(authoredLinks, indexRows);

  const ul = createTag('ul');
  articles.forEach((article) => ul.append(buildLinksCard(article)));
  block.replaceChildren(ul);
}

/**
 * Decorate bento-grid cards variant.
 * Each authored row becomes a card. The first <p> in each card is treated
 * as a tag/label (e.g. "// Knowledge Base v1.0"), and the first card is
 * marked as the featured (primary) card.
 */
function decorateBento(block) {
  const ul = createTag('ul');

  [...block.children].forEach((row, idx) => {
    const li = createTag('li');
    if (idx === 0) li.classList.add('cards-card-featured');
    while (row.firstElementChild) li.append(row.firstElementChild);

    // Unwrap the single wrapper div if present
    const wrapper = li.firstElementChild;
    if (wrapper && wrapper.tagName === 'DIV' && li.children.length === 1) {
      while (wrapper.firstChild) li.append(wrapper.firstChild);
      wrapper.remove();
    }

    // Separate image into its own wrapper (consistent with default cards)
    const picture = li.querySelector('picture');
    if (picture) {
      const imageDiv = createTag('div', { class: 'cards-card-image' });
      const pictureParent = picture.parentElement;
      imageDiv.append(picture);
      li.prepend(imageDiv);
      if (pictureParent && pictureParent.tagName === 'A' && !pictureParent.children.length) {
        pictureParent.remove();
      }
    } else {
      li.classList.add('cards-card-text-only');
    }

    // Find and mark the tag/label (first <p> that looks like a category tag)
    const firstP = li.querySelector('p');
    if (firstP && !firstP.querySelector('picture') && !firstP.classList.contains('button-container')) {
      firstP.classList.add('cards-card-tag');
    }

    // Wrap remaining non-image content in a body div
    const body = createTag('div', { class: 'cards-card-body' });
    [...li.children].forEach((child) => {
      if (!child.classList.contains('cards-card-image')) body.append(child);
    });
    li.append(body);

    ul.append(li);
  });

  block.replaceChildren(ul);
}

/* Category → inline SVG icon for the overlay-carousel pills. Keyed by a
   normalized (lowercased) category label so authors can edit the label text
   in the document and still get the right glyph. */
const OVERLAY_ICONS = {
  'sleep and rest': '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>',
  'wellness and longevity': '<path d="M12 21c0-4-3-7-7-8 4-1 7-4 7-8 0 4 3 7 7 8-4 1-7 4-7 8z"/>',
  'activity and fitness': '<path d="M12 2c2 3 4 5 4 8a4 4 0 01-8 0c0-1 .5-2 1-3-.5 2 1 3 2 3 1 0 2-1 2-2 0-3-1-4-1-6z"/>',
  'heart health': '<path d="M12 20s-7-4.6-7-9.5A3.5 3.5 0 0112 7a3.5 3.5 0 017 3.5C19 15.4 12 20 12 20z"/>',
  "women's health": '<path d="M12 3a5 5 0 100 10 5 5 0 000-10zm0 10v8m-3-3h6"/>',
  stress: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18zm-4 8h8m-8 4h5"/>',
};

function overlayIcon(label) {
  const key = (label || '').trim().toLowerCase();
  const path = OVERLAY_ICONS[key] || OVERLAY_ICONS['heart health'];
  const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" `
    + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const span = createTag('span', { class: 'cards-card-pill-icon' });
  span.innerHTML = svg;
  return span;
}

/**
 * Decorate the overlay-carousel variant (Oura "Membership" cards):
 * a single-row horizontal carousel of portrait image cards, each with a
 * category pill (icon + label) top-left, a circular "+" button top-right,
 * a bottom gradient scrim, and a serif headline (trailing <em> italicised).
 * Prev/next controls under a divider advance the row.
 *
 * Authored structure per row: [ image cell ][ body cell: <p>category</p> <h3>headline</h3> ]
 */
function decorateOverlay(block) {
  const ul = createTag('ul');

  [...block.children].forEach((row) => {
    const li = createTag('li');
    const cells = [...row.children];
    const imageCell = cells.find((c) => c.querySelector('picture, img')) || cells[0];
    const bodyCell = cells.find((c) => c !== imageCell);

    // Image fills the card
    const imageDiv = createTag('div', { class: 'cards-card-image' });
    const picture = imageCell?.querySelector('picture');
    if (picture) imageDiv.append(picture);
    else if (imageCell?.querySelector('img')) imageDiv.append(imageCell.querySelector('img'));
    li.append(imageDiv);

    // Body: first <p> = category label, <h3>/<h2> = headline
    const body = createTag('div', { class: 'cards-card-body' });
    const label = bodyCell?.querySelector('p');
    const heading = bodyCell?.querySelector('h2, h3, h4');

    if (label) {
      const pill = createTag('span', { class: 'cards-card-pill' });
      pill.append(overlayIcon(label.textContent), createTag('span', {}, label.textContent.trim()));
      li.append(pill);
    }

    // Circular "+" affordance (decorative)
    const plus = createTag('span', { class: 'cards-card-plus', 'aria-hidden': 'true' }, '+');
    li.append(plus);

    if (heading) body.append(heading);
    li.append(body);

    const article = createTag('article');
    while (li.firstChild) article.append(li.firstChild);
    li.append(article);
    ul.append(li);
  });

  ul.querySelectorAll('picture > img').forEach((img) => {
    const p = img.closest('picture');
    if (p) p.replaceWith(createOptimizedPicture(img.src, img.alt || '', false, [{ width: '750' }]));
  });

  // Carousel scaffold: viewport wraps the scrollable row; footer holds divider + controls.
  const viewport = createTag('div', { class: 'cards-carousel-viewport' });
  viewport.append(ul);

  const prev = createTag('button', {
    type: 'button', class: 'cards-carousel-btn cards-carousel-prev', 'aria-label': 'Previous',
  });
  prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
  const next = createTag('button', {
    type: 'button', class: 'cards-carousel-btn cards-carousel-next', 'aria-label': 'Next',
  });
  next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

  const controls = createTag('div', { class: 'cards-carousel-controls' });
  controls.append(prev, next);
  const footer = createTag('div', { class: 'cards-carousel-footer' });
  footer.append(controls);

  const scrollByCard = (dir) => {
    const first = ul.querySelector('li');
    const step = first ? first.getBoundingClientRect().width + 16 : viewport.clientWidth * 0.8;
    viewport.scrollBy({ left: dir * step, behavior: 'smooth' });
  };
  prev.addEventListener('click', () => scrollByCard(-1));
  next.addEventListener('click', () => scrollByCard(1));

  const syncControls = () => {
    const max = viewport.scrollWidth - viewport.clientWidth - 1;
    prev.disabled = viewport.scrollLeft <= 0;
    next.disabled = viewport.scrollLeft >= max;
  };
  viewport.addEventListener('scroll', syncControls, { passive: true });
  window.addEventListener('resize', syncControls);

  block.replaceChildren(viewport, footer);
  // Defer initial sync until layout/images settle so scrollWidth is accurate.
  requestAnimationFrame(syncControls);
  viewport.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', syncControls, { once: true });
  });
}

/**
 * Normalize a product-card body so its styling works for both local and DA
 * markup. DA can wrap each authored line in its own <div> and skip the
 * `.button`/`.button-container` classes (its nesting defeats aem.js's
 * single-child button check). This flattens wrapper divs so the CSS's
 * direct-child selectors (`> p:first-child` for "On Sale", price, etc.) match,
 * and explicitly tags each CTA paragraph/link so the pill styling applies.
 * @param {Element} body the `.cards-card-body` overlay cell
 */
function normalizeProductBody(body) {
  if (!body) return;

  // Flatten a single wrapping <div> (or DA per-line divs) so paragraphs and the
  // heading become direct children of the body cell.
  [...body.children].forEach((child) => {
    if (child.tagName === 'DIV') {
      child.replaceWith(...child.childNodes);
    }
  });

  // Tag CTA paragraphs: any <p> whose content is a single link (no image).
  [...body.querySelectorAll(':scope > p')].forEach((p) => {
    const link = p.querySelector(':scope > a');
    if (link && !p.querySelector('img') && p.textContent.trim() === link.textContent.trim()) {
      p.classList.add('button-container');
      if (!link.classList.contains('button')) link.classList.add('button');
    }
  });
}

/**
 * Decorate regular cards (authored rows with image + body).
 */
function decorateDefault(block) {
  const ul = createTag('ul');
  const isProduct = block.classList.contains('product');

  [...block.children].forEach((row) => {
    const li = createTag('li');
    while (row.firstElementChild) li.append(row.firstElementChild);

    const content = li.firstElementChild;
    if (content?.children?.length > 1) {
      const imageEl = [...content.children].find((el) => el.querySelector('picture'));
      if (imageEl) {
        const picture = imageEl.querySelector('picture');
        const imageDiv = createTag('div', { class: 'cards-card-image' });
        if (picture) imageDiv.append(picture);
        const bodyDiv = createTag('div', { class: 'cards-card-body' });
        [...content.children].forEach((el) => { if (el !== imageEl) bodyDiv.append(el); });
        li.replaceChildren(imageDiv, bodyDiv);
      } else {
        content.className = 'cards-card-body';
      }
    } else {
      [...li.children].forEach((div) => {
        div.className = (div.children.length === 1 && div.querySelector('picture'))
          ? 'cards-card-image' : 'cards-card-body';
      });
    }

    // Product cards: normalize the overlay body so DA's nested markup styles
    // the same as local (flatten wrapper divs, tag "On Sale" + CTA pills).
    if (isProduct) normalizeProductBody(li.querySelector('.cards-card-body:last-child, .cards-card-body'));

    // Cards with multiple CTAs (e.g. product cards with Shop + Explore) keep
    // their individual links/buttons instead of collapsing into one card link.
    const hasMultipleCtas = isProduct
      || li.querySelectorAll('.cards-card-body a[href]').length > 1;
    const linkEl = !hasMultipleCtas
      && (li.querySelector('.cards-card-image a[href]') || li.querySelector('.cards-card-body a[href]'));
    if (linkEl) {
      if (isUE) {
        // In UE: use a <div> wrapper so the authored <a> (with its href) is preserved
        const wrapper = createTag('div', { class: 'cards-card-link' });
        while (li.firstChild) wrapper.append(li.firstChild);
        li.append(wrapper);
        //Remove the button class from the link and button-container class from the parent
        const parent = linkEl.parentElement;
        if (parent) {
          parent.classList.remove('button-container');
        }
        linkEl.classList.remove('button');
       } else {
        const wrapper = createTag('a', {
          href: linkEl.getAttribute('href'),
          title: linkEl.getAttribute('title')?.trim() || undefined,
          class: 'cards-card-link',
        });
        while (li.firstChild) wrapper.append(li.firstChild);
        li.append(wrapper);
        linkEl.replaceWith(...linkEl.childNodes);
        li.querySelectorAll('.cards-card-body a[href]').forEach((a) => a.replaceWith(...a.childNodes));
      }
    }

    const article = createTag('article');
    while (li.firstChild) article.append(li.firstChild);
    li.append(article);

    ul.append(li);
  });

  ul.querySelectorAll('picture > img').forEach((img) => {
    const picture = img.closest('picture');
    if (picture) {
      picture.replaceWith(createOptimizedPicture(img.src, img.alt || '', false, [{ width: '750' }]));
    }
  });

  block.replaceChildren(ul);
}

export default async function decorate(block) {
  if (block.classList.contains('links')) {
    await decorateLinks(block);
  } else if (block.classList.contains('bento')) {
    decorateBento(block);
  } else if (block.classList.contains('overlay')) {
    decorateOverlay(block);
  } else {
    decorateDefault(block);
  }
}
