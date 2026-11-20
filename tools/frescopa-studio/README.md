# Frescopa Studio (`/tools/frescopa-studio`)

A DA app for editing a structured content document next to the app that uses it, with the app updating as you type. Built once and shared: it works for any org, site, document and schema. The [Frescopa app](https://github.com/scdemos/frescopa-app) today, a CarPlay or kiosk app on another schema tomorrow, in your org or a customer demo org.

**Open** with the document after `#`, addressed as DA's form editor does (`/org/site/path`):

```
https://da.live/app/scdemos/demo/tools/frescopa-studio/frescopa-studio#/scdemos/demo/en/app/experience
```

Studio is hosted in `scdemos/demo`; only the part after `#` changes. Studio reads and saves the document with the author's own DA login, so it works for any site they can edit.

Opened with only the site after `#` (DA's **Apps** page always opens apps that way, whatever path the `apps` sheet holds), Studio opens the document in `?doc=` (e.g. `…/frescopa-studio?doc=/en/app/experience` in the `apps` sheet), or `/en/app/experience` without it. The document menu in the toolbar lists the documents in the same folder; pick one to open it.

**403:** the author's DA login can't read the site's content. Add them (or their IMS group) to a row in the org's DA `permissions` sheet that covers the site, like `/demo/+**`, and check they signed in with that organization.

- **As you type:** changes save to DA, and the app on the right shows them straight away.
- **Preview:** updates the document's preview content (what `…?preview` apps read).
- **Publish:** previews, then publishes.
- **Channel and device:** pick which app to show, and on which device (phone, tablet, desktop, kiosk, car display).
- **Channels:** opens the site's DA config, where the `channels` sheet says which apps show which schema. Add a row there to show a new schema or app experience in Studio.
- **Choose:** fields the schema marks as fragments get a button that opens the [AEM Apps fragment picker](https://github.com/adobe-rnd/aem-apps/tree/main/tools/plugins/fragments).

To open another document, pick it in the document menu, or change the part after `#` and reload: DA doesn't reload apps when only the `#` changes.

DA's own form editor (`Open in DA`) opens the same document, because both use DA's structured content SDK.

## Set up a document

Everything below lives in the document's own site (`/org/site`), not in this repo:

1. **Schema:** create it with DA's [Schema Editor](https://da.live/apps/schema). To give a field the fragment picker, add `"format": "fragment"` to it (a string field holding a path like `/en/fragments/…`).
2. **Document:** create it in DA's form editor with that schema. Studio reads the schema name from the document.
3. **Channels:** add a row per app to the `channels` sheet of that site's DA config (`https://da.live/config#/{org}/{site}/`). This site's rows:

| schema | label | url | device |
| --- | --- | --- | --- |
| `frescopa-app` | Frescopa app | `https://scdemos.github.io/frescopa-app/app/?{tier}` | `phone` |
| `frescopa-app` | Frescopa app (local) | `http://localhost:4321/app/?{tier}` | `phone` |

- **schema:** which documents the channel shows. Empty means every document.
- **url:** tokens `{tier}` (`preview`), `{tld}` (`page`), `{path}` (`/en/app/experience`), `{slug}` (`experience`), `{org}`, `{site}`. `http://localhost` channels only show while Studio itself runs locally.
- **device:** the device the channel opens on; `phone` when empty.

## Make an app previewable as you type

Studio loads the channel URL in a frame. To show the author's changes before they're saved or published, the app:

1. Tells Studio it's ready: `window.parent.postMessage({ type: 'structured-content-ready' }, '*')`.
2. Listens for `{ type: 'structured-content', org, site, path, data }` from its parent frame on Studio's origin (`https://*--demo--scdemos.preview.da.live`), checks `org`, `site` and `path` are its document, and renders `data` (the document's fields).

An app that doesn't do this still works in Studio; it shows the previewed content and updates after Preview. See `listenToStudio()` in the Frescopa app's `app/app.js`.

## How it works

- `frescopa-studio.js` loads the document, its schema (`/.da/forms/schemas/{name}`) and the channels from DA with the author's token ([DA App SDK](https://docs.da.live/developers/guides/developing-apps-and-plugins)), saves with the DA source API, and previews and publishes with the AEM admin API.
- `form.js` draws the form from the [da-sc-sdk](https://github.com/adobe/da-sc-sdk) model. Labels, help text, options and limits come from the schema, so a schema change needs no code change.
- The fragment picker is AEM Apps' DA plugin, loaded from its own host. Studio hosts it the way DA's library does: it passes the DA context and token over a `MessagePort` and takes the path from the link the plugin sends back (`sendHTML`), only if it's a page on this site. That gives the author's DA token to code served from `adobe-rnd/aem-apps`, as registering it as a DA library plugin by URL would.

## Develop

```sh
aem up                     # serves this repo on localhost:3000
# in frescopa-app: npm start (the app on localhost:4321)
```

Open the Studio URL with `?ref=local` before the `#`: `…/frescopa-studio?ref=local#/scdemos/demo/en/app/experience`.
