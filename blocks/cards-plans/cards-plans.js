import { createTag } from '../../scripts/shared.js';

/**
 * Cards Plans – interactive plan pricing comparison.
 *
 * Authoring: each row is one plan card. Within a plan card, mark the per-line
 * price with a link/strong whose text contains a dollar amount; the block reads
 * the base per-line price and multiplies by the selected number of lines.
 * A "Number of lines" stepper and a "Bring your phone" toggle are rendered
 * above the plan grid.
 */

const MIN_LINES = 1;
const MAX_LINES = 5;

function parsePrice(text) {
  const match = (text || '').replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function formatPrice(value) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function updatePrices(block, lines) {
  block.querySelectorAll('.cards-plans-price[data-base-price]').forEach((el) => {
    const base = parseFloat(el.getAttribute('data-base-price'));
    if (Number.isFinite(base)) {
      const total = base * lines;
      const amount = el.querySelector('.cards-plans-price-amount');
      if (amount) amount.textContent = formatPrice(total);
    }
  });
}

function buildControls(block) {
  const controls = createTag('div', { class: 'cards-plans-controls' });

  const label = createTag('span', { class: 'cards-plans-lines-label' }, 'Number of lines');
  const stepper = createTag('div', { class: 'cards-plans-stepper' });
  const dec = createTag('button', { type: 'button', class: 'cards-plans-dec', 'aria-label': 'Decrease lines' }, '−');
  const count = createTag('span', { class: 'cards-plans-count', 'aria-live': 'polite' }, '1');
  const inc = createTag('button', { type: 'button', class: 'cards-plans-inc', 'aria-label': 'Increase lines' }, '+');
  stepper.append(dec, count, inc);

  let lines = MIN_LINES;
  const sync = () => {
    count.textContent = String(lines);
    dec.disabled = lines <= MIN_LINES;
    inc.disabled = lines >= MAX_LINES;
    updatePrices(block, lines);
  };
  dec.addEventListener('click', () => { lines = Math.max(MIN_LINES, lines - 1); sync(); });
  inc.addEventListener('click', () => { lines = Math.min(MAX_LINES, lines + 1); sync(); });

  controls.append(label, stepper);

  const byo = createTag('label', { class: 'cards-plans-byo' });
  const byoInput = createTag('input', { type: 'checkbox' });
  byo.append(byoInput, createTag('span', {}, 'Bring your own phone'));
  byoInput.addEventListener('change', () => {
    block.classList.toggle('cards-plans-byo-on', byoInput.checked);
  });
  controls.append(byo);

  // initialise
  sync();
  return controls;
}

export default function decorate(block) {
  const ul = createTag('ul', { class: 'cards-plans-list' });

  [...block.children].forEach((row) => {
    const li = createTag('li', { class: 'cards-plans-card' });
    while (row.firstElementChild) li.append(row.firstElementChild);

    // Unwrap single wrapper div
    const wrapper = li.firstElementChild;
    if (wrapper && wrapper.tagName === 'DIV' && li.children.length === 1) {
      while (wrapper.firstChild) li.append(wrapper.firstChild);
      wrapper.remove();
    }

    // Detect the price element: first element whose text contains a $amount
    const priceEl = [...li.querySelectorAll('p, h2, h3, h4, strong')]
      .find((el) => /\$\s*\d/.test(el.textContent));
    if (priceEl) {
      const base = parsePrice(priceEl.textContent);
      const suffix = priceEl.textContent.replace(/\$?\s*\d+(?:\.\d+)?/, '').trim();
      priceEl.classList.add('cards-plans-price');
      if (base != null) priceEl.setAttribute('data-base-price', String(base));
      priceEl.textContent = '';
      priceEl.append(createTag('span', { class: 'cards-plans-price-amount' }, formatPrice(base ?? 0)));
      if (suffix) priceEl.append(createTag('span', { class: 'cards-plans-price-suffix' }, ` ${suffix}`));
    }

    ul.append(li);
  });

  const controls = buildControls(block);
  block.replaceChildren(controls, ul);
  updatePrices(block, MIN_LINES);
}
