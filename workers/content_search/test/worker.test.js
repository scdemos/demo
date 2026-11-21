import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import worker, { resetIndexCache, pagesFromIndex, scopesFrom } from '../index.js';

const SITE = 'https://demo.bbird.live';

const ENV_VARS = {
  PATH_PREFIX: 'content-search',
  SITE_URL: SITE,
  CONTENT_ORIGIN: 'https://main--demo--scdemos.aem.live',
  ALLOWED_ORIGINS: 'https://demo.bbird.live,http://localhost:3000,https://*--demo--scdemos.aem.page',
  INCLUDE_PATHS: '/demo-docs/,/en/',
  EXCLUDE_PATHS: '/demo-docs/nav,/demo-docs/footer,/demo-docs/demo-slides/',
  EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
  ANSWER_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
};

const row = (path, extra = {}) => ({
  path,
  title: '',
  description: '',
  image: '/default-meta-image.png?width=1200&format=pjpg&optimize=medium',
  keywords: [],
  lastModified: '1795204653',
  ...extra,
});

const INDEX = [
  row('/demo-docs/usecases/how-to-add-new-users', {
    title: 'How to onboard new users to demo site',
    description: 'Request access to the demo site and CloneIt with the Access app.',
    keywords: ['demo, access, onboarding'],
  }),
  row('/demo-docs/usecases/how-to-clone-demo-site', {
    title: 'How to Clone the Demo Site using CloneIT app',
    description: 'Create your own copy of the demo site with its own repo and DA folder.',
    keywords: ['demo, clone, cloneit'],
  }),
  row('/demo-docs/usecases/how-to-use-deliver-personalized-experiences', {
    title: 'How to deliver personalized experiences with Adobe Target',
    description: 'Personalize Frescopa pages with Adobe Target offers.',
    keywords: ['demo, personalization, target'],
  }),
  row('/en/coffee', {
    title: 'Our coffee',
    description: 'Single-origin coffee from Frescopa.',
    image: '/en/media_123.jpg?width=1200&format=pjpg&optimize=medium',
  }),
  row('/demo-docs/nav', { title: 'Demo Area' }),
  row('/demo-docs/demo-slides/demo', { title: 'x-schema-name' }),
  row('/experiments/test', { title: 'Experiment' }),
  row('/en/untitled', { title: '' }),
];

// Each topic gets its own axis, so cosine similarity picks the page on the asked topic.
const TOPICS = [/access|onboard/i, /clone/i, /personali[sz]/i, /coffee/i];
function embed(text) {
  return TOPICS.map((re) => (re.test(text) ? 1 : 0)).concat(0.01);
}

function mockAi({ answer = 'Use the Access app.' } = {}) {
  const calls = [];
  return {
    calls,
    run: vi.fn(async (model, input) => {
      calls.push({ model, input });
      if (model === ENV_VARS.EMBEDDING_MODEL) {
        const texts = Array.isArray(input.text) ? input.text : [input.text];
        return { shape: [texts.length, 5], data: texts.map(embed) };
      }
      return { response: typeof answer === 'function' ? answer(input) : answer };
    }),
  };
}

const PAGE_TEXT = {
  '/demo-docs/usecases/how-to-add-new-users': '<div><h1>How to add new users</h1><p>Send the user to <a href="/x">Get demo access</a>.</p><script>alert(1)</script></div>',
};

const DOCS_TEXT = {
  '/docs/personalization': '<div><h1>Personalization</h1><p>Use Adobe Target with Edge Delivery.</p></div>',
  '/docs/quantum-cdn': '<div><h1>Quantum CDN</h1><p>Point the quantum CDN at your origin.</p></div>',
};
const DOCS = [
  row('/docs/personalization', {
    title: 'Personalization with Edge Delivery',
    description: 'Personalize pages with Adobe Target.',
    deprecation: '',
  }),
  row('/docs/quantum-cdn', {
    title: 'Quantum CDN setup',
    description: 'Configure the quantum physics CDN.',
    deprecation: '',
  }),
  row('/docs/scheduling', { title: 'Scheduling', description: 'Clone and schedule.', deprecation: 'Use something else.' }),
  row('/blog/clone-news', { title: 'Clone news', description: 'Blog about clone.' }),
];
const DOCS_VARS = {
  DOCS_ORIGIN: 'https://www.aem.live',
  DOCS_INCLUDE_PATHS: '/docs/,/developer/',
  DOCS_LABEL: 'AEM product documentation',
};

let indexFetches;
function mockIndex(rows = INDEX, docsRows = []) {
  indexFetches = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    indexFetches.push(String(url));
    const { host } = new URL(url);
    if (String(url).endsWith('.plain.html')) {
      const path = new URL(url).pathname.replace(/\.plain\.html$/, '');
      const page = (host === 'www.aem.live' ? DOCS_TEXT : PAGE_TEXT)[path];
      return page ? new Response(page, { headers: { 'Content-Type': 'text/html' } }) : new Response('', { status: 404 });
    }
    if (host === 'www.aem.live') {
      return new Response(JSON.stringify({ data: docsRows }), { headers: { 'Content-Type': 'application/json' } });
    }
    const params = new URL(url).searchParams;
    const offset = Number(params.get('offset')) || 0;
    const limit = Number(params.get('limit')) || rows.length;
    return new Response(JSON.stringify({ data: rows.slice(offset, offset + limit) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }));
}

function post(path, body, origin = SITE) {
  return new Request(`${SITE}/content-search${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// The request the search block sends to /search.
const searchBody = (text, pagination = { limit: 10 }) => ({
  contentSource: { name: 'demo', type: 'AEM_PUBLISH' },
  query: {
    type: 'composite',
    operator: 'OR',
    queries: [
      { type: 'vector', text, options: { numCandidates: 50, boost: 1 } },
      { type: 'fulltext', text, options: { boost: 0.1, operator: 'AND' } },
    ],
  },
  queryOptions: { resultFields: { includes: ['metadata.title'] }, pagination },
});

let env;
beforeEach(() => {
  resetIndexCache();
  mockIndex();
  env = { ...ENV_VARS, AI: mockAi() };
});
afterEach(() => vi.unstubAllGlobals());

describe('CORS and routing', () => {
  it('answers a preflight from an allowed origin', async () => {
    const res = await worker.fetch(new Request(`${SITE}/content-search/search`, {
      method: 'OPTIONS', headers: { Origin: 'https://feat--demo--scdemos.aem.page' },
    }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://feat--demo--scdemos.aem.page');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('does not allow other origins', async () => {
    const res = await worker.fetch(post('/search', searchBody('clone'), 'https://evil.example'), env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('returns 404 for unknown paths and 405 for GET', async () => {
    expect((await worker.fetch(post('/other', {}), env)).status).toBe(404);
    const get = await worker.fetch(new Request(`${SITE}/content-search/search`), env);
    expect(get.status).toBe(405);
  });

  it('rejects requests from origins that are not allowed', async () => {
    const res = await worker.fetch(post('/gensearch', { query: 'clone' }, 'https://evil.example'), env);
    expect(res.status).toBe(403);
    expect(env.AI.calls).toHaveLength(0);
  });

  it('only accepts JSON, so other sites cannot send a simple cross-origin POST', async () => {
    const req = new Request(`${SITE}/content-search/gensearch`, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ query: 'clone' }),
    });
    expect((await worker.fetch(req, env)).status).toBe(415);
    expect(env.AI.calls).toHaveLength(0);
  });

  it('rate-limits each client and the whole worker', async () => {
    const keys = [];
    const ok = (name) => ({ limit: vi.fn(async ({ key }) => { keys.push(`${name} ${key}`); return { success: true }; }) });
    env.CLIENT_LIMITER = ok('client');
    env.TOTAL_LIMITER = ok('total');
    const req = post('/gensearch', { query: 'clone' });
    req.headers.set('CF-Connecting-IP', '203.0.113.7');
    expect((await worker.fetch(req, env)).status).toBe(200);
    expect(keys).toEqual(['client gensearch:203.0.113.7', 'total gensearch']);

    env.TOTAL_LIMITER = { limit: vi.fn(async () => ({ success: false })) };
    const limited = await worker.fetch(post('/search', searchBody('clone')), env);
    expect(limited.status).toBe(429);
    expect(env.AI.calls.filter((c) => c.model === ENV_VARS.EMBEDDING_MODEL && !Array.isArray(c.input.text))).toHaveLength(0);
  });

  it('rejects malformed query objects with 400', async () => {
    const bad = [{ query: { text: 42 } }, { query: { queries: 'invalid' } }, { query: [1] }, { query: { queries: [{ text: 5 }] } }];
    const statuses = await Promise.all(bad.map(async (b) => (await worker.fetch(post('/search', b), env)).status));
    expect(statuses).toEqual([400, 400, 400, 400]);
  });

  it('rejects request bodies over 8 KB', async () => {
    const big = post('/gensearch', { query: 'clone', padding: 'x'.repeat(9000) });
    expect((await worker.fetch(big, env)).status).toBe(413);
    const declared = new Request(`${SITE}/content-search/gensearch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '9000000' },
      body: JSON.stringify({ query: 'clone' }),
    });
    expect((await worker.fetch(declared, env)).status).toBe(413);
    expect(env.AI.calls).toHaveLength(0);
  });

  it('rejects an empty, invalid or too long query', async () => {
    expect((await worker.fetch(post('/search', searchBody('  ')), env)).status).toBe(400);
    expect((await worker.fetch(post('/gensearch', 'not json'), env)).status).toBe(400);
    expect((await worker.fetch(post('/gensearch', { query: 'x'.repeat(501) }), env)).status).toBe(400);
  });
});

describe('/search', () => {
  it('ranks query-index pages by meaning and returns them in the Content AI shape', async () => {
    const res = await worker.fetch(post('/search', searchBody('How do I get a copy of the site? clone')), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    const json = await res.json();
    const [first] = json.results;
    expect(first.id).toBe('/demo-docs/usecases/how-to-clone-demo-site');
    expect(first.data.source).toBe(`${SITE}/demo-docs/usecases/how-to-clone-demo-site`);
    expect(first.data.metadata).toMatchObject({
      url: `${SITE}/demo-docs/usecases/how-to-clone-demo-site`,
      title: 'How to Clone the Demo Site using CloneIT app',
      description: 'Create your own copy of the demo site with its own repo and DA folder.',
    });
    expect(typeof first.score).toBe('number');
  });

  it('only searches included paths with a title, minus excluded ones', async () => {
    const json = await (await worker.fetch(post('/search', searchBody('demo', { limit: 50 })), env)).json();
    const ids = json.results.map((r) => r.id);
    expect(ids).not.toContain('/demo-docs/nav');
    expect(ids).not.toContain('/demo-docs/demo-slides/demo');
    expect(ids).not.toContain('/experiments/test');
    expect(ids).not.toContain('/en/untitled');
  });

  it('keeps real images and drops the default meta image', async () => {
    const json = await (await worker.fetch(post('/search', searchBody('coffee')), env)).json();
    const coffee = json.results.find((r) => r.id === '/en/coffee');
    expect(coffee.data.metadata.image).toBe(`${SITE}/en/media_123.jpg?width=750&format=pjpg&optimize=medium`);
    const clone = json.results.find((r) => r.id === '/demo-docs/usecases/how-to-clone-demo-site');
    expect(clone?.data.metadata.image).toBeUndefined();
  });

  it('drops pages that are clearly unrelated', async () => {
    const json = await (await worker.fetch(post('/search', searchBody('personalization')), env)).json();
    expect(json.results.map((r) => r.id)).toEqual(['/demo-docs/usecases/how-to-use-deliver-personalized-experiences']);
  });

  it('pages through results with a cursor', async () => {
    env.MIN_SCORE = '0';
    const first = await (await worker.fetch(post('/search', searchBody('demo', { limit: 2 })), env)).json();
    expect(first.results).toHaveLength(2);
    expect(first.cursor).toBeTruthy();
    const second = await (await worker.fetch(post('/search', searchBody('demo', { limit: 2, cursor: first.cursor })), env)).json();
    expect(second.results).toHaveLength(2);
    expect(second.results[0].id).not.toBe(first.results[0].id);
    const last = await (await worker.fetch(post('/search', searchBody('demo', { limit: 50, cursor: second.cursor })), env)).json();
    expect(last.cursor).toBeNull();
  });

  it('accepts a plain string query', async () => {
    const json = await (await worker.fetch(post('/search', { query: 'clone' }), env)).json();
    expect(json.results[0].id).toBe('/demo-docs/usecases/how-to-clone-demo-site');
  });

  it('loads the index once for concurrent first requests', async () => {
    await Promise.all(['clone', 'access', 'coffee'].map((q) => worker.fetch(post('/search', searchBody(q)), env)));
    expect(indexFetches.filter((u) => u.includes('query-index'))).toHaveLength(1);
    expect(env.AI.calls.filter((c) => c.input.text?.length > 1)).toHaveLength(1);
  });

  it('retries loading the index after a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    expect((await worker.fetch(post('/search', searchBody('clone')), env)).status).toBe(502);
    mockIndex();
    expect((await worker.fetch(post('/search', searchBody('clone')), env)).status).toBe(200);
  });

  it('reads and embeds the index once for several queries', async () => {
    await worker.fetch(post('/search', searchBody('clone')), env);
    await worker.fetch(post('/search', searchBody('access')), env);
    expect(indexFetches).toHaveLength(1);
    const pageEmbeds = env.AI.calls.filter((c) => c.input.text?.length > 1);
    expect(pageEmbeds).toHaveLength(1);
  });
});

describe('product documentation source', () => {
  beforeEach(() => {
    mockIndex(INDEX, DOCS);
    env = { ...ENV_VARS, ...DOCS_VARS, AI: mockAi() };
  });

  it('reads current docs pages under the included paths, with their own URLs', () => {
    const pages = pagesFromIndex(DOCS, {
      siteUrl: 'https://www.aem.live', origin: 'https://www.aem.live', include: ['/docs/'], exclude: [], site: false,
    });
    expect(pages.map((p) => p.id)).toEqual(['https://www.aem.live/docs/personalization', 'https://www.aem.live/docs/quantum-cdn']);
  });

  it('searches the docs only when no site page matches', async () => {
    const docs = await (await worker.fetch(post('/search', searchBody('quantum physics')), env)).json();
    expect(docs.results.map((r) => r.id)).toEqual(['https://www.aem.live/docs/quantum-cdn']);
    expect(docs.results[0].data.metadata.url).toBe('https://www.aem.live/docs/quantum-cdn');
    const site = await (await worker.fetch(post('/search', searchBody('personalization')), env)).json();
    expect(site.results.map((r) => r.id)).toEqual(['/demo-docs/usecases/how-to-use-deliver-personalized-experiences']);
  });

  it('keeps searching the site when the docs index is down, and reuses docs it already has', async () => {
    const down = () => vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (new URL(url).host === 'www.aem.live') return new Response('down', { status: 503 });
      return new Response(JSON.stringify({ data: INDEX }), { headers: { 'Content-Type': 'application/json' } });
    }));
    down();
    const cold = await worker.fetch(post('/search', searchBody('clone')), env);
    expect(cold.status).toBe(200);
    expect((await cold.json()).results[0].id).toBe('/demo-docs/usecases/how-to-clone-demo-site');

    resetIndexCache();
    mockIndex(INDEX, DOCS);
    await worker.fetch(post('/search', searchBody('quantum physics')), env);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    down();
    const json = await (await worker.fetch(post('/search', searchBody('quantum physics')), env)).json();
    vi.useRealTimers();
    expect(json.results.map((r) => r.id)).toEqual(['https://www.aem.live/docs/quantum-cdn']);
  });

  it('does not wait for a docs index that hangs', async () => {
    env.DOCS_TIMEOUT_MS = '50';
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      if (new URL(url).host === 'www.aem.live') {
        return new Promise((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ data: INDEX }), { headers: { 'Content-Type': 'application/json' } }));
    }));
    const res = await worker.fetch(post('/search', searchBody('clone')), env);
    expect(res.status).toBe(200);
    expect((await res.json()).results[0].id).toBe('/demo-docs/usecases/how-to-clone-demo-site');
  }, 2000);

  it('answers without the text of a docs page that hangs', async () => {
    env.DOCS_TIMEOUT_MS = '50';
    mockIndex(INDEX, DOCS);
    const indexFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      if (String(url).startsWith('https://www.aem.live/docs/') && String(url).endsWith('.plain.html')) {
        return new Promise((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return indexFetch(url, init);
    }));
    const res = await worker.fetch(post('/gensearch', { query: 'quantum physics' }), env);
    expect(res.status).toBe(200);
  }, 2000);

  it('keeps site search working when embedding the docs fails', async () => {
    const run = env.AI.run;
    env.AI.run = vi.fn(async (model, input) => {
      if (Array.isArray(input.text) && input.text.some((t) => t.includes('Quantum'))) throw new Error('embed failed');
      return run(model, input);
    });
    const res = await worker.fetch(post('/search', searchBody('clone')), env);
    expect(res.status).toBe(200);
    expect((await res.json()).results[0].id).toBe('/demo-docs/usecases/how-to-clone-demo-site');
  });

  it('only tells the model about product documentation when the sources are docs', async () => {
    await worker.fetch(post('/gensearch', { query: 'personalization' }), env);
    const chat = env.AI.calls.find((c) => c.model === ENV_VARS.ANSWER_MODEL);
    expect(chat.input.messages.map((m) => m.content).join('\n')).not.toContain('product documentation');
  });

  it('does not wait for a docs embedding that hangs', async () => {
    env.DOCS_TIMEOUT_MS = '50';
    const run = env.AI.run;
    env.AI.run = vi.fn((model, input) => {
      if (Array.isArray(input.text) && input.text.some((t) => t.includes('Quantum'))) return new Promise(() => {});
      return run(model, input);
    });
    const [a, b] = await Promise.all(['clone', 'access'].map((q) => worker.fetch(post('/search', searchBody(q)), env)));
    expect([a.status, b.status]).toEqual([200, 200]);
  }, 2000);

  it('labels docs sources for the answer model and reads their text from aem.live', async () => {
    env.AI = mockAi({ answer: 'See [Quantum CDN setup](https://www.aem.live/docs/quantum-cdn).' });
    const json = await (await worker.fetch(post('/gensearch', { query: 'quantum physics' }), env)).json();
    const chat = env.AI.calls.find((c) => c.model === ENV_VARS.ANSWER_MODEL);
    const prompt = chat.input.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('From: AEM product documentation');
    expect(prompt).toContain('From the product documentation:');
    expect(prompt).toContain('Point the quantum CDN at your origin.');
    expect(json.hits.map((h) => h.id)).toEqual(['https://www.aem.live/docs/quantum-cdn']);
  });
});

describe('/gensearch', () => {
  it('answers from the top pages and returns the pages it cites as hits', async () => {
    const answer = `Sign up in the [Access app](${SITE}/demo-docs/usecases/how-to-add-new-users).`;
    env.AI = mockAi({ answer });
    const res = await worker.fetch(post('/gensearch', {
      contentSource: { name: 'demo', type: 'AEM_PUBLISH' },
      query: 'How do I request access?',
    }), env);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.query).toBe('How do I request access?');
    expect(json.result).toBe(answer);
    expect(json.hits.map((h) => h.id)).toEqual(['/demo-docs/usecases/how-to-add-new-users']);
    expect(json.hits[0].metadata).toMatchObject({
      url: `${SITE}/demo-docs/usecases/how-to-add-new-users`,
      title: 'How to onboard new users to demo site',
    });

    const chat = env.AI.calls.find((c) => c.model === ENV_VARS.ANSWER_MODEL);
    const prompt = chat.input.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('How do I request access?');
    expect(prompt).toContain(`${SITE}/demo-docs/usecases/how-to-add-new-users`);
    expect(prompt).not.toContain('/en/coffee');
    expect(prompt).toContain('Send the user to Get demo access.');
    expect(prompt).not.toContain('alert(1)');
  });

  it('reads each source page once and still answers when a page cannot be read', async () => {
    await worker.fetch(post('/gensearch', { query: 'request access' }), env);
    await worker.fetch(post('/gensearch', { query: 'onboard access' }), env);
    const reads = indexFetches.filter((u) => u.endsWith('/demo-docs/usecases/how-to-add-new-users.plain.html'));
    expect(reads).toHaveLength(1);
    const res = await worker.fetch(post('/gensearch', { query: 'clone' }), env);
    expect(res.status).toBe(200);
  });

  it('reads a folder index page as index.plain.html', async () => {
    mockIndex([row('/demo-docs/', { title: 'Demo Area', description: 'Clone and access.' })]);
    await worker.fetch(post('/gensearch', { query: 'clone' }), env);
    expect(indexFetches).toContain('https://main--demo--scdemos.aem.live/demo-docs/index.plain.html');
  });

  it('counts a page as cited only when its exact URL is linked', async () => {
    mockIndex([
      row('/en/', { title: 'Frescopa coffee home', description: 'Coffee for everyone.' }),
      row('/en/coffee', { title: 'Our coffee', description: 'Single-origin coffee.' }),
    ]);
    env.AI = mockAi({ answer: `See [Our coffee](${SITE}/en/coffee).` });
    const json = await (await worker.fetch(post('/gensearch', { query: 'coffee' }), env)).json();
    expect(json.hits.map((h) => h.id)).toEqual(['/en/coffee']);
  });

  it('reads a page again after a failed read', async () => {
    const saved = PAGE_TEXT['/demo-docs/usecases/how-to-add-new-users'];
    delete PAGE_TEXT['/demo-docs/usecases/how-to-add-new-users'];
    await worker.fetch(post('/gensearch', { query: 'request access' }), env);
    PAGE_TEXT['/demo-docs/usecases/how-to-add-new-users'] = saved;
    await worker.fetch(post('/gensearch', { query: 'request access' }), env);
    const chats = env.AI.calls.filter((c) => c.model === ENV_VARS.ANSWER_MODEL);
    expect(chats[1].input.messages[1].content).toContain('Send the user to Get demo access.');
  });

  it('falls back to the best matches as hits when the answer cites none', async () => {
    env.AI = mockAi({ answer: 'Clone the site with CloneIt.' });
    const json = await (await worker.fetch(post('/gensearch', { query: 'clone' }), env)).json();
    expect(json.hits[0].id).toBe('/demo-docs/usecases/how-to-clone-demo-site');
  });

  it('does not call the model when nothing in the index matches', async () => {
    const json = await (await worker.fetch(post('/gensearch', { query: 'quantum physics' }), env)).json();
    expect(json.hits).toEqual([]);
    expect(json.result).toBe('');
    expect(env.AI.calls.some((c) => c.model === ENV_VARS.ANSWER_MODEL)).toBe(false);
  });

  it('returns 502 when the model fails', async () => {
    env.AI.run = vi.fn(async (model, input) => {
      if (model === ENV_VARS.EMBEDDING_MODEL) {
        const texts = Array.isArray(input.text) ? input.text : [input.text];
        return { data: texts.map(embed) };
      }
      throw new Error('model down');
    });
    const res = await worker.fetch(post('/gensearch', { query: 'clone' }), env);
    expect(res.status).toBe(502);
  });
});

describe('scopes (contentSource.name)', () => {
  beforeEach(() => {
    mockIndex(INDEX, DOCS);
    env = {
      ...ENV_VARS, ...DOCS_VARS, SCOPES: 'frescopa=/en/', AI: mockAi(),
    };
  });
  const scoped = (text, name) => ({ ...searchBody(text), contentSource: { name, type: 'AEM_PUBLISH' } });

  it('parses name=prefix|prefix pairs', () => {
    expect(scopesFrom('frescopa=/en/; Docs=/demo-docs/|/fr/;bad;=x')).toEqual({
      frescopa: ['/en/'],
      docs: ['/demo-docs/', '/fr/'],
    });
  });

  it('searches only the scope\'s pages', async () => {
    const json = await (await worker.fetch(post('/search', scoped('coffee and clone', 'frescopa')), env)).json();
    expect(json.results.map((r) => r.id)).toEqual(['/en/coffee']);
    const all = await (await worker.fetch(post('/search', scoped('coffee and clone', 'demo')), env)).json();
    expect(all.results.map((r) => r.id)).toContain('/demo-docs/usecases/how-to-clone-demo-site');
  });

  it('never falls back to the product docs in a scope', async () => {
    const json = await (await worker.fetch(post('/search', scoped('quantum physics', 'Frescopa')), env)).json();
    expect(json.results).toEqual([]);
  });

  it('answers from the scope\'s pages only', async () => {
    env.AI = mockAi({ answer: `See [Our coffee](${SITE}/en/coffee).` });
    const res = await worker.fetch(post('/gensearch', { query: 'coffee and clone', contentSource: { name: 'frescopa' } }), env);
    const json = await res.json();
    expect(json.hits.map((h) => h.id)).toEqual(['/en/coffee']);
    const prompt = env.AI.calls.find((c) => c.model === ENV_VARS.ANSWER_MODEL).input.messages[1].content;
    expect(prompt).not.toContain('/demo-docs/');
  });
});
