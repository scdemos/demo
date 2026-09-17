/*
 * Explore resources — a two-part layout: an intro column (heading, description,
 * "Learn more" link) beside a row of resource cards (category eyebrow, title
 * link, date). Fully authorable:
 *   Row 1  → intro: heading + description + optional "Learn more" link
 *   Row 2+ → one card each, three cells: category | title (link) | date
 * Source: publicissapient.com/industries/financial-services
 */

export default function decorate(block) {
  let rows = [...block.children];

  // Optional first row: a lone image → the section's full-bleed background.
  const first = rows[0];
  const firstImg = first?.querySelector('img');
  if (firstImg && !first.textContent.trim()) {
    first.classList.add('explore-resources-bg');
    const cell = first.firstElementChild;
    if (cell) {
      while (cell.firstChild) first.append(cell.firstChild);
      cell.remove();
    }
    block.classList.add('has-bg');
    rows = rows.slice(1);
  }

  const [introRow, ...cardRows] = rows;

  // ----- Intro column -----
  if (introRow) {
    introRow.classList.add('explore-resources-intro');
    const cell = introRow.firstElementChild;
    if (cell) {
      while (cell.firstChild) introRow.append(cell.firstChild);
      cell.remove();
    }
    // Render the last link as the arrow "Learn more" CTA (strip EDS button).
    const link = introRow.querySelector('a');
    if (link) {
      link.classList.remove('button');
      link.classList.add('explore-resources-cta');
      link.closest('.button-container')?.classList.remove('button-container');
    }
  }

  // ----- Cards -----
  const list = document.createElement('ul');
  list.className = 'explore-resources-cards';

  cardRows.forEach((row) => {
    const cells = [...row.children];
    const [categoryCell, titleCell, dateCell] = cells;
    const link = titleCell?.querySelector('a');

    const li = document.createElement('li');
    const card = document.createElement(link ? 'a' : 'div');
    card.className = 'explore-resources-card';
    if (link) card.href = link.getAttribute('href');

    if (categoryCell) {
      const cat = document.createElement('p');
      cat.className = 'explore-resources-category';
      cat.textContent = categoryCell.textContent.trim();
      card.append(cat);
    }

    if (titleCell) {
      const title = document.createElement('h3');
      title.className = 'explore-resources-title';
      title.textContent = titleCell.textContent.trim();
      card.append(title);
    }

    if (dateCell && dateCell.textContent.trim()) {
      const date = document.createElement('p');
      date.className = 'explore-resources-date';
      date.textContent = dateCell.textContent.trim();
      card.append(date);
    }

    li.append(card);
    list.append(li);
    row.remove();
  });

  if (list.children.length) block.append(list);
}
