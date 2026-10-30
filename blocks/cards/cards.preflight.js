import { rows, isEmpty } from '../../scripts/preflight/utils.js';

export default function validate(source) {
  if (source.classList.contains('links')) {
    if (source.querySelector('a[href]')) return [];
    return [{
      message: 'Cards (links) block has no links.',
      hint: 'Add a list of links to the pages to show as cards.',
    }];
  }
  const all = rows(source);
  if (!all.length) {
    return [{ message: 'Cards block has no cards.', hint: 'Add one row per card.' }];
  }
  const empty = all.map((row, i) => (isEmpty(row) ? i + 1 : null)).filter(Boolean);
  if (!empty.length) return [];
  return [{
    message: `Cards block has empty row(s): ${empty.join(', ')}.`,
    hint: 'Add an image and text to each card row, or delete the empty rows.',
  }];
}
