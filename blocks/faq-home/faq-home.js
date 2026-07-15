import { createTag } from '../../scripts/shared.js';
import { extendSchema } from '../../scripts/schema.js';

function toggleItem(button) {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  const panel = button.nextElementSibling;
  panel.hidden = expanded;
}

/**
 * FAQ Home – inline authored question/answer accordion.
 * Each authored row has two cells: question and answer. Unlike the index-driven
 * faq block, this variant renders content authored directly on the page.
 */
export default function decorate(block) {
  const faqs = [];
  const rows = [...block.children];
  block.textContent = '';

  rows.forEach((row) => {
    const cells = [...row.children];
    const question = (cells[0]?.textContent || '').trim();
    const answerCell = cells[1];
    if (!question || !answerCell) return;

    const item = createTag('div', { class: 'faq-home-item' });
    const button = createTag('button', {
      class: 'faq-home-question',
      'aria-expanded': 'false',
      type: 'button',
    }, question);

    const panel = createTag('div', {
      class: 'faq-home-answer',
      role: 'region',
      hidden: true,
    });
    while (answerCell.firstChild) panel.append(answerCell.firstChild);

    button.addEventListener('click', () => toggleItem(button));
    item.append(button, panel);
    block.append(item);

    faqs.push({ question, answer: panel.textContent.trim() });
  });

  if (faqs.length) {
    extendSchema('WebPage', {
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    });
  }
}
