/**
 * Loads the AEM Experimentation plugin (experiments, audiences, campaigns) only on pages
 * that use it. See plugins/experimentation/README.md.
 */

const PLUGIN = '../plugins/experimentation/src/index.js';

// Decided in the eager phase: section metadata is removed when sections are decorated,
// so the lazy phase can't look again.
let enabled = false;

const SECTION_KEYS = /^data-(experiment|campaign|audience)/;

/**
 * Delivered pages carry Section Metadata as section data attributes (e.g. data-experiment,
 * data-audience:-member-week). The plugin reads Section Metadata tables, so rebuild one per
 * section from those attributes. Runs once, before any detection or decoration.
 * @param {Document} doc
 */
const seenSections = new WeakSet();

function restoreSectionMetadata(doc) {
  doc.querySelectorAll('main > div').forEach((section) => {
    // Later passes only look at sections a served campaign brought in: the engine writes its
    // own data-audience/data-experiment on sections it has already handled.
    if (seenSections.has(section)) return;
    seenSections.add(section);
    const attrs = [...section.attributes].filter(({ name }) => SECTION_KEYS.test(name));
    if (!attrs.length || section.querySelector(':scope > .section-metadata')) return;
    const meta = doc.createElement('div');
    meta.className = 'section-metadata';
    attrs.forEach(({ name, value }) => {
      const row = doc.createElement('div');
      const key = doc.createElement('div');
      const cell = doc.createElement('div');
      key.textContent = name.slice(5);
      cell.textContent = value;
      row.append(key, cell);
      meta.append(row);
      section.removeAttribute(name);
    });
    section.append(meta);
  });
}

/**
 * Whether the page has experiment, campaign or audience metadata (page or section level).
 * @returns {boolean}
 */
export function isExperimentationEnabled(doc = document) {
  return !!doc.head.querySelector('[name^="experiment"],[name^="campaign-"],[name="audience"],[name^="audience-"],[property^="campaign:"],[property^="audience:"]')
    || [...doc.querySelectorAll('.section-metadata div')]
      .some((d) => /Experiment|Campaign|Audience/i.test(d.textContent));
}

/** Experiment-only pages do not need the audience sheet on their rendering path. */
function hasAudienceMetadata(doc) {
  return !!doc.head.querySelector('[name="audience"],[name^="audience-"],[property^="audience:"],[name="experiment-audience"],[name="experiment-audiences"],[name="campaign-audience"],[name="campaign-audiences"]')
    || [...doc.querySelectorAll('.section-metadata > div > div:first-child')]
      .some((cell) => /^(audience(?:$|[\s:(-])|(?:experiment|campaign)[\s-]+audiences?$)/i.test(cell.textContent.trim()));
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
  restoreSectionMetadata(doc);
  enabled = isExperimentationEnabled(doc);
  if (!enabled) {
    answerEmptyConfig();
    return null;
  }
  try {
    const plugin = import(PLUGIN);
    let registered = false;
    const prepareAudiences = async (target) => {
      restoreSectionMetadata(doc);
      if (registered) {
        const { refreshAudienceGates } = await import('./audiences.js');
        refreshAudienceGates(doc);
        return;
      }
      if (!hasAudienceMetadata(doc)) return;
      registered = true;
      const { registerAudiences } = await import('./audiences.js');
      await registerAudiences(target, doc);
    };
    await prepareAudiences(config);
    const { loadEager } = await plugin;
    // A served campaign can bring in content with its own audience sections; the engine
    // calls this again between the campaign and audience passes.
    return await loadEager(doc, { ...config, prepareAudiences });
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
