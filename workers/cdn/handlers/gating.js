/**
 * Gated pages: `<meta name="gated" content="true">` + section audience (`data-view` or section-metadata `view`).
 */
import { load } from 'cheerio';
import { isAuthenticated } from './auth-check.js';

const SKIP = ['/fragments/', '/nav.plain.html', '/footer.plain.html'];
const GATED_META = /<meta[^>]+name=["']gated["'][^>]*content=["']true["']/i;

function audience($, $section) {
  const a = String($section.attr('data-view') || '').trim().toLowerCase();
  if (a === 'logged-in' || a === 'logged-out') return a;

  const meta = $section.find('.section-metadata').first();
  if (!meta.length) return null;
  const viewDiv = meta.find('div').filter((__, div) => $(div).text().trim().toLowerCase() === 'view');
  if (!viewDiv.length) return null;
  const v = String(viewDiv.next().text() || '').trim().toLowerCase();
  return v === 'logged-in' || v === 'logged-out' ? v : null;
}

function transformGatedHtml(html, loggedIn) {
  const $ = load(html);
  const removeEls = new Set();
  $('main > div').each((_, el) => {
    const $s = $(el);
    const aud = audience($, $s);
    if (aud) {
      const drop = (loggedIn && aud === 'logged-out') || (!loggedIn && aud === 'logged-in');
      if (drop) removeEls.add(el);
    }
    if (!removeEls.has(el)) {
      if (loggedIn) $s.find('[class*="logged-out"]').remove();
      else $s.find('[class*="logged-in"]').remove();
    }
  });
  removeEls.forEach((node) => $(node).remove());
  return $.html();
}

function mergeVaryCookie(headers) {
  const vary = headers.get('Vary');
  if (!vary) {
    headers.set('Vary', 'Cookie');
    return;
  }
  if (vary.split(',').map((s) => s.trim().toLowerCase()).includes('cookie')) return;
  headers.set('Vary', `${vary}, Cookie`);
}

/** @param {boolean} [personalized] — gated HTML was changed per user; tighten cache + Vary. */
function htmlResponse(body, source, personalized = false) {
  const headers = new Headers(source.headers);
  if (personalized) {
    headers.delete('content-length');
    headers.set('Cache-Control', 'private, no-cache, must-revalidate');
    headers.delete('Age');
    mergeVaryCookie(headers);
  }
  return new Response(body, {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
}

export async function applyGatingIfNeeded(request, requestURL, response) {
  if (request.method !== 'GET' || response.status !== 200) return response;
  if (SKIP.some((p) => requestURL.pathname.startsWith(p))) return response;
  if (!(response.headers.get('content-type') || '').includes('text/html')) return response;

  const html = await response.text();

  if (!GATED_META.test(html)) {
    return htmlResponse(html, response);
  }

  const out = transformGatedHtml(html, isAuthenticated(request));
  return htmlResponse(out, response, out !== html);
}
