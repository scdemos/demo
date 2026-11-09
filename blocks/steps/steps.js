import { createTag } from '../../scripts/shared.js';

/**
 * Steps: numbered sequence.
 * Rows: title cell + description cell (or one cell with heading + text).
 * Variant: horizontal.
 * @param {Element} block
 */
export default function decorate(block) {
  const ol = createTag('ol', { class: 'steps-list' });
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const li = createTag('li');
    if (cells.length > 1) {
      const [titleCell, ...rest] = cells;
      const heading = titleCell.querySelector('h2, h3, h4') || createTag('h3', {}, titleCell.textContent.trim());
      li.append(heading);
      rest.forEach((cell) => {
        if (cell.children.length) [...cell.children].forEach((el) => li.append(el));
        else if (cell.textContent.trim()) li.append(createTag('p', {}, cell.textContent.trim()));
      });
    } else if (cells[0]) {
      [...cells[0].children].forEach((el) => li.append(el));
    }
    if (li.textContent.trim()) ol.append(li);
  });
  ol.style.setProperty('--steps', Math.min(ol.children.length, 4));
  block.replaceChildren(ol);
}
