import { getMetadata } from '../../scripts/aem.js';
import { createTag, formatDate } from '../../scripts/shared.js';

/**
 * AEM Content Fragments store a date as milliseconds at UTC midnight: read it as that calendar
 * day (YYYY-MM-DD), or it shows as the day before in the Americas.
 */
function calendarDate(value) {
  const text = String(value || '').trim();
  if (!/^[0-9]{12,}$/.test(text)) return text;
  const date = new Date(Number(text));
  if (Number.isNaN(date.getTime()) || date.getUTCHours() || date.getUTCMinutes()) return text;
  return date.toISOString().slice(0, 10);
}

function buildByline() {
  const author = getMetadata('author');
  // a press release has a dateline city instead of an author
  const dateline = author ? '' : getMetadata('dateline');
  // press releases from AEM Content Fragments carry their date as publisheddate
  const date = calendarDate(getMetadata('date') || getMetadata('publisheddate'));
  if (!author && !dateline && !date) return null;

  const byline = createTag('p', { class: 'hero-note article-byline' });
  if (author) byline.append('By ', createTag('strong', { class: 'article-author' }, author));
  if (dateline) byline.append(createTag('strong', { class: 'article-dateline' }, dateline));
  if ((author || dateline) && date) byline.append(' · ');
  if (date) {
    const parsed = new Date(date);
    let attrs = Number.isNaN(parsed.getTime()) ? {} : { datetime: parsed.toISOString().slice(0, 10) };
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) attrs = { datetime: date };
    byline.append(createTag('time', { class: 'article-date', ...attrs }, formatDate(date)));
  }
  return byline;
}

export default function init(root = document) {
  const main = root.querySelector('main');
  if (!main) return;

  const heroBody = main.querySelector('.hero .hero-body, .hero .hero-content');
  if (heroBody && !heroBody.querySelector('.hero-note')) {
    const byline = buildByline();
    if (byline) heroBody.append(byline);
  }
}
