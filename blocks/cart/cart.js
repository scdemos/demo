import { createTag, trackEvent } from '../../scripts/shared.js';
import { PRODUCTS_ROOT } from '../../scripts/products.js';
import {
  getCart, setQuantity, cartTotal, onCartChange, formatMoney, formatLabel, loadLabels, placeOrder,
  lastOrder, MAX_QUANTITY, ecommerce,
} from '../../scripts/cart.js';

// checkout fields: [name, label key, autocomplete, extra attributes]
const FIELDS = [
  ['firstName', 'field-first-name', 'given-name'],
  ['lastName', 'field-last-name', 'family-name'],
  ['email', 'field-email', 'email', { type: 'email' }],
  ['address1', 'field-address', 'street-address', { class: 'cart-field-wide' }],
  ['city', 'field-city', 'address-level2'],
  ['state', 'field-state', 'address-level1', {
    maxlength: '2', pattern: '[A-Za-z]{2}', class: 'cart-field-short',
  }],
  ['zip', 'field-zip', 'postal-code', {
    inputmode: 'numeric', maxlength: '10', pattern: '\\d{5}(-\\d{4})?', class: 'cart-field-short',
  }],
];

function buildLine(item, labels) {
  const li = createTag('li', { class: 'cart-line' });
  const media = createTag('div', { class: 'cart-line-media' });
  if (item.image) {
    media.append(createTag('img', {
      src: item.image, alt: '', loading: 'lazy', width: '96', height: '96',
    }));
  }
  const info = createTag('div', { class: 'cart-line-info' }, [
    createTag('a', { class: 'cart-line-name', href: item.path }, item.name),
    createTag('p', { class: 'cart-line-price' }, `${formatMoney(item.price, item.currency)}${item.period || ''}`),
  ]);

  const id = `cart-qty-${item.sku}`;
  const select = createTag('select', { id, name: id });
  for (let q = 1; q <= MAX_QUANTITY; q += 1) {
    const option = createTag('option', { value: String(q) }, String(q));
    option.selected = q === Number(item.quantity);
    select.append(option);
  }
  select.addEventListener('change', () => setQuantity(item.sku, select.value));
  const remove = createTag('button', {
    type: 'button', class: 'cart-line-remove', 'aria-label': `${labels['cart-remove']}: ${item.name}`,
  }, labels['cart-remove']);
  remove.addEventListener('click', () => setQuantity(item.sku, 0));
  const controls = createTag('div', { class: 'cart-line-controls' }, [
    createTag('label', { for: id }, labels['cart-quantity']),
    select,
    remove,
  ]);
  const total = createTag('p', { class: 'cart-line-total' }, formatMoney(Number(item.price) * Number(item.quantity), item.currency));
  li.append(media, info, controls, total);
  return li;
}

function buildEmpty(labels) {
  return createTag('div', { class: 'cart-empty' }, [
    createTag('p', {}, labels['cart-empty']),
    createTag('p', { class: 'button-container' }, createTag('a', { class: 'button primary', href: PRODUCTS_ROOT }, labels['cart-browse'])),
  ]);
}

function buildConfirmation(order, labels) {
  const name = order.customer?.firstName || '';
  const heading = createTag('h2', { tabindex: '-1' }, formatLabel(labels['order-confirmed'], { name }));
  const list = createTag('ul', { class: 'cart-confirmation-items' });
  order.items.forEach((item) => {
    list.append(createTag('li', {}, [
      createTag('span', {}, `${item.quantity} × ${item.name}`),
      createTag('span', {}, formatMoney(Number(item.price) * Number(item.quantity), order.currency)),
    ]));
  });
  list.append(createTag('li', { class: 'cart-confirmation-total' }, [
    createTag('span', {}, labels['cart-total']),
    createTag('span', {}, formatMoney(order.total, order.currency)),
  ]));
  return createTag('div', { class: 'cart-confirmation' }, [
    heading,
    createTag('p', { class: 'cart-confirmation-id' }, formatLabel(labels['order-number'], { order: order.id })),
    list,
    labels['order-next'] ? createTag('p', {}, formatLabel(labels['order-next'], { email: order.customer?.email || '' })) : '',
    createTag('p', { class: 'button-container' }, createTag('a', { class: 'button primary', href: PRODUCTS_ROOT }, labels['continue-shopping'])),
  ]);
}

function buildForm(labels, onPlaced) {
  const form = createTag('form', { class: 'cart-checkout', novalidate: '' });
  form.append(createTag('h2', {}, labels['checkout-title']));
  const grid = createTag('div', { class: 'cart-fields' });
  FIELDS.forEach(([name, key, autocomplete, extra = {}]) => {
    const { class: cls, ...attrs } = extra;
    const id = `cart-${name}`;
    const input = createTag('input', {
      id, name, autocomplete, required: '', type: 'text', ...attrs,
    });
    grid.append(createTag('div', { class: `cart-field ${cls || ''}`.trim() }, [createTag('label', { for: id }, labels[key]), input]));
  });
  // honeypot: hidden from people, filled by bots
  const trap = createTag('input', {
    name: '_gotcha', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', class: 'cart-trap',
  });
  const error = createTag('p', { class: 'cart-error', role: 'alert' });
  const submit = createTag('button', { type: 'submit', class: 'button primary' }, labels['place-order']);
  form.append(grid, trap, error, submit);

  const markInvalid = (names) => {
    form.querySelectorAll('input[name]').forEach((input) => {
      if (names.includes(input.name)) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
    form.querySelector('[aria-invalid="true"]')?.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const invalid = [...form.querySelectorAll('input[required]')].filter((i) => !i.checkValidity()).map((i) => i.name);
    if (invalid.length) {
      markInvalid(invalid);
      error.textContent = labels['order-check-fields'];
      return;
    }
    markInvalid([]);
    const v = Object.fromEntries(new FormData(form));
    submit.disabled = true;
    submit.textContent = labels['placing-order'] || labels['place-order'];
    try {
      const order = await placeOrder({
        customer: { firstName: v.firstName, lastName: v.lastName, email: v.email },
        address: {
          address1: v.address1, city: v.city, state: v.state.toUpperCase(), zip: v.zip,
        },
        gotcha: v._gotcha,
      });
      onPlaced(order);
    } catch (err) {
      if (err.code === 'invalid_customer') {
        markInvalid(err.fields);
        error.textContent = labels['order-check-fields'];
      } else {
        error.textContent = err.code === 'price_changed' ? labels['price-changed'] : labels['order-error'];
      }
    } finally {
      submit.disabled = false;
      submit.textContent = labels['place-order'];
    }
  });
  return form;
}

/** @param {Element} block */
export default async function decorate(block) {
  const labels = await loadLabels();
  block.textContent = '';
  if (!labels['add-to-cart']) return; // no shop text on this site: nothing to show

  const lines = createTag('ul', { class: 'cart-lines' });
  const total = createTag('p', { class: 'cart-total' });
  const summary = createTag('div', { class: 'cart-summary' }, [
    lines,
    total,
    labels['cart-note'] ? createTag('p', { class: 'cart-note' }, labels['cart-note']) : '',
  ]);
  let placed = false;

  const showConfirmation = (order) => {
    placed = true;
    block.replaceChildren(buildConfirmation(order, labels));
    const url = new URL(window.location.href);
    url.searchParams.set('order', order.id);
    window.history.replaceState(null, '', url);
    block.querySelector('h2')?.focus();
  };
  const form = buildForm(labels, showConfirmation);
  form.addEventListener('focusin', () => {
    trackEvent('begin_checkout', { ecommerce: ecommerce(getCart()) });
  }, { once: true });
  let viewed = false;

  const render = () => {
    if (placed) return;
    const items = getCart();
    if (!items.length) {
      const hadFocus = block.contains(document.activeElement);
      block.replaceChildren(buildEmpty(labels));
      if (hadFocus) block.querySelector('.cart-empty a')?.focus();
      return;
    }
    // keep keyboard focus on the control being used; after a removal, on the next line
    const active = lines.contains(document.activeElement) ? document.activeElement : null;
    const index = active ? [...lines.children].findIndex((li) => li.contains(active)) : -1;
    lines.replaceChildren(...items.map((item) => buildLine(item, labels)));
    if (active) {
      const same = active.id && document.getElementById(active.id);
      const next = lines.children[Math.min(index, lines.children.length - 1)];
      (same || next?.querySelector('select'))?.focus();
    }
    if (!viewed) {
      viewed = true;
      trackEvent('view_cart', { ecommerce: ecommerce(items) });
    }
    total.replaceChildren(
      createTag('span', {}, labels['cart-total']),
      createTag('strong', {}, formatMoney(cartTotal(items), items[0].currency)),
    );
    if (!block.contains(form)) block.replaceChildren(createTag('div', { class: 'cart-layout' }, [summary, form]));
  };

  const confirmed = lastOrder(new URLSearchParams(window.location.search).get('order'));
  if (confirmed) showConfirmation(confirmed);
  else render();
  onCartChange(render);
}
