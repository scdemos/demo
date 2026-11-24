import { readBlockConfig } from '../../scripts/aem.js';
import { LABELS } from './search.js';

const RESERVED = ['view', 'keywords', 'excluded-keywords', 'searchbar', ...Object.keys(LABELS)];
const AI_KEYS = [
  'base-url', 'content-source', 'content-source-type', 'disclaimer', 'suggestions', 'suggestions-count',
  'submit', 'clear', 'results-tab', 'answer-tab', 'answer-title', 'generating',
  'sources', 'no-answer', 'error', 'retry', 'suggestions-label', 'search-mode',
];
const VIEWS = ['cards', 'list'];
const SEARCHBAR = ['enabled', 'disabled'];

const text = (value) => String(Array.isArray(value) ? value[0] : value || '').trim().toLowerCase();

export default function validate(source) {
  const config = readBlockConfig(source);
  const ai = source.classList.contains('ai') || source.classList.contains('tabs');
  const reserved = ai ? [...RESERVED, ...AI_KEYS] : RESERVED;
  const issues = [];
  if (ai && !config['base-url']) {
    issues.push({
      message: 'Search (AI) and Search (Tabs) need a base-url row for the AI answer.',
      hint: 'Add a base-url row with the search service URL.',
    });
  }
  if (config.view !== undefined && !VIEWS.includes(text(config.view))) {
    issues.push({
      message: `Search view '${config.view}' is not supported; cards is used.`,
      hint: 'Set view to cards or list.',
    });
  }
  if (config.searchbar !== undefined && !SEARCHBAR.includes(text(config.searchbar))) {
    issues.push({
      message: `Search searchbar '${config.searchbar}' is not supported; the search bar is hidden.`,
      hint: 'Set searchbar to enabled or disabled.',
    });
  }
  if (config.source !== undefined) {
    issues.push({
      message: 'Search reads the site\'s query index; the source row is shown as a filter.',
      hint: 'Delete the source row.',
    });
  }
  Object.entries(config)
    .filter(([key, value]) => key !== 'source' && !reserved.includes(key) && !String(value).split(',').some((v) => v.trim()))
    .forEach(([key]) => issues.push({
      message: `Search filter '${key}' has no options and is not shown.`,
      hint: 'List the filter options, separated by commas.',
    }));
  if (!ai) {
    Object.keys(config).filter((key) => AI_KEYS.includes(key)).forEach((key) => issues.push({
      message: `Search row '${key}' only works in Search (AI) or Search (Tabs); here it is shown as a filter.`,
      hint: 'Use Search (AI) or Search (Tabs), or delete the row.',
    }));
  }
  return issues;
}
