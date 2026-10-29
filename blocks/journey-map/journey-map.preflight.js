import { rows, cells, isEmpty } from '../../scripts/preflight/utils.js';

export default function validate(source) {
  const incomplete = rows(source)
    .map((row, i) => {
      const [title, content] = cells(row);
      return isEmpty(title) || isEmpty(content) ? i + 1 : null;
    })
    .filter(Boolean);
  if (!incomplete.length) return [];
  return [{
    message: `Journey map row(s) ${incomplete.join(', ')} are missing a title or content and are not shown.`,
    hint: 'Each row needs two columns: a step title and its content.',
  }];
}
