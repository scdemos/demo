/*
 * Search over the site's query index.
 *
 * Variants (in the block name, e.g. "Search (AI)"):
 *   none  keyword search with optional filters and sort
 *   ai    natural-language search that answers with AI (search-ai.js)
 *   tabs  one search box, with keyword "Results" and an "AI answer" tab
 *
 * Keyword rows: view (cards | list), keywords, excluded-keywords, searchbar (enabled |
 * disabled); any other row is a filter group whose value lists its options.
 * AI rows: see search-ai.js. Any key of LABELS overrides that text.
 */
import { loadCSS, readBlockConfig, toClassName } from '../../scripts/aem.js';
import {
  createTag,
  safeLabel,
  trackEvent,
  fetchQueryIndexPage,
  formatDate,
  getContentTimestamp,
  getArticleKeywords,
  inCurrentMarket,
  normalizePath,
  parseKeywords,
} from '../../scripts/shared.js';

const PAGE_SIZE = 15;
const FETCH_LIMIT = 500;
const RESERVED_CONFIG_KEYS = ['view', 'keywords', 'excluded-keywords', 'searchbar'];
// short words such as "how", "do", "I" don't have to match in a natural-language query
const MIN_TERM_LENGTH = 3;

export const LABELS = {
  placeholder: 'Search',
  'search-button': 'Search',
  filters: 'Filters',
  'filter-results': 'Filter results',
  'sort-by': 'Sort by',
  sort: 'Sort',
  relevance: 'Best match',
  newest: 'Newest',
  oldest: 'Oldest',
  'no-matches': 'No matching results.',
  'load-more': 'Load More',
  loading: 'Loading...',
  'status-query': 'Showing {shown} of {total} results for "{query}".',
  'status-filters': 'Showing {shown} of {total} for {count} selected filters.',
  'status-filter': 'Showing {shown} of {total} for 1 selected filter.',
  'status-all': 'Showing all {total} results.',
};

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));

function parseFilterGroupsFromConfig(config, reserved) {
  return Object.entries(config)
    .filter(([key]) => !reserved.includes(key))
    .map(([key, value]) => {
      const options = String(value || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => ({ key: toClassName(v), label: v, match: v.toLowerCase() }));
      if (!options.length) return null;
      const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ');
      return { key, label, options };
    })
    .filter(Boolean);
}

function getGroupMatches(row, group) {
  if (group.key === 'type') {
    const template = String(row.template || '').toLowerCase();
    return group.options
      .filter((opt) => template === opt.match)
      .map((opt) => opt.key);
  }
  const rowKeywords = parseKeywords(getArticleKeywords(row)).map((k) => k.toLowerCase());
  return group.options
    .filter((opt) => rowKeywords.some((rk) => rk === opt.match || rk.includes(opt.match)))
    .map((opt) => opt.key);
}

function rowMatchesFilterGroups(row, selectedByGroup, filterGroups) {
  return filterGroups.every((group) => {
    const selected = selectedByGroup.get(group.key) || [];
    if (!selected.length) return true;
    const values = getGroupMatches(row, group);
    return selected.some((v) => values.includes(v));
  });
}

function getSelectedByGroupFromBlock(block, filterGroups) {
  const map = new Map();
  filterGroups.forEach((group) => {
    const inputs = block.querySelectorAll(`input[data-group="${group.key}"]:checked`);
    map.set(group.key, [...inputs].map((i) => i.value));
  });
  return map;
}

function matchesKeywords(row, keywords) {
  if (!keywords.length) return true;
  const rowKeywords = parseKeywords(getArticleKeywords(row));
  return keywords.some((k) => rowKeywords.some((rk) => rk === k || rk.includes(k)));
}

function matchesExcluded(row, excluded) {
  if (!excluded.length) return false;
  const rowKeywords = parseKeywords(getArticleKeywords(row));
  return excluded.some((k) => rowKeywords.some((rk) => rk === k || rk.includes(k)));
}

function rowText(row) {
  return [row.title, row.description, row.path, getArticleKeywords(row)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesQuery(row, query) {
  if (!query) return true;
  const text = rowText(row);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => text.includes(term));
}

// For questions: how many of the query's words a row contains.
function queryScore(row, query) {
  const text = rowText(row);
  const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u))]
    .filter((t) => t.length >= MIN_TERM_LENGTH);
  if (!terms.length) return matchesQuery(row, query) ? 1 : 0;
  const hits = terms.filter((t) => text.includes(t)).length;
  return hits >= Math.ceil(terms.length / 2) ? hits : 0;
}

function isMatch(row, keywords, excluded) {
  return (
    row?.path
    && row?.title
    && inCurrentMarket(row.path)
    && matchesKeywords(row, keywords)
    && !matchesExcluded(row, excluded)
  );
}

async function fetchMatchingRows(state, keywords, excluded, query, neededCount) {
  if (state.rows.length >= neededCount || !state.hasMore) return;
  const batch = await fetchQueryIndexPage(state.offset, FETCH_LIMIT);
  state.offset += batch.length;
  state.hasMore = batch.length === FETCH_LIMIT;
  batch
    .filter((row) => isMatch(row, keywords, excluded))
    .forEach((row) => {
      if (!state.pathSet.has(row.path)) {
        state.pathSet.add(row.path);
        state.rows.push(row);
      }
    });
  await fetchMatchingRows(state, keywords, excluded, query, neededCount);
}

function buildResultItem(row, view, filterGroups) {
  const href = normalizePath(row.path);
  const link = createTag('a', { href, class: 'search-result-link' });
  if (view === 'cards') {
    link.append(createTag('div', { class: 'search-result-strip' }));
  }
  const content = createTag('div', { class: 'search-result-content' });
  content.append(createTag('h3', {}, row.title || href));
  if (row.description) {
    content.append(createTag('p', { class: 'search-result-description' }, row.description));
  }
  const author = row.author || row.authors || row.byline || '';
  const date = row.date || row.publisheddate || row.lastModified;
  if (author || date) {
    const meta = createTag('p', { class: 'search-result-meta' });
    if (author) meta.append(createTag('span', { class: 'search-result-author' }, String(author)));
    if (author && date) meta.append(createTag('span', { class: 'search-result-meta-sep' }, ' • '));
    if (date) meta.append(createTag('span', { class: 'search-result-date' }, formatDate(date)));
    content.append(meta);
  }
  link.append(content);
  const li = createTag('li', { class: `search-result ${view === 'cards' ? 'is-card' : 'is-list'}` }, link);
  li.dataset.time = String(getContentTimestamp(row));
  if (filterGroups?.length) {
    filterGroups.forEach((group) => {
      const values = getGroupMatches(row, group);
      li.setAttribute(`data-filter-${group.key}`, values.join(','));
    });
  }
  return li;
}

function sortByDate(rows, order) {
  const out = [...rows];
  out.sort((a, b) => {
    const ta = getContentTimestamp(a);
    const tb = getContentTimestamp(b);
    return order === 'oldest' ? ta - tb : tb - ta;
  });
  return out;
}

function sortOptions(label, loose) {
  return [...(loose ? ['relevance'] : []), 'newest', 'oldest']
    .map((value) => createTag('option', { value }, label(value)));
}

function buildFilterSidebar(filterGroups, listId, idPrefix, sortSelectId, label, loose) {
  const panelId = `${idPrefix}-filters-panel`;
  const aside = createTag('aside', {
    class: 'search-filters',
    role: 'region',
    'aria-label': label('filter-results'),
  });

  const toggle = createTag('button', {
    type: 'button',
    class: 'search-filters-toggle',
    'aria-expanded': 'false',
    'aria-controls': panelId,
  }, label('filters'));
  aside.append(toggle);

  const panel = createTag('div', {
    id: panelId,
    class: 'search-filters-panel',
  });

  const sortWrap = createTag('div', { class: 'search-filters-sort' });
  sortWrap.append(createTag('label', { for: sortSelectId }, label('sort-by')));
  const select = createTag('select', { id: sortSelectId, name: 'search-sort', 'aria-controls': listId });
  select.append(...sortOptions(label, loose));
  sortWrap.append(select);
  panel.append(sortWrap);

  const list = createTag('div', { class: 'search-filter-list' });
  filterGroups.forEach((group) => {
    const groupEl = createTag('div', { class: 'search-filter-group' });
    groupEl.append(createTag('p', { class: 'search-filter-group-title' }, group.label));
    group.options.forEach((option) => {
      const id = `${idPrefix}-${group.key}-${option.key}`;
      const input = createTag('input', {
        id,
        type: 'checkbox',
        name: `search-filter-${group.key}`,
        'data-group': group.key,
        value: option.key,
        'aria-controls': listId,
      });
      const labelEl = createTag('label', { for: id }, `${option.label} (0)`);
      groupEl.append(createTag('div', { class: 'search-filter-item' }, [input, labelEl]));
    });
    list.append(groupEl);
  });
  panel.append(list);
  aside.append(panel);

  toggle.addEventListener('click', () => {
    const expanded = aside.classList.toggle('is-expanded');
    toggle.setAttribute('aria-expanded', String(expanded));
  });

  return { aside, sortSelect: select };
}

function updateFilterCounts(block, filterGroups, rows) {
  const groupCounts = new Map(
    filterGroups.map((g) => [g.key, new Map(g.options.map((o) => [o.key, 0]))]),
  );
  rows.forEach((row) => {
    filterGroups.forEach((group) => {
      getGroupMatches(row, group).forEach((value) => {
        const m = groupCounts.get(group.key);
        if (m) m.set(value, (m.get(value) || 0) + 1);
      });
    });
  });
  const labelMap = new Map(
    filterGroups.map((g) => [g.key, new Map(g.options.map((o) => [o.key, o.label]))]),
  );
  block.querySelectorAll('input[data-group]').forEach((input) => {
    const groupKey = input.dataset.group;
    const count = groupCounts.get(groupKey)?.get(input.value) || 0;
    input.disabled = count === 0;
    const label = block.querySelector(`label[for="${input.id}"]`);
    if (label) label.textContent = `${labelMap.get(groupKey)?.get(input.value) || input.value} (${count})`;
  });
}

/**
 * Keyword search rendered into `root`.
 * @param {Element} root
 * @param {object} config block config
 * @param {object} options
 *   form: show its own search bar (when the searchbar row is enabled)
 *   loose: rank rows by how many query words they contain, for natural-language questions
 *   reserved: more config keys that are not filters
 *   label: text lookup
 * @returns {Promise<{search: (query: string) => Promise<void>}>}
 */
export async function keywordSearch(root, config, {
  form: ownForm = true, loose = false, reserved = [], label = (key) => config[key] || LABELS[key],
} = {}) {
  const viewVal = Array.isArray(config.view) ? config.view[0] : config.view;
  const view = String(viewVal || 'cards').trim().toLowerCase() === 'list' ? 'list' : 'cards';
  const keywords = parseKeywords(config.keywords || '');
  const excluded = parseKeywords(config['excluded-keywords'] || '');
  const searchBarEnabled = String(config.searchbar || '').trim().toLowerCase() === 'enabled';
  const initialQuery = (new URLSearchParams(window.location.search).get('q') || '').trim();
  const filterGroups = parseFilterGroupsFromConfig(
    config,
    [...RESERVED_CONFIG_KEYS, ...Object.keys(LABELS), ...reserved],
  );

  const state = {
    offset: 0,
    hasMore: true,
    rows: [],
    pathSet: new Set(),
    displayCount: PAGE_SIZE,
    query: initialQuery,
    sort: loose ? 'relevance' : 'newest',
    loading: false,
  };

  const listId = `search-list-${Date.now()}`;
  const idPrefix = `search-${Date.now()}`;
  const sortSelectId = `search-sort-${Date.now()}`;

  const controls = createTag('div', { class: 'search-controls' });
  const resultsWrap = createTag('div', { class: 'search-results-wrap' });
  const status = createTag('p', { class: 'search-status', role: 'status', 'aria-live': 'polite' });
  const list = createTag('ul', { class: `search-results search-results-${view}`, id: listId });
  const empty = createTag('p', { class: 'search-empty', hidden: true }, label('no-matches'));
  const loadMore = createTag('button', {
    type: 'button',
    class: 'search-load-more search-load-more-hidden button secondary',
  }, label('load-more'));
  resultsWrap.append(status, list, loadMore, empty);

  async function render() {
    state.loading = true;
    loadMore.disabled = true;
    loadMore.textContent = label('loading');

    try {
      const needed = state.displayCount;
      await fetchMatchingRows(state, keywords, excluded, state.query, needed);

      const sortBy = root.querySelector('select[name="search-sort"]')?.value || state.sort;
      state.sort = sortBy;

      const scores = new Map();
      const inQuery = (row) => {
        if (!loose || !state.query) return matchesQuery(row, state.query);
        if (!scores.has(row)) scores.set(row, queryScore(row, state.query));
        return scores.get(row) > 0;
      };
      let filtered = state.rows.filter(inQuery);
      if (filterGroups.length > 0) {
        const selectedByGroup = getSelectedByGroupFromBlock(root, filterGroups);
        const matchesFilter = (row) => rowMatchesFilterGroups(row, selectedByGroup, filterGroups);
        const queryRows = filtered;
        filtered = filtered.filter(matchesFilter);
        updateFilterCounts(root, filterGroups, queryRows);
      }

      let sorted = sortByDate(filtered, state.sort === 'oldest' ? 'oldest' : 'newest');
      // best match first, newest first among equal matches (sort is stable)
      if (state.sort === 'relevance' && scores.size) {
        sorted = sorted.sort((a, b) => scores.get(b) - scores.get(a));
      }
      const visible = sorted.slice(0, state.displayCount);

      list.textContent = '';
      visible.forEach((row) => list.append(buildResultItem(row, view, filterGroups)));

      empty.hidden = visible.length > 0;

      if (state.query) {
        status.hidden = false;
        const n = visible.length;
        const total = filtered.length;
        status.textContent = fill(label('status-query'), { shown: n, total, query: state.query });
      } else if (filterGroups.length > 0) {
        const selectedCount = filterGroups.reduce((sum, g) => {
          const selected = getSelectedByGroupFromBlock(root, filterGroups).get(g.key) || [];
          return sum + selected.length;
        }, 0);
        status.hidden = false;
        const values = { shown: visible.length, total: filtered.length, count: selectedCount };
        if (!selectedCount) status.textContent = fill(label('status-all'), values);
        else status.textContent = fill(label(selectedCount > 1 ? 'status-filters' : 'status-filter'), values);
      } else {
        status.hidden = true;
        status.textContent = '';
      }

      const hasMoreThanOnePage = filtered.length > PAGE_SIZE;
      const hasMoreToShow = visible.length < filtered.length;
      const mayHaveMoreToFetch = state.hasMore && visible.length >= PAGE_SIZE;
      const showLoadMore = hasMoreThanOnePage && (hasMoreToShow || mayHaveMoreToFetch);
      loadMore.classList.toggle('search-load-more-hidden', !showLoadMore);
    } finally {
      loadMore.disabled = false;
      loadMore.textContent = label('load-more');
      state.loading = false;
    }
  }

  const trackSearch = () => {
    const term = safeLabel(state.query);
    if (term) trackEvent('search', { search_term: term });
  };

  async function search(query) {
    state.query = String(query || '').trim();
    trackSearch();
    state.displayCount = PAGE_SIZE;
    await render();
  }

  if (ownForm && searchBarEnabled) {
    const form = createTag('form', { class: 'search-query-form', role: 'search', 'aria-label': label('placeholder') });
    const input = createTag('input', {
      type: 'search',
      name: 'q',
      value: state.query,
      placeholder: label('placeholder'),
      'aria-label': label('placeholder'),
    });
    form.append(input, createTag('button', { type: 'submit', class: 'button primary' }, label('search-button')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = new URL(window.location.href);
      if (input.value.trim()) url.searchParams.set('q', input.value.trim());
      else url.searchParams.delete('q');
      window.history.replaceState({}, '', url);
      await search(input.value);
    });
    controls.append(form);
  }

  if (filterGroups.length > 0) {
    const { aside, sortSelect } = buildFilterSidebar(
      filterGroups,
      listId,
      idPrefix,
      sortSelectId,
      label,
      loose,
    );
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      render();
    });
    aside.addEventListener('change', () => render());
    const layout = createTag('div', { class: 'search-layout' });
    layout.append(aside, resultsWrap);
    root.append(controls, layout);
  } else {
    const sortLabel = createTag('label', { class: 'search-sort-label', for: sortSelectId }, label('sort'));
    const sortSelect = createTag('select', { id: sortSelectId, name: 'search-sort' }, sortOptions(label, loose));
    sortLabel.append(sortSelect);
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      render();
    });
    controls.append(sortLabel);
    root.append(controls, resultsWrap);
  }

  loadMore.addEventListener('click', async () => {
    if (state.loading) return;
    state.displayCount += PAGE_SIZE;
    await render();
  });

  // a search that arrived in the URL (from the header's search field); without its own form, the
  // block driving this one runs that search through search()
  if (ownForm) trackSearch();
  await render();
  return { search };
}

/** @param {Element} block */
export default async function decorate(block) {
  const config = readBlockConfig(block);
  const label = (key) => config[key] || LABELS[key];
  block.textContent = '';
  if (block.classList.contains('ai') || block.classList.contains('tabs')) {
    const [{ default: decorateAi }] = await Promise.all([
      import('./search-ai.js'),
      loadCSS(`${window.hlx.codeBasePath}/blocks/search/search-ai.css`),
    ]);
    await decorateAi(block, config, { keywordSearch, tabs: block.classList.contains('tabs') });
    return;
  }
  await keywordSearch(block, config, { label });
}
