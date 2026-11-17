import { createTag } from '../../scripts/shared.js';

/**
 * Stats: proof figures.
 * Rows: number cell + label cell. Optional single-cell first row = heading/intro.
 * Optional single-cell row containing a `<ul>` = scrolling ticker (decorative).
 * Variant: ink.
 * @param {Element} block
 */

const NUMBER_RE = /^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/;

function countUp(el, finalText) {
  const match = finalText.match(NUMBER_RE);
  if (!match) return;
  const [, prefix, raw, suffix] = match;
  const target = parseFloat(raw.replace(/,/g, ''));
  const decimals = (raw.split('.')[1] || '').length;
  const useGrouping = raw.includes(',');
  const fmt = new Intl.NumberFormat(document.documentElement.lang || 'en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping,
  });
  const duration = 1400;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = `${prefix}${fmt.format(target * eased)}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = finalText;
  };
  requestAnimationFrame(tick);
}

function buildTicker(ul) {
  const ticker = createTag('div', { class: 'stats-ticker', 'aria-hidden': 'true' });
  const track = createTag('ul');
  const items = [...ul.children].map((li) => li.textContent.trim()).filter(Boolean);
  [...items, ...items].forEach((text) => track.append(createTag('li', {}, text)));
  ticker.append(track);
  return ticker;
}

export default function decorate(block) {
  const rows = [...block.children];
  const intro = createTag('div', { class: 'stats-intro' });
  const list = createTag('dl', { class: 'stats-list' });
  let ticker;

  rows.forEach((row, idx) => {
    const cells = [...row.children];
    if (cells.length === 1) {
      const ul = cells[0].querySelector('ul');
      if (ul && !cells[0].querySelector('h2, h3')) {
        ticker = buildTicker(ul);
        return;
      }
      if (idx === 0) {
        const cell = cells[0];
        if (!cell.querySelector('h2, h3, p') && cell.textContent.trim()) {
          intro.append(createTag('h2', {}, cell.textContent.trim()));
        } else {
          [...cell.children].forEach((el) => intro.append(el));
        }
      }
      return;
    }
    const [numCell, labelCell] = cells;
    const value = numCell.textContent.trim();
    if (!value) return;
    const item = createTag('div', { class: 'stats-item' });
    const dt = createTag('dt', {}, labelCell.textContent.trim());
    const dd = createTag('dd');
    const visible = createTag('span', { class: 'stats-value', 'aria-hidden': 'true' }, value);
    const sr = createTag('span', { class: 'visually-hidden' }, value);
    dd.append(visible, sr);
    item.append(dt, dd);
    list.append(item);
  });

  const children = [];
  if (intro.children.length) children.push(intro);
  children.push(list);
  if (ticker) children.push(ticker);
  block.replaceChildren(...children);

  if (block.classList.contains('ink')) block.classList.add('surface-ink');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      block.querySelectorAll('.stats-value').forEach((el) => countUp(el, el.textContent));
    });
  }, { threshold: 0.4 });
  observer.observe(list);
}
