/*
 * Site notices: an optional entry gate (e.g. a regulatory disclaimer) and a cookie consent banner.
 * Both are authored as fragments and switched on by metadata:
 *   site-gate: /fragments/disclaimer   -> modal with `#agree` / `#cancel` links
 *   consent:   /fragments/consent      -> banner with `#accept` / `#reject` / `#settings` links;
 *                                         an optional list in the fragment defines the categories
 *                                         (first item = strictly necessary, always on).
 * Consent choices are applied to Adobe Web SDK via the martech plugin and broadcast as a
 * `consent-change` event on window.
 */
import { getMetadata } from './aem.js';
import { createTag } from './shared.js';
import { loadFragment } from '../blocks/fragment/fragment.js';

const CONSENT_KEY = 'site-consent';
const GATE_KEY = 'site-gate';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** Turns `<a href="#action">Label</a>` links into buttons and returns them by action. */
function actionButtons(root, actions) {
  const found = {};
  root.querySelectorAll('a[href^="#"]').forEach((a) => {
    const action = a.getAttribute('href').slice(1);
    if (!actions.includes(action)) return;
    const btn = createTag('button', { type: 'button', class: `site-notice-btn site-notice-${action}` }, a.textContent.trim());
    const wrap = a.closest('p');
    if (wrap && wrap.textContent.trim() === a.textContent.trim()) wrap.replaceWith(btn);
    else a.replaceWith(btn);
    found[action] = btn;
  });
  return found;
}

async function fragmentContent(path) {
  const fragment = await loadFragment(new URL(path, window.location).pathname);
  if (!fragment) return null;
  const content = createTag('div', { class: 'site-notice-content' });
  fragment.querySelectorAll(':scope > .section > div').forEach((div) => content.append(...div.childNodes));
  return content;
}

async function applyConsent(consent) {
  window.dispatchEvent(new CustomEvent('consent-change', { detail: consent }));
  try {
    const { updateUserConsent } = await import('../plugins/martech/src/index.js');
    await updateUserConsent({
      collect: consent.performance,
      marketing: consent.targeting,
      personalize: consent.targeting,
      share: false,
    });
  } catch { /* martech not configured */ }
}

async function showGate(path) {
  if (read(GATE_KEY)?.path === path) return;
  const content = await fragmentContent(path);
  if (!content) return;
  const dialog = createTag('dialog', { class: 'site-notice site-gate', 'aria-modal': 'true' });
  const { agree, cancel } = actionButtons(content, ['agree', 'cancel']);
  const actions = createTag('div', { class: 'site-notice-actions' }, [cancel, agree]);
  dialog.append(content, actions);
  document.body.append(dialog);
  dialog.addEventListener('cancel', (e) => e.preventDefault());
  agree?.addEventListener('click', () => {
    write(GATE_KEY, { path, ts: Date.now() });
    dialog.close();
    dialog.remove();
  });
  cancel?.addEventListener('click', () => {
    const exit = getMetadata('site-gate-exit');
    if (exit) window.location.href = exit;
  });
  dialog.showModal();
  agree?.focus();
}

function buildSettings(categories, current, onSave) {
  const dialog = createTag('dialog', { class: 'site-notice consent-settings', 'aria-label': 'Cookie settings' });
  const list = createTag('ul', { class: 'consent-categories' });
  const inputs = [];
  categories.forEach(({ key, title, text }, i) => {
    const id = `consent-${key}`;
    const input = createTag('input', { type: 'checkbox', id, name: key });
    input.checked = i === 0 || !!current?.[key];
    input.disabled = i === 0;
    inputs.push(input);
    const label = createTag('label', { for: id }, [createTag('strong', {}, title), text ? createTag('span', {}, text) : null]);
    list.append(createTag('li', {}, [input, label]));
  });
  const save = createTag('button', { type: 'button', class: 'site-notice-btn site-notice-accept' }, 'Save preferences');
  const close = createTag('button', { type: 'button', class: 'site-notice-btn site-notice-settings' }, 'Close');
  save.addEventListener('click', () => {
    onSave(Object.fromEntries(inputs.map((input) => [input.name, input.checked])));
    dialog.close();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.append(createTag('h2', {}, 'Cookie settings'), list, createTag('div', { class: 'site-notice-actions' }, [close, save]));
  document.body.append(dialog);
  return dialog;
}

async function showConsent(path) {
  const stored = read(CONSENT_KEY);
  if (stored) {
    applyConsent(stored);
    return;
  }
  const content = await fragmentContent(path);
  if (!content) return;

  const defaults = [
    { key: 'necessary', title: 'Strictly necessary' },
    { key: 'performance', title: 'Performance' },
    { key: 'targeting', title: 'Targeting' },
  ];
  const authored = content.querySelector('ul');
  const categories = authored
    ? [...authored.children].map((li, i) => ({
      key: defaults[i]?.key || `category${i}`,
      title: li.querySelector('strong')?.textContent.trim() || li.textContent.trim(),
      text: li.querySelector('strong') ? li.textContent.replace(li.querySelector('strong').textContent, '').trim() : '',
    }))
    : defaults;
  authored?.remove();

  const banner = createTag('section', { class: 'site-notice consent-banner', 'aria-label': 'Cookie consent', role: 'region' });
  const { accept, reject, settings } = actionButtons(content, ['accept', 'reject', 'settings']);
  banner.append(content, createTag('div', { class: 'site-notice-actions' }, [settings, reject, accept]));
  document.body.append(banner);

  const decide = (choices) => {
    const consent = Object.fromEntries(categories.map(({ key }, i) => [key, i === 0 || !!choices[key]]));
    write(CONSENT_KEY, { ...consent, ts: Date.now() });
    applyConsent(consent);
    banner.remove();
  };
  accept?.addEventListener('click', () => decide(Object.fromEntries(categories.map(({ key }) => [key, true]))));
  reject?.addEventListener('click', () => decide({}));
  settings?.addEventListener('click', () => buildSettings(categories, null, decide).showModal());
}

export default async function loadSiteNotices() {
  const gate = getMetadata('site-gate');
  const consent = getMetadata('consent');
  if (gate) await showGate(gate);
  if (consent) await showConsent(consent);
}
