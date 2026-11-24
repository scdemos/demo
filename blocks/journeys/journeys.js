import loadStudioData, { STUDIO_ROOT } from './studio-data.js';
import { createTag } from '../../scripts/shared.js';

const INDEX = `${STUDIO_ROOT}/journeys.json`;

/** Journeys from authored links in the block (fetches each page's metadata). */
async function fromLinks(links) {
  return Promise.all(links.map(async (a) => {
    const path = new URL(a.href, window.location.href).pathname;
    try {
      const resp = await fetch(path);
      const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
      const meta = (name) => doc.querySelector(`meta[name="${name}"]`)?.content || '';
      return {
        path,
        title: doc.querySelector('h1')?.textContent.trim() || a.textContent.trim(),
        description: meta('description'),
        persona: meta('persona'),
      };
    } catch {
      return { path, title: a.textContent.trim() };
    }
  }));
}

/** Journeys from the query index (pages using the `journey` template). */
async function fromIndex(source) {
  const resp = await fetch(source);
  if (!resp.ok) throw new Error(`${source}: HTTP ${resp.status}`);
  const { data = [] } = await resp.json();
  return data.filter((row) => !row.template || row.template === 'journey');
}

function renderList(block, journeys, label) {
  const search = createTag('input', {
    type: 'search', class: 'journeys-search', 'aria-label': label('search'), placeholder: label('search'),
  });
  const count = createTag('p', { class: 'journeys-count', role: 'status', 'aria-live': 'polite' });
  const list = createTag('ul', { class: 'journeys-list' });
  const text = (j) => [j.title, j.description, j.persona].join(' ').toLowerCase();

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const visible = journeys.filter((j) => !q || text(j).includes(q));
    list.replaceChildren(...visible.map((j) => createTag('li', {}, createTag('a', { class: 'journeys-row', href: j.path }, [
      createTag('span', { class: 'journeys-row-title' }, j.title),
      j.description ? createTag('span', { class: 'journeys-row-quote' }, `“${j.description}”`) : null,
      j.persona ? createTag('span', { class: 'journeys-row-meta' }, j.persona) : null,
    ]))));
    count.textContent = visible.length
      ? label('showing', { count: visible.length, total: journeys.length })
      : label('noResults');
  };
  search.addEventListener('input', render);
  render();
  block.replaceChildren(search, count, list);
}

/** Capability map: capabilities by group; only non-live statuses are called out. */
function renderMap(block, studio) {
  const caution = (c) => c.status && c.status !== 'Current';
  const used = new Set(studio.capabilities.filter(caution).map((c) => c.status));
  const groups = studio.groups.map((g) => {
    const caps = studio.capabilities.filter((c) => c.group === g.id);
    if (!caps.length) return null;
    return createTag('div', { class: 'journeys-map-group' }, [
      createTag('h3', {}, g.id),
      createTag('p', { class: 'journeys-map-summary' }, g.summary),
      createTag('ul', {}, caps.map((c) => createTag('li', {}, [
        c.name,
        caution(c) ? createTag('span', { class: 'journeys-map-status' }, ` · ${c.status}`) : null,
      ]))),
    ]);
  });
  const legend = createTag('dl', { class: 'journeys-map-legend' }, studio.statuses
    .filter((s) => used.has(s.id))
    .flatMap((s) => [createTag('dt', {}, s.id), createTag('dd', {}, s.description)]));
  block.replaceChildren(createTag('div', { class: 'journeys-map-grid' }, groups), legend);
}

/**
 * Studio journeys list. Content: links to journey pages (optional; order is kept).
 * Without links, journeys come from the query index at /studio/journeys.json.
 * Variant `map`: capability map from /studio/capabilities.json.
 * @param {Element} block
 */
export default async function decorate(block) {
  const links = [...block.querySelectorAll('a[href]')];
  const status = createTag('p', { class: 'journeys-count', role: 'status' });
  block.replaceChildren(status);

  let studio;
  try {
    studio = await loadStudioData();
    if (block.classList.contains('map')) {
      renderMap(block, studio);
      return;
    }
    const journeys = links.length ? await fromLinks(links) : await fromIndex(INDEX);
    renderList(block, journeys, studio.label);
  } catch (error) {
    status.textContent = studio?.label('loadError') || error.message;
    status.classList.add('is-error');
  }
}
