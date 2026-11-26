/*
 * Optimize at Edge (Adobe Brand Visibility): AI agents asking for a page get it from the Edge
 * Optimize service, which fetches the page back through this worker and serves an AI-friendly
 * version. People and SEO bots are never routed there.
 * https://experienceleague.adobe.com/en/docs/brand-visibility/using/resources/optimize-at-edge/cloudflare-byocdn
 */

export const EDGE_OPTIMIZE_ORIGIN = 'https://live.edgeoptimize.net';

// user agents served by Edge Optimize (matched case-insensitively, anywhere in the user agent)
const AGENTIC_BOTS = [
  'AdobeEdgeOptimize-AI',
  'ChatGPT-User',
  'GPTBot',
  'OAI-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
].map((bot) => bot.toLowerCase());

// pages only: a path ending in `/`, `.html`, or without an extension
const isPagePath = (pathname) => {
  const name = pathname.split('/').pop();
  return name === '' || name.endsWith('.html') || !name.includes('.');
};

/**
 * Whether a request goes to Edge Optimize: an AI agent asking for a page, while an API key is
 * set. Edge Optimize's own fetches back to the site carry `x-edgeoptimize-request` and go to the
 * origin as usual, so they can't loop.
 * @param {Request} request
 * @param {object} env
 * @returns {boolean}
 */
export function isAgentRequest(request, env) {
  if (!env.EDGE_OPTIMIZE_API_KEY) return false;
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  if (request.headers.has('x-edgeoptimize-request')) return false;
  const url = new URL(request.url);
  if (url.port || url.pathname.startsWith('/drafts/') || !isPagePath(url.pathname)) return false;
  const agent = (request.headers.get('user-agent') || '').toLowerCase();
  return AGENTIC_BOTS.some((bot) => agent.includes(bot));
}

/**
 * The page from Edge Optimize, or null when it fails (network error, 4xx or 5xx), so the
 * caller serves the page from the origin instead.
 * @param {Request} request
 * @param {object} env - EDGE_OPTIMIZE_API_KEY; EDGE_OPTIMIZE_HOST, the site's domain at Edge
 *   Optimize (defaults to the request's host)
 * @returns {Promise<Response|null>}
 */
export async function fetchEdgeOptimized(request, env) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  // no header injection from the client, and no visitor credentials for a third party
  [...headers.keys()].filter((name) => name.startsWith('x-edgeoptimize-'))
    .forEach((name) => headers.delete(name));
  headers.delete('cookie');
  headers.delete('authorization');
  headers.set('x-forwarded-host', env.EDGE_OPTIMIZE_HOST || url.host);
  headers.set('x-edgeoptimize-url', `${url.pathname}${url.search}`);
  headers.set('x-edgeoptimize-api-key', env.EDGE_OPTIMIZE_API_KEY);
  headers.set('x-edgeoptimize-config', 'LLMCLIENT=TRUE;');
  try {
    const response = await fetch(`${EDGE_OPTIMIZE_ORIGIN}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      redirect: 'manual',
    });
    if (response.status >= 400) {
      console.warn(`edge optimize: ${response.status} for ${url.pathname}, serving the origin`);
      return null;
    }
    return response;
  } catch (error) {
    console.warn(`edge optimize: ${error.message} for ${url.pathname}, serving the origin`);
    return null;
  }
}
