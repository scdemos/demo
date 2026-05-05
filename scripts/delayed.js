// Delayed functionality – martech integrations
import {
  loadScript,
} from './aem.js';

async function loadCloudflareAnalytics() {
  if (!window.location.hostname.includes('bbird.live')) return;

  return loadScript('https://static.cloudflareinsights.com/beacon.min.js', {
    defer: true,
    'data-cf-beacon': '{"token": "6e52f24c204942e89f9b897c49e769d6"}',
  });
}

async function init() {
  await loadCloudflareAnalytics();
}

init();
