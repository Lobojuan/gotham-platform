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

Both are served from one machine on one domain: `/` is the website, `/admin` is
the back office, and `/api/*` is the API. That means sign-in stays in the same
tab, the session cookie is first-party, and the browser makes no cross-origin
requests at all. The site reads events and sponsors from the API on load, so
content edited in the back office appears without a redeploy — and falls back to
the copy baked into the page if the API is unreachable.

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
│   │   └── dist/        build output, deployed to Netlify (git-ignored)
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

That starts Postgres in Docker, the CRM on `http://127.0.0.1:4100`
(sign in as `admin` / `devpassword123`) and the site on `http://127.0.0.1:8080`.
Stop with Ctrl-C. To wipe the local database: `docker rm -f gotham-dev-db`.

## Deploy

```bash
./scripts/deploy-site.sh     # build + rsync the site to the server
./scripts/deploy-crm.sh      # ship the CRM, rebuild the container, health check
./scripts/rollback-crm.sh    # put the previous CRM release back
```

`deploy-crm.sh` snapshots the current release to `~/backups/gotham.prev` on the
server before touching anything, and never overwrites the server's `.env`.

---

## Configuration

The CRM reads its settings from the environment. On the server these live in
`/srv/gotham/.env`, which is deliberately not in this repo. See `.env.example`.

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | Signs the sign-in cookie. Change it and everyone is signed out. |
| `ALLOW_ORIGINS` | Which websites may call the API. `*` allows any. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeds the first owner account on an empty database |
| `PUBLIC_URL` | The CRM's own address, used in emails, tickets and QR codes |
| `SITE_URL` | The public website, used in QR targets and posters |
| `MAIL_FROM` | The From address on outgoing mail |
| `RESEND_API_KEY` | When set, queued mail is sent automatically. When empty, it waits in the outbox to be sent by hand. |
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

**Jobs.** `runJobs()` runs every 15 minutes: releases expired holds, sends
day-before reminders, nudges unpaid registrations after 12 hours, and flushes
the mail outbox.

**Roles.** `owner` can do everything including managing the team; `admin` can
run registrations, payments, events and settings; `staff` can view and do door
check-in with contact details hidden.

---

## Things to know before changing anything

- `schema.sql` runs on every start. Only ever add `create table if not exists`
  or `alter table ... add column if not exists`. Never drop or rename a column
  in it.
- `server.js` has no framework on purpose. Routes are matched top to bottom in
  one handler, so order matters: put specific paths above their patterns.
- `admin.html` is one file with no build step. It is a small hand-rolled SPA.
- Passwords are hashed with scrypt and cannot be read back, only reset.
- The site pages are written as page *bodies*, not complete documents, so they
  can double as artifacts. `build.py` adds the `<head>`. Do not add a doctype
  to the files in `pages/`.
