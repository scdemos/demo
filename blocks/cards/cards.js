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

/**
 * Decorate regular cards (authored rows with image + body).
 */
function decorateDefault(block) {
  const ul = createTag('ul');

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

    const linkEl = li.querySelector('.cards-card-image a[href]') || li.querySelector('.cards-card-body a[href]');
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

/**
 * Mirror the section's `accent` style onto the block so the accent card
 * treatment can be scoped to `.cards.accent`. Reads the section class (the
 * standard EDS section-metadata path) and falls back to the authored
 * section-metadata table when the section-metadata block is unavailable.
 */
function applyAccentVariant(block) {
  const section = block.closest('.section');
  if (!section) return;
  if (section.classList.contains('accent')) {
    block.classList.add('accent');
    return;
  }
  const meta = section.querySelector('.section-metadata');
  if (!meta) return;
  const isAccent = [...meta.querySelectorAll(':scope > div')].some((row) => {
    const cells = [...row.children];
    return cells.length === 2
      && cells[0].textContent.trim().toLowerCase() === 'style'
      && /\baccent\b/i.test(cells[1].textContent);
  });
  if (isAccent) {
    section.classList.add('accent');
    block.classList.add('accent');
  }
}

/**
 * Turn the decorated `large` cards into a one-at-a-time carousel of big
 * landscape tiles (matches the "realities" section on the source): a scroll-
 * snapping track with the next card peeking, prev/next arrow controls and a
 * "Slide X of N" status. Content-first: the cards are already authored/rendered
 * by decorateDefault; this only adds the carousel chrome and behavior.
 */
function decorateLargeCarousel(block) {
  const track = block.querySelector(':scope > ul');
  if (!track) return;
  const slides = [...track.children];
  if (slides.length < 2) return;

  track.classList.add('cards-track');

  const viewport = createTag('div', { class: 'cards-carousel-viewport' });
  track.before(viewport);
  viewport.append(track);

  const prev = createTag('button', { type: 'button', class: 'cards-carousel-prev', 'aria-label': 'Previous slide' });
  const next = createTag('button', { type: 'button', class: 'cards-carousel-next', 'aria-label': 'Next slide' });
  const controls = createTag('div', { class: 'cards-carousel-controls' }, [prev, next]);
  block.prepend(controls);

  const status = createTag('div', { class: 'cards-carousel-status', 'aria-live': 'polite' });
  block.append(status);

  let index = 0;
  const clamp = (i) => Math.max(0, Math.min(i, slides.length - 1));

  const update = () => {
    prev.disabled = index === 0;
    next.disabled = index === slides.length - 1;
    status.textContent = `Slide ${index + 1} of ${slides.length}`;
  };

  const goTo = (i) => {
    index = clamp(i);
    slides[index].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    update();
  };

  prev.addEventListener('click', () => goTo(index - 1));
  next.addEventListener('click', () => goTo(index + 1));

  // Keep the index/status in sync when the user scrolls/swipes the track.
  let scrollTimer;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const nearest = slides.reduce((best, slide, i) => {
        const dist = Math.abs(slide.offsetLeft - track.scrollLeft);
        return dist < best.dist ? { i, dist } : best;
      }, { i: 0, dist: Infinity });
      index = nearest.i;
      update();
    }, 100);
  }, { passive: true });

  update();
}

/**
 * icon-lg variant: reorder each card to heading → image → details, matching
 * the use-case cards on the source. The default decoration renders an image
 * cell followed by a body cell (heading + paragraph); this lifts the heading
 * above the image so the order reads title, graphic, then description.
 */
function decorateIconLg(block) {
  block.querySelectorAll(':scope > ul > li > article').forEach((article) => {
    const imageCell = [...article.children].find((el) => el.querySelector('img, picture'));
    const heading = article.querySelector('h2, h3, h4, h5, h6');
    if (imageCell && heading) article.insertBefore(heading, imageCell);
  });
}

export default async function decorate(block) {
  if (block.classList.contains('links')) {
    await decorateLinks(block);
  } else if (block.classList.contains('bento')) {
    decorateBento(block);
  } else {
    decorateDefault(block);
    applyAccentVariant(block);
    if (block.classList.contains('large')) decorateLargeCarousel(block);
    if (block.classList.contains('icon-lg')) decorateIconLg(block);
  }
}
