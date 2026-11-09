import { createOptimizedPicture } from '../../scripts/aem.js';
import {
  createTag,
  fetchQueryIndexAll,
  getAuthoredLinks,
  normalizePath,
  resolveArticlesFromIndex,
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
 * Decorate "cards tiers" variant: one row per plan with an optional badge line
 * above the heading (marks the featured plan), a bold price, text, list and button.
 */
function decorateTiers(block) {
  const ul = createTag('ul');

  [...block.children].forEach((row) => {
    const body = row.firstElementChild || row;
    body.className = 'cards-card-body';
    const li = createTag('li', {}, createTag('article', {}, body));

    const heading = body.querySelector('h2, h3, h4');
    const badge = heading?.previousElementSibling;
    if (badge?.tagName === 'P' && !badge.querySelector('a')) {
      badge.classList.add('cards-card-badge');
      li.classList.add('cards-card-featured', 'surface-ink');
    }
    const price = heading?.nextElementSibling;
    if (price?.tagName === 'P' && price.firstElementChild?.tagName === 'STRONG') {
      price.classList.add('cards-card-price');
    }

    ul.append(li);
  });

  block.replaceChildren(ul);
}

const isSvg = (src) => /\.svg(\?|$)/i.test(new URL(src, window.location.href).pathname);

/**
 * Enhance a decorated default card: plain links with one stretched primary link,
 * eyebrow line before the heading, and icon badge (rendered as a CSS mask).
 */
function enhanceCard(li) {
  const body = li.querySelector('.cards-card-body');
  if (!body) return;

  body.querySelectorAll('.button-container').forEach((p) => p.classList.remove('button-container'));
  body.querySelectorAll('a.button').forEach((a) => a.classList.remove('button', 'primary', 'secondary'));
  const primary = body.querySelector(':is(h2, h3, h4) a[href]') || li.querySelector('a[href]');
  if (primary) {
    primary.classList.add('cards-card-primary');
    li.classList.add('cards-card-linked');
  }

  const icon = body.querySelector('.icon');
  if (icon) {
    const holder = icon.closest('p') || icon;
    const badge = createTag('span', { class: 'cards-card-icon', 'aria-hidden': 'true' });
    const img = icon.querySelector('img');
    if (img) badge.style.setProperty('--icon', `url("${img.getAttribute('src')}")`);
    body.prepend(badge);
    if (holder !== icon && !holder.textContent.trim()) holder.remove();
    else icon.remove();
  }

  const heading = body.querySelector('h2, h3, h4');
  const prev = heading?.previousElementSibling;
  if (prev?.tagName === 'P' && !prev.querySelector('a, picture') && prev.textContent.trim().length <= 40) {
    prev.classList.add('cards-card-eyebrow');
  }
}

/**
 * Decorate regular cards (authored rows with image + body).
 * Variants: tiles, stories, features, compact, cover.
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
      const wrapper = createTag('div', { class: 'cards-card-link' });
      while (li.firstChild) wrapper.append(li.firstChild);
      li.append(wrapper);
      const parent = linkEl.parentElement;
      if (parent) {
        parent.classList.remove('button-container');
      }
      linkEl.classList.remove('button');
    }

    enhanceCard(li);
    if (!li.querySelector('.cards-card-image')) li.classList.add('cards-card-text-only');

    const article = createTag('article');
    while (li.firstChild) article.append(li.firstChild);
    li.append(article);

    ul.append(li);
  });

  if (block.classList.contains('stories')) ul.firstElementChild?.classList.add('cards-card-lead');

  ul.querySelectorAll('picture > img').forEach((img, idx) => {
    const picture = img.closest('picture');
    if (!picture) return;
    if (isSvg(img.src)) {
      img.loading = 'lazy';
      return;
    }
    const wide = (block.classList.contains('stories') && idx === 0) || block.classList.contains('cover');
    const width = wide ? '1200' : '750';
    picture.replaceWith(createOptimizedPicture(img.src, img.alt || '', false, [{ width }]));
  });

  block.replaceChildren(ul);
}

export default async function decorate(block) {
  if (block.classList.contains('links')) {
    await decorateLinks(block);
  } else if (block.classList.contains('tiers')) {
    decorateTiers(block);
  } else if (block.classList.contains('bento')) {
    decorateBento(block);
  } else {
    decorateDefault(block);
  }
}
