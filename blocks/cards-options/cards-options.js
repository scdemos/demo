import { createOptimizedPicture } from '../../scripts/aem.js';
import { createTag, isUE } from '../../scripts/shared.js';

/**
 * Cards Options – icon-forward option chooser.
 * Each authored row becomes an option item with an optional icon/graphic,
 * heading and optional description. Author may include a link to make the
 * whole item clickable.
 */
export default function decorate(block) {
  const ul = createTag('ul');

  [...block.children].forEach((row) => {
    const li = createTag('li');
    while (row.firstElementChild) li.append(row.firstElementChild);

    const content = li.firstElementChild;
    if (content?.children?.length > 1) {
      const imageEl = [...content.children].find((el) => el.querySelector('picture'));
      if (imageEl) {
        const picture = imageEl.querySelector('picture');
        const imageDiv = createTag('div', { class: 'cards-options-card-image' });
        if (picture) imageDiv.append(picture);
        const bodyDiv = createTag('div', { class: 'cards-options-card-body' });
        [...content.children].forEach((el) => { if (el !== imageEl) bodyDiv.append(el); });
        li.replaceChildren(imageDiv, bodyDiv);
      } else {
        content.className = 'cards-options-card-body';
      }
    } else {
      [...li.children].forEach((div) => {
        div.className = (div.children.length === 1 && div.querySelector('picture'))
          ? 'cards-options-card-image' : 'cards-options-card-body';
      });
    }

    const linkEl = li.querySelector('.cards-options-card-image a[href]') || li.querySelector('.cards-options-card-body a[href]');
    if (linkEl) {
      if (isUE) {
        const wrapper = createTag('div', { class: 'cards-options-card-link' });
        while (li.firstChild) wrapper.append(li.firstChild);
        li.append(wrapper);
        const parent = linkEl.parentElement;
        if (parent) parent.classList.remove('button-container');
        linkEl.classList.remove('button');
      } else {
        const wrapper = createTag('a', {
          href: linkEl.getAttribute('href'),
          title: linkEl.getAttribute('title')?.trim() || undefined,
          class: 'cards-options-card-link',
        });
        while (li.firstChild) wrapper.append(li.firstChild);
        li.append(wrapper);
        linkEl.replaceWith(...linkEl.childNodes);
        li.querySelectorAll('.cards-options-card-body a[href]').forEach((a) => a.replaceWith(...a.childNodes));
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
      picture.replaceWith(createOptimizedPicture(img.src, img.alt || '', false, [{ width: '400' }]));
    }
  });

  block.replaceChildren(ul);
}
