import { createTag } from '../../scripts/shared.js';

/**
 * Stats: proof figures.
 * Rows (two columns): number | label.
 * A row whose second cell is a list is the ticker: the first cell is its caption (e.g. "Cities"),
 * the list scrolls underneath the figures. A one-cell first row is an optional intro.
 * Authored elements are moved, never copied, so the block stays editable in layout view.
 * Variant: ink.
 * @param {Element} block
 */

const NUMBER_RE = /^([^\d]*)(\d[\d,]*(?:\.\d+)?)(.*)$/;

/** Counts up on a decorative overlay; the authored number is never changed. */
function countUp(dd) {
  const value = dd.querySelector('p, :scope > *') || dd;
  const finalText = value.textContent.trim();
  const match = finalText.match(NUMBER_RE);
  if (!match) return;
  const [, prefix, raw, suffix] = match;
  const target = parseFloat(raw.replace(/,/g, ''));
  const decimals = (raw.split('.')[1] || '').length;
  const fmt = new Intl.NumberFormat(document.documentElement.lang || 'en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: raw.includes(','),
  });
  const overlay = createTag('span', { class: 'stats-count', 'aria-hidden': 'true' });
  dd.append(overlay);
  dd.classList.add('stats-counting');
  const duration = 1400;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    overlay.textContent = `${prefix}${fmt.format(target * (1 - (1 - t) ** 3))}${suffix}`;
    if (t < 1 && dd.isConnected) {
      requestAnimationFrame(tick);
    } else {
      overlay.remove();
      dd.classList.remove('stats-counting');
    }
  };
  requestAnimationFrame(tick);
}

function buildTicker(nameCell, list) {
  const ticker = createTag('div', { class: 'stats-ticker', role: 'group' });
  if (nameCell?.textContent.trim()) {
    /* the authored name is the ticker's visible caption (and its accessible name) */
    const label = createTag('div', { class: 'stats-ticker-label', id: `stats-ticker-${Math.random().toString(36).slice(2, 8)}` });
    label.append(...nameCell.childNodes);
    ticker.setAttribute('aria-labelledby', label.id);
    ticker.append(label);
  }
  const track = createTag('div', { class: 'stats-ticker-track' });
  const source = createTag('div', { class: 'stats-ticker-source' });
  source.append(list);
  const copy = createTag('div', { class: 'stats-ticker-copy', 'aria-hidden': 'true' });
  /* a copy closes the loop; it follows the authored list when an author edits it */
  const sync = () => {
    const authored = source.querySelector('ul, ol');
    if (!authored) return;
    const clone = authored.cloneNode(true);
    [clone, ...clone.querySelectorAll('*')].forEach((el) => {
      [...el.attributes].filter(({ name }) => name.startsWith('data-')).forEach(({ name }) => el.removeAttribute(name));
      el.removeAttribute('id');
    });
    copy.replaceChildren(clone);
  };
  sync();
  const observer = new MutationObserver(() => {
    if (!ticker.isConnected) {
      observer.disconnect();
      return;
    }
    sync();
  });
  observer.observe(source, { childList: true, subtree: true, characterData: true });
  track.append(source, copy);
  const viewport = createTag('div', { class: 'stats-ticker-viewport' });
  viewport.append(track);
  ticker.append(viewport);
  return ticker;
}

/** The cell's list when the cell holds one list and nothing else, else null. */
function onlyList(cell) {
  const nodes = [...cell.childNodes].filter((n) => n.nodeType === Node.ELEMENT_NODE
    || (n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
  return nodes.length === 1 && nodes[0].matches?.('ul, ol') ? nodes[0] : null;
}

export default function decorate(block) {
  const rows = [...block.children];
  const intro = createTag('div', { class: 'stats-intro' });
  const list = createTag('dl', { class: 'stats-list' });
  let ticker;

  rows.forEach((row, idx) => {
    const cells = [...row.children];
    /* ticker row: "Cities | list", or (as authored before) one cell holding only a list */
    const tickerList = onlyList(cells.length > 1 ? cells[1] : cells[0]);
    if (tickerList) {
      ticker = buildTicker(cells.length > 1 ? cells[0] : null, tickerList);
      return;
    }
    if (cells.length === 1) {
      if (idx === 0 && cells[0].textContent.trim()) intro.append(...cells[0].childNodes);
      return;
    }
    const [numCell, labelCell] = cells;
    if (!numCell.textContent.trim()) return;
    const item = createTag('div', { class: 'stats-item' });
    const dt = createTag('dt');
    const dd = createTag('dd');
    dt.append(...labelCell.childNodes);
    dd.append(...numCell.childNodes);
    item.append(dt, dd);
    list.append(item);
  });

  const children = [];
  if (intro.textContent.trim()) children.push(intro);
  children.push(list);
  if (ticker) children.push(ticker);
  block.replaceChildren(...children);

  if (block.classList.contains('ink')) block.classList.add('surface-ink');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    if (!block.isConnected) return;
    list.querySelectorAll('dd').forEach(countUp);
  }, { threshold: 0.4 });
  observer.observe(list);
}
