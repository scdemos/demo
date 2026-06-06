const CARD_COLORS = ['red', 'blue', 'purple', 'teal'];

export default function decorate(block) {
  const rows = [...block.children];
  const ROWS_PER_CARD = 4;
  const ul = document.createElement('ul');

  for (let i = 0; i < rows.length; i += ROWS_PER_CARD) {
    // rows[i] is the icon placeholder row (skipped)
    const titleRow = rows[i + 1];
    const descRow = rows[i + 2];
    const linkRow = rows[i + 3];

    if (!titleRow || !descRow || !linkRow) break;

    const li = document.createElement('li');
    const cardIndex = Math.floor(i / ROWS_PER_CARD);
    li.classList.add('cards-trust-card', CARD_COLORS[cardIndex] || 'red');

    // Header area with title
    const header = document.createElement('div');
    header.className = 'cards-trust-header';
    const titleText = titleRow.textContent.trim();
    const titleEl = document.createElement('div');
    titleEl.className = 'cards-trust-title';
    titleEl.textContent = titleText;
    header.append(titleEl);

    // Description
    const body = document.createElement('div');
    body.className = 'cards-trust-body';
    const descText = descRow.textContent.trim();
    const descEl = document.createElement('p');
    descEl.textContent = descText;
    body.append(descEl);

    // Link
    const footer = document.createElement('div');
    footer.className = 'cards-trust-footer';
    const linkEl = linkRow.querySelector('a');
    if (linkEl) {
      const a = document.createElement('a');
      a.href = linkEl.href;
      a.textContent = linkEl.textContent.trim();
      footer.append(a);
    }

    li.append(header, body, footer);
    ul.append(li);
  }

  block.textContent = '';
  block.append(ul);
}
