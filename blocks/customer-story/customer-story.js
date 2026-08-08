import { createOptimizedPicture } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

/*
 * Customer story — "stacking cards" showcase.
 * Each authored row is one story with two cells:
 *   1. Image — the full-bleed background photo
 *   2. Content — eyebrow paragraph, heading, description paragraph(s), an
 *      optional bulleted list of stats (each "<strong>NUMBER</strong> label"),
 *      and an optional "Learn more" link.
 * The card renders the photo as a full-bleed background with the text content
 * overlaid in a panel on the left.
 */

function decorateStats(list) {
  const stats = createTag('div', { class: 'customer-story-stats' });
  [...list.children].forEach((li) => {
    const strong = li.querySelector('strong');
    const stat = createTag('div', { class: 'customer-story-stat' });
    if (strong) {
      stat.append(createTag('span', { class: 'customer-story-stat-num' }, strong.textContent.trim()));
      strong.remove();
    }
    const label = li.textContent.trim();
    if (label) stat.append(createTag('p', { class: 'customer-story-stat-label' }, label));
    stats.append(stat);
  });
  list.replaceWith(stats);
}

export default function decorate(block) {
  [...block.children].forEach((row) => {
    row.classList.add('customer-story-card');
    const [imageCell, contentCell] = row.children;

    // Image cell → full-bleed background layer
    if (imageCell) {
      imageCell.classList.add('customer-story-media');
      const img = imageCell.querySelector('img');
      if (img) {
        img.closest('picture')?.replaceWith(
          createOptimizedPicture(img.src, img.alt || '', false, [{ width: '1200' }]),
        );
      }
    }

    // Content cell → overlaid text panel
    if (contentCell) {
      contentCell.classList.add('customer-story-content');

      // Eyebrow = first paragraph (before the heading)
      const heading = contentCell.querySelector('h1, h2, h3, h4, h5, h6');
      const firstP = contentCell.querySelector('p');
      if (heading && firstP && firstP.compareDocumentPosition(heading)
        & Node.DOCUMENT_POSITION_FOLLOWING) {
        firstP.classList.add('customer-story-eyebrow');
      }

      // Stats list
      const list = contentCell.querySelector('ul, ol');
      if (list) decorateStats(list);

      // "Learn more" link — strip EDS button decoration, render as arrow link
      const link = contentCell.querySelector('a');
      if (link) {
        link.classList.remove('button');
        link.classList.add('customer-story-link');
        link.closest('.button-container')?.classList.remove('button-container');
      }
    }
  });

  // Scroll-driven stacking: as each card scrolls up and pins, shrink it a
  // little so the incoming card sits proudly on top and the stack recedes.
  const cards = [...block.children];
  if (cards.length > 1) {
    const MIN_SCALE = 0.9;
    const update = () => {
      const pinTop = cards[0].getBoundingClientRect().top;
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) {
          card.style.setProperty('--card-scale', '1');
          return;
        }
        // Progress: 0 while the next card is far below, 1 once it has fully
        // covered this pinned card (its top reaches the pin line).
        const gap = next.getBoundingClientRect().top - pinTop;
        const progress = Math.min(Math.max(1 - gap / card.offsetHeight, 0), 1);
        const scale = 1 - (1 - MIN_SCALE) * progress;
        card.style.setProperty('--card-scale', scale.toFixed(4));
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
  }
}
