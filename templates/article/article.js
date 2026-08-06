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

  // Two-column layout (matches the source blog): the LEFT column holds the hero
  // (title → image → byline) followed by the article body; the RIGHT column is a
  // sidebar built from sections flagged `Style: aside`. A .article-layout grid
  // wraps both so the sidebar aligns to the top next to the title.
  const contentSections = [...main.querySelectorAll(':scope > .section:not(.hero-container)')];
  if (contentSections.length && !main.querySelector('.article-layout')) {
    const layout = createTag('div', { class: 'article-layout' });
    const mainCol = createTag('div', { class: 'article-main' });
    const article = createTag('article', { class: 'article-body' });
    const asideSections = [];

    // Anchor the grid where the hero currently sits, then move the hero into
    // the left column so the sidebar can rise to the same top edge.
    (hero || contentSections[0]).before(layout);
    if (hero) mainCol.append(hero);

    contentSections.forEach((s) => {
      if (s.classList.contains('aside')) asideSections.push(s);
      else article.append(s);
    });

    mainCol.append(article);
    layout.append(mainCol);

    if (asideSections.length) {
      const aside = createTag('aside', { class: 'article-aside' });
      asideSections.forEach((s) => aside.append(s));
      layout.append(aside);
      layout.classList.add('has-aside');
    }
  }
}
