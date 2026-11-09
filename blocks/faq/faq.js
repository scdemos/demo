import { createTag } from '../../scripts/shared.js';
import { extendSchema } from '../../scripts/schema.js';

const FAQ_INDEX_PATH = '/faq-index.json';

// Shared across every faq block on the page so the FAQPage entity lists all questions.
const pageQuestions = [];
let itemCount = 0;

async function fetchFaqs() {
  const resp = await fetch(FAQ_INDEX_PATH);
  if (!resp.ok) return [];
  const json = await resp.json();
  return json?.data || [];
}

function toggleItem(button) {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  const panel = button.parentElement.nextElementSibling;
  panel.hidden = expanded;
}

/**
 * @param {string|Element} question plain text or element whose content is the question
 * @param {string|Element} answer plain text or element whose children form the answer
 */
function buildFaqItem(question, answer) {
  itemCount += 1;
  const id = `faq-${itemCount}`;
  const item = createTag('div', { class: 'faq-item' });

  const heading = createTag('h3', { class: 'faq-heading' });
  const button = createTag('button', {
    class: 'faq-question',
    'aria-expanded': 'false',
    'aria-controls': `${id}-answer`,
    id: `${id}-question`,
    type: 'button',
  });
  const label = createTag('span', { class: 'faq-question-text' });
  if (typeof question === 'string') label.textContent = question;
  else label.append(...question.childNodes);
  button.append(label, createTag('span', { class: 'faq-icon', 'aria-hidden': 'true' }));
  heading.append(button);

  const panel = createTag('div', {
    class: 'faq-answer',
    id: `${id}-answer`,
    role: 'region',
    'aria-labelledby': `${id}-question`,
    hidden: true,
  });
  if (typeof answer === 'string') {
    panel.append(createTag('p', {}, answer));
  } else {
    const hasBlocks = answer.querySelector('p, ul, ol, table');
    if (hasBlocks) panel.append(...answer.childNodes);
    else panel.append(createTag('p', {}, [...answer.childNodes]));
  }

  button.addEventListener('click', () => toggleItem(button));

  item.append(heading, panel);
  return item;
}

function buildCategoryGroup(category, faqs) {
  const group = createTag('div', { class: 'faq-category' });
  group.append(createTag('h3', { class: 'faq-category-heading' }, category));
  faqs.forEach((faq) => {
    const item = buildFaqItem(faq.question, faq.answer);
    const heading = item.querySelector('.faq-heading');
    heading.replaceWith(createTag('h4', { class: 'faq-heading' }, [...heading.childNodes]));
    group.append(item);
  });
  return group;
}

function addFaqSchema(faqs) {
  pageQuestions.push(...faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })));
  // First block turns WebPage into FAQPage; later blocks extend the same entity.
  extendSchema('WebPage', { '@type': 'FAQPage', mainEntity: pageQuestions });
  extendSchema('FAQPage', { mainEntity: pageQuestions });
}

/**
 * Authored mode: each row = question cell + answer cell.
 * Index mode: each row = a category name filtering /faq-index.json.
 */
export default async function decorate(block) {
  const rows = [...block.children];
  const authored = rows.filter((row) => row.children.length >= 2);

  if (authored.length) {
    const list = createTag('div', { class: 'faq-list' });
    const schemaFaqs = [];
    authored.forEach((row) => {
      const [q, a] = row.children;
      const question = q.textContent.trim();
      if (!question) return;
      schemaFaqs.push({ question, answer: a.textContent.trim().replace(/\s+/g, ' ') });
      list.append(buildFaqItem(q, a));
    });
    block.replaceChildren(list);
    if (schemaFaqs.length) addFaqSchema(schemaFaqs);
    return;
  }

  const categories = rows.map((row) => row.textContent.trim()).filter(Boolean);

  block.textContent = '';

  const allFaqs = await fetchFaqs();
  if (!allFaqs.length) {
    block.append(createTag('p', { class: 'faq-empty' }, 'No FAQs available.'));
    return;
  }

  const filtered = categories.length
    ? allFaqs.filter((faq) => categories.includes(faq.category))
    : allFaqs;

  if (!filtered.length) {
    block.append(createTag('p', { class: 'faq-empty' }, 'No FAQs found for the selected categories.'));
    return;
  }

  const grouped = {};
  filtered.forEach((faq) => {
    if (!grouped[faq.category]) grouped[faq.category] = [];
    grouped[faq.category].push(faq);
  });

  Object.keys(grouped).forEach((category) => {
    block.append(buildCategoryGroup(category, grouped[category]));
  });

  addFaqSchema(filtered);
}
