export default function decorate(block) {
  const rows = [...block.children];

  // First row is the heading row
  const headingRow = rows[0];
  if (headingRow) {
    headingRow.classList.add('faq-heading-row');
  }

  // Remaining rows are Q&A pairs
  rows.slice(1).forEach((row) => {
    const [questionCell, answerCell] = row.children;
    if (!questionCell || !answerCell) return;

    row.classList.add('faq-item');

    const heading = questionCell.querySelector('h2,h3,h4,p');
    const questionText = heading ? heading.textContent.trim() : questionCell.textContent.trim();

    const button = document.createElement('button');
    button.className = 'faq-question';
    button.setAttribute('aria-expanded', 'false');
    button.textContent = questionText;

    const answer = document.createElement('div');
    answer.className = 'faq-answer';
    answer.hidden = true;
    answer.append(...answerCell.childNodes);

    questionCell.innerHTML = '';
    questionCell.appendChild(button);
    answerCell.replaceWith(answer);

    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      answer.hidden = expanded;
    });
  });
}
