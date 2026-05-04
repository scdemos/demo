/**
 * Parser: columns
 * Extracts multi-column card content (e.g., company size segments).
 */
export default function parse(element, { document }) {
  const cells = [];

  // Get each column from the 1by3 layout
  const columnDivs = element.querySelectorAll(':scope > .parsys, :scope > .cmp-columns__column');

  columnDivs.forEach((col) => {
    const colDiv = document.createElement('div');

    // Get image
    const img = col.querySelector('img');
    if (img) {
      const imgEl = document.createElement('img');
      imgEl.src = img.src || img.getAttribute('src') || '';
      imgEl.alt = img.alt || '';
      colDiv.appendChild(imgEl);
    }

    // Get heading (h3 or h4)
    const heading = col.querySelector('h3, h4');
    if (heading) {
      const h = document.createElement('h4');
      h.textContent = heading.textContent.trim();
      colDiv.appendChild(h);
    }

    // Get description text
    const texts = col.querySelectorAll('.cmp-text p, p');
    texts.forEach((t) => {
      const text = t.textContent.trim();
      if (text && !t.closest('h3, h4')) {
        const p = document.createElement('p');
        p.textContent = text;
        colDiv.appendChild(p);
      }
    });

    // Get CTA link
    const link = col.querySelector('a.cmp-button, a[class*="button"]');
    if (link) {
      const a = document.createElement('a');
      a.href = link.href || link.getAttribute('href') || '';
      a.textContent = link.textContent.trim() || 'Learn More';
      colDiv.appendChild(a);
    }

    if (colDiv.children.length > 0) {
      cells.push([colDiv]);
    }
  });

  return cells;
}
