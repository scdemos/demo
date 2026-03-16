import {
  html,
  render,
  useState,
  useRef,
  useEffect,
} from 'https://esm.sh/htm/preact/standalone';

// Sync theme changes from header toggle to all embeds on this page
window.addEventListener('aem-theme-change', (e) => {
  const { theme } = e.detail;
  document.querySelectorAll('aem-embed').forEach((embed) => {
    const body = embed.shadowRoot?.querySelector('body');
    if (body) {
      body.classList.remove('light-scheme', 'dark-scheme');
      body.classList.add(`${theme}-scheme`);
    }
  });
});

function getBaseUrl() {
  const { origin } = window.location;
  if (origin.includes('.aem.')) return origin;
  if (origin.includes('localhost')) return origin;
  return 'https://main--demo--scdemos.aem.live';
}

function resolveUrl(path) {
  if (path.startsWith('http')) return path;
  const base = getBaseUrl();
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function AemEmbed({ path, type = 'main' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!path || !ref.current) return;
    ref.current.replaceChildren();
    const el = document.createElement('aem-embed');
    el.setAttribute('url', resolveUrl(path));
    el.setAttribute('type', type);
    ref.current.appendChild(el);
  }, [path, type]);

  return html`<div ref=${ref}></div>`;
}

function Card({ title, children }) {
  return html`
    <div class="card">
      <h3>${title}</h3>
      <p>${children}</p>
    </div>
  `;
}

function Hero() {
  return html`
    <section class="hero">
      <h1>AEM Embed Tester</h1>
      <p>
        This page demonstrates embedding demo content in a non-AEM page
        using the <code>${'<aem-embed>'}</code> web component.
        The header and footer above and below are live embeds.
      </p>
    </section>
  `;
}

function CardGrid() {
  return html`
    <section class="card-grid">
      <${Card} title="Shadow DOM Isolation">
        Embedded content renders inside a shadow root, keeping its styles
        completely isolated from this page.
      <//>
      <${Card} title="Zero Build Step">
        This tester uses Preact + htm from a CDN. No bundler, no transpiler,
        just native ES modules.
      <//>
      <${Card} title="Fragment Support">
        Embed any page or fragment path below to see it rendered
        with full block decoration.
      <//>
    </section>
  `;
}

function FragmentEmbedder() {
  const [path, setPath] = useState('');
  const [activePath, setActivePath] = useState(null);

  const handleEmbed = () => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setActivePath(trimmed);
  };

  return html`
    <section class="fragment-embedder">
      <h2>Embed a Fragment</h2>
      <div class="embed-controls">
        <div class="field">
          <label for="path-input">Page or fragment path</label>
          <input
            id="path-input"
            type="text"
            placeholder="/fragments/example or full URL"
            value=${path}
            onInput=${(e) => setPath(e.target.value)}
            onKeyDown=${(e) => e.key === 'Enter' && handleEmbed()}
          />
        </div>
        <button onClick=${handleEmbed}>Embed</button>
      </div>
      <div class="preview-container">
        ${activePath
    ? html`<${AemEmbed} path=${activePath} />`
    : html`<div class="preview-placeholder">Enter a path and click Embed to preview content.</div>`}
      </div>
      <p class="hint">
        Paths are resolved against <code>${getBaseUrl()}</code>.
        CORS headers must be configured on the source for cross-origin embedding.
      </p>
    </section>
  `;
}

function App() {
  return html`
    <${AemEmbed} path="/nav" type="header" />
    <main class="app-main">
      <${Hero} />
      <${CardGrid} />
      <${FragmentEmbedder} />
      <div class="bottom-content">
        <p>
          Built with Preact + htm — this entire page is a non-AEM surface
          consuming demo content via <a href="https://www.aem.live/docs/aem-embed"><code>${'<aem-embed>'}</code></a>.
        </p>
      </div>
    </main>
    <${AemEmbed} path="/footer" type="footer" />
  `;
}

render(html`<${App} />`, document.getElementById('app'));
