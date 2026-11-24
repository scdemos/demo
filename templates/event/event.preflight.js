import { getMetadata } from '../../scripts/aem.js';

const isDate = (value) => !Number.isNaN(new Date(value).getTime());

export default function validate(doc, main) {
  const issues = [];
  if (!main.querySelector('.hero h1')) {
    issues.push({
      message: 'Event has no hero block with an H1.',
      hint: 'Start the event page with a hero block whose title is Heading 1.',
    });
  }
  const date = getMetadata('date', doc);
  if (!date) {
    issues.push({ message: 'Event has no date.', hint: 'Add Date to the page metadata, such as 2026-12-06.' });
  } else if (!isDate(date)) {
    issues.push({ message: `Event date '${date}' is not a valid date.`, hint: 'Use a date such as 2026-12-06.' });
  }
  if (!getMetadata('location', doc)) {
    issues.push({ message: 'Event has no location.', hint: 'Add Location to the page metadata.' });
  }
  const keywords = getMetadata('keywords', doc).split(',').map((k) => k.trim().toLowerCase());
  if (!keywords.includes('events')) {
    issues.push({
      message: "Event page keywords don't include 'events', so it gets no event structured data.",
      hint: "Add 'events' to the Keywords page metadata.",
    });
  }
  return issues;
}
