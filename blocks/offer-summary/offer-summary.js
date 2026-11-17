import { getMetadata, toClassName } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';
import { addSchema } from '../../scripts/schema.js';

const CONFIG_KEYS = [
  'name', 'start', 'end', 'price', 'currency', 'availability',
  'countdown', 'units', 'live', 'ended', 'share', 'copied',
];

const INFO = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></g></svg>';

function parseDate(value) {
  const time = new Date(value || '').getTime();
  return Number.isNaN(time) ? null : time;
}

function buildCountdown(cfg) {
  const start = parseDate(cfg.start);
  if (!cfg.countdown || !start) return null;
  const end = parseDate(cfg.end);
  const units = (cfg.units || '').split(',').map((u) => u.trim());
  const wrap = createTag('div', { class: 'offer-summary-countdown' });
  const label = createTag('p', { class: 'offer-summary-countdown-label' }, cfg.countdown);
  const listEl = createTag('ul', { class: 'offer-summary-timer', 'aria-label': cfg.countdown });
  const cells = ['days', 'hours', 'minutes'].map((unit, i) => {
    const value = createTag('strong', {}, '00');
    const li = createTag('li', {}, [value, createTag('span', {}, units[i] || '')]);
    listEl.append(li);
    return value;
  });
  const live = createTag('p', { class: 'offer-summary-live', hidden: '' }, cfg.live || '');
  wrap.append(label, listEl, live);

  let timer;
  const tick = () => {
    const now = Date.now();
    const diff = Math.max(0, start - now);
    if (diff === 0) {
      label.hidden = true;
      listEl.hidden = true;
      const running = !end || now < end;
      const message = running ? cfg.live : cfg.ended;
      live.textContent = message || '';
      live.hidden = !message;
      if (!message) wrap.hidden = true;
      clearInterval(timer);
      return;
    }
    const pad = (n) => String(n).padStart(2, '0');
    cells[0].textContent = pad(Math.floor(diff / 864e5));
    cells[1].textContent = pad(Math.floor((diff / 36e5) % 24));
    cells[2].textContent = pad(Math.floor((diff / 6e4) % 60));
  };
  tick();
  timer = setInterval(tick, 30000);
  return wrap;
}

function buildShare(cfg) {
  if (!cfg.share || !navigator.clipboard) return null;
  const wrap = createTag('p', { class: 'offer-summary-share' });
  const btn = createTag('button', { type: 'button', class: 'button secondary' }, cfg.share);
  const status = createTag('span', { class: 'offer-summary-share-status', role: 'status' });
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
      status.textContent = cfg.copied || '';
      setTimeout(() => { status.textContent = ''; }, 4000);
    } catch (e) { /* clipboard unavailable */ }
  });
  wrap.append(btn, status);
  return wrap;
}

function buildSchema(cfg) {
  const name = cfg.name || document.querySelector('main h1')?.textContent.trim() || document.title;
  const url = document.querySelector('link[rel="canonical"]')?.href || window.location.href.split('?')[0];
  const schema = {
    '@type': 'Offer',
    name,
    url,
    availability: `https://schema.org/${(cfg.availability || 'InStock').replace(/\s+/g, '')}`,
  };
  const description = getMetadata('description');
  if (description) schema.description = description;
  if (parseDate(cfg.start)) schema.validFrom = cfg.start;
  if (parseDate(cfg.end)) schema.validThrough = cfg.end;
  const price = Number.parseFloat(cfg.price);
  if (!Number.isNaN(price)) {
    schema.price = price.toFixed(2);
    schema.priceCurrency = cfg.currency || 'USD';
  }
  addSchema(schema);
}

function decorateCallout(block) {
  const content = createTag('div', { class: 'offer-summary-callout-body' });
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => content.append(...cell.childNodes));
  });
  const icon = createTag('span', { class: 'offer-summary-icon' });
  icon.innerHTML = INFO;
  const aside = createTag('aside', { class: 'offer-summary-callout' }, [icon, content]);
  const heading = content.querySelector('h2, h3, h4');
  if (heading) {
    heading.id = heading.id || `offer-note-${Math.random().toString(36).slice(2, 7)}`;
    aside.setAttribute('aria-labelledby', heading.id);
  }
  block.replaceChildren(aside);
}

/** @param {Element} block */
export default function decorate(block) {
  if (block.classList.contains('callout')) {
    decorateCallout(block);
    return;
  }

  const cfg = {};
  const head = createTag('div', { class: 'offer-summary-head' });
  const facts = createTag('dl', { class: 'offer-summary-facts' });
  const actions = createTag('div', { class: 'offer-summary-actions' });

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (cells.length >= 2) {
      const key = toClassName(cells[0].textContent);
      if (CONFIG_KEYS.includes(key)) {
        cfg[key] = cells[1].textContent.trim();
        return;
      }
      const item = createTag('div', { class: 'offer-summary-fact' });
      const dt = createTag('dt');
      dt.append(...cells[0].childNodes);
      const dd = createTag('dd');
      dd.append(...cells[1].childNodes);
      item.append(dt, dd);
      facts.append(item);
      return;
    }
    const cell = cells[0];
    if (!cell) return;
    const buttons = cell.querySelectorAll('.button-container');
    if (buttons.length && buttons.length === cell.children.length) {
      const group = createTag('div', { class: 'button-group' });
      group.append(...buttons);
      actions.append(group);
    } else {
      head.append(...cell.childNodes);
    }
  });

  const share = buildShare(cfg);
  if (share) {
    const group = actions.querySelector('.button-group');
    if (group) group.append(share);
    else actions.append(share);
  }

  const card = createTag('div', { class: 'offer-summary-card' });
  const countdown = buildCountdown(cfg);
  if (head.childNodes.length) card.append(head);
  const main = createTag('div', { class: 'offer-summary-main' });
  if (countdown) main.append(countdown);
  if (facts.children.length) main.append(facts);
  card.append(main);
  if (actions.children.length) card.append(actions);
  block.replaceChildren(card);

  buildSchema(cfg);
}
