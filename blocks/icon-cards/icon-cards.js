export default function decorate(block) {
  const rows = [...block.children];
  const cards = [];

  rows.forEach((row) => {
    const cells = [...row.children];
    const iconCell = cells[0];
    const contentCell = cells[1] || cells[0];
    cards.push({ iconCell, contentCell });
  });

  // Build carousel structure
  const track = document.createElement('div');
  track.className = 'icon-cards-track';

  cards.forEach((card) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'icon-card';

    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'icon-card-icon';
    const img = card.iconCell.querySelector('img');
    if (img) {
      iconWrapper.appendChild(img);
    } else {
      iconWrapper.innerHTML = '<span class="icon-card-icon-placeholder"></span>';
    }

    const content = document.createElement('div');
    content.className = 'icon-card-content';
    const heading = card.contentCell.querySelector('h3');
    const desc = card.contentCell.querySelector('p:not(:has(a))');
    const link = card.contentCell.querySelector('a');

    if (heading) content.appendChild(heading);
    if (desc) content.appendChild(desc);
    if (link) {
      const linkWrapper = document.createElement('p');
      linkWrapper.className = 'icon-card-link';
      linkWrapper.appendChild(link);
      content.appendChild(linkWrapper);
    }

    cardEl.appendChild(iconWrapper);
    cardEl.appendChild(content);
    track.appendChild(cardEl);
  });

  // Navigation dots
  const nav = document.createElement('div');
  nav.className = 'icon-cards-nav';
  const totalPages = Math.ceil(cards.length / 3);
  for (let i = 0; i < totalPages; i += 1) {
    const dot = document.createElement('button');
    dot.className = `icon-cards-dot${i === 0 ? ' active' : ''}`;
    dot.setAttribute('aria-label', `Page ${i + 1}`);
    dot.addEventListener('click', () => {
      track.style.transform = `translateX(-${i * 100}%)`;
      nav.querySelectorAll('.icon-cards-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
    });
    nav.appendChild(dot);
  }

  block.textContent = '';
  block.appendChild(track);
  if (totalPages > 1) block.appendChild(nav);
}
