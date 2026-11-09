import { getMetadata, toClassName } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';
import { addSchema } from '../../scripts/schema.js';

const CONFIG_KEYS = [
  'sku', 'price', 'currency', 'availability', 'brand', 'rating', 'reviews',
  'plans', 'plans-label', 'gallery-label',
];

const CHECK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function absoluteUrl(path) {
  try {
    return new URL(path, window.location.href).href;
  } catch (e) {
    return '';
  }
}

function readConfig(block) {
  const config = {};
  [...block.children].slice(1).forEach((row) => {
    const [keyCell, valueCell] = row.children;
    const key = toClassName(keyCell?.textContent || '');
    if (!valueCell || !CONFIG_KEYS.includes(key)) return;
    config[key] = key === 'plans'
      ? [...valueCell.querySelectorAll('li')].map((li) => li.textContent.trim())
      : valueCell.textContent.trim();
    row.remove();
  });
  return config;
}

function buildGallery(cell, label) {
  const pictures = [...cell.querySelectorAll('picture')];
  const gallery = createTag('div', { class: 'product-detail-gallery' });
  if (!pictures.length) return gallery;

  const stage = createTag('div', { class: 'product-detail-stage' });
  const first = pictures[0].cloneNode(true);
  const firstImg = first.querySelector('img');
  if (firstImg) {
    firstImg.loading = 'eager';
    firstImg.setAttribute('fetchpriority', 'high');
  }
  stage.append(first);
  gallery.append(stage);
  if (pictures.length < 2) return gallery;

  const thumbs = createTag('div', { class: 'product-detail-thumbs', role: 'group' });
  if (label) thumbs.setAttribute('aria-label', label);
  pictures.forEach((picture, i) => {
    const alt = picture.querySelector('img')?.getAttribute('alt') || '';
    const btn = createTag('button', {
      type: 'button',
      class: 'product-detail-thumb',
      'aria-pressed': String(i === 0),
      'aria-label': alt || `${i + 1}`,
    });
    const thumb = picture.cloneNode(true);
    const img = thumb.querySelector('img');
    if (img) {
      img.alt = '';
      img.loading = 'lazy';
    }
    btn.append(thumb);
    btn.addEventListener('click', () => {
      thumbs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const next = picture.cloneNode(true);
      stage.replaceChildren(next);
    });
    thumbs.append(btn);
  });
  gallery.append(thumbs);
  return gallery;
}

function decorateContent(cell) {
  const h1 = cell.querySelector('h1, h2');
  let afterHeading = false;
  let ledeDone = false;
  let group = null;

  [...cell.children].forEach((el) => {
    if (el === h1) {
      afterHeading = true;
      return;
    }
    if (el.tagName === 'UL') {
      el.classList.add('product-detail-features');
      el.querySelectorAll(':scope > li').forEach((li) => li.insertAdjacentHTML('afterbegin', CHECK));
      group = null;
      return;
    }
    if (el.tagName !== 'P') return;
    if (el.classList.contains('button-container')) {
      if (!group) {
        group = createTag('div', { class: 'button-group' });
        el.before(group);
      }
      group.append(el);
      return;
    }
    group = null;
    if (!afterHeading) {
      el.classList.add('product-detail-badge');
      return;
    }
    const txt = el.textContent.trim();
    if (/^[★☆]/.test(txt)) {
      const stars = txt.match(/^[★☆]+/)[0];
      el.classList.add('product-detail-rating');
      el.textContent = '';
      el.append(
        createTag('span', { class: 'product-detail-stars', 'aria-hidden': 'true' }, stars),
        createTag('span', {}, txt.slice(stars.length).trim()),
      );
      return;
    }
    const first = el.firstElementChild;
    if (first?.tagName === 'STRONG' && !el.querySelector('a') && el.firstChild === first) {
      el.classList.add('product-detail-price');
      const rest = [...el.childNodes].slice(1);
      if (rest.length) {
        const small = createTag('small');
        small.append(...rest);
        el.append(small);
      }
      return;
    }
    if (!ledeDone) {
      el.classList.add('lede', 'product-detail-lede');
      ledeDone = true;
      return;
    }
    el.classList.add('product-detail-note');
  });
}

function buildPlans(cfg, priceEl, uid) {
  if (!cfg.plans?.length) return null;
  const fieldset = createTag('fieldset', { class: 'product-detail-plans' });
  fieldset.append(createTag('legend', {}, cfg['plans-label'] || ''));
  const requested = toClassName(new URLSearchParams(window.location.search).get('plan') || '');
  const plans = cfg.plans.map((entry) => {
    const [name, priceText = ''] = entry.split(/\s+[—–|]\s+/);
    const [, amount = priceText, period = ''] = priceText.match(/^(\S+?)(\/.*)?$/) || [];
    return {
      name, amount, period, value: toClassName(name),
    };
  });
  const selected = plans.find((p) => requested && p.value.includes(requested)) || plans[0];

  const apply = (plan) => {
    if (!priceEl || !plan.amount) return;
    priceEl.textContent = '';
    priceEl.append(createTag('strong', {}, plan.amount));
    if (plan.period) priceEl.append(createTag('small', {}, plan.period));
  };

  plans.forEach((plan, i) => {
    const id = `${uid}-plan-${i}`;
    const input = createTag('input', {
      type: 'radio', name: `${uid}-plan`, id, value: plan.value,
    });
    input.checked = plan === selected;
    input.addEventListener('change', () => apply(plan));
    const label = createTag('label', { for: id, class: 'product-detail-plan' });
    label.append(input, createTag('span', { class: 'product-detail-plan-name' }, plan.name));
    if (plan.amount) {
      label.append(createTag('span', { class: 'product-detail-plan-price' }, `${plan.amount}${plan.period}`));
    }
    fieldset.append(label);
  });
  if (selected !== plans[0]) apply(selected);
  return fieldset;
}

function buildSchema(block, cfg) {
  const name = block.querySelector('h1, h2')?.textContent.trim();
  if (!name) return;
  const img = block.querySelector('.product-detail-stage img');
  const schema = {
    '@type': 'Product',
    name,
    description: block.querySelector('.product-detail-lede')?.textContent.trim()
      || getMetadata('description'),
    url: document.querySelector('link[rel="canonical"]')?.href || window.location.href.split('?')[0],
  };
  if (img) schema.image = absoluteUrl(img.getAttribute('src'));
  if (cfg.sku) schema.sku = cfg.sku;
  if (cfg.brand) schema.brand = { '@type': 'Brand', name: cfg.brand };
  const rating = Number.parseFloat(cfg.rating);
  const reviews = Number.parseInt(String(cfg.reviews || '').replace(/\D/g, ''), 10);
  if (!Number.isNaN(rating) && reviews) {
    schema.aggregateRating = {
      '@type': 'AggregateRating', ratingValue: rating, reviewCount: reviews, bestRating: 5,
    };
  }
  const price = Number.parseFloat(cfg.price);
  if (!Number.isNaN(price)) {
    const availability = cfg.availability || 'InStock';
    schema.offers = {
      '@type': 'Offer',
      price: price.toFixed(2),
      priceCurrency: cfg.currency || 'USD',
      availability: availability.startsWith('http') ? availability : `https://schema.org/${availability.replace(/\s+/g, '')}`,
      url: schema.url,
    };
  }
  addSchema(schema);
}

/** @param {Element} block */
export default function decorate(block) {
  const cfg = readConfig(block);
  const row = block.firstElementChild;
  if (!row) return;
  const cells = [...row.children];
  const mediaCell = cells.find((c) => c.querySelector('picture') && !c.querySelector('h1, h2'));
  const contentCell = cells.find((c) => c !== mediaCell) || cells[0];
  const uid = `pdp-${Math.random().toString(36).slice(2, 7)}`;

  decorateContent(contentCell);
  contentCell.classList.add('product-detail-buy');
  const priceEl = contentCell.querySelector('.product-detail-price');
  if (priceEl) priceEl.setAttribute('aria-live', 'polite');
  const plans = buildPlans(cfg, priceEl, uid);
  if (plans) {
    const anchor = contentCell.querySelector('.product-detail-features, .button-group, .button-container');
    if (anchor) anchor.before(plans);
    else contentCell.append(plans);
  }

  const layout = createTag('div', { class: 'product-detail-layout' });
  if (mediaCell) layout.append(buildGallery(mediaCell, cfg['gallery-label']));
  layout.append(contentCell);
  block.replaceChildren(layout);
  if (!mediaCell) block.classList.add('no-media');

  buildSchema(block, cfg);
}
