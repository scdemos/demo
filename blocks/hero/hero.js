import { createTag, groupButtons } from '../../scripts/shared.js';

/**
 * Hero
 * Rows (any order, all optional except content):
 * - picture row: one picture, or two (light + dark artwork)
 * - content row: eyebrow p, h1, lede p, button paragraphs (+ optional note/byline p)
 * - list rows: `<ul>` without links = proof chips; `<ul>` of links = floating highlight cards
 * Variants: (default) page hero · `home` flagship first viewport · `ink` dark
 * @param {Element} block
 */

function iconToMask(scope) {
  scope.querySelectorAll('.icon').forEach((icon) => {
    const img = icon.querySelector('img');
    if (img) icon.style.setProperty('--icon', `url("${img.getAttribute('src')}")`);
  });
}

function decorateContent(content) {
  const heading = content.querySelector(':scope > :is(h1, h2)');
  if (!heading) return;
  heading.classList.add('hero-title');

  const prev = heading.previousElementSibling;
  if (prev?.tagName === 'P' && !prev.classList.contains('button-container')
    && !prev.querySelector('picture') && prev.textContent.trim().length <= 80) {
    prev.classList.add('eyebrow');
  }

  let ledeSet = false;
  let next = heading.nextElementSibling;
  while (next) {
    if (next.tagName === 'P' && !next.classList.contains('button-container')) {
      if (!ledeSet) {
        next.classList.add('lede');
        ledeSet = true;
      } else {
        next.classList.add('hero-note');
      }
    }
    next = next.nextElementSibling;
  }
  groupButtons(content);
}

function buildFloats(ul) {
  ul.className = 'hero-floats';
  [...ul.children].forEach((li) => {
    li.classList.add('hero-float');
    const icon = li.querySelector('.icon');
    if (icon) icon.classList.add('hero-float-badge');
    const link = li.querySelector('a');
    if (link) link.classList.remove('button');
  });
  iconToMask(ul);
  return ul;
}

function buildProof(ul) {
  ul.className = 'hero-proof';
  [...ul.children].forEach((li) => {
    const strong = li.querySelector('strong');
    if (!strong) return;
    const rest = [...li.childNodes].filter((n) => n !== strong);
    const label = createTag('span', { class: 'hero-proof-label' });
    rest.forEach((n) => label.append(n));
    label.textContent = label.textContent.trim();
    li.replaceChildren(strong, label);
  });
  return ul;
}

export default function decorate(block) {
  const rows = [...block.children];
  const contentRow = rows.find((r) => r.querySelector('h1, h2'))
    || rows.find((r) => !r.querySelector('picture'));

  const content = createTag('div', { class: 'hero-content' });
  const media = createTag('div', { class: 'hero-media' });
  const pictures = [];
  const lists = [];

  rows.forEach((row) => {
    [...row.children].forEach((cell) => {
      if (row === contentRow && !(cell.querySelector('picture') && !cell.querySelector('h1, h2'))) {
        [...cell.children].forEach((el) => content.append(el));
        return;
      }
      cell.querySelectorAll('picture').forEach((pic) => pictures.push(pic));
      cell.querySelectorAll(':scope > ul').forEach((ul) => lists.push(ul));
    });
  });

  // pictures inside the content cell (single-row authoring) move to the media column
  content.querySelectorAll('picture').forEach((pic) => {
    const holder = pic.closest('p');
    pictures.push(pic);
    if (holder && !holder.textContent.trim()) holder.remove();
  });

  decorateContent(content);
  const heading = createTag('div', { class: 'hero-heading' });
  const body = createTag('div', { class: 'hero-body' });
  [...content.children].forEach((el) => {
    const isHead = el.classList.contains('eyebrow') || el.classList.contains('hero-title');
    (isHead && !body.children.length ? heading : body).append(el);
  });
  content.append(heading);
  if (body.children.length) content.append(body);

  if (pictures.length >= 2) {
    const [light, dark] = pictures;
    const lightWrap = createTag('div', { class: 'hero-art hero-img-light' }, light);
    const darkWrap = createTag('div', { class: 'hero-art hero-img-dark' }, dark);
    const isDark = document.documentElement.dataset.theme === 'dark'
      || document.body.classList.contains('dark-scheme');
    media.append(...(isDark ? [darkWrap, lightWrap] : [lightWrap, darkWrap]));
  } else if (pictures.length === 1) {
    media.append(createTag('div', { class: 'hero-art' }, pictures[0]));
  }

  const firstImg = media.querySelector('img');
  if (firstImg) {
    firstImg.loading = 'eager';
    firstImg.fetchPriority = 'high';
    firstImg.decoding = 'async';
  }

  lists.forEach((ul) => {
    if (ul.querySelector('a')) {
      media.append(buildFloats(ul));
    } else {
      body.append(buildProof(ul));
      if (!body.parentElement) content.append(body);
    }
  });

  const inner = createTag('div', { class: 'hero-inner' }, content);
  if (media.children.length) {
    inner.append(media);
  } else {
    block.classList.add('no-image');
  }

  if (block.classList.contains('ink')) block.classList.add('surface-ink');
  block.replaceChildren(inner);
}
