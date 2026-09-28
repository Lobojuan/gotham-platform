# Working on this repo with a coding agent

This file is read by Codex, Claude Code, Kimi and similar tools. `CLAUDE.md`
is a symlink to it. Read `README.md` first for the architecture.

## Git is the single source of truth

Several agents work on this repo (Claude, Codex, sometimes Kimi) and Uffe edits too. **`origin/main` on GitHub
(`Lobojuan/gotham-platform`) is the only truth.** If something is not committed and pushed, it does not exist.

1. **Start** with `git fetch && git status`. If the tree has uncommitted changes you did not make, another agent is
   mid-task: do not edit, commit, stash or discard them. Ask Uffe, or work in a separate `git worktree` from origin/main.
2. **Pull before you work** (`git pull --rebase`), commit in small focused commits, and push when a piece is done and
   tested. Never force-push `main`.
3. **Deploy only what is on origin/main.** `scripts/deploy-crm.sh` and `scripts/deploy-site.sh` refuse to run from a
   folder that is not exactly origin/main with a clean `apps/` and `scripts/` (override: `FORCE_DEPLOY=1`, and explain
   in the next commit). The server records what is live in `/srv/gotham/DEPLOYED_COMMIT` and
   `/srv/gotham-site/DEPLOYED_COMMIT`.
4. **One owner per feature.** Before building something, check `git log`, open branches and `docs/handoff-*.md`, so two
   agents don't build the same thing. Record what you shipped and what is left in the handoff file, in the same commit.
5. Secrets (API keys, `PROXY_KEY`, passwords) never go in git, commits, logs or chat. Set them on the server with
   `bash scripts/set-secret.sh NAME`.

## Read first: current state

**`docs/handoff-2026-09.md`** describes how the platform runs today and what changed in September 2026: the main
domain goes through the WordPress bridge plugin, CRM v2, account rules and cedis-only prices. It also lists the
open items. Update that file, or add a newer handoff, when you change how things run.

Secrets never go in git. `/srv/gotham/.env` holds them, including `PROXY_KEY`, which is shared with the WordPress
bridge plugin. The repo copy of the plugin says `SET-ME`.

## Ground rules

1. **No build step for the app code.** `server.js` is plain Node 22 ESM.
   `admin.html` is one hand-written file. Do not introduce React, a bundler,
   TypeScript or a framework unless explicitly asked. The whole point of this
   stack is that one person can read it.
2. **`schema.sql` is append-only and runs on every boot.** Add
   `create table if not exists` or `alter table ... add column if not exists`.
   Never drop or rename. A migration that loses a column loses real
   registrations.
3. **Route order matters.** `server.js` matches routes top to bottom inside
   one handler. A specific path must come above the pattern that would also
   match it. `/api/items/all` sits above the `/api/items/:code` pattern.
4. **Never log or return a password hash, a salt, or `SESSION_SECRET`.**
   Passwords are scrypt and cannot be read back, only reset.
5. **The public API is CORS-exposed.** `/api/items`, `/api/register`,
   `/api/sponsors`, `/api/sponsor-enquiry`, `/media/*`, `/s/*`, `/confirm/*`,
   `/unsubscribe/*`, `/ticket/*`, `/api/ask` are reachable by anyone. Everything else must
   call `auth()` or `need('admin')` as its first line. If you add an endpoint,
   decide which it is before you write the body.
6. **Personal data.** This system holds names, phone numbers and emails of real
   people under Ghana's Data Protection Act 2012 (Act 843). Do not add a field
   that collects more than the task needs, do not send personal data to a third
   party, and keep the `staff` role unable to see contact details.

## Before you say you are done

```bash
node --check apps/crm/server.js
./scripts/dev.sh          # then exercise the thing you changed
```

Run the API suites (a fresh database per suite; never production):

```bash
TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/gotham_test bash tests/run_api.sh
```

`tests/api/NN_*.py` are the API suites and `tests/ui/*.js` the Playwright phone-layout and flow tests (see
`docs/qa-report-2026-09.md`). Add a suite for new behaviour. `docs/srs.md` maps requirements to tests; keep it current.

## Where things are

| Task | File |
|---|---|
| An API endpoint | `apps/crm/server.js` — one big switch, grouped by public / admin |
| A database table or column | `apps/crm/schema.sql` |
| Anything in the back office UI | `apps/crm/public/admin.html` |
| Image resizing, uploads | `storeImage`, `storeLogo`, `storeDoc` in `server.js` |
| Scheduled work | `runJobs()` at the bottom of `server.js`, every 15 minutes |
| Email bodies | `queueMail` / `wrapMail` / `flushMail` in `server.js` |
| The public website | `apps/site/pages/*.html` |
| Page `<head>`, meta, sitemap | `apps/site/build.py` |
| Privacy and terms wording | `apps/site/legal/` then rebuild into `public/` |

## Conventions that are load-bearing

- Site pages are **page bodies**, not whole documents. `build.py` adds the
  `<head>`. Do not put a doctype in `apps/site/pages/`.
- The site must render with the CRM unreachable. Every `fetch` to the API has a
  `.catch()` and a hard-coded fallback. Keep it that way — the marketing site
  going blank because a VM rebooted is not acceptable.
- Money is `numeric(12,2)` in Postgres and formatted in the UI. Never do
  currency maths in floats in SQL.
- Ghanaian phone numbers are normalised to `+233…` by `phoneGH()` on the way
  in, so WhatsApp links always work. Use it for any new phone field.
- Images are resized to fixed sizes on upload so the layout cannot break.
  `storeImage` crops to fill (photos), `storeLogo` fits inside (logos, keeps
  transparency). Pick the right one.

## Deploying

From Uffe's Mac repo (`~/Documents/CRM/gotham-repo`):

```bash
SITE_URL=https://gothamconsult.com bash scripts/build-site.sh
rsync -az apps/site/dist/ nuru@84.12.73.59:/srv/gotham-site/
bash scripts/deploy-crm.sh
```

The CRM deploy snapshots the previous release first; `./scripts/rollback-crm.sh` restores it. The deploy never ships
`node_modules` or `.env`. Never edit files directly on the server: the next deploy overwrites them.

## Importing lists

`readSheet()` (exceljs) reads every worksheet, finds the header row and returns
its columns. `guessMapping()` proposes a field per column, but the user confirms
every one in the UI before anything is written — never import on a guess alone.

Three rules that exist because of real data:

- **Placeholders are not values.** `TO FIND`, `TBD`, `N/A`, `-` and friends are
  stripped by `realValue()`. A column of "TO FIND" must never become a column of
  email addresses.
- **Specific column names beat loose ones.** `guessMapping()` walks the hint
  patterns in rounds so "Ghana MD / CEO" wins over a "Group CEO" column that
  happens to appear first. Add new hints in priority order within each field.
- **Dedupe on email when there is one, otherwise on company plus person.** Lead
  lists routinely have no addresses yet, and the same sheet gets re-uploaded as
  it fills in. Both import paths must behave the same way, or a contact gains a
  twin the day someone finds their email.

Columns the user did not map are kept in `contacts.extra` (jsonb) and shown in
the contact drawer. Never drop them — a "pitch angle" or "sensitivities" column
is often the most valuable thing in the sheet.

## Visitors abroad, and knowing who a visitor is

- **Phone numbers:** `phoneGH()` assumes a Ghanaian number. Anything a person
  abroad types goes through `phoneIntl(dial, local)` instead, or a UK "07700…"
  becomes a wrong +233 number. The Family Desk form sends a dial code and a
  local number separately for exactly this reason.
- **Client IP:** rate limits key on `X-Real-IP`, which Caddy sets from the real
  visitor address (`header_up X-Real-IP {remote_host}`). If anything is ever put
  in front of Caddy — Cloudflare, a load balancer — that value becomes the proxy's
  address and every visitor shares one limit. Update the Caddy block to use the
  forwarded client address before doing that.
  The WordPress bridge is the one sanctioned exception. It sends `X-GC-Client-IP`, and the server trusts that header
  only when `X-GC-Proxy-Key` matches `PROXY_KEY`.
- **Rate limits are per form** (`rateLimited(ip, max, window, bucket)`), so signing
  in never uses up someone's allowance for a public form.
- **Money:** Ghanaian law prohibits pricing, advertising or charging for services
  in foreign currency. Every price, invoice and email is in cedis. Paystack Ghana
  charges foreign cards in cedis. See `docs/family-desk.md` §5.

## Registration: never make a new field required on the server

Old copies of the registration page stay out in the world — shared in WhatsApp
groups, cached, or still hosted on the retired Netlify address — and they keep
posting to `/api/register` with only the fields they knew about. A field that
becomes required server-side silently breaks every one of those links. Validate
new questions in the page; accept their absence in the API.

A "Yes" or "Maybe" to the follow-up question creates or tags a contact
(`forum-lead`, `forum-yes` / `forum-maybe`). Anyone with `unsubscribed_at` set or
status `do_not_contact` is never re-tagged — check both, every time.

## "Ask Gotham" website chat

`/api/ask` answers the chat on the home page with an AI model. Its knowledge is `apps/crm/assistant.md` plus the
published upcoming forums. Keep prices in that file in cedis and in step with the site.
- The provider is anything OpenAI-compatible. Live since 28 Sep 2026: **Groq**, with `OPENAI_BASE_URL=https://api.groq.com/openai/v1`
  and `OPENAI_MODEL=openai/gpt-oss-120b` in `/srv/gotham/.env`; the Groq key sits in `OPENAI_API_KEY`. Switching back to
  OpenAI means emptying `OPENAI_BASE_URL` and setting a model; for Kimi, use Moonshot's base URL. No code change either way.
- Set keys with `bash scripts/set-secret.sh OPENAI_API_KEY`, a hidden prompt: never in git, never in chat. Without a
  key, or on any provider error (quota, 429, outage), the page falls back to its built-in answers.
- Cost caps: 20 questions per visitor per hour, `ASK_DAILY_CAP` per day (default 400), and answers capped at 900 tokens.
  Questions are not stored. Reasoning models get low effort (`OPENAI_REASONING` overrides it).
- Tests use a local mock via `OPENAI_BASE_URL` (`tests/api/13_ask_gotham.py`).
