/**
 * Parser: cards
 * Extracts product teaser cards from flexgrid containers.
 * Each card has an image, title, description, and link.
 */
export default function parse(element, { document }) {
  const cells = [];

  const teasers = element.querySelectorAll('.cmp-teaser');

  teasers.forEach((teaser) => {
    const image = teaser.querySelector('.cmp-teaser__image img, .cmp-image__image, img');
    const title = teaser.querySelector('.cmp-teaser__title, h3');
    const description = teaser.querySelector('.cmp-teaser__description p, .cmp-teaser__description');
    const link = teaser.querySelector('a.cmp-teaser__action-link, a[href]');

    const imgCell = document.createElement('div');
    const contentCell = document.createElement('div');

    if (image) {
      const img = document.createElement('img');
      img.src = image.src || image.getAttribute('src') || '';
      img.alt = image.alt || '';
      imgCell.appendChild(img);
    }

    if (title) {
      const h3 = document.createElement('h3');
      h3.textContent = title.textContent.trim();
      contentCell.appendChild(h3);
    }

    if (description) {
      const p = document.createElement('p');
      p.textContent = description.textContent.trim();
      contentCell.appendChild(p);
    }

    if (link) {
      const a = document.createElement('a');
      a.href = link.href || link.getAttribute('href') || '';
      const linkText = link.textContent.trim();
      a.textContent = linkText || 'Learn More';
      contentCell.appendChild(a);
    }

    cells.push([imgCell, contentCell]);
  });

  return cells;
}
