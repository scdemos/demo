import { createTag } from '../../scripts/shared.js';

/**
 * Peek: a slim tab fixed to the right edge of the page that links somewhere.
 * Content: one link; its text is the tab label.
 * @param {Element} block
 */
export default function decorate(block) {
  const source = block.querySelector('a');
  if (!source) {
    block.remove();
    return;
  }
  const link = createTag('a', { class: 'peek-link', href: source.getAttribute('href') }, [
    createTag('span', { class: 'peek-mark', 'aria-hidden': 'true' }),
    createTag('span', { class: 'peek-label' }, source.textContent.trim()),
  ]);
  block.replaceChildren(link);
}
