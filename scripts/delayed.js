// Delayed functionality – martech and the global social share dock
import {
  buildBlock, decorateBlock, loadBlock, loadScript,
} from './aem.js';
import { createTag } from './shared.js';

async function injectSocialShareBlock() {
  const main = document.querySelector('main');
  if (!main || main.querySelector('.social-share')) return;

  const section = createTag('div', {
    class: 'section',
    'data-section-status': 'initialized',
  });
  section.style.display = null;

  const wrapper = createTag('div');
  const block = buildBlock('social-share', [[]]);
  wrapper.append(block);
  section.append(wrapper);

  main.append(section);

  decorateBlock(block);
  await loadBlock(block);
}

async function loadCloudflareAnalytics() {
  if (!window.location.hostname.includes('bbird.live')) return;

  return loadScript('https://static.cloudflareinsights.com/beacon.min.js', {
    defer: true,
    'data-cf-beacon': '{"token": "6e52f24c204942e89f9b897c49e769d6"}',
  });
}

async function init() {
  await loadCloudflareAnalytics();
  await injectSocialShareBlock();
}

init();
