import { toClassName } from '../../scripts/aem.js';
import { addSchema } from '../../scripts/schema.js';
import { createTag } from '../../scripts/shared.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const CONFIG_KEYS = ['filter', 'filter-label', 'count', 'empty'];

const format = (str, vars) => str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

function parseDate(value) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDate(value) {
  const date = parseDate(value);
  const lang = document.documentElement.lang || 'en';
  const time = createTag('time', { datetime: value });
  if (!date) {
    time.textContent = value;
    return time;
  }
  const month = new Intl.DateTimeFormat(lang, { month: 'short' }).format(date);
  const day = new Intl.DateTimeFormat(lang, { day: '2-digit' }).format(date);
  const full = new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(date);
  time.append(
    createTag('span', { class: 'events-month', 'aria-hidden': 'true' }, month),
    createTag('span', { class: 'events-day', 'aria-hidden': 'true' }, day),
    createTag('span', { class: 'visually-hidden' }, full),
  );
  return time;
}

function readRows(rows) {
  const config = {};
  const items = [];
  rows.forEach((row) => {
    const cells = [...row.children];
    const first = cells[0]?.textContent.trim() || '';
    const key = toClassName(first);
    if (DATE_RE.test(first)) items.push(cells);
    else if (cells.length >= 2 && CONFIG_KEYS.includes(key)) config[key] = cells[1].textContent.trim();
  });
  return { config, items };
}

function buildItem(cells) {
  const [dateCell, ...rest] = cells;
  const date = dateCell.textContent.trim();
  const content = rest.find((c) => c.querySelector('h2, h3, h4'));
  const media = rest.find((c) => c !== content && c.querySelector('picture, img'));
  const tagCell = rest.find((c) => c !== content && c !== media && c.textContent.trim());
  const tags = tagCell ? tagCell.textContent.split(',').map((t) => t.trim()).filter(Boolean) : [];

  const li = createTag('li', { class: 'events-item' });
  li.dataset.tags = tags.map((t) => toClassName(t)).join(' ');
  li.append(createTag('div', { class: 'events-date' }, buildDate(date)));

  const body = createTag('div', { class: 'events-body' });
  if (content) body.append(...content.childNodes);
  li.append(body);

  const heading = body.querySelector('h2, h3, h4');
  const titleLink = heading?.querySelector('a');
  if (titleLink) li.classList.add('events-item-linked');

  // last plain paragraph = meta line ("Place · Time · Price")
  const paras = [...body.querySelectorAll(':scope > p')].filter((p) => !p.querySelector('a'));
  const metaP = paras.length > 1 ? paras.at(-1) : paras.find((p) => p.textContent.includes('·'));
  let place = '';
  if (metaP) {
    const parts = metaP.textContent.split('·').map((s) => s.trim()).filter(Boolean);
    [place = ''] = parts;
    metaP.className = 'events-meta';
    metaP.replaceChildren(...parts.map((part) => createTag('span', {}, part)));
  }
  paras.filter((p) => p !== metaP).forEach((p) => p.classList.add('events-summary'));

  // a CTA pointing at the same URL as the title is decorative (row is already clickable)
  body.querySelectorAll(':scope > p a, :scope > .button-group a').forEach((a) => {
    const holder = a.closest('.button-group') || a.closest('p');
    if (titleLink && a.href === titleLink.href) {
      li.append(createTag('span', { class: 'events-cta', 'aria-hidden': 'true' }, a.textContent));
      a.closest('p')?.remove();
      if (holder.classList.contains('button-group') && !holder.children.length) holder.remove();
    } else {
      holder.classList.add('events-action');
    }
  });

  if (media) {
    const pic = media.querySelector('picture') || media.querySelector('img');
    const img = pic.tagName === 'IMG' ? pic : pic.querySelector('img');
    if (img) img.loading = 'lazy';
    li.prepend(createTag('div', { class: 'events-media' }, pic));
    li.classList.add('events-item-media');
  }

  const event = {
    '@type': 'Event',
    name: heading?.textContent.trim() || '',
    startDate: date,
    eventStatus: 'https://schema.org/EventScheduled',
  };
  if (titleLink) event.url = titleLink.href;
  if (place) {
    const online = /online|virtual|livestream/i.test(place);
    event.eventAttendanceMode = online
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode';
    event.location = online
      ? { '@type': 'VirtualLocation', url: event.url || window.location.href }
      : { '@type': 'Place', name: place };
  }
  return { li, tags, event };
}

function buildFilter(block, list, built, config) {
  const values = [];
  built.forEach(({ tags }) => tags.forEach((label) => {
    if (!values.some((v) => v.label === label)) values.push({ value: toClassName(label), label });
  }));
  if (!values.length) return;

  const group = createTag('div', {
    class: 'events-filter',
    role: 'group',
    'aria-label': config['filter-label'] || config.filter,
  });
  const status = createTag('p', { class: 'events-status', 'aria-live': 'polite' });
  const empty = createTag('p', { class: 'events-empty', hidden: '' }, config.empty || null);
  const params = new URLSearchParams(window.location.search);
  let current = params.get('filter') || 'all';
  if (!values.some((v) => v.value === current)) current = 'all';

  const chips = [{ value: 'all', label: config.filter }, ...values].map(({ value, label }) => {
    const btn = createTag('button', { type: 'button', class: 'events-chip' }, label);
    btn.dataset.value = value;
    return btn;
  });
  group.append(...chips);

  const apply = (updateUrl) => {
    let shown = 0;
    built.forEach(({ li }) => {
      const match = current === 'all' || li.dataset.tags.split(' ').includes(current);
      li.hidden = !match;
      if (match) shown += 1;
    });
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === current)));
    status.textContent = format(config.count || '{n} / {total}', { n: shown, total: built.length });
    empty.hidden = shown > 0;
    if (updateUrl) {
      const url = new URL(window.location.href);
      if (current === 'all') url.searchParams.delete('filter');
      else url.searchParams.set('filter', current);
      window.history.replaceState(null, '', url);
    }
  };

  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    current = btn.dataset.value;
    apply(true);
  });

  block.prepend(createTag('div', { class: 'events-toolbar' }, [group, status]));
  list.after(empty);
  apply(false);
}

/** @param {Element} block */
export default function decorate(block) {
  const { config, items } = readRows([...block.children]);
  const built = items.map(buildItem);
  const list = createTag('ul', { class: 'events-list' });
  built.forEach(({ li }) => list.append(li));
  block.replaceChildren(list);

  if (config.filter) buildFilter(block, list, built, config);

  if (built.length) {
    addSchema({
      '@type': 'ItemList',
      itemListElement: built.map(({ event }, i) => ({
        '@type': 'ListItem', position: i + 1, item: event,
      })),
    });
  }
}
