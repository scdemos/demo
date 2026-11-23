/*
 * Site notice: an optional entry gate (e.g. a regulatory disclaimer), authored as a fragment
 * and switched on by metadata:
 *   site-gate: /fragments/disclaimer   -> modal with `#agree` / `#cancel` links
 * The cookie consent banner is separate: scripts/consent-check.js.
 */
import { getMetadata } from './aem.js';
import { createTag } from './shared.js';
import { loadFragment } from '../blocks/fragment/fragment.js';

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

async function showGate(path) {
  if (read(GATE_KEY)?.path === path) return;
  const content = await fragmentContent(path);
  if (!content) return;
  const dialog = createTag('dialog', { class: 'site-notice site-gate', 'aria-modal': 'true' });
  const heading = content.querySelector('h1, h2, h3');
  if (heading) {
    heading.id ||= 'site-gate-title';
    dialog.setAttribute('aria-labelledby', heading.id);
  }
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

export default async function loadSiteNotices() {
  const gate = getMetadata('site-gate');
  if (gate) await showGate(gate);
}
