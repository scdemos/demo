import { rows, cells } from '../../scripts/preflight/utils.js';

export default function validate(source) {
  const [first] = rows(source);
  if (first && cells(first).length) return [];
  return [{
    message: 'Columns block is empty.',
    hint: 'Add at least one row with one or more columns, or remove the block.',
  }];
}
