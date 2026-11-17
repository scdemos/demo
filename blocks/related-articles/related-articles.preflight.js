import { readBlockConfig } from '../../scripts/aem.js';
import { didYouMean } from '../../scripts/preflight/utils.js';

const MODES = ['dynamic', 'links'];
const KEYS = ['mode', 'keywords', 'excluded-keywords'];

export default function validate(source) {
  const config = readBlockConfig(source);
  const mode = String(config.mode || 'dynamic').trim().toLowerCase();
  if (!MODES.includes(mode)) {
    return [{
      message: `Related articles mode '${config.mode}' is not supported.`,
      hint: `Use 'dynamic' or 'links'. ${didYouMean(mode, MODES)}`.trim(),
    }];
  }
  if (mode === 'links') {
    const ul = source.querySelector(':scope > div:nth-child(2) > div:nth-child(1) ul')
      || source.querySelector(':scope > div:nth-child(1) > div:nth-child(1) ul');
    if (ul?.querySelector('a[href]')) return [];
    return [{
      message: 'Related articles block is in links mode but has no list of links.',
      hint: 'Add a bulleted list of article links in the first column.',
    }];
  }
  return Object.keys(config)
    .filter((key) => !KEYS.includes(key))
    .map((key) => ({
      message: `Related articles option '${key}' is not supported.`,
      hint: `Use ${KEYS.join(', ')}. ${didYouMean(key, KEYS)}`.trim(),
    }));
}
