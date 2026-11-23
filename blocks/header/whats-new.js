/*
 * What's new: a header tools link to a sheet (e.g. /demo-docs/data/whats-new.json) becomes a
 * button that opens the latest items in a dialog, as a Carousel (whats-new, autoplay).
 *
 * Sheet columns: date, type (the label, e.g. "New feature"), text (one line), link.
 * Newest rows come first and only the latest few are shown, so adding a row is all it takes;
 * older rows stay in the sheet but drop out of the dialog.
 *
 * While the newest item hasn't been dismissed:
 * - the button shows a dot;
 * - the dialog opens by itself once per browser session, a moment after the page loads.
 * Ticking "Don't show this again" remembers the newest item in localStorage, so the dialog
 * stays closed until a newer row is added (or the browser storage is cleared). The button
 * always opens it.
 */
import { loadSections } from '../../scripts/aem.js';
import { decorateMain } from '../../scripts/scripts.js';
import { createTag } from '../../scripts/shared.js';

const STORAGE_PREFIX = 'whats-new:';
const AUTO_OPEN_DELAY_MS = 1500;
const DEFAULT_COUNT = 6;
const DAY_MS = 86400000;
// days between 1899-12-30 (spreadsheet day 0) and 1970-01-01
const SHEET_EPOCH_DAYS = 25569;

// storage can be blocked (privacy settings): then the dialog simply shows again next time
const storage = (name) => ({
  get: (key) => {
    try {
      return window[name].getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      window[name].setItem(key, value);
    } catch {
      // nothing to remember
    }
  },
});
const local = storage('localStorage');
const session = storage('sessionStorage');

// a typed date (2026-11-21) or a spreadsheet date number
function toTime(value) {
  const raw = String(value ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return (Number(raw) - SHEET_EPOCH_DAYS) * DAY_MS;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? 0 : time;
}

// all rows with text, newest first; rows added later come first on the same date
async function loadItems(path) {
  const resp = await fetch(path);
  if (!resp.ok) return [];
  const rows = (await resp.json())?.data || [];
  return rows
    .map((r, order) => ({
      order,
      time: toTime(r.date),
      type: String(r.type || '').trim(),
      text: String(r.text || '').trim(),
      link: String(r.link || '').trim(),
    }))
    .filter((item) => item.text)
    .sort((a, b) => b.time - a.time || b.order - a.order);
}

// the newest date and how many rows share it: a new row changes it, an edit does not
function versionOf(items) {
  if (!items.length) return '';
  const newest = items[0].time;
  return `${newest}:${items.filter((i) => i.time === newest).length}`;
}

function slide(eyebrow, text, href, linkText) {
  const content = createTag('div');
  if (eyebrow) content.append(createTag('p', {}, eyebrow));
  content.append(createTag('h3', {}, text));
  if (href) content.append(createTag('p', {}, createTag('a', { href }, linkText)));
  return createTag('div', {}, [createTag('div'), content]);
}

// the same markup an author would write in a document, decorated the same way
async function buildContent(items, labels) {
  const carousel = createTag('div', { class: 'carousel whats-new autoplay' });
  items.forEach((item) => carousel.append(
    slide(item.type, item.text, item.link, labels.link),
  ));
  if (labels.moreText && labels.moreLink) {
    carousel.append(slide(labels.moreLabel, labels.moreText, labels.moreLink, labels.moreCta));
  }
  const section = createTag('div', {}, [createTag('h2', {}, labels.title), carousel]);
  const main = createTag('main', {}, section);
  decorateMain(main);
  await loadSections(main);
  return main;
}

/**
 * @param {HTMLButtonElement} button header button
 * @param {object} options path: the sheet; labels: texts from the nav's labels table
 */
export default async function announce(button, { path, labels }) {
  const key = `${STORAGE_PREFIX}${path}`;
  const count = parseInt(labels.count, 10) || DEFAULT_COUNT;
  let all = [];
  try {
    all = await loadItems(path);
  } catch {
    // nothing to show
  }
  if (!all.length) {
    button.remove();
    return;
  }
  const version = versionOf(all);
  const items = all.slice(0, count);
  const dismissed = () => local.get(key) === version;
  button.classList.toggle('has-new', !dismissed());

  let opened = false;
  const open = async (auto = false) => {
    opened = true;
    const id = `whats-new-dismiss-${Math.random().toString(36).slice(2, 8)}`;
    const checkbox = createTag('input', { type: 'checkbox', id });
    checkbox.checked = dismissed();
    const footer = createTag('div', { class: 'modal-dismiss' }, [
      checkbox,
      createTag('label', { for: id }, labels.dismiss),
    ]);
    session.set(key, version);
    const [{ openFragmentModal }, content] = await Promise.all([
      import('../modal/modal.js'),
      buildContent(items, labels),
    ]);
    // an automatic open gives way to a menu or dialog the visitor opened while it loaded
    if (auto === true && document.body.classList.contains('is-locked')) return;
    await openFragmentModal(content, {
      footer,
      label: labels.title,
      className: 'modal-announce',
      onClose: () => {
        if (checkbox.checked) local.set(key, version);
        else if (dismissed()) local.set(key, '');
        button.classList.toggle('has-new', !checkbox.checked);
      },
    });
  };

  button.addEventListener('click', () => open());

  // open by itself once per session while the newest item hasn't been dismissed
  // opened is kept in memory too, for browsers that block storage
  const shouldAutoOpen = () => !opened && !dismissed() && session.get(key) !== version;
  if (shouldAutoOpen()) {
    setTimeout(() => {
      // check again: it may have been opened or dismissed in the meantime
      if (shouldAutoOpen() && !document.body.classList.contains('is-locked')) open(true);
    }, AUTO_OPEN_DELAY_MS);
  }
}
