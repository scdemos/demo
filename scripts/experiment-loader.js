/**
 * Loads the AEM Experimentation plugin (experiments, audiences, campaigns) only on pages
 * that use it. See plugins/experimentation/README.md.
 */

const PLUGIN = '../plugins/experimentation/src/index.js';

// Decided in the eager phase: section metadata is removed when sections are decorated,
// so the lazy phase can't look again.
let enabled = false;

/**
 * Whether the page has experiment, campaign or audience metadata (page or section level).
 * @returns {boolean}
 */
export function isExperimentationEnabled() {
  return !!document.head.querySelector('[name^="experiment"],[name^="campaign-"],[name^="audience-"],[property^="campaign:"],[property^="audience:"]')
    || [...document.querySelectorAll('.section-metadata div')]
      .some((d) => /Experiment|Campaign|Audience/i.test(d.textContent));
}

/**
 * Answers the simulation panel's config request on pages without experiments.
 */
function answerEmptyConfig() {
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'hlx:experimentation-get-config') {
      event.source.postMessage({
        type: 'hlx:experimentation-config',
        config: { experiments: [], audiences: [], campaigns: [] },
        source: 'no-experiments',
      }, '*');
    }
  });
}

/**
 * Picks the variant to serve before the page decorates (eager phase).
 * @param {Document} doc
 * @param {Object} config experimentation options
 */
export async function runExperimentation(doc, config) {
  enabled = isExperimentationEnabled();
  if (!enabled) {
    answerEmptyConfig();
    return null;
  }
  try {
    const { loadEager } = await import(PLUGIN);
    return loadEager(doc, config);
  } catch (error) {
    console.error('Failed to load experimentation (eager):', error);
    return null;
  }
}

/**
 * Loads the simulation UI in preview and development only (lazy phase).
 * @param {Document} doc
 * @param {Object} config experimentation options
 */
export async function runExperimentationLazy(doc, config) {
  if (config.simulationUI === false || config.isProd?.() || !enabled) return null;
  try {
    const { loadLazy } = await import(PLUGIN);
    return loadLazy(doc, config);
  } catch (error) {
    console.error('Failed to load experimentation (lazy):', error);
    return null;
  }
}
