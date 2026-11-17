import { getMetadata } from '../../scripts/aem.js';
import { createTag, formatDate } from '../../scripts/shared.js';

const FIELDS = [
  ['date', 'Date'],
  ['time', 'Time'],
  ['location', 'Where'],
  ['type', 'Type'],
];

export default function init(root = document) {
  const main = root.querySelector('main');
  const hero = main?.querySelector('.hero');
  if (!hero || main.querySelector('.event-meta')) return;

  const items = FIELDS.map(([key, label]) => {
    const value = getMetadata(key);
    if (!value) return null;
    let content = value;
    if (key === 'date') {
      const parsed = new Date(value);
      content = createTag('time', Number.isNaN(parsed.getTime()) ? {} : { datetime: value }, formatDate(value));
    }
    return createTag('div', {}, [createTag('dt', {}, getMetadata(`${key}-label`) || label), createTag('dd', {}, content)]);
  }).filter(Boolean);
  if (!items.length) return;

  hero.after(createTag('dl', { class: 'event-meta' }, items));
}
