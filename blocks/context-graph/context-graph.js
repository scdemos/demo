/*
 * Context graph — a central "Enterprise Context Graph" image ringed by
 * selectable platform nodes (Bodhi / Slingshot / Sustain), with a persistent
 * row of platform tiles below. Selecting a platform (via a ring node OR a tile)
 * highlights it and dims the others; the ring nodes and tiles stay in sync.
 *
 * Authoring model (one row per part):
 *   Row 1  → single cell containing the center graph image.
 *   Rows 2+ → one platform each, two cells:
 *     • cell A: node label — heading (name) + optional tagline paragraph
 *     • cell B: detail — description paragraph(s) + optional "Learn more" link
 * Platforms are placed around the dome by order: 1st=left, 2nd=top, 3rd=right.
 */

const POSITIONS = ['left', 'top', 'right'];

export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length < 2) return;

  const [centerRow, ...platformRows] = rows;

  const stage = document.createElement('div');
  stage.className = 'context-graph-stage';
  stage.setAttribute('role', 'tablist');
  stage.setAttribute('aria-label', 'Platforms');

  // Center image — kept as the authored <img>, served as-is (no optimization
  // resize, no cropping) so the graph renders at full fidelity.
  const center = document.createElement('div');
  center.className = 'context-graph-center';
  const img = centerRow.querySelector('img');
  if (img) center.append(img);
  stage.append(center);

  const tiles = document.createElement('div');
  tiles.className = 'context-graph-tiles';

  const nodes = [];
  const tileEls = [];

  platformRows.forEach((row, i) => {
    const cells = [...row.children];
    const labelCell = cells[0];
    const detailCell = cells[1];

    const heading = labelCell?.querySelector('h1, h2, h3, h4, h5, h6');
    const name = heading?.textContent?.trim() || labelCell?.textContent?.trim() || `Platform ${i + 1}`;
    const id = `ctx-graph-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

    // Ring node (label around the dome): keeps the name + tagline.
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'context-graph-node';
    node.dataset.position = POSITIONS[i] || 'top';
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-controls', `${id}-tile`);
    node.id = `${id}-node`;
    while (labelCell?.firstChild) node.append(labelCell.firstChild);
    stage.append(node);
    nodes.push(node);

    // Tile below (always visible): name heading + description + link.
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'context-graph-tile';
    tile.id = `${id}-tile`;
    const tileHeading = document.createElement('h3');
    tileHeading.textContent = name;
    tile.append(tileHeading);
    if (detailCell) {
      while (detailCell.firstChild) tile.append(detailCell.firstChild);
    }
    tiles.append(tile);
    tileEls.push(tile);
  });

  block.replaceChildren(stage, tiles);

  const select = (index) => {
    nodes.forEach((node, i) => {
      const active = i === index;
      node.classList.toggle('is-active', active);
      node.classList.toggle('is-dimmed', !active);
      node.setAttribute('aria-selected', active ? 'true' : 'false');
      node.tabIndex = active ? 0 : -1;
    });
    tileEls.forEach((tile, i) => {
      const active = i === index;
      tile.classList.toggle('is-active', active);
      tile.classList.toggle('is-dimmed', !active);
    });
  };

  const bindKeys = (els, i) => (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (i + 1) % els.length;
      els[next].focus();
      select(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (i - 1 + els.length) % els.length;
      els[prev].focus();
      select(prev);
    }
  };

  nodes.forEach((node, i) => {
    node.addEventListener('click', () => select(i));
    node.addEventListener('keydown', bindKeys(nodes, i));
  });
  tileEls.forEach((tile, i) => {
    tile.addEventListener('click', () => select(i));
    tile.addEventListener('keydown', bindKeys(tileEls, i));
  });

  select(0);
}
