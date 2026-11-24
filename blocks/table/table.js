/*
 * Table Block
 * Recreate a table
 * https://www.hlx.live/developer/block-collection/table
 */

function buildCell(rowIndex) {
  const cell = rowIndex ? document.createElement('td') : document.createElement('th');
  if (!rowIndex) cell.setAttribute('scope', 'col');
  return cell;
}

function findLabel(block, caption) {
  if (caption) return caption.textContent.trim();
  const wrapper = block.parentElement;
  let el = wrapper?.previousElementSibling;
  while (el) {
    const headings = /^H[1-6]$/.test(el.tagName) ? [el] : el.querySelectorAll('h2, h3, h4');
    if (headings.length) return headings[headings.length - 1].textContent.trim();
    el = el.previousElementSibling;
  }
  return '';
}

function decorateCompare(table) {
  const featured = [];
  table.querySelectorAll('thead th').forEach((th, i) => {
    const strong = th.querySelector(':scope > strong:only-child, :scope > p:only-child > strong:only-child');
    if (strong) {
      featured.push(i);
      th.textContent = th.textContent.trim();
    }
  });
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const first = tr.firstElementChild;
    if (first && first.tagName === 'TD') {
      const th = document.createElement('th');
      th.setAttribute('scope', 'row');
      th.append(...first.childNodes);
      th.style.cssText = first.style.cssText;
      first.replaceWith(th);
    }
  });
  if (!featured.length) return;
  table.querySelectorAll('tr').forEach((tr) => {
    featured.forEach((i) => tr.children[i]?.classList.add('is-featured'));
  });
}

export default function decorate(block) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const rows = [...block.children];
  let caption;
  if (rows.length > 1 && rows[0].children.length === 1 && rows[1].children.length > 1) {
    caption = document.createElement('caption');
    caption.append(...rows.shift().firstElementChild.childNodes);
    table.append(caption);
  }

  const header = !block.classList.contains('no-header');
  if (header) table.append(thead);
  table.append(tbody);

  rows.forEach((child, i) => {
    const row = document.createElement('tr');
    if (header && i === 0) thead.append(row);
    else tbody.append(row);
    [...child.children].forEach((col) => {
      const cell = buildCell(header ? i : i + 1);
      const align = col.getAttribute('data-align');
      const valign = col.getAttribute('data-valign');
      if (align) cell.style.textAlign = align;
      if (valign) cell.style.verticalAlign = valign;
      cell.append(...col.childNodes);
      row.append(cell);
    });
  });

  if (block.classList.contains('compare')) decorateCompare(table);

  block.replaceChildren(table);

  block.setAttribute('role', 'region');
  block.setAttribute('tabindex', '0');
  const label = findLabel(block, caption);
  if (label) block.setAttribute('aria-label', label);
}
