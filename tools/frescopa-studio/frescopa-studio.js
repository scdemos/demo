/**
 * Frescopa Studio: edit a structured content document in DA and see it in the app that
 * uses it, as you type. One Studio for every org, site, document and schema:
 *
 *   https://da.live/app/scdemos/demo/tools/frescopa-studio/frescopa-studio#/{org}/{site}/en/app/experience
 *
 * - The document is the one after #, addressed as in DA's form editor (/org/site/path).
 *   Its schema is the one the document names.
 *   Studio edits it with the same SDK as DA's own form editor, so both open it:
 *   https://www.aem.live/docs/ew/administering/structured-content
 * - The app is a channel from the "channels" sheet of the DA site config (see README).
 *   Studio sends it the draft as you type; it shows it without saving or publishing.
 * - Fields the schema marks "format": "fragment" get a Choose button (fragment picker).
 * - Changes save to DA as you type. Preview and Publish go through the AEM admin API.
 */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { createEngine, convertHtmlToJson, convertJsonToHtml } from 'https://da.live/nx/deps/da-sc-sdk/dist/index.js';
import { renderForm, showErrors } from './form.js';

const DA_ADMIN = 'https://admin.da.live';
const AEM_ADMIN = 'https://admin.hlx.page';
// The fragment picker plugin from AEM Apps, for fields marked "format": "fragment"
// (https://github.com/adobe-rnd/aem-apps/tree/main/tools/plugins/fragments).
const FRAGMENT_PICKER = new URL('https://main--aem-apps--adobe-rnd.aem.live/tools/plugins/fragments/fragments.html');
const DEVICES = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 800 },
  kiosk: { width: 1080, height: 1920 },
  car: { width: 1280, height: 480 },
};
const FRAME = 20; // the device's border, both sides
// opened without a document (DA's Apps page always sends just #/org/site): start here
const DEFAULT_DOCUMENT = '/en/app/experience';
const LOCAL = window.location.hostname === 'localhost';

const TEXT = {
  loading: 'Loading…',
  saving: 'Saving…',
  saveFailed: 'Couldn’t save. Your changes are kept here; edit any field to try again.',
  previewing: 'Previewing…',
  publishing: 'Publishing…',
  failed: (action, status) => `${action} failed (${status}).`,
  fixFirst: (n) => `Fix ${n} ${n === 1 ? 'field' : 'fields'} before you preview or publish.`,
  schemaIssues: (name) => `The "${name}" schema has problems, so some fields can't be shown or checked. Fix it in the Schema Editor before you preview or publish.`,
  published: (time) => `Published ${time}`,
  previewed: (time) => `Previewed ${time}, not published yet`,
  notPreviewed: 'Saved, not previewed yet',
  noDocument: 'Add the document to the address after #, like #/scdemos/demo/en/app/experience',
  notFound: (path) => `${path} isn’t in DA. Create it with DA’s form editor first.`,
  loadFailed: (status) => `Couldn’t load the document (${status}).`,
  noAccess: 'Your account can’t read this site’s content in DA (403). Ask a site admin to add you to the site’s DA permissions, and check you signed in with the right organization.',
  noSchemaName: 'This document doesn’t name a schema. Open it in DA’s form editor and pick one.',
  schemaFailed: (name, status) => `Couldn’t read the "${name}" schema (${status}).`,
  noSchema: (name) => `The "${name}" schema isn’t in DA. Add it with the Schema Editor app.`,
  phoneNote: 'Your changes show here as you type. Preview and Publish update it for everyone else.',
  devices: {
    phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop', kiosk: 'Kiosk', car: 'Car display',
  },
  configFailed: (status) => `Couldn’t read the site config to find the apps to preview (${status}).`,
  noChannels: (name) => `To see your changes in an app, add a channel for "${name}" to the "channels" sheet of the site config (Channels, above).`,
  choose: 'Choose',
  chooseFragment: (label) => `Choose a fragment: ${label}`,
  closePicker: 'Close',
};

const { context, token, actions } = await DA_SDK;
// DA's fetch adds the author's current token, which DA refreshes during long sessions
const { daFetch } = actions;
// reads from the DA admin API, always fresh (DA's responses allow the browser to reuse them)
const readDA = (path) => daFetch(`${DA_ADMIN}${path}`, { cache: 'no-store' });
// the document, from the address as DA's form editor writes it: #/{org}/{site}/en/app/experience.
// Studio's own address first: Open changes it, while DA keeps the address Studio was opened with.
const [, org = '', site = '', ...rest] = (window.location.hash || context.hash || '')
  .replace(/^#/, '').replace(/\.html$/, '').split('/');
// no path after # (DA's Apps page): ?doc= from the apps sheet, like other DA apps' settings
const DOCUMENT = rest.filter(Boolean).length ? `/${rest.join('/')}`
  : new URLSearchParams(window.location.search).get('doc') || DEFAULT_DOCUMENT;
const documentHash = (path) => `#/${org}/${site}${path}`;
if (!rest.filter(Boolean).length) window.history.replaceState(null, '', documentHash(DOCUMENT));
const NAME = /^[a-z0-9][a-z0-9-]*$/; // an org, site or schema name
// a plain path in this site: no "." or ".." segments, encoding or query that could reach elsewhere
const SITE_PATH = /^(\/[a-z0-9][a-z0-9_-]*)+$/;

const statusText = document.getElementById('status');
const form = document.getElementById('form');
// fields save as you type: Enter must not submit the form and leave Studio
form.addEventListener('submit', (event) => event.preventDefault());
const phone = document.getElementById('phone');
const channelSelect = document.getElementById('channel');
const deviceSelect = document.getElementById('device');
const stage = document.getElementById('stage');
const previewButton = document.getElementById('preview');
const publishButton = document.getElementById('publish');
const setStatus = (text) => { statusText.textContent = text; };

const when = (date) => new Date(date).toLocaleString([], {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

/** A schema by name. */
async function loadSchema(name) {
  const resp = await readDA(`/source/${org}/${site}/.da/forms/schemas/${name}.html`);
  if (resp.status === 404) throw new Error(TEXT.noSchema(name));
  if (!resp.ok) throw new Error(TEXT.schemaFailed(name, resp.status));
  // DA stores a schema as JSON inside <pre><code> (see DA's Schema Editor)
  const code = new DOMParser().parseFromString(await resp.text(), 'text/html').querySelector('code');
  if (!code) throw new Error(TEXT.schemaFailed(name, resp.status));
  return JSON.parse(code.textContent);
}

/** The document, with its schema name in metadata.schemaName. */
async function loadDocument() {
  const resp = await readDA(`/source/${org}/${site}${DOCUMENT}.html`);
  if (resp.status === 404) throw new Error(TEXT.notFound(DOCUMENT));
  if (resp.status === 403) throw new Error(TEXT.noAccess);
  if (!resp.ok) throw new Error(TEXT.loadFailed(resp.status));
  const { json, error } = convertHtmlToJson({ html: await resp.text() });
  if (error) throw new Error(error);
  return json;
}

function saveDocument(engine) {
  const { document: json, model } = engine.getState();
  const { html } = convertJsonToHtml({ json, model });
  const body = new FormData();
  body.append('data', new Blob([html], { type: 'text/html' }));
  return daFetch(`${DA_ADMIN}/source/${org}/${site}${DOCUMENT}.html`, { method: 'POST', body });
}

/**
 * Opens the fragment picker plugin in a dialog and hosts it the way DA's library does:
 * it gets the DA context and token over a MessagePort, and sends back the link to
 * insert (sendHTML), then closeLibrary. Resolves with the fragment's path, or null.
 */
function chooseFragment(title) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    // no allow-top-navigation: the picker can't move the DA tab elsewhere
    frame.sandbox = 'allow-scripts allow-same-origin allow-popups allow-forms';
    frame.referrerPolicy = 'no-referrer';
    frame.src = FRAGMENT_PICKER.href;
    frame.title = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'studio-button';
    close.textContent = TEXT.closePicker;
    const dialog = document.createElement('dialog');
    dialog.className = 'picker';
    dialog.setAttribute('aria-label', title);
    dialog.append(close, frame);

    let path = null;
    const finish = () => {
      dialog.close();
      dialog.remove();
      resolve(path);
    };
    close.addEventListener('click', finish);
    dialog.addEventListener('cancel', finish); // Escape, while focus is outside the picker

    frame.addEventListener('load', () => {
      const channel = new MessageChannel();
      channel.port1.onmessage = ({ data }) => {
        if (data?.action === 'sendHTML') path = fragmentPath(data.details);
        if (data?.action === 'closeLibrary') finish();
      };
      frame.contentWindow.postMessage({
        ready: true, context: { org, repo: site, path: DOCUMENT }, token,
      }, FRAGMENT_PICKER.origin, [channel.port2]);
    }, { once: true });

    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * The documents next to this one, in a select like Channel and Device: picking one opens it.
 * Studio reloads on its own address; DA keeps the address it opened Studio with.
 */
// resolves true once this document's edits are saved; set when the form is ready
let savedBeforeLeaving = () => Promise.resolve(true);

async function showDocuments() {
  const select = document.getElementById('document');
  const folder = DOCUMENT.slice(0, DOCUMENT.lastIndexOf('/'));
  const resp = await readDA(`/list/${org}/${site}${folder}`);
  if (!resp.ok) return;
  const prefix = `/${org}/${site}`;
  const paths = (await resp.json())
    .filter((item) => item.ext === 'html')
    .map((item) => item.path.slice(prefix.length).replace(/\.html$/, ''))
    .filter((path) => SITE_PATH.test(path))
    .sort();
  if (!paths.includes(DOCUMENT)) paths.unshift(DOCUMENT);
  if (paths.length < 2) return;
  select.replaceChildren(...paths.map((path) => new Option(path, path, false, path === DOCUMENT)));
  select.hidden = false;
  select.addEventListener('change', async () => {
    const next = select.value;
    select.disabled = true;
    // an edit still saving would be lost on reload: wait for it, stay here if it fails
    if (!await savedBeforeLeaving()) {
      select.value = DOCUMENT;
      select.disabled = false;
      setStatus(TEXT.saveFailed);
      return;
    }
    window.location.hash = documentHash(next);
    window.location.reload();
  });
}

/** The path of the fragment link the picker sends, if it's a page on this site. */
function fragmentPath(html) {
  const href = new DOMParser().parseFromString(String(html), 'text/html').querySelector('a[href]')?.getAttribute('href');
  try {
    const url = new URL(href);
    const host = `https://main--${site}--${org}.aem.page`;
    return url.origin === host && /^\/[^/]/.test(url.pathname) ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * The fields the schema marks "format": "fragment", as patterns for the form's field
 * pointers (/data/announcement, /data/tabs/0/opens…). Read from the schema itself:
 * the structured content SDK drops formats it doesn't know.
 */
function fragmentFields(schema) {
  // a key as a JSON Pointer segment (~ and / escaped), then as literal regex text
  const escape = (key) => key.replaceAll('~', '~0').replaceAll('/', '~1')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lookup = (ref) => ref.replace(/^#\//, '').split('/')
    .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((n, key) => n?.[key], schema);
  /**
   * Follows a chain of $refs; each one's own keywords (e.g. "format": "fragment") apply
   * on top of what it refers to, and both sides' properties are kept, as in the SDK.
   * A ref already followed on this branch (a schema that refers to itself), or one that
   * leads nowhere, isn't followed: the field keeps what it has. Returns the field, the
   * refs followed, and the node's own keywords.
   */
  const resolve = (node, refs) => {
    if (!node || typeof node !== 'object') return null;
    const own = { ...node };
    delete own.$ref;
    let field = node;
    const seen = new Set(refs);
    while (field.$ref) {
      const { $ref, ...rest } = field;
      const target = seen.has($ref) ? null : lookup($ref);
      seen.add($ref);
      if (!target || typeof target !== 'object') {
        field = rest;
        break;
      }
      field = { ...target, ...rest, properties: { ...target.properties, ...rest.properties } };
    }
    return { field, seen, own };
  };
  const patterns = [];
  const walk = (node, pointer, refs) => {
    const resolved = resolve(node, refs);
    if (!resolved) return;
    const { field, seen, own } = resolved;
    // parts the node states itself aren't inside its refs: a ref they repeat isn't a loop
    const refsFor = (isOwn) => (isOwn ? refs : seen);
    if (field.format === 'fragment') patterns.push(new RegExp(`^${pointer}$`));
    Object.entries(field.properties ?? {})
      .forEach(([key, child]) => walk(child, `${pointer}/${escape(key)}`, refsFor(own.properties?.[key])));
    if (field.items) walk(field.items, `${pointer}/\\d+`, refsFor(own.items));
    ['oneOf', 'anyOf', 'allOf'].forEach((keyword) => (field[keyword] ?? [])
      .forEach((option) => walk(option, pointer, refsFor(own[keyword]))));
  };
  walk(schema, '/data', new Set());
  return patterns;
}

/** Adds a Choose button next to each fragment field. */
function addPickers(engine, patterns) {
  return (form) => form.querySelectorAll('input[data-pointer]').forEach((input) => {
    const { pointer, label } = input.dataset;
    if (!patterns.some((pattern) => pattern.test(pointer))) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'studio-button';
    button.textContent = TEXT.choose;
    button.setAttribute('aria-label', `${TEXT.choose}: ${label}`);
    button.addEventListener('click', async () => {
      const path = await chooseFragment(TEXT.chooseFragment(label));
      if (!path) return;
      input.value = path;
      engine.setField(pointer, path);
      input.focus();
    });
    const row = document.createElement('div');
    row.className = 'field-row';
    input.replaceWith(row);
    row.append(input, button);
  });
}

/** Preview, publish or status for the document, through the AEM admin API. */
function admin(route, method = 'POST') {
  return daFetch(`${AEM_ADMIN}/${route}/${org}/${site}/main${DOCUMENT}`, { method });
}

const time = (date) => (date ? new Date(date).getTime() : 0);

/** When the document was last saved in DA, from DA's list of its folder. */
async function lastEdited() {
  const folder = DOCUMENT.slice(0, DOCUMENT.lastIndexOf('/'));
  const name = DOCUMENT.slice(folder.length + 1);
  const resp = await readDA(`/list/${org}/${site}${folder}`);
  if (!resp.ok) return 0;
  const item = (await resp.json()).find((i) => i.name === name && i.ext === 'html');
  return item?.lastModified ?? 0;
}

/** Where the saved document stands: not previewed, previewed, or published. */
async function showPublishState() {
  const [resp, edited] = await Promise.all([admin('status', 'GET'), lastEdited()]);
  if (!resp.ok) {
    setStatus(TEXT.failed('Checking the publish status', resp.status));
    return;
  }
  const { preview, live } = await resp.json();
  const [previewed, published] = [preview, live].map((s) => time(s?.lastModified));
  if (!previewed || edited > previewed) setStatus(TEXT.notPreviewed);
  else if (!published || previewed > published) setStatus(TEXT.previewed(when(preview.lastModified)));
  else setStatus(TEXT.published(when(live.lastModified)));
}

/**
 * Saves after each change, one request at a time: changes made during a save
 * are saved right after it, so a slow request never overwrites newer content.
 */
function autosave(engine, saved) {
  let saving = null;
  let again = false;
  let lastOk = true; // whether the latest save worked: Preview and Publish wait for one that did
  const run = async () => {
    setStatus(TEXT.saving);
    let ok = false;
    try {
      // still "saving" until saved() has run, so nothing sees a half-finished save;
      // a change made meanwhile goes round the loop again
      do {
        again = false;
        ok = (await saveDocument(engine)).ok;
        if (ok && !again) await saved().catch(() => {}); // saved, even if the follow-up fails
      } while (again && ok);
    } catch {
      ok = false; // offline or blocked: the next change tries again
    } finally {
      saving = null;
    }
    lastOk = ok;
    if (!ok) setStatus(TEXT.saveFailed);
    return ok;
  };
  return {
    changed() {
      if (saving) again = true;
      else saving = run();
    },
    /** Resolves once everything is saved: true if it saved. */
    done: () => saving ?? Promise.resolve(lastOk),
  };
}

/**
 * The channels for this schema, from the "channels" sheet of the DA site config.
 * localhost channels show only while Studio itself runs locally (aem up, ?ref=local).
 */
async function loadChannels(schemaName) {
  const resp = await readDA(`/config/${org}/${site}`);
  if (resp.status === 404) return [];
  if (!resp.ok) throw new Error(TEXT.configFailed(resp.status));
  const rows = (await resp.json()).channels?.data ?? [];
  return rows
    .map((row) => ({ ...row, device: (row.device || 'phone').trim().toLowerCase() }))
    .filter((row) => row.label && DEVICES[row.device]
      && channelUrl(row.url) && (!row.schema || row.schema === schemaName))
    // while developing, the local app first: it's the one that has your code changes
    .sort((a, b) => Number(LOCAL && /^http:/.test(b.url)) - Number(LOCAL && /^http:/.test(a.url)));
}

/**
 * A channel's URL for previewed content, from its template: {tier} preview, {tld} page,
 * {path}, {slug}, {org}, {site}. Null unless it's https (or http://localhost while Studio
 * runs locally) and the tokens don't change which site it points at.
 */
function channelUrl(template) {
  const fill = (path, slug) => template
    .replaceAll('{tier}', 'preview')
    .replaceAll('{tld}', 'page')
    .replaceAll('{path}', path)
    .replaceAll('{slug}', slug)
    .replaceAll('{org}', org)
    .replaceAll('{site}', site);
  try {
    const url = new URL(fill(DOCUMENT, encodeURIComponent(DOCUMENT.split('/').pop())));
    const plain = new URL(fill('/path', 'slug'));
    const allowed = url.protocol === 'https:'
      || (LOCAL && url.protocol === 'http:' && url.hostname === 'localhost');
    return allowed && !url.username && !url.password && url.origin === plain.origin ? url : null;
  } catch {
    return null;
  }
}

/**
 * Shows the document in its channels. The app on screen gets the draft as you type:
 * it says when it's ready ({ type: 'structured-content-ready' }) and Studio sends
 * { type: 'structured-content', org, site, path, data } to it. See README.
 */
function connectChannels(engine, channels) {
  let channel;
  const send = () => phone.contentWindow?.postMessage({
    type: 'structured-content', org, site, path: DOCUMENT, data: engine.getState().document.data,
  }, channelUrl(channel.url).origin);
  window.addEventListener('message', (event) => {
    if (event.source === phone.contentWindow && event.data?.type === 'structured-content-ready') send();
  });

  // the device at its own size, scaled down to fit the column and the window
  const fit = () => {
    const device = deviceSelect.value;
    const { width, height } = DEVICES[device];
    const room = stage.getBoundingClientRect().width;
    const scale = Math.max(Math.min(room / (width + FRAME), (window.innerHeight - 180) / (height + FRAME), 1), 0.1);
    Object.assign(phone.style, { width: `${width}px`, height: `${height}px`, transform: `scale(${scale})` });
    stage.style.height = `${(height + FRAME) * scale}px`;
    phone.dataset.device = device;
  };
  const show = () => {
    channel = channels[channelSelect.selectedIndex];
    deviceSelect.value = channel.device; // each channel opens on its own device
    phone.title = channel.label;
    phone.src = channelUrl(channel.url).href;
    fit();
  };
  document.getElementById('preview-bar').hidden = false;
  stage.hidden = false;
  channelSelect.replaceChildren(...channels.map((c) => new Option(c.label)));
  channelSelect.hidden = channels.length < 2;
  channelSelect.addEventListener('change', show);
  deviceSelect.replaceChildren(...Object.keys(DEVICES).map((d) => new Option(TEXT.devices[d], d)));
  deviceSelect.addEventListener('change', fit);
  new ResizeObserver(fit).observe(stage);
  window.addEventListener('resize', fit);
  document.getElementById('phone-note').textContent = TEXT.phoneNote;
  show();

  let timer;
  const update = () => {
    clearTimeout(timer);
    timer = setTimeout(send, 250);
  };
  // reloads the app, e.g. after Preview; an app that takes drafts asks for one again
  update.reload = () => { phone.src = channelUrl(channel.url).href; };
  return update;
}

async function init() {
  if (!NAME.test(org) || !NAME.test(site) || !SITE_PATH.test(DOCUMENT)) {
    setStatus(TEXT.noDocument);
    return;
  }
  // the other documents work even when this one can't be loaded: pick another one
  showDocuments().catch(() => {});
  setStatus(TEXT.loading);
  document.getElementById('open-in-da').href = `https://da.live/form#/${org}/${site}${DOCUMENT}`;
  // the site config, where the channels sheet says which apps show which schema
  document.getElementById('channels-config').href = `https://da.live/config#/${org}/${site}/`;

  // when DA last saved the document, read before it: a save in between only causes a reload
  const loadedRevision = await lastEdited();
  const json = await loadDocument();
  const { schemaName } = json.metadata ?? {};
  if (!NAME.test(schemaName ?? '')) {
    setStatus(TEXT.noSchemaName);
    return;
  }
  // the form doesn't need the channels: if they can't be read, say so beside it
  const [schema, channels] = await Promise.all([
    loadSchema(schemaName),
    loadChannels(schemaName).catch((error) => error),
  ]);

  let save;
  let updatePhone;
  let publishing = false; // Preview or Publish is running: one at a time
  let freshness = null; // the check for changes made in DA meanwhile, while it runs
  let lastDocument;
  let engine;
  const errorCount = () => Object.keys(engine.getState().validation.errors).length;
  /** Preview and Publish need a valid document; the status says what to fix. */
  const checkErrors = () => {
    const errors = errorCount();
    const schemaBroken = (engine.getState().schemaIssues?.length ?? 0) > 0;
    const busy = publishing || Boolean(freshness);
    previewButton.disabled = busy || errors > 0 || schemaBroken;
    publishButton.disabled = busy || errors > 0 || schemaBroken;
    if (schemaBroken) setStatus(TEXT.schemaIssues(schemaName));
    else if (errors) setStatus(TEXT.fixFirst(errors));
    return errors + Number(schemaBroken);
  };

  engine = createEngine({
    schema,
    document: json,
    onChange: () => {
      const { document: next } = engine.getState();
      if (next === lastDocument) return;
      lastDocument = next;
      showErrors(form, engine);
      checkErrors();
      save.changed();
      updatePhone();
    },
  });
  lastDocument = engine.getState().document;
  // When the document was last saved in DA, by Studio or anyone else
  let known = loadedRevision;
  save = autosave(engine, async () => {
    known = await lastEdited();
    if (!checkErrors()) setStatus(TEXT.notPreviewed);
  });
  savedBeforeLeaving = () => save.done();
  // Someone changed the document in DA (e.g. DA's form editor) while Studio was in the
  // background: reload it rather than overwrite their changes with the next save.
  // Editing waits for the check, so nothing typed meanwhile is saved over their changes.
  window.addEventListener('focus', () => {
    if (publishing || freshness) return;
    form.inert = true;
    freshness = (async () => {
      if (!await save.done()) return;
      if (await lastEdited() > known) window.location.reload();
    })().catch(() => {}).finally(() => {
      freshness = null;
      form.inert = publishing;
      checkErrors();
    });
    checkErrors();
  });
  if (Array.isArray(channels) && channels.length) {
    updatePhone = connectChannels(engine, channels);
  } else {
    updatePhone = Object.assign(() => {}, { reload: () => {} });
    document.getElementById('phone-note').textContent = channels.message ?? TEXT.noChannels(schemaName);
  }
  renderForm(form, engine, { decorate: addPickers(engine, fragmentFields(schema)) });
  if (!checkErrors()) await showPublishState();

  // Publishing goes through preview first, as in DA.
  const publish = async (steps) => {
    if (publishing || freshness) return;
    publishing = true;
    form.inert = true; // the saved, checked document is the one that gets published
    previewButton.disabled = true;
    publishButton.disabled = true;
    try {
      if (!await save.done()) {
        setStatus(TEXT.saveFailed);
        return;
      }
      // the author may have edited while it saved: only publish a valid document
      if (checkErrors()) return;
      for (const [route, busy, name] of steps) {
        setStatus(busy);
        const resp = await admin(route);
        if (!resp.ok) {
          setStatus(TEXT.failed(name, resp.status));
          return;
        }
      }
      updatePhone.reload(); // apps that only read previewed content show it now
      await showPublishState();
    } catch {
      setStatus(TEXT.failed(steps.at(-1)[2], 'network error'));
    } finally {
      form.inert = false;
      publishing = false;
      checkErrors();
    }
  };
  previewButton.addEventListener('click', () => publish([['preview', TEXT.previewing, 'Preview']]));
  publishButton.addEventListener('click', () => publish([
    ['preview', TEXT.previewing, 'Preview'],
    ['live', TEXT.publishing, 'Publish'],
  ]));
}

init().catch((error) => setStatus(error.message));
