import { readBlockConfig, toClassName } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';
import { addSchema } from '../../scripts/schema.js';

const text = (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? '')).trim();
const list = (value) => text(value).split(',').map((v) => v.trim()).filter(Boolean);
const format = (tpl, values) => tpl.replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);

function absoluteUrl(path) {
  try {
    return new URL(path, window.location.origin).href;
  } catch (e) {
    return '';
  }
}

function matches(item, rule) {
  if (!rule) return true;
  const m = rule.match(/^\s*([\w-]+)\s*(!?=)\s*(.*)$/);
  if (!m) return true;
  const [, field, op, value] = m;
  const values = list(item[field]).map(toClassName);
  const hit = value ? values.includes(toClassName(value)) : !values.length;
  return op === '=' ? hit : !hit;
}

function buildCard(item, cfg) {
  const li = createTag('li', { class: 'catalog-item' });
  if (item.id) li.id = toClassName(item.id);
  const card = createTag('article', { class: 'catalog-card' });

  if (item.badge) {
    const style = toClassName(item.badgeStyle || '');
    card.append(createTag('span', { class: `catalog-badge${style ? ` catalog-badge-${style}` : ''}` }, item.badge));
  }

  const media = createTag('div', { class: 'catalog-media' });
  if (item.image) {
    media.append(createTag('img', {
      src: item.image,
      alt: item.imageAlt || '',
      width: '400',
      height: '300',
      loading: 'lazy',
      decoding: 'async',
    }));
  }
  card.append(media);

  const body = createTag('div', { class: 'catalog-body' });
  const heading = createTag(cfg.level);
  heading.append(createTag('a', { class: 'catalog-link', href: item.url || '#' }, item.title));
  body.append(heading);
  if (item.summary) body.append(createTag('p', {}, item.summary));
  card.append(body);

  if (item.priceLabel) {
    const foot = createTag('div', { class: 'catalog-foot' });
    const price = createTag('p', { class: 'catalog-price' }, item.priceLabel);
    if (item.period) price.append(createTag('small', {}, item.period));
    foot.append(price);
    card.append(foot);
  }

  li.append(card);
  return li;
}

function buildSchema(items, cfg) {
  addSchema({
    '@type': 'ItemList',
    name: cfg.heading || document.title,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => {
      const url = absoluteUrl(item.url);
      const price = Number.parseFloat(item.price);
      const hasPrice = !Number.isNaN(price);
      const currency = item.currency || cfg.currency;
      let entry;
      if (cfg.type === 'product') {
        entry = {
          '@type': 'Product', name: item.title, description: item.summary, url,
        };
        if (item.image) entry.image = absoluteUrl(item.image);
        if (hasPrice) {
          entry.offers = {
            '@type': 'Offer',
            price: price.toFixed(2),
            priceCurrency: currency,
            availability: 'https://schema.org/InStock',
          };
        }
      } else {
        entry = {
          '@type': 'Offer', name: item.title, description: item.summary, url,
        };
        if (item.start) entry.validFrom = item.start;
        if (item.end) entry.validThrough = item.end;
        if (hasPrice) {
          entry.price = price.toFixed(2);
          entry.priceCurrency = currency;
        }
      }
      return {
        '@type': 'ListItem', position: i + 1, url, item: entry,
      };
    }),
  });
}

/** @param {Element} block */
export default async function decorate(block) {
  const raw = readBlockConfig(block);
  const cfg = {
    type: toClassName(text(raw.type)) === 'offer' ? 'offer' : 'product',
    source: text(raw.source),
    filters: list(raw.filter).map(toClassName),
    heading: text(raw.heading),
    match: text(raw.match),
    limit: Number.parseInt(text(raw.limit), 10) || 0,
    currency: text(raw.currency) || 'USD',
    sort: text(raw.sort),
    sortOptions: list(raw['sort-options']),
    search: text(raw.search),
    count: text(raw.count) || '{n} / {total}',
    empty: text(raw.empty),
    allLabel: text(raw['all-label']),
    level: 'h3',
  };
  const label = (field, suffix, fallback) => text(raw[`${field}-${suffix}`]) || fallback;

  block.textContent = '';
  block.classList.add(`catalog-type-${cfg.type}`);
  if (!cfg.source) return;

  const uid = `catalog-${Math.random().toString(36).slice(2, 7)}`;
  if (cfg.heading) {
    const h = createTag('h2', { class: 'catalog-heading', id: `${uid}-title` }, cfg.heading);
    block.append(h);
    block.setAttribute('aria-labelledby', h.id);
  } else if (!block.closest('.section')?.querySelector('h1, h2')) {
    cfg.level = 'h2';
  }

  let items = [];
  try {
    const resp = await fetch(cfg.source);
    if (resp.ok) {
      const json = await resp.json();
      items = json.data || [];
    }
  } catch (e) {
    items = [];
  }
  items = items.filter((item) => matches(item, cfg.match));
  if (cfg.limit) items = items.slice(0, cfg.limit);

  const grid = createTag('ul', { class: 'catalog-grid' });
  const nodes = items.map((item, i) => {
    const li = buildCard(item, cfg);
    li.dataset.index = i;
    grid.append(li);
    return li;
  });

  if (!cfg.filters.length && !cfg.sort && !cfg.search) {
    block.append(grid);
    block.classList.add('is-loaded');
    if (items.length) buildSchema(items, cfg);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const state = { sort: 'featured', q: (params.get('q') || '').trim().toLowerCase() };
  const bar = createTag('div', { class: 'catalog-bar' });
  const controls = createTag('div', { class: 'catalog-controls' });
  const status = createTag('p', { class: 'catalog-status', role: 'status', 'aria-live': 'polite' });
  const empty = createTag('p', { class: 'catalog-empty', hidden: '' }, cfg.empty);
  const chips = [];
  const selects = [];

  function update(persist) {
    let shown = 0;
    nodes.forEach((li) => {
      const item = items[li.dataset.index];
      const haystack = [item.title, item.summary, item.keywords, ...cfg.filters.map((f) => item[f])]
        .join(' ').toLowerCase();
      const pass = cfg.filters.every((f) => state[f] === 'all'
        || list(item[f]).map(toClassName).includes(state[f]))
        && (!state.q || haystack.includes(state.q));
      li.hidden = !pass;
      if (pass) shown += 1;
    });

    const price = (li) => Number.parseFloat(items[li.dataset.index].price) || 0;
    const sorted = [...nodes].sort((a, b) => {
      if (state.sort === 'price-asc') return price(a) - price(b);
      if (state.sort === 'price-desc') return price(b) - price(a);
      return a.dataset.index - b.dataset.index;
    });
    grid.append(...sorted);

    chips.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === state[btn.dataset.field]));
    });
    selects.forEach((select) => { select.value = state[select.dataset.field]; });

    status.textContent = format(cfg.count, { n: shown, total: nodes.length });
    empty.hidden = shown > 0 || !cfg.empty;

    if (persist) {
      const url = new URL(window.location.href);
      cfg.filters.forEach((f) => {
        if (state[f] === 'all') url.searchParams.delete(f);
        else url.searchParams.set(f, state[f]);
      });
      if (state.q) url.searchParams.set('q', state.q);
      else url.searchParams.delete('q');
      window.history.replaceState(window.history.state, '', url);
    }
  }

  const set = (field, value) => {
    state[field] = value;
    update(true);
  };

  cfg.filters.forEach((field, i) => {
    const values = [];
    items.forEach((item) => list(item[field]).forEach((v) => {
      if (!values.includes(v)) values.push(v);
    }));
    const requested = toClassName(params.get(field) || '');
    state[field] = values.map(toClassName).includes(requested) ? requested : 'all';
    const groupLabel = label(field, 'label', field);
    const allLabel = label(field, 'all', cfg.allLabel);
    const options = [['all', allLabel], ...values.map((v) => [toClassName(v), v])];

    if (i === 0) {
      const group = createTag('div', { class: 'catalog-chips', role: 'group', 'aria-label': groupLabel });
      options.forEach(([value, name]) => {
        const btn = createTag('button', {
          class: 'catalog-chip', type: 'button', 'aria-pressed': 'false', 'data-value': value, 'data-field': field,
        }, name);
        btn.addEventListener('click', () => set(field, value));
        chips.push(btn);
        group.append(btn);
      });
      bar.append(group);
      return;
    }

    const id = `${uid}-${field}`;
    const wrap = createTag('div', { class: 'catalog-field' });
    const select = createTag('select', { id, 'data-field': field });
    options.forEach(([value, name]) => select.append(createTag('option', { value }, name)));
    select.addEventListener('change', () => set(field, select.value));
    selects.push(select);
    wrap.append(createTag('label', { for: id }, groupLabel), select);
    controls.append(wrap);
  });

  if (cfg.sort && cfg.sortOptions.length) {
    const id = `${uid}-sort`;
    const wrap = createTag('div', { class: 'catalog-field' });
    const select = createTag('select', { id });
    ['featured', 'price-asc', 'price-desc'].forEach((value, i) => {
      if (cfg.sortOptions[i]) select.append(createTag('option', { value }, cfg.sortOptions[i]));
    });
    select.addEventListener('change', () => set('sort', select.value));
    wrap.append(createTag('label', { for: id }, cfg.sort), select);
    controls.append(wrap);
  }

  if (cfg.search) {
    const id = `${uid}-search`;
    const wrap = createTag('div', { class: 'catalog-field catalog-search' });
    const input = createTag('input', {
      id, type: 'search', placeholder: cfg.search, autocomplete: 'off',
    });
    input.value = params.get('q') || '';
    input.addEventListener('input', () => set('q', input.value.trim().toLowerCase()));
    wrap.append(createTag('label', { for: id, class: 'visually-hidden' }, cfg.search), input);
    controls.append(wrap);
  }

  if (controls.children.length) bar.append(controls);
  block.append(bar, status, grid, empty);
  update(false);
  block.classList.add('is-loaded');
  if (items.length) buildSchema(items, cfg);
}
