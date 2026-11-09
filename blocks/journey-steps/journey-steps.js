import loadStudioData from '../journeys/studio-data.js';
import { createTag } from '../../scripts/shared.js';

/**
 * Journey steps: one row per demo step.
 * Columns: title + page link · what to say · capabilities (comma-separated names).
 * Capabilities that are not "Current" in /studio/capabilities.json get a caution note.
 * @param {Element} block
 */
export default async function decorate(block) {
  let studio;
  try {
    studio = await loadStudioData();
  } catch {
    studio = { label: (k) => k, capability: () => null, status: () => null };
  }
  const { label } = studio;
  const list = createTag('ol', { class: 'journey-steps-list' });

  [...block.children].forEach((row) => {
    const [head, say, caps] = [...row.children];
    if (!head) return;
    const link = head.querySelector('a');
    const title = head.querySelector('h1, h2, h3, h4, h5, h6')
      || createTag('h3', {}, head.textContent.trim());
    if (link) link.closest('p')?.remove();

    const item = createTag('li', { class: 'journey-steps-item' });
    const top = createTag('div', { class: 'journey-steps-head' }, [title]);
    if (link) {
      const page = link.getAttribute('href');
      top.append(createTag('a', {
        class: 'button', href: page, target: '_blank', rel: 'noopener',
      }, [
        label('openPage'),
        createTag('span', { class: 'visually-hidden' }, ` ${label('newTab')}`),
      ]));
      item.append(top, createTag('code', { class: 'journey-steps-path' }, page));
    } else {
      item.append(top);
    }

    if (say?.textContent.trim()) {
      const p = createTag('p', { class: 'journey-steps-say' }, [
        createTag('strong', {}, `${label('say')}: `),
        say.textContent.trim(),
      ]);
      item.append(p);
    }

    const names = (caps?.textContent || '').split(',').map((n) => n.trim()).filter(Boolean);
    if (names.length) {
      item.append(createTag('p', { class: 'journey-steps-caps' }, [
        createTag('strong', {}, `${label('capabilities')}: `),
        names.join(' · '),
      ]));
      names.map(studio.capability).filter((c) => c && c.status && c.status !== 'Current')
        .forEach((c) => item.append(createTag('p', { class: 'journey-steps-caution' }, [
          createTag('strong', {}, `${c.name}: ${c.status}.`),
          ` ${studio.status(c.status)?.description || ''}`,
        ])));
    }
    list.append(item);
  });

  block.replaceChildren(list);
}
