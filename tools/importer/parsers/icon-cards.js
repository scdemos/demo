/**
 * Parser: icon-cards
 * Extracts icon-teaser cards from carousel containers.
 * Only processes carousels that contain .cmp-iconteaser elements.
 * Returns empty if no icon-teasers found (skips non-matching carousels).
 */
export default function parse(element, { document }) {
  const cells = [];

  const iconTeasers = element.querySelectorAll('.cmp-iconteaser');
  if (iconTeasers.length === 0) return cells;

  iconTeasers.forEach((teaser) => {
    const icon = teaser.querySelector('.cmp-iconteaser__icon img');
    const heading = teaser.querySelector('.cmp-iconteaser__heading-title, h3');
    const description = teaser.querySelector('.cmp-iconteaser__descripton p, .cmp-iconteaser__description p, .cmp-iconteaser__descripton, .cmp-iconteaser__description');
    const link = teaser.querySelector('a');

    const iconCell = document.createElement('div');
    const contentCell = document.createElement('div');

    if (icon) {
      const img = document.createElement('img');
      img.src = icon.src || icon.getAttribute('src') || '';
      img.alt = icon.alt || '';
      iconCell.appendChild(img);
    }

    if (heading) {
      const h3 = document.createElement('h3');
      h3.textContent = heading.textContent.trim();
      contentCell.appendChild(h3);
    }

    if (description) {
      const text = description.textContent.trim();
      if (text) {
        const p = document.createElement('p');
        p.textContent = text;
        contentCell.appendChild(p);
      }
    }

    if (link) {
      const a = document.createElement('a');
      a.href = link.href || link.getAttribute('href') || '';
      a.textContent = 'Learn More';
      contentCell.appendChild(a);
    }

    cells.push([iconCell, contentCell]);
  });

  return cells;
}
