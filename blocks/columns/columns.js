import { groupButtons } from '../../scripts/shared.js';

/**
 * Columns: side-by-side content. Variant: media (image + text split with rounded art).
 * @param {Element} block
 */
export default function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-${cols.length}-cols`);

  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column
          picWrapper.classList.add('columns-img-col');
        }
      }
      if (col.classList.contains('columns-img-col')) return;

      const heading = col.querySelector(':scope > :is(h2, h3)');
      const prev = heading?.previousElementSibling;
      if (prev?.tagName === 'P' && !prev.querySelector('a, picture') && prev.textContent.trim().length <= 60) {
        prev.classList.add('eyebrow');
      }

      groupButtons(col);
    });
  });
}
