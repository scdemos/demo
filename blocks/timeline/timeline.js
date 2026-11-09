import { createTag } from '../../scripts/shared.js';
import { toClassName } from '../../scripts/aem.js';

/**
 * Timeline (What's New): newest first.
 * Rows: date cell (ISO `2026-10-20` or written date) + content cell
 * (optional short category line, heading, text, link).
 * @param {Element} block
 */

const pad = (n) => String(n).padStart(2, '0');

function buildTime(text) {
  const lang = document.documentElement.lang || 'en-US';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const label = new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    return createTag('time', { datetime: text }, label);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return createTag('span', { class: 'timeline-date' }, text);
  const datetime = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  return createTag('time', { datetime }, text);
}

export default function decorate(block) {
  const ol = createTag('ol', { class: 'timeline-list' });
  [...block.children].forEach((row) => {
    const [dateCell, contentCell] = row.children;
    if (!contentCell) return;
    const li = createTag('li');
    const body = createTag('div', { class: 'timeline-body' });
    [...contentCell.children].forEach((el) => body.append(el));

    const heading = body.querySelector('h2, h3, h4');
    if (heading) {
      const prev = heading.previousElementSibling;
      if (prev?.tagName === 'P' && !prev.querySelector('a') && prev.textContent.trim().length <= 30) {
        prev.className = 'timeline-tag';
      }
      li.id = heading.id || toClassName(heading.textContent);
      if (heading.id) heading.removeAttribute('id');
    }

    li.append(buildTime(dateCell.textContent.trim()), body);
    ol.append(li);
  });
  block.replaceChildren(ol);
}
