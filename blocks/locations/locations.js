import { toClassName } from '../../scripts/aem.js';
import { addSchema } from '../../scripts/schema.js';
import { createTag } from '../../scripts/shared.js';

const format = (str, vars) => str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const split = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);

function readRows(block) {
  const config = {};
  let aside = null;
  [...block.children].forEach((row) => {
    const [keyCell, valueCell] = row.children;
    if (!keyCell || !valueCell) return;
    const key = toClassName(keyCell.textContent);
    if (key === 'aside') {
      aside = valueCell;
      return;
    }
    const link = valueCell.querySelector('a');
    config[key] = link && ['source', 'booking'].includes(key)
      ? new URL(link.href).pathname
      : valueCell.textContent.trim();
  });
  return { config, aside };
}

function buildField(labelText, control) {
  const field = createTag('div', { class: 'locations-field' });
  field.append(createTag('label', { for: control.id }, labelText), control);
  return field;
}

function buildCard(loc, index, config) {
  const li = createTag('li', { id: `loc-${loc.id}`, class: 'locations-item' });
  const article = createTag('article', { class: 'locations-card', 'aria-labelledby': `loc-${loc.id}-title` });
  const art = createTag('div', { class: `locations-art art-${toClassName(loc.art || 'rings')}`, 'aria-hidden': 'true' });
  art.append(createTag('span', { class: 'locations-num' }, String(index + 1)));
  article.append(art);
  if (loc.hours) {
    const open = config.open ? `${config.open} · ${loc.hours}` : loc.hours;
    article.append(createTag('p', { class: 'locations-open' }, open));
  }
  article.append(createTag('h3', { id: `loc-${loc.id}-title` }, loc.name));
  const address = [loc.street, [loc.city, [loc.state, loc.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ')]
    .filter(Boolean).join(', ');
  article.append(createTag('address', {}, address));
  const services = split(loc.services);
  if (services.length) {
    const tags = createTag('ul', { class: 'locations-tags' });
    services.forEach((s) => tags.append(createTag('li', {}, s)));
    if (config.services) tags.setAttribute('aria-label', config.services);
    article.append(tags);
  }
  if (config.booking && config.book) {
    const href = `${config.booking}?location=${encodeURIComponent(loc.id)}`;
    const link = createTag('a', { href, class: 'locations-book' }, config.book);
    link.append(createTag('span', { class: 'visually-hidden' }, ` – ${loc.name}`));
    article.append(createTag('p', { class: 'locations-cta' }, link));
  }
  li.append(article);
  return { li, address };
}

function buildPin(loc, index, onSelect) {
  const pin = createTag('button', {
    type: 'button',
    class: 'locations-pin',
    'aria-label': `${index + 1}. ${loc.name}, ${loc.city}`,
    'aria-pressed': 'false',
    style: `left:${Number(loc.x) || 50}%;top:${Number(loc.y) || 50}%`,
  });
  pin.append(createTag('span', { 'aria-hidden': 'true' }, String(index + 1)));
  pin.addEventListener('click', () => onSelect(pin, loc));
  return pin;
}

function emitSchema(locations) {
  addSchema({
    '@type': 'ItemList',
    itemListElement: locations.map(({ loc }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'LocalBusiness',
        name: loc.name,
        url: `${window.location.origin}${window.location.pathname}#loc-${loc.id}`,
        address: {
          '@type': 'PostalAddress',
          streetAddress: loc.street,
          addressLocality: loc.city,
          addressRegion: loc.state,
          postalCode: loc.postcode,
        },
      },
    })),
  });
}

function render(block, data, config, aside) {
  const params = new URLSearchParams(window.location.search);
  const state = {
    region: params.get('region') || 'all',
    service: params.get('service') || 'all',
    q: params.get('q') || '',
  };

  const regions = [...new Set(data.map((l) => l.region).filter(Boolean))];
  const services = [...new Set(data.flatMap((l) => split(l.services)))];
  if (!regions.some((r) => toClassName(r) === state.region)) state.region = 'all';
  if (!services.some((s) => toClassName(s) === state.service)) state.service = 'all';

  // toolbar
  const chips = createTag('div', { class: 'locations-chips', role: 'group', 'aria-label': config.region || null });
  [{ value: 'all', label: config['all-regions'] || '—' }, ...regions.map((r) => ({ value: toClassName(r), label: r }))]
    .forEach(({ value, label }) => {
      const btn = createTag('button', { type: 'button', class: 'locations-chip' }, label);
      btn.dataset.value = value;
      chips.append(btn);
    });

  const select = createTag('select', { id: 'locations-service' });
  select.append(createTag('option', { value: 'all' }, config['any-service'] || '—'));
  services.forEach((s) => select.append(createTag('option', { value: toClassName(s) }, s)));
  select.value = state.service;

  const search = createTag('input', {
    id: 'locations-search', type: 'search', autocomplete: 'off', placeholder: config.placeholder || null,
  });
  search.value = state.q;

  const fields = createTag('div', { class: 'locations-fields' }, [
    buildField(config.service || '', select),
    buildField(config.search || '', search),
  ]);
  const status = createTag('p', { class: 'locations-status', 'aria-live': 'polite' });
  const toolbar = createTag('div', { class: 'locations-toolbar' }, [chips, fields]);

  // map + cards
  const map = createTag('div', { class: 'locations-map', role: 'group', 'aria-label': config.map || null });
  const list = createTag('ul', { class: 'locations-list' });
  const empty = createTag('p', { class: 'locations-empty', hidden: '' }, config.empty || null);

  const onSelect = (pin, loc) => {
    map.querySelectorAll('.locations-pin').forEach((p) => p.setAttribute('aria-pressed', String(p === pin)));
    const card = block.querySelector(`#loc-${CSS.escape(loc.id)}`);
    if (!card) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
    card.querySelector('a, h3')?.focus({ preventScroll: true });
  };

  const items = data.map((loc, i) => {
    const { li, address } = buildCard(loc, i, config);
    const pin = buildPin(loc, i, onSelect);
    list.append(li);
    map.append(pin);
    const haystack = [loc.name, loc.neighbourhood, loc.city, loc.state, address, loc.keywords, loc.region]
      .join(' ').toLowerCase();
    return {
      loc, li, pin, haystack, region: toClassName(loc.region), services: split(loc.services).map(toClassName),
    };
  });

  const apply = (updateUrl) => {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    items.forEach((item) => {
      const match = (state.region === 'all' || item.region === state.region)
        && (state.service === 'all' || item.services.includes(state.service))
        && (!q || item.haystack.includes(q));
      item.li.hidden = !match;
      item.pin.hidden = !match;
      if (match) shown += 1;
    });
    chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === state.region)));
    status.textContent = format(config.count || '{n} / {total}', { n: shown, total: items.length });
    empty.hidden = shown > 0;
    if (updateUrl) {
      const url = new URL(window.location.href);
      ['region', 'service'].forEach((k) => {
        if (state[k] === 'all') url.searchParams.delete(k);
        else url.searchParams.set(k, state[k]);
      });
      if (q) url.searchParams.set('q', search.value.trim());
      else url.searchParams.delete('q');
      window.history.replaceState(null, '', url);
    }
  };

  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    state.region = btn.dataset.value;
    apply(true);
  });
  select.addEventListener('change', () => {
    state.service = select.value;
    apply(true);
  });
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => apply(true), 150);
  });

  const layout = createTag('div', { class: 'locations-layout' }, map);
  if (aside) {
    const panel = createTag('aside', { class: 'locations-aside' });
    panel.append(...aside.childNodes);
    layout.append(panel);
  }

  block.replaceChildren(toolbar, status, layout, list, empty);
  apply(false);
  emitSchema(items);

  const hashTarget = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  if (hashTarget && block.contains(hashTarget)) hashTarget.scrollIntoView({ block: 'start' });
}

/** @param {Element} block */
export default async function decorate(block) {
  const { config, aside } = readRows(block);
  block.replaceChildren();
  block.setAttribute('aria-busy', 'true');
  if (!config.source) return;
  try {
    const resp = await fetch(config.source);
    if (!resp.ok) throw new Error(`${resp.status}`);
    const json = await resp.json();
    const data = (json.data || []).filter((l) => l.id && l.name);
    render(block, data, config, aside);
  } catch (e) {
    console.error('locations: could not load', config.source, e);
  } finally {
    block.removeAttribute('aria-busy');
  }
}
