import { readBlockConfig } from '../../scripts/aem.js';

const RESERVED = ['view', 'keywords', 'excluded-keywords', 'searchbar'];
const VIEWS = ['cards', 'list'];
const SEARCHBAR = ['enabled', 'disabled'];

const text = (value) => String(Array.isArray(value) ? value[0] : value || '').trim().toLowerCase();

export default function validate(source) {
  const config = readBlockConfig(source);
  const issues = [];
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
  Object.entries(config)
    .filter(([key, value]) => !RESERVED.includes(key) && !String(value).split(',').some((v) => v.trim()))
    .forEach(([key]) => issues.push({
      message: `Search filter '${key}' has no options and is not shown.`,
      hint: 'List the filter options, separated by commas.',
    }));
  return issues;
}
