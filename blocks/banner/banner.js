/**
 * Split banner: image + copy (heading, body, CTA).
 *
 * Authoring (Word / Google Docs block table, one row, two cells):
 * | banner |
 * | picture + optional caption | h2, paragraph(s), link or button (e.g. Take a Tour) |
 *
 * Block variants (optional class on the block row): split-50 | split-60 (default)
 */
export default function decorate(block) {
  const row = block.querySelector(':scope > div');
  if (!row || row.children.length < 2) return;

  const [media, copy] = row.children;
  media.classList.add('banner-media');
  copy.classList.add('banner-copy');

  if (!block.classList.contains('split-50') && !block.classList.contains('split-60')) {
    block.classList.add('split-60');
  }

  const heading = copy.querySelector('h2, h3');
  if (heading) {
    const id = heading.id || `banner-heading-${Math.random().toString(36).slice(2, 9)}`;
    if (!heading.id) heading.id = id;
    block.setAttribute('role', 'region');
    block.setAttribute('aria-labelledby', heading.id);
  }
}
