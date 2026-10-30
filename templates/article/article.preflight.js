import { getMetadata } from '../../scripts/aem.js';

const isDate = (value) => /^\d+$/.test(value) || !Number.isNaN(new Date(value).getTime());

export default function validate(doc, main) {
  const issues = [];
  if (!main.querySelector('.hero h1')) {
    issues.push({
      message: 'Article has no hero block with an H1.',
      hint: 'Start the article with a hero block whose title is Heading 1.',
    });
  }
  if (!getMetadata('author', doc)) {
    issues.push({ message: 'Article has no author.', hint: 'Add Author to the page metadata.' });
  }
  const date = getMetadata('date', doc);
  if (!date) {
    issues.push({ message: 'Article has no date.', hint: 'Add Date to the page metadata.' });
  } else if (!isDate(date)) {
    issues.push({
      message: `Article date '${date}' is not a valid date.`,
      hint: 'Use a date such as 2026-09-21.',
    });
  }
  return issues;
}
