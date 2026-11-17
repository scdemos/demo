import { createTag } from '../../scripts/shared.js';

/**
 * Quote: testimonial / pull quote.
 * Cells: quote text · attribution (**Name** + role, or name line then role line) · optional picture.
 * @param {Element} block
 */
export default function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  let picture;
  const textCells = [];
  cells.forEach((cell) => {
    const pic = cell.querySelector('picture');
    if (pic && !cell.textContent.trim()) picture = pic;
    else if (cell.textContent.trim()) textCells.push(cell);
  });

  const [quoteCell, attrCell] = textCells;
  const figure = createTag('figure');
  const blockquote = createTag('blockquote');
  if (quoteCell) {
    const paras = quoteCell.querySelectorAll('p');
    if (paras.length) paras.forEach((p) => blockquote.append(p));
    else blockquote.append(createTag('p', {}, quoteCell.textContent.trim()));
  }
  figure.append(blockquote);

  if (attrCell) {
    const caption = createTag('figcaption');
    let name = attrCell.querySelector('strong')?.textContent.trim();
    let role;
    if (name) {
      role = attrCell.textContent.replace(name, '').trim().replace(/^[,·–—-]\s*/, '');
    } else {
      const lines = [...attrCell.querySelectorAll('p')].map((p) => p.textContent.trim());
      const [first, ...rest] = lines.length ? lines : [attrCell.textContent.trim()];
      name = first;
      role = rest.join(' · ');
    }
    if (picture) {
      caption.append(createTag('span', { class: 'quote-avatar' }, picture));
    } else if (name) {
      const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      caption.append(createTag('span', { class: 'quote-monogram', 'aria-hidden': 'true' }, initials));
    }
    const who = createTag('span', { class: 'quote-who' });
    who.append(createTag('strong', {}, name));
    if (role) who.append(createTag('span', {}, role));
    caption.append(who);
    figure.append(caption);
  }

  block.replaceChildren(figure);
}
