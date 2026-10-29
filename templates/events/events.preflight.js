import { getMetadata } from '../../scripts/aem.js';

const isDate = (value) => /^\d+$/.test(value) || !Number.isNaN(new Date(value).getTime());

function readDetails(cell) {
  const details = {};
  cell?.querySelectorAll('p').forEach((p) => {
    const match = p.textContent.match(/^(.+?)\s*:\s*(.+)$/);
    if (match) details[match[1].trim().toLowerCase()] = match[2].trim();
  });
  return details;
}

export default function validate(doc, sourceOf) {
  const issues = [];
  const columns = doc.querySelector('main .columns');
  const source = columns && sourceOf(columns);
  const details = readDetails(source?.querySelector(':scope > div > div'));
  if (!details.date) {
    issues.push({
      message: 'Event has no date.',
      hint: "Add a 'Date: 2026-09-21' line to the first column of the first columns block.",
    });
  } else if (!isDate(details.date)) {
    issues.push({
      message: `Event date '${details.date}' is not a valid date.`,
      hint: 'Use a date such as 2026-09-21.',
    });
  }
  const keywords = getMetadata('keywords', doc).split(',').map((k) => k.trim().toLowerCase());
  if (!keywords.includes('events')) {
    issues.push({
      message: "Event page keywords don't include 'events', so it is missing from event listings and event structured data.",
      hint: "Add 'events' to the Keywords page metadata.",
    });
  }
  return issues;
}
