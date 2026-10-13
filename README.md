# Gotham Platform

The Gotham Consult website and back office, in one repository.

Gotham Consult, Accra, in partnership with Carlson Capital Ltd.

---

## Why two apps, one repo

It is one product and one repo, but it deploys to two places, because the two
halves have opposite needs:

| | `apps/site` | `apps/crm` |
|---|---|---|
| What | The public website, registration page, teaser, legal pages | Back office, API, database |
| Runs on | Static files, served by the CRM process | Node 22 + Postgres in Docker, one VM |
| Who reaches it | Everyone | Signed-in staff, plus a small public API |
| If it goes down | Nobody can read about you | Nobody can register |

Both are served from one origin: `/` is the website, `/admin` is the back office,
and `/api/*` is the API. Login opens the back office in a full-screen same-origin
dialog over the current page, keeping the public page and URL in place. The
session cookie is first-party, and the browser makes no cross-origin API requests.
The site reads events and sponsors from the API on load, so
content edited in the back office appears without a redeploy — and falls back to
the copy baked into the page if the API is unreachable.

Event delivery stays in that same back office: **Events & media** holds the public
event page, registration, speakers, agenda, QR code and flyer. Its private **Event
plan for Joy** adds the client brief, a task checklist with owners/due dates, guest
target, budget ceiling and contingency, plus a supplier/service estimate. Mark each
budget item as client-paid-direct, Gotham-billed, or included in a service fee. Only
priced items deliberately checked for the quotation and marked Gotham-billed are
copied into a draft GHS quote. Client-direct supplier estimates remain planning-only.
The quote still needs Joy's review of scope, price, tax and terms before issue/email.
This private planning data is stored on the event record and is not returned by the
public events API.

The site is plain static files. Moving it onto a CDN later is a matter of
copying `apps/site/dist` there; nothing in the code assumes where it is served
from.

```
gotham-platform/
├── apps/
│   ├── site/            the public website
│   │   ├── pages/       page bodies: index, register, teaser
│   │   ├── public/      images, legal pages, headers — copied as-is
│   │   ├── legal/       source for privacy.html and terms.html
│   │   ├── build.py     wraps pages in full HTML documents -> dist/
│   │   └── dist/        generated build output (git-ignored)
│   └── crm/             the back office
│       ├── server.js    the whole API and admin backend
│       ├── schema.sql   tables and migrations, safe to re-run
│       ├── public/      admin.html, the single-page back office
│       ├── Dockerfile
│       └── docker-compose.yml
├── scripts/             build, deploy, rollback, local dev
└── docs/                compliance checklist and operating notes
```

---

## Run it locally

Needs Docker, Node 22 and Python 3.

```bash
./scripts/dev.sh
```

That starts Postgres in Docker and serves the website, registration, API and back office
from the same origin at `http://127.0.0.1:4100` (sign in as `admin` / `devpassword123`).
Stop with Ctrl-C. To wipe the local database: `docker rm -f gotham-dev-db`.

## Deploy

```bash
./scripts/deploy-site.sh     # build + rsync the site to the server
./scripts/deploy-crm.sh      # ship the CRM, rebuild the container, health check
./scripts/rollback-crm.sh    # put the previous CRM release back
```

`deploy-site.sh` builds the public pages and syncs them to `/srv/gotham-site`.
`deploy-crm.sh` deploys the API/back office container and checks its server address.
The current checked-in deploy script notes that `gothamconsult.com` still serves
WordPress; the platform host is `https://gotham.84-12-73-59.sslip.io`. The
WordPress bridge must be configured to proxy requests to that host. A successful
container health check does not prove the public domain bridge works. The CRM
deploy script snapshots its prior release and does not overwrite the server's
`.env`.

---

## Configuration

**Ask Gotham speech:** `apps/crm/ask-voices.json` is the shared regional voice map used by
answer tickets, dynamic workers and Docker-built welcome/payment recordings. English keeps
Kokoro `bm_fable` (`en-gb`). French uses Piper `fr_FR-upmc-medium`, Pierre (speaker 1),
trained on France French; Spanish uses `es_ES-sharvard-medium`, male speaker M (0), labelled
Spanish (Spain). Uffe approved both regional demos on 7 October. No specific Madrid birthplace
is claimed by the model documentation.

The workers make synthetic speech on our server with existing local Kokoro/Piper runtimes.
Fixed filenames identify the speaker, preventing old English or generic-language recordings
from being reused. Public model/dataset credits and licence links: `/downloads/voice-credits.txt`.
Piper model/config downloads are SHA256-verified in the Dockerfile. The English Fable voice is
distinct from OpenAI's voice of the same name; no new provider key is needed.

The CRM reads its settings from the environment. On the server these live in
`/srv/gotham/.env`, which is deliberately not in this repo. See `.env.example`.

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | Signs the sign-in cookie. Change it and everyone is signed out. |
| `ALLOW_ORIGINS` | Exact comma-separated origins for any required cross-origin API clients. Same-origin is the default; `*` is ignored. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeds the first owner account on an empty database |
| `PUBLIC_URL` | The CRM's own address, used in emails, tickets and QR codes |
| `SITE_URL` | The public website, used in QR targets and posters |
| `MAIL_FROM` | The From address on outgoing mail |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Gotham's authenticated outgoing mailbox. The password is only stored on the server. |
| `RESEND_API_KEY` | When set, queued mail is sent automatically. When empty, it waits in the outbox to be sent by hand. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional Google sign-in for existing active team accounts. Configure a Google OAuth web client with redirect URI `https://gothamconsult.com/auth/google/callback`; Google email must match the team's account email. Store the secret only in the server environment. |
| `IMAP_HOST` / `IMAP_PORT` / `IMAP_USER` / `IMAP_PASS` | Incoming mailbox settings. Host defaults to the verified `gothamconsult.com`; username/password fall back to SMTP settings; TLS uses port 993. |
| `MEDIA_DIR` | Where uploaded images and PDFs are stored (a Docker volume in production) |

---

## How the pieces fit

**Registration.** A visitor submits the form on `register.html`. It posts to
`POST /api/register` on the CRM, which stores the registration, issues a
reference and a ticket code, and queues a confirmation email. Paid items are
held for 24 hours (48 once a mobile money transaction is reported) and released
by the jobs loop if unpaid.

**Content.** Events live in the CRM, not in the site's code. The back office
writes them to the `items` table with their cover image, description, agenda and
PDFs. The site calls `GET /api/items` on load and renders whatever it finds,
falling back to the hard-coded list in `pages/index.html` if the CRM is
unreachable. So the site never breaks, it just goes stale.

**Media.** Uploads go through `POST /api/media` as base64 JSON. Images are
resized by sharp into four fixed sizes (1600×900 hero, 1200×630 social,
800×450 card, 400×225 thumbnail) in WebP and JPEG, cropped content-aware so
faces survive. PDFs are checked for a real PDF header. Everything is served
from `/media/<file>` with a one-year immutable cache.

**Scan codes.** Each QR code points at a short link (`/s/<slug>`) rather than
the destination directly, so scans are counted per placement. `/poster/<slug>`
renders a print-ready A4 or A5 poster.

**Email.** The back office has an admin-only Email inbox and Email outbox. The inbox
syncs the newest 50 messages over TLS every 15 minutes and on demand, displays the
latest 100, and retains up to 500 messages in the CRM. Replies go through the Gotham
SMTP mailbox with reply threading. It stores plain text only; HTML and attachments
are not retained. Sent replies also appear in the inbox view. Mailbox credentials
stay in the server environment.

**Jobs.** `runJobs()` runs every 15 minutes: releases expired holds, sends
day-before reminders, nudges unpaid registrations after 12 hours, syncs the latest
mailbox messages, and flushes the mail outbox.

**Roles.** `owner` can do everything including managing the team; `admin` can
run registrations, payments, events and settings; `staff` can view and do door
check-in with contact details hidden.

**Invoice bank accounts.** Owners/admins manage receiving accounts in
**Settings → Company & invoicing**. Add a separate entry for each GHS, USD, EUR
or GBP account, set one default per currency, and preview invoices before
issuing. Older single-account settings are migrated in memory and remain
editable. Account details are admin-only in settings and appear on the
corresponding client invoice; they are never included in public content feeds.
Verify account coordinates and international routing with the bank before use.

---

## Things to know before changing anything

- `schema.sql` runs on every start. Only ever add `create table if not exists`
  or `alter table ... add column if not exists`. Never drop or rename a column
  in it.
- `server.js` has no framework on purpose. Routes are matched top to bottom in
  one handler, so order matters: put specific paths above their patterns.
- `admin.html` is one file with no build step. It is a small hand-rolled SPA.
- Passwords are hashed with scrypt and cannot be read back, only reset.
- The sign-in page offers email password recovery only when SMTP or Resend is configured. Recovery links expire after 30 minutes, are single-use, and do not bypass two-step verification. A person can use Google without first signing in with a password, but Google OAuth must be configured and the verified Google email must match their active team account.
- The site pages are written as page *bodies*, not complete documents, so they
  can double as artifacts. `build.py` adds the `<head>`. Do not add a doctype
  to the files in `pages/`.

## Backups

Run `scripts/backup-crm.sh` with `DATABASE_URL` and `MEDIA_DIR` set. It creates a
private, checksummed database and media archive under `.backups/` by default,
validates both archives, and retains 30 days locally. It requires PostgreSQL
client tools and `sha256sum`. Schedule it on the server and copy archives to
encrypted off-site storage; the local script cannot configure either service.
Restore guidance is included in each archive as `RESTORE.txt`. Test restores in
a separate database and media directory before touching live data.

## Domain

The live address is **https://gothamconsult.com**. Since 28 September 2026 it reaches this server through the
**Gotham Consult Platform Bridge** WordPress plugin (`integrations/wordpress/gotham-bridge`), installed on the
Namecheap WordPress site (DNS still points at Namecheap, 199.188.201.131; mail/MX unchanged).

- The plugin forwards every address except WordPress's own (`/wp-admin`, `/wp-login.php`, `/wp-content`…) to
  `https://gotham.84-12-73-59.sslip.io`, signed with `PROXY_KEY` (same value in `/srv/gotham/.env` and the plugin file;
  the repo copy says `SET-ME`). Videos redirect straight to the server.
- `/srv/gotham/.env`: `PUBLIC_URL` and `SITE_URL` = `https://gothamconsult.com`; `MEDIA_URL` = the sslip address, so
  uploaded images load directly instead of through PHP; `REDIRECT_HOSTS` = the sslip host, so people who open the
  server address are moved to gothamconsult.com (bridge requests, framed pages, `/api/*` and `/media/*` are exempt).
- Build the site with `SITE_URL=https://gothamconsult.com`.
- WordPress admin still works at gothamconsult.com/wp-admin. **Deactivating the plugin restores the old WordPress
  site** (its Home/Services/Contact/FAQ pages frame the new site as a fallback).
- Later, for speed: point the A record at 84.12.73.59, add gothamconsult.com to Caddy, set `MEDIA_URL` empty and
  remove the plugin. Old WordPress paths (`/services`, `/contact`, `/faq`, `/wp-admin`…) already redirect.
## Quality checks

The API suites use a dedicated Postgres database and recreate it for each suite.
Use a database name ending in `_test`; the runner refuses other names because it
drops and recreates the database.

```bash
TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/gotham_test bash tests/run_api.sh
```

The browser E2E scripts in `tests/ui/` require Chromium and `playwright-core`.
Their last recorded device sweep is historical; rerun it against the current
checkout before a public release.

## Multilingual search pages

The 24 core page and insight families are built as English `/`, French `/fr`,
and Spanish `/es` URLs. Each has translated metadata and structured data, its own
canonical, reciprocal EN/FR/ES/x-default links, and a sitemap entry. The desktop
and phone language choices are real links; JavaScript keeps the current query
and section when switching. `public/assets/v2/i18n-{fr,es}.js` remains the body
translation source, article translations stay in `content/insights`, and Spanish
search metadata is in `apps/site/seo_locales.py`. Legacy forms/events retain
browser translation and are not advertised as untranslated locale twins.

`deploy-crm.sh` also applies `scripts/bridge-host.py` to Gotham's Caddy block.
Caddy normally replaces `X-Forwarded-Host`; the patch copies the incoming value
to `X-GC-Forwarded-Host`. The CRM uses it only with the valid bridge key and only
for the exact www hostname. The patch backs up the config, refuses an unexpected
block, validates, reloads in place and rolls back on failure. No DNS or WordPress
plugin changes are needed.

SEO regression: `python3 tests/api/31_seo.py` after building, plus
`BASE=http://127.0.0.1:4199 PLAYWRIGHT=… CHROMIUM=… node tests/ui/seo_locales_ui.js`.
The normal API/E2E runners include these checks. Use the bundled Python runtime
with Pillow and openpyxl when running the full API suite. E2E cleanup stops only
its own server processes; the fact-check suite uses local source fixtures.

## Six public languages and free speech (7 October 2026)

Public core pages and insight articles have crawlable English, French, Spanish, German, Arabic and Simplified Chinese URLs. The shared public English copy remains the source for numbers, law IDs and linked evidence. New translations live in `apps/site/public/assets/v2/i18n-{de,ar,zh}.js`; `locale_support.py` prepares localized article, research and search metadata. Arabic uses RTL layout with isolated phone numbers and financial charts; Chinese uses native Han font fallbacks. Dynamic chat answers follow the selected website language.

Uffe approved the German, Mandarin and Arabic demos on 7 October before publication. German uses CC0 Piper Thorsten (`de_DE-thorsten-high`); Mandarin uses Apache-2.0 Kokoro 1.1 Chinese (`zf_001`, Misaki Chinese G2P); formal Arabic uses Supertonic 3 (`M1`, OpenRAIL-M model / MIT worker). These are local CPU workers with no ElevenLabs subscription or per-answer speech API bill. Existing hosting resources and Groq text-provider limits still apply. Country/language metadata does not certify a particular city accent.

`voice-models.json` pins upstream asset URLs and SHA256 checksums. `download-voices.py` verifies the weights before image installation. Each language has its own lazily loaded warm worker, matching welcome/payment files, and bounded visitor-bound speech tickets. English retains Kokoro Fable; France French and Spain Spanish retain the approved Piper voices. `/downloads/voice-credits.txt` links provenance; `/terms#ai-voices` incorporates Arabic model use restrictions and links the full model licence. The separate receptionist demo retains its existing scope.

Public text requests use `ask-context.js` to bound UTF-8 input to 22,000 bytes, keeping all system rules and the current question, complete relevant fact sections, whole source excerpts and recent bounded history. Website retrieval excludes weak matches. Production's retired third Groq model was replaced with `qwen/qwen3.8-27b` using the secret-setting script; the existing key and free plan remain. Input caps do not remove provider quota limits.

Production validation passed on 7 October: Linux models/fixed recordings, 18 public welcome/payment/clock audio cases, all six real-provider general-answer voices (Spanish passed after a quota retry), 36 API suites, and the final full browser regression (15,799 site checks, zero failures). Public cold dynamic audio can take 10–35 seconds; free-provider quotas remain. The separately added investment-report body is currently English.
