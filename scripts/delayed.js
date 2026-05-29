// Delayed functionality – martech, accessiBe, and the global social share dock
import {
  buildBlock, decorateBlock, loadBlock, loadScript,
} from './aem.js';
import { createTag } from './shared.js';

// Domain registered in accessiBe (must resolve at eu-cdn.acsbapp.com/config/{domain}/config.json).
// Used when the current host is not licensed (localhost, *.aem.page, etc.).
const ACCESSIBE_LICENSED_DOMAIN = 'lacoste.com';
const ACCESSIBE_SCRIPT = 'https://eu.acsbapp.com/apps/app/dist/js/app.js';

const ACCESSIBE_CONFIG = {
  statementLink: '',
  footerHtml: '',
  hideMobile: false,
  hideTrigger: false,
  language: 'en',
  position: 'right',
  leadColor: '#146ff8',
  triggerColor: '#146ff8',
  triggerRadius: '50%',
  triggerPositionX: 'right',
  triggerPositionY: 'bottom',
  triggerIcon: 'people',
  triggerSize: 'medium',
  triggerOffsetX: 20,
  triggerOffsetY: 20,
  mobile: {
    triggerSize: 'small',
    triggerPositionX: 'right',
    triggerPositionY: 'bottom',
    triggerOffsetX: 10,
    triggerOffsetY: 10,
  },
};

function shouldRewriteAccessiBeConfig() {
  const { hostname } = window.location;
  return hostname !== ACCESSIBE_LICENSED_DOMAIN;
}

function installAccessiBeConfigRewrite() {
  if (!shouldRewriteAccessiBeConfig() || window.__accessibeConfigRewrite) return;

  window.__accessibeConfigRewrite = true;
  const licensedDomain = ACCESSIBE_LICENSED_DOMAIN;
  const configPattern = /((?:eu-)?cdn\.acsbapp\.com\/config\/)[^/]+(\/)/;

  const { fetch: origFetch } = window;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url && configPattern.test(url)) {
      const rewritten = url.replace(configPattern, `$1${licensedDomain}$2`);
      return origFetch(rewritten, init);
    }
    return origFetch(input, init);
  };

  const { open: origOpen } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
    if (typeof url === 'string' && configPattern.test(url)) {
      return origOpen.call(this, method, url.replace(configPattern, `$1${licensedDomain}$2`), ...rest);
    }
    return origOpen.call(this, method, url, ...rest);
  };
}

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

async function loadAccessiBe() {
  if (window.__accessibeLoaded) return;

  installAccessiBeConfigRewrite();

  const src = ACCESSIBE_SCRIPT;
  const config = JSON.stringify(ACCESSIBE_CONFIG);

  await new Promise((resolve, reject) => {
    const finish = (error) => {
      window.removeEventListener('accessibe-ready', onReady);
      window.removeEventListener('accessibe-error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error('accessiBe failed to load'));

    window.addEventListener('accessibe-ready', onReady, { once: true });
    window.addEventListener('accessibe-error', onError, { once: true });

    if (document.querySelector(`script[src="${src}"]`)) {
      if (window.acsbJS?.init) window.acsbJS.init(ACCESSIBE_CONFIG);
      window.__accessibeLoaded = true;
      finish();
      return;
    }

    const nonce = document.querySelector('script[nonce]')?.nonce || 'aem';
    const bootstrap = document.createElement('script');
    bootstrap.nonce = nonce;
    bootstrap.textContent = `(function(){
      var s = document.createElement('script');
      var h = document.querySelector('head') || document.body;
      s.src = '${src}';
      s.async = true;
      s.onload = function() {
        acsbJS.init(${config});
        window.__accessibeLoaded = true;
        window.dispatchEvent(new Event('accessibe-ready'));
      };
      s.onerror = function() {
        window.dispatchEvent(new Event('accessibe-error'));
      };
      h.appendChild(s);
    })();`;
    document.head.appendChild(bootstrap);
  });
}

async function init() {
  await Promise.all([
    loadCloudflareAnalytics(),
    loadAccessiBe().catch((err) => console.warn('[accessiBe]', err.message)),
    injectSocialShareBlock(),
  ]);
}

init();
