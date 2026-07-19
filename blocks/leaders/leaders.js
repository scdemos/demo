import { createOptimizedPicture } from '../../scripts/aem.js';
import { createTag } from '../../scripts/shared.js';

/*
 * Leaders — a row of people cards. Each card shows a photo with an email +
 * LinkedIn icon overlay at the bottom-right, then the person's name and title.
 * Authored one row per person, five cells:
 *   1. Photo
 *   2. Name
 *   3. Title
 *   4. LinkedIn profile URL (link or plain text URL) — optional
 *   5. Email address — optional
 * Source: publicissapient.com/industries/financial-services
 */

function firstLink(cell) {
  const a = cell?.querySelector('a');
  if (a) return a.getAttribute('href');
  const text = cell?.textContent.trim();
  return text || null;
}

export default function decorate(block) {
  const ul = createTag('ul', { class: 'leaders-list' });

  [...block.children].forEach((row) => {
    const [photoCell, nameCell, titleCell, linkedinCell, emailCell] = row.children;
    const name = nameCell?.textContent.trim() || '';

    const li = createTag('li', { class: 'leaders-card' });

    // ----- Photo tile with contact overlay -----
    const tile = createTag('div', { class: 'leaders-photo' });
    const img = photoCell?.querySelector('img');
    if (img) {
      tile.append(createOptimizedPicture(img.src, name, false, [{ width: '750' }]));
    }

    const actions = createTag('div', { class: 'leaders-actions' });
    const email = firstLink(emailCell);
    if (email) {
      const href = email.startsWith('mailto:') ? email : `mailto:${email}`;
      actions.append(createTag('a', {
        href,
        class: 'leaders-action leaders-email',
        'aria-label': `Contact ${name}`,
      }));
    }
    const linkedin = firstLink(linkedinCell);
    if (linkedin) {
      actions.append(createTag('a', {
        href: linkedin,
        class: 'leaders-action leaders-linkedin',
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': `View ${name}'s LinkedIn profile (opens in new tab)`,
      }));
    }
    if (actions.children.length) tile.append(actions);
    li.append(tile);

    // ----- Name + title -----
    const body = createTag('div', { class: 'leaders-body' });
    if (name) body.append(createTag('p', { class: 'leaders-name' }, name));
    const title = titleCell?.textContent.trim();
    if (title) body.append(createTag('p', { class: 'leaders-title' }, title));
    li.append(body);

    ul.append(li);
  });

  block.replaceChildren(ul);
}
