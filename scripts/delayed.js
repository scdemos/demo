// Delayed functionality – the global social share dock and the peek tab
import {
  buildBlock, decorateBlock, getMetadata, loadBlock,
} from './aem.js';
import { createTag, fetchFragment } from './shared.js';

const PEEK_FRAGMENT = '/fragments/peek';

async function injectSocialShareBlock() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('.social-share')) return;
  // On by default (fixed dock, no layout shift); authors opt out with "Social Share: off".
  if (getMetadata('social-share').toLowerCase() === 'off') return;

  const section = createTag('div', {
    class: 'section',
    'data-section-status': 'initialized',
  });
  const wrapper = createTag('div');
  const block = buildBlock('social-share', [[]]);
  wrapper.append(block);
  section.append(wrapper);

  main.append(section);

  decorateBlock(block);
  await loadBlock(block);
}

/**
 * Fragments to try for the peek tab, most specific first. Page metadata "Peek" switches it:
 * "off" hides it, a path picks that fragment. Without it, a section's own fragment
 * (/demo-docs/fragments/peek on /demo-docs/ pages) comes before the site's /fragments/peek
 * (localized per market).
 * @returns {string[]}
 */
function peekFragments() {
  const meta = getMetadata('peek').trim();
  if (meta.toLowerCase() === 'off') return [];
  if (meta) return [new URL(meta, window.location.href).pathname];
  const [first] = window.location.pathname.split('/').filter(Boolean);
  const isMarket = /^[a-z]{2}$/.test(first || '');
  return first && !isMarket ? [`/${first}${PEEK_FRAGMENT}`, PEEK_FRAGMENT] : [PEEK_FRAGMENT];
}

/**
 * Peek tab on the right edge (blocks/peek) from the first peek fragment that exists.
 * Not shown on pages under the place it links to.
 */
async function injectPeekBlock() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('.peek')) return;

  const found = await peekFragments().reduce(
    (prev, path) => prev.then((hit) => hit || fetchFragment(path).catch(() => null)),
    Promise.resolve(null),
  );
  if (!found) return;
  const content = createTag('div');
  content.innerHTML = found.html;
  const link = content.querySelector('a[href]');
  if (!link) return;
  const target = new URL(link.getAttribute('href'), window.location.href);
  const here = window.location.pathname;
  if (target.origin === window.location.origin && here.startsWith(target.pathname)) return;

  const section = createTag('div', {
    class: 'section',
    'data-section-status': 'initialized',
  });
  const wrapper = createTag('div');
  const block = buildBlock('peek', [[{ elems: [...content.querySelectorAll('p')] }]]);
  wrapper.append(block);
  section.append(wrapper);
  main.append(section);

  decorateBlock(block);
  await loadBlock(block);
}

async function init() {
  await injectSocialShareBlock();
  await injectPeekBlock();
}

init();
