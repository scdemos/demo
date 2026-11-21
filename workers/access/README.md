# Demo access worker

Gives people access to the scdemos demo site. Replaces the n8n "BBirrd Demo Access Request" workflow.

The sign-up app is `tools/access/access.html`, opened from da.live
(`https://da.live/app/scdemos/demo/tools/access/access`), linked from the demo docs nav (**Get demo access**).
The person signs in with their Adobe account and enters their GitHub username.

## Routes (`demo.bbird.live/access/*`)

| Route | Body | Result |
|---|---|---|
| `POST /access/whoami` | | `{ email, name, automatic }` of the signed-in user |
| `POST /access/request` | `{ githubUser }` | `{ email, automatic, steps: [{ step, ok, … }] }` |

Every call needs the caller's own Adobe IMS token (`Authorization: Bearer …`, the DA SDK session).
The worker validates it with IMS and takes the email and name from the profile, never from the request.

## What `/request` does

Emails on `AUTO_DOMAINS` (`adobe.com`):

1. **GitHub:** checks the user exists and adds them to `GITHUB_TEAM` (`sc-team`, the demo's GitHub group) in `GITHUB_ORG` (`scdemos`).
   People who aren't in the org yet get an invitation email (`state: pending`).
2. **Admin Console** (User Management API, `ADMIN_ORG_ID` = CAS Hub): creates the user as a Federated ID
   (kept if it exists) and adds them to `ADMIN_GROUP` (`da-demosite-authors`). That group has write on
   `CONFIG` and `/demo/+**` in the DA permissions sheet (`da.live/config#/scdemos/`).

Each step is reported; one failing doesn't stop the other, and submitting again is safe.

Anyone else: a row is added to `REQUESTS_SHEET` (`/scdemos/demo/.da/aem-permission-requests.json`, tab `users`)
for an admin to review. Nothing else changes. The worker re-reads the sheet to check the row is there and writes it again if not; two requests in the same instant can still overwrite each other (last write wins).

CloneIt then gives each demo's requester write on `/<site>/CONFIG` and `/<site>/**`.

## Setup

Merging to `main` deploys the worker (`.github/workflows/deploy-access.yaml`). The workflow also sets the
worker's secrets in Cloudflare from these **GitHub repository secrets** (Settings › Secrets and variables › Actions):

| Repository secret | Worker secret | What |
|---|---|---|
| `UMAPI_CLIENT_ID` | `UMAPI_CLIENT_ID` | Client ID of the Developer Console project in CAS Hub with the User Management API (OAuth server-to-server) |
| `UMAPI_CLIENT_SECRET` | `UMAPI_CLIENT_SECRET` | Its client secret. Its technical account also needs write on `REQUESTS_SHEET` in DA |
| `ACCESS_GITHUB_TEAM_TOKEN` | `GITHUB_TEAM_TOKEN` | Fine-grained token, resource owner scdemos, organization permission Members: Read and write (or classic `admin:org`) |

The existing `CLOUDFLARE_API_TOKEN` secret deploys it. After changing a secret, run the workflow again
(Actions › Deploy Access Worker › Run workflow).

## Tests

```bash
cd workers/access && npm install && npm test
```
