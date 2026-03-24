/** Presenter: fetch JSON from a URL (Document Authoring structured content). */
const STORAGE_KEY = 'tools-demo-walkthrough-v1';

/**
 * What we fetch: full `https://…` URLs as-is, or a path / site-relative ref resolved against this origin
 * (e.g. `demo-slides` → `https://current.host/demo-slides`).
 */
function resolveSlidesUrl(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.href;
    }
    return new URL(s, `${window.location.origin}/`).href;
  } catch {
    return '';
  }
}

/**
 * `?url=…` pre-fills the slides URL (overrides saved value for this visit).
 * The query string is left in the address bar so the page URL stays a shareable deep link.
 */
function applySlidesUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('url');
  if (!raw) return;
  const trimmed = String(raw).trim();
  if (!trimmed || !resolveSlidesUrl(trimmed)) return;
  state.slidesUrl = trimmed;
  state.stepIndex = 0;
  persistState();
}

function getContentUrl() {
  const saved = String(state.slidesUrl || '').trim();
  if (!saved) return null;
  const resolved = resolveSlidesUrl(saved);
  return resolved || null;
}

/** Known JSON paths on this site → DA `formsref` path (after `#/`). */
const DA_EDIT_BY_PATHNAME = {
  '/demo-slides': 'scdemos/demo/drafts/demo-slides/demo',
};

/** Same slug as `?url=demo-slides` / `/demo-slides` — used for setup “New” → DA folder. */
const DEFAULT_SLIDES_SLUG = 'demo-slides';

/** Path after `da.live/formsref#/`, or null. Preview worker + `DA_EDIT_BY_PATHNAME`. */
function getDaFormsrefPath(resolvedUrl) {
  if (!resolvedUrl) return null;
  try {
    const u = new URL(resolvedUrl);
    const pathname = u.pathname.replace(/\/$/, '') || '/';

    if (u.hostname.endsWith('adobeaem.workers.dev') && u.pathname.startsWith('/preview/')) {
      const afterPreview = u.pathname.slice('/preview/'.length).replace(/\/$/, '');
      return afterPreview || null;
    }

    return DA_EDIT_BY_PATHNAME[pathname] || null;
  } catch {
    return null;
  }
}

function getDaEditUrlFromSlidesUrl(resolvedUrl) {
  const path = getDaFormsrefPath(resolvedUrl);
  return path ? `https://da.live/formsref#/${path}` : null;
}

/** Parent folder in DA browse (drop last path segment) — `da.live/#/…` so authors can create documents. */
function getDaNewDocumentUrlFromSlidesUrl(resolvedUrl) {
  const path = getDaFormsrefPath(resolvedUrl);
  if (!path) return null;
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  return `https://da.live/#/${parts.slice(0, -1).join('/')}`;
}

/** DA delivery often wraps the document in `{ metadata, data }`. */
function unwrapWalkthroughPayload(json) {
  const inner = json?.data;
  if (inner && typeof inner === 'object' && typeof inner.topbarTitle === 'string') {
    return inner;
  }
  return json;
}

/** @type {{ meta: { title: string, subtitle: string }, slides: object[] } | null} */
let config = null;

const state = loadState();

applySlidesUrlFromQuery();

function loadState() {
  const initial = { stepIndex: 0, slidesUrl: '' };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const saved = JSON.parse(raw);
    return { ...initial, ...saved };
  } catch {
    return initial;
  }
}

function persistState() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ stepIndex: state.stepIndex, slidesUrl: state.slidesUrl || '' }),
  );
}

/** Drop `?…` from the address bar; keeps path and hash. */
function clearAddressBarQuery() {
  const loc = new URL(window.location.href);
  if (!loc.search) return;
  loc.search = '';
  window.history.replaceState({}, '', `${loc.pathname}${loc.hash}`);
}

/** Clear slides URL, step, loaded deck, and persisted session (full tool reset). */
function resetToolState() {
  state.slidesUrl = '';
  state.stepIndex = 0;
  config = null;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * @param {object} raw
 * @returns {{ label: string, title: string, lead: string, bullets: string[], takeaway: string, links: { label: string, url: string }[] }}
 */
function normalizeSlide(raw) {
  const bullets = Array.isArray(raw.bulletPoints) ? raw.bulletPoints.filter(Boolean) : [];
  const links = Array.isArray(raw.openInBrowser)
    ? raw.openInBrowser
      .filter((x) => x && String(x.buttonText || '').trim() && String(x.url || '').trim())
      .map((x) => ({ label: String(x.buttonText).trim(), url: String(x.url).trim() }))
    : [];
  return {
    label: String(raw.eyebrowLabel || '').trim(),
    title: String(raw.slideTitle || '').trim() || 'Slide',
    lead: String(raw.leadParagraph || '').trim(),
    bullets,
    takeaway: String(raw.keyTakeaways || '').trim(),
    links,
  };
}

async function loadContent() {
  const contentUrl = getContentUrl();
  if (!contentUrl) throw new Error('Add a slides JSON URL.');
  const res = await fetch(contentUrl);
  if (!res.ok) {
    throw new Error(`Could not load presenter content (${res.status}) — ${contentUrl}`);
  }
  let raw;
  try {
    raw = await res.json();
  } catch {
    throw new Error('Response was not valid JSON.');
  }
  const data = unwrapWalkthroughPayload(raw);
  if (!data.topbarTitle || typeof data.topbarTitle !== 'string') {
    throw new Error('JSON must include topbarTitle (inside data if wrapped).');
  }
  const slidesIn = Array.isArray(data.slides) ? data.slides : [];
  config = {
    meta: {
      title: data.topbarTitle.trim(),
      subtitle: String(data.topbarSubtitle || '').trim(),
    },
    slides: slidesIn.map(normalizeSlide),
  };
}

function getSteps() {
  return config?.slides || [];
}

function clampStepIndex() {
  const steps = getSteps();
  if (!steps.length) {
    state.stepIndex = 0;
    return;
  }
  if (state.stepIndex < 0) state.stepIndex = 0;
  if (state.stepIndex >= steps.length) state.stepIndex = steps.length - 1;
}

function getActiveSlide() {
  const steps = getSteps();
  return steps[state.stepIndex] || null;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeExternalUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return `${window.location.origin}${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function renderLinkButtons(slide) {
  const items = slide.links || [];
  if (!items.length) return '';

  return items.map((item) => {
    const url = normalizeExternalUrl(item.url);
    const label = escapeHtml(item.label || 'Link');

    if (!url) {
      return `
        <div class="show-link-disabled">
          <span class="show-link-title">${label}</span>
        </div>
      `;
    }

    return `
      <a class="show-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        <span class="show-link-title">${label}</span>
      </a>
    `;
  }).join('');
}

const PENCIL_SVG = `<svg class="topbar-edit-da-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;

function renderTopbar(steps) {
  const meta = config.meta;
  const total = steps.length;
  const current = total ? state.stepIndex + 1 : 0;
  const pct = total ? Math.round((current / total) * 100) : 0;
  const contentUrlResolved = getContentUrl();
  const daEditUrl = getDaEditUrlFromSlidesUrl(contentUrlResolved);
  const daNewUrl = getDaNewDocumentUrlFromSlidesUrl(contentUrlResolved);

  return `
    <header class="topbar">
      <div class="topbar-brand">
        <h1 class="topbar-title">${escapeHtml(meta.title)}</h1>
        ${meta.subtitle ? `<p class="topbar-subtitle">${escapeHtml(meta.subtitle)}</p>` : ''}
      </div>
      <div class="topbar-meta">
        ${daEditUrl ? `
        <a
          class="topbar-da-link topbar-edit-da"
          href="${escapeHtml(daEditUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          title="Edit in Document Authoring"
          aria-label="Edit structured content in Document Authoring"
        >${PENCIL_SVG}</a>
        ` : ''}
        ${daNewUrl ? `
        <a
          class="topbar-da-link topbar-new-da"
          href="${escapeHtml(daNewUrl)}"
          target="_blank"
          rel="noopener noreferrer"
          title="Open folder in Document Authoring to create a document"
          aria-label="Open folder in Document Authoring to create a document"
        >+</a>
        ` : ''}
        <button type="button" class="topbar-change-url" data-action="change-content-url">Change URL</button>
        <span class="step-badge" aria-live="polite">
          <span class="step-badge-num">${current}</span>
          <span class="step-badge-of">of</span>
          <span class="step-badge-total">${total}</span>
        </span>
      </div>
    </header>
    <div class="progress-track" role="progressbar" aria-valuenow="${current}" aria-valuemin="1" aria-valuemax="${total}" aria-label="Walkthrough progress">
      <div class="progress-fill" style="width: ${pct}%;"></div>
    </div>
  `;
}

/** Title-only / cover slide: matches presenter “hero” layout (centered, full card height). */
function isTitleOnlySlide(slide) {
  if (!slide) return false;
  const bullets = (slide.bullets || []).filter(Boolean);
  const hasLinks = Array.isArray(slide.links) && slide.links.length > 0;
  return (
    !slide.label
    && !String(slide.lead || '').trim()
    && !bullets.length
    && !hasLinks
    && !String(slide.takeaway || '').trim()
  );
}

function renderSlide(slide) {
  if (!slide) {
    return '<p class="placeholder-copy">No slides.</p>';
  }

  const bullets = (slide.bullets || []).filter(Boolean);
  const hasLinks = Array.isArray(slide.links) && slide.links.length > 0;
  const linkHtml = hasLinks ? renderLinkButtons(slide) : '';
  const cardClass = isTitleOnlySlide(slide) ? 'slide-card slide-card-title' : 'slide-card';

  return `
    <article class="${cardClass}">
      <header class="slide-header">
        ${slide.label ? `<p class="slide-label">${escapeHtml(slide.label)}</p>` : ''}
        <h2 class="slide-title">${escapeHtml(slide.title || 'Slide')}</h2>
      </header>

      ${slide.lead ? `<p class="slide-lead">${escapeHtml(slide.lead)}</p>` : ''}

      ${bullets.length ? `
        <ul class="slide-list">
          ${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
        </ul>
      ` : ''}

      ${linkHtml ? `
        <section class="slide-block slide-block-links" aria-labelledby="block-links-title">
          <h3 id="block-links-title" class="slide-block-title">Open in the browser</h3>
          <div class="slide-links">${linkHtml}</div>
        </section>
      ` : ''}

      ${slide.takeaway ? `
        <aside class="slide-takeaway" aria-label="Key takeaway">
          <span class="takeaway-label">Key takeaway</span>
          <p class="takeaway-text">${escapeHtml(slide.takeaway)}</p>
        </aside>
      ` : ''}

      <p class="slide-hint" aria-hidden="true">Use ← → keys to move between slides.</p>
    </article>
  `;
}

function render() {
  if (!config) return;

  clampStepIndex();
  const app = document.getElementById('app');
  const steps = getSteps();
  const slide = getActiveSlide();

  const canPrev = state.stepIndex > 0;
  const canNext = state.stepIndex < steps.length - 1;

  app.innerHTML = `
    <div class="presenter-shell">
      ${renderTopbar(steps)}
      <div class="slide-area">
        <button
          class="nav-btn nav-prev"
          type="button"
          data-action="prev-step"
          ${!canPrev ? 'disabled' : ''}
          aria-label="Previous"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <main class="slide-main">
          ${renderSlide(slide)}
        </main>
        <button
          class="nav-btn nav-next"
          type="button"
          data-action="next-step"
          ${!canNext ? 'disabled' : ''}
          aria-label="Next"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <nav class="slide-dots" aria-label="Jump to slide">
        ${steps.map((s, i) => `
          <button
            class="dot${i === state.stepIndex ? ' is-active' : ''}"
            type="button"
            data-action="jump-step"
            data-step-index="${i}"
            title="${escapeHtml(s.title)}"
            aria-label="Slide ${i + 1}: ${escapeHtml(s.title)}"
          ></button>
        `).join('')}
      </nav>
    </div>
  `;
}

function renderSetup() {
  const app = document.getElementById('app');
  const saved = escapeHtml(state.slidesUrl || '');
  const setupNewDaUrl = getDaNewDocumentUrlFromSlidesUrl(resolveSlidesUrl(DEFAULT_SLIDES_SLUG));
  app.innerHTML = `
    <div class="presenter-setup">
      <h1 class="presenter-setup-title">Demo slides</h1>
      <p class="presenter-setup-lead">Add slides URL</p>
      <form class="slides-url-form" id="slides-url-form" novalidate>
        <label class="slides-url-label" for="slides-url-input">Demo slides URL</label>
        <input
          id="slides-url-input"
          class="slides-url-input"
          name="slidesUrl"
          type="text"
          inputmode="url"
          autocomplete="off"
          placeholder="Add slides URL"
          value="${saved}"
        >
        <div class="slides-url-actions">
          <button type="submit" class="slides-url-submit">Start</button>
          ${setupNewDaUrl ? `
          <a
            class="slides-url-new"
            href="${escapeHtml(setupNewDaUrl)}"
            target="_blank"
            rel="noopener noreferrer"
            title="Open folder in Document Authoring to create a document"
            aria-label="Open folder in Document Authoring to create a document"
          >New</a>
          ` : ''}
        </div>
      </form>
    </div>
  `;
  document.getElementById('slides-url-input')?.focus();
}

function renderError(message) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="presenter-error">
      <p><strong>Could not load the demo.</strong></p>
      <p>${escapeHtml(message)}</p>
      <p class="presenter-error-hint">
        Check the URL and try again, or <button type="button" class="link-like" data-action="change-content-url">change URL</button>.
      </p>
    </div>
  `;
}

function moveStep(direction) {
  state.stepIndex += direction;
  clampStepIndex();
  persistState();
  render();
}

function jumpToStep(index) {
  state.stepIndex = index;
  clampStepIndex();
  persistState();
  render();
}

function handleAction(action, target) {
  if (action === 'next-step') moveStep(1);
  if (action === 'prev-step') moveStep(-1);
  if (action === 'jump-step') jumpToStep(Number(target.dataset.stepIndex));
  if (action === 'change-content-url') {
    resetToolState();
    clearAddressBarQuery();
    renderSetup();
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  handleAction(target.dataset.action, target);
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'slides-url-form') return;
  event.preventDefault();
  const input = document.getElementById('slides-url-input');
  const url = String(input?.value || '').trim();
  if (!url) return;
  state.slidesUrl = url;
  state.stepIndex = 0;
  persistState();
  try {
    await loadContent();
    render();
  } catch (err) {
    renderError(err instanceof Error ? err.message : String(err));
  }
});

document.addEventListener('keydown', (event) => {
  const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
  if (isTyping) return;
  if (!config) return;

  if (event.key === 'ArrowRight') moveStep(1);
  if (event.key === 'ArrowLeft') moveStep(-1);
});

(async function init() {
  if (!getContentUrl()) {
    renderSetup();
    return;
  }
  try {
    await loadContent();
    render();
  } catch (err) {
    renderError(err instanceof Error ? err.message : String(err));
  }
})();
