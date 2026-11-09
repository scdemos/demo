import { createTag, groupButtons } from '../../scripts/shared.js';

/**
 * Campaign: featured offer band.
 * Cells: picture · body (eyebrow p, h2, lede p, buttons) · optional meta `<ul>`
 * (each item: **value** label). Variants: ink, flame, reverse.
 * @param {Element} block
 */
export default function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  const media = createTag('div', { class: 'campaign-media' });
  const body = createTag('div', { class: 'campaign-body' });
  let meta;

  cells.forEach((cell) => {
    const hasHeading = cell.querySelector('h1, h2, h3');
    const picture = cell.querySelector('picture');
    if (picture && !hasHeading) {
      media.append(picture);
    } else if (!hasHeading && cell.querySelector('ul')) {
      meta = cell.querySelector('ul');
    } else {
      [...cell.children].forEach((el) => body.append(el));
    }
  });

  const heading = body.querySelector(':scope > :is(h1, h2, h3)');
  if (heading) {
    heading.classList.add('campaign-title');
    const prev = heading.previousElementSibling;
    if (prev?.tagName === 'P' && !prev.classList.contains('button-container')
      && prev.textContent.trim().length <= 80) {
      prev.classList.add('eyebrow');
    }
    const lede = [...body.querySelectorAll(':scope > p:not(.button-container, .eyebrow)')]
      .find((p) => heading.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (lede) lede.classList.add('lede');
  }

  if (meta) {
    meta.className = 'campaign-meta';
    [...meta.children].forEach((li) => {
      const strong = li.querySelector('strong');
      if (!strong) return;
      const label = createTag('span');
      [...li.childNodes].filter((n) => n !== strong).forEach((n) => label.append(n));
      label.textContent = label.textContent.trim();
      li.replaceChildren(strong, label);
    });
    const firstButton = body.querySelector(':scope > p.button-container');
    if (firstButton) firstButton.before(meta); else body.append(meta);
  }

  groupButtons(body);

  const inner = createTag('div', { class: 'campaign-inner' });
  if (media.children.length) inner.append(media); else block.classList.add('no-image');
  inner.append(body);

  if (block.classList.contains('ink')) block.classList.add('surface-ink');
  if (block.classList.contains('flame')) block.classList.add('surface-flame');
  block.replaceChildren(inner);
}
