import { rows, cells } from '../../scripts/preflight/utils.js';

export default function validate(source) {
  const incomplete = rows(source)
    .map((row, i) => (cells(row).length < 2 ? i + 1 : null))
    .filter(Boolean);
  if (!incomplete.length) return [];
  return [{
    message: `Journey map row(s) ${incomplete.join(', ')} have fewer than two columns and are not shown.`,
    hint: 'Each row needs two columns: a step title and its content.',
  }];
}
