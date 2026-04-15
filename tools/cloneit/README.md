# CloneIt

Clone a **template** repoless site under `scdemos` to a **new** site name in one run.

## Template list (org config)

The **Template** dropdown is filled from the **scdemos** org **DA config** (`GET /config/scdemos/`), multi-sheet document, sheet name **`demosites`**. Each row is:

| Column | Meaning |
|--------|---------|
| `name` | Label shown in the UI (e.g. Finance, Health). |
| `site` | DA + Helix folder segment for the baseline (e.g. `financedemo`, `demo`). Lowercase letters, numbers, hyphens only. |

Add or change rows in Document Authoring to maintain templates—no code deploy required for the list.

The list is loaded in the browser with **DA_SDK** (`https://da.live/nx/utils/sdk.js`) and `actions.daFetch`. Open CloneIt **from a DA context** while signed in; otherwise the template list may stay empty and a toast asks you to sign in and refresh.

## What It Does

CloneIt creates a new repoless site by:

1. **Creating DA folder** – Creates the new site folder in DA with a minimal `index.html`.
2. **Copying DA config** – Fetches repo-level config from the **selected template** baseline via [DA Config GET](https://opensource.adobe.com/da-admin/#tag/Config/operation/getConfig) and creates it for the new site via [DA Config POST](https://opensource.adobe.com/da-admin/#tag/Config/operation/createConfig). Skipped if baseline has no config.
3. **Copying DA content** – Recursively copies all files from `scdemos/{template}` to the new site folder, skipping `drafts`, `demo-docs`, and **locale folders** (segment names like `en`, `fr`, `de`, `ja`, `hi`, `zh`, plus other common ISO 639-1 codes and a few regional variants such as `zh-cn`, `pt-br`). Uses the [DA List API](https://admin.da.live/list) to discover all files, then the [DA Copy API](https://opensource.adobe.com/da-admin/#tag/Copy) per file (the Copy API does not recurse into folders). If copy fails, falls back to updating the minimal `index.html`.
4. **Creating the AEM site config** – Fetches the baseline configuration from the [AEM Admin API](https://www.aem.live/docs/admin.html#tag/siteConfig/operation/createSiteSite) for the template, copies only code, sidekick, and headers, sets content to the new DA URL, and creates the site via `PUT /config/{org}/sites/{site}.json`
5. **Copying query index config** – Fetches the template’s `query.yaml` and writes it with **`PUT`** (create per [IndexConfig](https://www.aem.live/docs/admin.html#schema/IndexConfig)); on **409** conflict, **`POST`** (update). Then **GETs the same URL** (with retries) so you see **copied and verified** when propagation succeeds. If the baseline has no `query.yaml`, CloneIt shows that nothing was copied. If the write fails, the error is shown; if write succeeds but `GET` stays empty, the UI warns with a link to the Admin API URL for manual checks.

After a successful clone, use **Copy handoff** to copy a plain-text block (Preview URL, DA content, Code) for email or Slack.

The new site uses `https://content.da.live/scdemos/{sitename}/` as its content source.

**Edit in DA:** `https://da.live/#/scdemos/{sitename}`

## How to Use

**Note:** Sign in to Document Authoring and open CloneIt from a DA context (e.g. Sidekick) so the template list loads.

1. Open the app from the AEM Sidekick (CloneIt button) or navigate to `/tools/cloneit/cloneit.html`
2. **Authentication** – DA_SDK needs an active DA session to read org config for the dropdown. Clone operations use the **CloneIt worker** (see below).
3. Choose a **template** from the dropdown.
4. Enter a **site name** (lowercase, numbers and hyphens only, max 50 chars). It must not match the template `site` or reserved names like `admin`, `api`, `config`.
5. Click **Start clone**
6. Access your new site at `https://main--{sitename}--scdemos.aem.page`
7. **Bulk Preview/Publish** (optional) – After a successful clone, click **Bulk Preview/Publish** to copy all content URLs to your clipboard. A modal guides you to the [DA Bulk app](https://da.live/apps/bulk).

---

## App Structure (for maintainers)

### File layout

All CloneIt files live under the project’s `tools/cloneit/` folder:

| File | Role |
|------|------|
| `cloneit.html` | Single-page UI: header, config card (template + site name), progress, result, bulk modal, help modal, toast |
| `cloneit.js` | Constants, DA_SDK org-config fetch, validation, worker proxy calls, clone flow, event wiring, init |
| `cloneit.css` | Styles (no preprocessor). Scoped by section/component class names. |
| `README.md` | This documentation |

### HTML structure (`cloneit.html`)

- **Header** – Title, subtitle, Help button
- **Config card** – Template `<select>`, site name input, live preview URL, Clone button
- **Progress section** – Shown during clone: phase, progress bar, status text, file list
- **Result section** – Success card (summary list, Bulk Preview/Publish button, Preview/DA/Code links) or error card
- **Bulk modal** – “URLs copied” message and “Open DA Bulk app” button
- **Help modal** – What CloneIt does, naming rules, after-clone steps, bulk flow
- **Toast** – Temporary success/error/info messages

---

## APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| DA (browser) | `GET /config/scdemos/` | Load org config; read **`demosites`** sheet for template dropdown |
| DA Admin | `GET /config/scdemos/{template}/` | Fetch baseline repo config |
| DA Admin | `POST /config/scdemos/{site}/` | Create config for new site |
| DA Admin | `GET /list/scdemos/{template}/{path}` | Discover all files recursively |
| DA Admin | `POST /copy/scdemos/{template}/{path}` | Copy each file to new site folder |
| DA Admin | `POST /source/scdemos/{site}/index.html` | Fallback: create minimal content if copy fails |
| AEM Admin | `GET /config/scdemos/sites/{template}.json` | Fetch baseline site config |
| AEM Admin | `PUT /config/scdemos/sites/{site}.json` | Create repoless site |
| AEM Admin | `GET /config/scdemos/sites/{template}/content/query.yaml` | Fetch baseline index config |
| AEM Admin | `PUT /config/scdemos/sites/{site}/content/query.yaml` | Create index config (or `POST` if 409 = update) |
| CloneIt worker | `POST …/` | On load: IMS **client_credentials** ping (proves CORS, secrets, token endpoint) |
| CloneIt worker | `POST …/cloneprocess` | **Helix + DA Admin** clone calls — worker adds IMS token and forwards to allowlisted paths only (`/config/{org}/sites/…` on Helix; `/list|config|copy|source/{org}/…` on DA). The browser never stores an API token for those requests. |

## Authentication

The **Cloudflare Worker** (`workers/cloneit_token`) uses OAuth **client_credentials** for **`POST /`** and **`POST /cloneprocess`**. The **template list** uses **DA_SDK** in the browser and does not go through the worker.

## References

- [Repoless documentation](https://www.aem.live/docs/repoless)
- [AEM Admin API – Create Site](https://www.aem.live/docs/admin.html#tag/siteConfig/operation/createSiteSite)
- [AEM Admin API – Create Index Config](https://www.aem.live/docs/admin.html#tag/indexConfig/operation/createIndexConfig)
- [DA Admin API – Create Source](https://opensource.adobe.com/da-admin/#tag/Source/operation/createSource)
- [DA Admin API – Get Config](https://opensource.adobe.com/da-admin/#tag/Config/operation/getConfig)
- [DA Admin API – Create Config](https://opensource.adobe.com/da-admin/#tag/Config/operation/createConfig)
