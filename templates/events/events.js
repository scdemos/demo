import { createTag, formatDate } from '../../scripts/shared.js';

export default function init(main) {
  const col = main.querySelector('.columns > div > div');
  if (!col) return;

  const metaPairs = {};
  const metaParas = [];

  col.querySelectorAll('p').forEach((p) => {
    const match = p.textContent.match(/^(.+?)\s*:\s*(.+)$/);
    if (match) {
      metaPairs[match[1].trim().toLowerCase()] = match[2].trim();
      metaParas.push(p);
    }
  });

  if (!Object.keys(metaPairs).length) return;

  const meta = createTag('dl', { class: 'event-meta' });

  if (metaPairs.date) {
    const formatted = formatDate(metaPairs.date);
    const time = createTag('time', { datetime: metaPairs.date }, formatted);
    meta.append(createTag('div', {}, [createTag('dt', {}, 'Date'), createTag('dd', { class: 'event-meta-date' }, time)]));
  }

  if (metaPairs.time) {
    meta.append(createTag('div', {}, [createTag('dt', {}, 'Time'), createTag('dd', { class: 'event-meta-time' }, metaPairs.time)]));
  }

  if (metaPairs.type) {
    const badge = createTag('span', { class: 'event-meta-badge' }, metaPairs.type);
    meta.append(createTag('div', {}, [createTag('dt', {}, 'Type'), createTag('dd', { class: 'event-meta-type' }, badge)]));
  }

  metaParas.forEach((p) => p.remove());
  col.append(meta);
}
