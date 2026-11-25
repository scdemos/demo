# Audience picker

The picker reads the site's published `/audiences.json` and inserts a Section Metadata table with `Audience` set to the selected row's `name`. Buttons use each row's `label` and `description`. UI copy is configurable in `labels.json`.

## Sheet

Create an Experience Workspace sheet at `/audiences` with columns:

| name | label | rule | description |
| --- | --- | --- | --- |
| first-visit | First visit | new-visitor | Visitors with no saved first-visit marker |
| welcome-back | Welcome back | returning-visitor | Visitors with a saved first-visit marker |
| members | Signed-in members | signed-in | Signed in to the demo |
| gold-members | Gold members | ajo:gold | Membership decided by AJO |

`name`, `label`, and `rule` are required. Names must be unique lowercase hyphenated identifiers. `description` is optional. Other rules are `mobile`, `desktop`, and `guest`. Unknown rules resolve false and warn in the console. Blocked storage makes both visit rules false. An unavailable session does not qualify as signed-in.

## Library registration (outside this repo)

Add a row to the site's Experience Workspace config `library` tab, matching the existing Tags and Fragments tools:

| title | path | experience |
| --- | --- | --- |
| Audiences | /tools/plugins/audiences/audiences.html | dialog |

The sheet must be previewed/published before visitors or the picker can read it. No Experience Workspace configuration or content has been written by this change.

## Campaign links (AJO email, social, ads)

No audience rule is needed for campaign links. The experimentation plugin's Campaign feature reads `utm_campaign` (or `campaign`) from the URL. On the landing page's default section or page Metadata:

| Section Metadata | |
| --- | --- |
| Campaign: member-week | /fragments/hero-member-week |

A link such as `/en/?utm_campaign=member-week` in an AJO email then serves that hero. Add `Campaign Audience` to restrict it to an audience from the sheet.

## Section targeting

Put the cursor in a section, open the library picker, and choose an audience. It inserts:

| Section Metadata | |
| --- | --- |
| Audience | gold-members |

Keep that section's content in the document. It is included only for the selected audience; unmatched sections are removed before decoration. Separate sections with a section break. An untargeted section is always included. The picker does not merge a second metadata table into an existing one: edit the section's existing Audience row if it already has one.

For a replacement with default content, use the existing URL-based contract on the default section instead:

| Section Metadata | |
| --- | --- |
| Audience: first-visit | /fragments/hero-new |
| Audience: welcome-back | /fragments/hero-returning |
| Audience: gold-members | /fragments/hero-gold |

The first qualifying mapping wins. If none qualify, or a variant cannot be loaded, the default section stays. At page level, use the same `Audience: <name>` rows in Metadata. Keep existing Experiment / Experiment Variants metadata to run experiments alongside. `Experiment Audience` can restrict an experiment to a defined audience. Existing RUM events and the Experimentation panel's configuration handshake stay in use.

## Limits

Put Audience, Campaign Audience and Experiment Audience on the page section that loads a fragment, not inside the fragment. The engine copies a variant fragment's content into the section, so targeting set on the fragment's own sections is not evaluated.

## AJO setup

Set the values in `scripts/ajo-config.js`: surface and timeout (800 ms). The surface is fixed so every host (localhost, `.aem.page`, `.aem.live`) asks AJO the same question; an empty surface falls back to `web://<current host>/#audiences`. AJO lookups use the site datastream (`MARTECH_DATASTREAM_ID`), which needs Experience Platform with Adobe Journey Optimizer enabled.

A campaign for **All visitors** needs nothing else: starting or stopping it in AJO turns the audience on or off for everyone. A campaign that targets an AEP audience also needs edge segmentation on the datastream and an Active-On-Edge merge policy in the sandbox.

In AJO, configure a JSON code-based experience for that surface. Return a JSON content item containing:

```json
{ "audiences": ["gold", "coffee-lovers"] }
```

A sheet rule `ajo:gold` qualifies only when that exact key is returned. AJO uses the anonymous ECID managed by the Web SDK and events already sent by the site. The demo login remains display-name-only: no member identifier is derived or sent from the name, and the site does not read membership tier from the session. Login adds no consent step. Device, visit and signed-in/guest rules use only local browser state or the existing demo session and never call AJO.

AJO requests run only after targeting consent and martech startup. They are shared across all AJO rules for the page view and time out to false, without swapping late content. Display notifications are sent only for AJO-resolved audience variants actually applied by the engine, never for a forced simulation or merely fetched decisions. On newly accepted consent, targeting starts on the next page view, following the site's existing no-content-swap behavior.

Localhost and other non-auth hosts use the existing anonymous session behavior. Signed-in rule validation needs the production auth origin or a browser test stub. `/audiences.json` is loaded only on pages with audience metadata (including Experiment Audience and Campaign Audience). An experiment-only page skips the sheet. First-visit bookkeeping is local and runs without a sheet request.
