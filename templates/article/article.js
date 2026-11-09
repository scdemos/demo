import { getMetadata } from '../../scripts/aem.js';
import { createTag, formatDate } from '../../scripts/shared.js';

function buildByline() {
  const author = getMetadata('author');
  const date = getMetadata('date');
  if (!author && !date) return null;

  const byline = createTag('p', { class: 'hero-note article-byline' });
  if (author) byline.append('By ', createTag('strong', { class: 'article-author' }, author));
  if (author && date) byline.append(' · ');
  if (date) {
    const parsed = new Date(String(date).trim());
    const attrs = Number.isNaN(parsed.getTime()) ? {} : { datetime: parsed.toISOString().slice(0, 10) };
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
