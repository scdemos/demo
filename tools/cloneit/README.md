# CloneIt

Create a demo from the **scdemos demo site** (`scdemos/demo`: content and code) in one run. Every demo
gets **its own repo** `scdemos/<site>` (created from `scdemos/demo`, added to AEM Code Sync, you as admin)
and **its own DA folder**, so it can be demoed as is and customized later (content and code) with the
`customer-demo` AI skill. CloneIt shows that prompt and an "Open in VS Code" link at the end.

CloneIt copies the demo site's content (except `drafts`, `demo-docs`, `demo-slides` and the locale folders), **all DA config sheets** (`scdemos/demo` references rewritten; publish
approvers set to you), the AEM site config (you as admin, `*@adobe.com` author/publish), the query
index config, then **preview and publish everything automatically** and add a row to the demo
registry (`da.live/#/scdemos/demo-registry`, sheet `demos.json`).

## What It Does

CloneIt creates the new demo by (code sync runs before publishing):

0. **Repository** – the worker creates `scdemos/{site}` from the template repo, adds it to AEM Code Sync and grants access; CloneIt then runs a full code sync and waits until code is served.
1. **Creating DA folder** – Creates the new site folder in DA with a minimal `index.html`.
2. **Copying DA config** – Fetches every sheet of the template's DA config (library, apps, skills, mcp-servers, prompts, flags, …) via [DA Config GET](https://opensource.adobe.com/da-admin/#tag/Config/operation/getConfig), rewrites template references to the new site, sets `publish-workflow-config` to one `/*` rule with **you** as approver, and creates it via [DA Config POST](https://opensource.adobe.com/da-admin/#tag/Config/operation/createConfig). Skipped if baseline has no config.
3. **Copying DA content** – Recursively copies all files from `scdemos/demo` to the new site folder, skipping `drafts`, `demo-docs`, `demo-slides`, and **locale folders** (segment names like `en`, `fr`, `de`, `ja`, `hi`, `zh`, plus other common ISO 639-1 codes and a few regional variants such as `zh-cn`, `pt-br`). Uses the [DA List API](https://admin.da.live/list) to discover all files, then the [DA Copy API](https://opensource.adobe.com/da-admin/#tag/Copy) per file (the Copy API does not recurse into folders). If copy fails, falls back to updating the minimal `index.html`.
4. **Creating the AEM site config** – Fetches the baseline configuration from the [AEM Admin API](https://www.aem.live/docs/admin.html#tag/siteConfig/operation/createSiteSite) for the template, points code at the demo's own repo, sidekick, headers, robots (without the template's sitemap host) and public config (template references rewritten, other programs' DAM mappings dropped), sets content to the new DA URL, and creates the site via `PUT /config/{org}/sites/{site}.json` (`POST` on 409, when AEM Code Sync already created a default config). Roles per [AdminAccessConfig](https://www.aem.live/docs/admin.html#schema/AdminAccessConfig): **you** as `admin`, `*@adobe.com` as `author` and `publish`, plus the template's `@techacct.adobe.com` entries so automation keeps working.
5. **Copying query index config** – Fetches the template’s `query.yaml` and writes it with **`PUT`** (create per [IndexConfig](https://www.aem.live/docs/admin.html#schema/IndexConfig)); on **409** conflict, **`POST`** (update). Then **GETs the same URL** (with retries) so you see **copied and verified** when propagation succeeds. If the baseline has no `query.yaml`, CloneIt shows that nothing was copied. If the write fails, the error is shown; if write succeeds but `GET` stays empty, the UI warns with a link to the Admin API URL for manual checks.

6. **Preview + publish** – bulk preview, then bulk publish of every copied path through the Admin API (jobs are polled). If that fails, the result card says so and **Bulk Preview/Publish** remains as the manual fallback.
7. **Registry** – appends who/when/site/customer site to `scdemos/demo-registry/demos.json`.

After a successful clone, use **Copy handoff** to copy a plain-text block (Preview URL, DA content, Code) for email or Slack.

The new site uses `https://content.da.live/scdemos/{sitename}/` as its content source.

**Edit in DA:** `https://da.live/#/scdemos/{sitename}`

## How to Use

**Note:** Sign in to Document Authoring with your Adobe account and open CloneIt from DA (e.g. Sidekick or `da.live/app/scdemos/demo/tools/cloneit/cloneit`); the worker only accepts signed-in `@adobe.com` users. You're made admin of the new site automatically.

1. If CloneIt says demo creation isn't enabled, an admin still has to set `GITHUB_PROVISION_TOKEN` on the worker.
2. Enter the **customer site** URL (e.g. `https://www.acme-investments.com/en`). The **site name** is suggested from its domain (`acme-investments`) and you can edit it (lowercase, numbers and hyphens, max 50 chars; if it's taken, add e.g. `-2`). CloneIt doesn't read or copy the customer's website; it puts the URL in the ready-to-paste AI prompt shown at the end.
3. Enter your **GitHub username** once (remembered in this browser). It must be an scdemos member; you become admin of the new repo.
4. Click **Create demo** and wait for the progress steps.
5. Open the preview, DA or repo links. To customize it, open the repo (**Open in VS Code**) and paste the prompt CloneIt shows (`/customer-demo <customer site>`) there to make it look like the customer.

---

## App Structure (for maintainers)

### File layout

All CloneIt files live under the project’s `tools/cloneit/` folder:

| File | Role |
|------|------|
| `cloneit.html` | Single-page UI: header, config card (customer site, suggested site name, GitHub user), progress, result (with AI handoff), bulk modal, help modal, toast |
| `cloneit.js` | Constants, DA_SDK org-config fetch, validation, worker proxy calls, clone flow, event wiring, init |
| `cloneit.css` | Styles (no preprocessor). Scoped by section/component class names. |
| `README.md` | This documentation |

### HTML structure (`cloneit.html`)

- **Header** – Title, subtitle, Help button
- **Config card** – Customer site URL, editable site name suggested from its domain, GitHub user, live preview URL, Create demo button
- **Progress section** – Shown during clone: phase, progress bar, status text, file list
- **Result section** – Success card (summary list, Bulk Preview/Publish button, Preview/DA/Code links) or error card
- **Bulk modal** – “URLs copied” message and “Open DA Bulk app” button
- **Help modal** – What CloneIt does, naming rules, after-clone steps, bulk flow
- **Toast** – Temporary success/error/info messages

---

## APIs Used

| API | Endpoint | Purpose |
|-----|----------|---------|
| DA Admin | `GET /config/scdemos/demo/` | Fetch baseline repo config |
| DA Admin | `POST /config/scdemos/{site}/` | Create config for new site |
| DA Admin | `GET /list/scdemos/demo/{path}` | Discover all files recursively |
| DA Admin | `POST /copy/scdemos/demo/{path}` | Copy each file to new site folder |
| DA Admin | `POST /source/scdemos/{site}/index.html` | Fallback: create minimal content if copy fails |
| AEM Admin | `GET /config/scdemos/sites/demo.json` | Fetch baseline site config |
| AEM Admin | `PUT /config/scdemos/sites/{site}.json` | Create the site config (code = own repo, content = DA folder) |
| AEM Admin | `GET /config/scdemos/sites/demo/content/query.yaml` | Fetch baseline index config |
| AEM Admin | `PUT /config/scdemos/sites/{site}/content/query.yaml` | Create index config (or `POST` if 409 = update) |
| AEM Admin | `POST /code/scdemos/{site}/main/*`, `GET …/scripts/aem.js` | Own repo: full code sync, then wait until code is served |
| AEM Admin | `POST /preview|live/scdemos/{site}/main/*`, `GET /job/…/details` | Bulk preview + publish of every copied path |
| DA Admin | `GET/POST /source/scdemos/demo-registry/demos.json` | Registry row (best effort) |
| CloneIt worker | `POST …/whoami` | Verifies the signed-in user; tells the UI whether demo creation is enabled |
| CloneIt worker | `POST …/standalone` | Own repo: create `scdemos/<site>` from `TEMPLATE_REPO`, add it to the AEM Code Sync installation (auto-discovered), make the requester's GitHub user admin, grant `SC_TEAM` push (if set) |
| CloneIt worker | `POST …/` | Readiness ping (the technical account's token never leaves the worker) |
| CloneIt worker | `POST …/cloneprocess` | **Helix + DA Admin** clone calls — worker adds the technical account's token and forwards to allowlisted paths only (`/config/{org}/sites/…` and `/code|preview|live|job|status/{org}/{site}/…` on Helix; `/list|config|copy|source/{org}/…` on DA). The browser never stores an API token for those requests. |

## Authentication

- **Backward compatible:** while `LEGACY_COMPAT` is `"true"` (default), requests without an `Authorization`
  header behave like the previous worker (`POST /` returns the technical token, `/cloneprocess` uses the old
  allowlist), so the currently deployed CloneIt page keeps working. Set it to `"false"` once every page
  sends a token: the old behavior gives anyone who fakes an allowed `Origin` an admin token.
- **Who may call (new routes and new paths):** the caller's own Adobe IMS access token (the DA session,
  read with `DA_SDK` and sent as `Authorization: Bearer …`). The worker validates it with IMS, accepts
  only `IMS_CLIENT_IDS` (DA = `darkalley`) and `ALLOWED_EMAIL_DOMAINS` (`adobe.com`). The `Origin`
  check is a browser convenience, not authentication (it can be spoofed outside a browser).
- **What the worker uses:** a technical account (OAuth **client_credentials**: `ADOBE_CLIENT_ID`,
  `ADOBE_CLIENT_SECRET`) for Admin/DA calls, and `GITHUB_PROVISION_TOKEN` (classic PAT of an `scdemos`
  org owner/bot; scopes `repo`, `read:org`, plus `admin:org` only when `SC_TEAM` is set) to create demo repos. Adding a repo to the AEM Code Sync
  installation requires that user token; the installation id is discovered automatically.
  Without `GITHUB_PROVISION_TOKEN`, CloneIt says demo creation isn't enabled yet.
- The browser reads the user's IMS token with **DA_SDK** (`https://da.live/nx/utils/sdk.js`); nothing else is stored.

## Worker setup (admins)

```bash
wrangler secret put ADOBE_CLIENT_ID --config workers/cloneit_token/wrangler.toml
wrangler secret put ADOBE_CLIENT_SECRET --config workers/cloneit_token/wrangler.toml
wrangler secret put GITHUB_PROVISION_TOKEN --config workers/cloneit_token/wrangler.toml   # required to create demos
```
Optionally set `SC_TEAM` in `wrangler.toml`: that team must contain the requester and gets push on every new demo repo
(without it, `scdemos` org membership is checked and only the requester gets access, as admin). The technical account must keep a role on new sites:
CloneIt copies `scdemos/demo`'s `@techacct.adobe.com` role entries into each new site config.

## Local testing

```bash
# worker: .dev.vars holds the secrets (git-ignored)
npx wrangler dev --config workers/cloneit_token/wrangler.toml --port 8797 --var "PATH_PREFIX:" --var "ALLOWED_ORIGINS:https://da.live,http://localhost:3000"
node workers/cloneit_token/index.test.mjs        # offline tests
# app: open CloneIt from DA with ?ref=local&worker=http://localhost:8797
```

## References

- [Repoless documentation](https://www.aem.live/docs/repoless)
- [AEM Admin API – Create Site](https://www.aem.live/docs/admin.html#tag/siteConfig/operation/createSiteSite)
- [AEM Admin API – Create Index Config](https://www.aem.live/docs/admin.html#tag/indexConfig/operation/createIndexConfig)
- [DA Admin API – Create Source](https://opensource.adobe.com/da-admin/#tag/Source/operation/createSource)
- [DA Admin API – Get Config](https://opensource.adobe.com/da-admin/#tag/Config/operation/getConfig)
- [DA Admin API – Create Config](https://opensource.adobe.com/da-admin/#tag/Config/operation/createConfig)
