import { createTag } from '../../scripts/shared.js';

/**
 * Cards Bento – bento-grid value-add card layout.
 * Each authored row becomes a card. The first <p> in each card is treated
 * as a tag/label, and the first card is marked as the featured (primary) card.
 */
export default function decorate(block) {
  const ul = createTag('ul');

  [...block.children].forEach((row, idx) => {
    const li = createTag('li');
    if (idx === 0) li.classList.add('cards-bento-card-featured');
    while (row.firstElementChild) li.append(row.firstElementChild);

    // Unwrap the single wrapper div if present
    const wrapper = li.firstElementChild;
    if (wrapper && wrapper.tagName === 'DIV' && li.children.length === 1) {
      while (wrapper.firstChild) li.append(wrapper.firstChild);
      wrapper.remove();
    }

    // Separate image into its own wrapper
    const picture = li.querySelector('picture');
    if (picture) {
      const imageDiv = createTag('div', { class: 'cards-bento-card-image' });
      const pictureParent = picture.parentElement;
      imageDiv.append(picture);
      li.prepend(imageDiv);
      if (pictureParent && pictureParent.tagName === 'A' && !pictureParent.children.length) {
        pictureParent.remove();
      }
    } else {
      li.classList.add('cards-bento-card-text-only');
    }

    // Find and mark the tag/label
    const firstP = li.querySelector('p');
    if (firstP && !firstP.querySelector('picture') && !firstP.classList.contains('button-container')) {
      firstP.classList.add('cards-bento-card-tag');
    }

    // Wrap remaining non-image content in a body div
    const body = createTag('div', { class: 'cards-bento-card-body' });
    [...li.children].forEach((child) => {
      if (!child.classList.contains('cards-bento-card-image')) body.append(child);
    });
    li.append(body);

    ul.append(li);
  });

  block.replaceChildren(ul);
}
