import { getMetadata } from '../../scripts/aem.js';
import { createTag, formatDate } from '../../scripts/shared.js';

function buildAuthorDate() {
  const author = getMetadata('author');
  const date = getMetadata('date');
  if (!author && !date) return null;

  const container = createTag('div', { class: 'article-author-container' });

  if (author) {
    container.append(createTag('span', { class: 'article-author' }, `By ${author}`));
  }

  if (date) {
    const parsed = new Date(String(date).trim());
    const datetime = !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
    const formatted = formatDate(date);
    const time = createTag('time', datetime ? { datetime } : {}, formatted);
    container.append(createTag('span', { class: 'article-date' }, time));
  }

  return container;
}

export default function init(root = document) {
  const main = root.querySelector('main');
  if (!main) return;

  const hero = main.querySelector('.hero');

  // Byline sits BELOW the hero image (matches the source blog: title → image →
  // author/date). Append it to the hero itself, not the title cell, and let CSS
  // order place it last.
  if (hero && !hero.querySelector('.article-author-container')) {
    const authorDate = buildAuthorDate();
    if (authorDate) hero.append(authorDate);
  }

  // Wrap all non-hero content sections in <article> for semantic correctness
  const contentSections = [...main.querySelectorAll(':scope > .section:not(.hero-container)')];
  if (contentSections.length && !main.querySelector('article.article-body')) {
    const article = createTag('article', { class: 'article-body' });
    contentSections[0].before(article);
    contentSections.forEach((s) => article.append(s));
  }
}
