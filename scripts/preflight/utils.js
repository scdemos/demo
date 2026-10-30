export const Alignment = Object.freeze({ YES: 'YES', NO: 'NO', NA: 'NA' });

export function result({
  id, title, alignment, reasoning, suggestions,
}) {
  const out = {
    id, title, alignment, reasoning,
  };
  if (suggestions) out.suggestions = suggestions;
  return out;
}

const unique = (values) => [...new Set(values.filter(Boolean))];

export function fromIssues(issues) {
  if (issues === null) return { alignment: Alignment.NA, reasoning: 'Not applicable to this page.' };
  if (!issues.length) return { alignment: Alignment.YES, reasoning: 'No issues found.' };
  return {
    alignment: Alignment.NO,
    reasoning: unique(issues.map(({ message }) => message)).join(' '),
    suggestions: unique(issues.map(({ hint }) => hint)).join(' '),
  };
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

export function nearest(value, candidates) {
  const [best] = candidates
    .filter((c) => typeof c === 'string')
    .map((c) => ({ c, d: distance(value, c) }))
    .sort((x, y) => x.d - y.d);
  return best && best.d <= Math.max(2, Math.floor(value.length / 3)) ? best.c : null;
}

export function didYouMean(value, candidates) {
  const suggestion = nearest(value, candidates);
  return suggestion ? `Did you mean '${suggestion}'?` : '';
}

export const matchesAny = (patterns, value) => patterns
  .some((p) => (p instanceof RegExp ? p.test(value) : p === value));

export const rows = (block) => [...block.children];

export const cells = (row) => [...row.children];

export const isEmpty = (el) => !el || (!el.textContent.trim() && !el.querySelector('picture, img, a'));
