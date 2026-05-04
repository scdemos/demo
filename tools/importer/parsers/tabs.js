/**
 * Parser: tabs
 * Extracts carousel/tab content with slide items.
 */
export default function parse(element, { document }) {
  const cells = [];

  // Get carousel items
  const items = element.querySelectorAll('.carousel-item');

  items.forEach((item) => {
    const row = document.createElement('div');

    // Get heading/title
    const heading = item.querySelector('h3, h2, .cmp-teaser__title, .cmp-title__text');
    if (heading) {
      const h = document.createElement('h3');
      h.textContent = heading.textContent.trim();
      row.appendChild(h);
    }

    // Get description
    const desc = item.querySelector('.cmp-teaser__description, .cmp-text, p');
    if (desc) {
      const p = document.createElement('p');
      p.textContent = desc.textContent.trim();
      row.appendChild(p);
    }

    // Get image
    const img = item.querySelector('img');
    if (img) {
      const imgEl = document.createElement('img');
      imgEl.src = img.src || img.getAttribute('src') || '';
      imgEl.alt = img.alt || '';
      row.appendChild(imgEl);
    }

    // Get link
    const link = item.querySelector('a');
    if (link) {
      const a = document.createElement('a');
      a.href = link.href || link.getAttribute('href') || '';
      a.textContent = link.textContent.trim() || 'Learn More';
      row.appendChild(a);
    }

    if (row.children.length > 0) {
      cells.push([row]);
    }
  });

  return cells;
}
