# Handoff: state of the platform, 28 September 2026

Written for the next agent (Codex, Claude, Kimi) picking this repo up. Work in September was done by Claude
(Cowork) for Uffe. Read `AGENTS.md` for the rules, `README.md` for the architecture, then this file.

## 1. How it runs today

| Piece | Where |
|---|---|
| Public address | **https://gothamconsult.com**. Website `/`, `/register`, `/family`, `/teaser`, back office `/admin`, API `/api/*` |
| How the domain reaches us | DNS still points at Namecheap shared hosting (199.188.201.131, WordPress). The **Gotham Consult Platform Bridge** plugin (`integrations/wordpress/gotham-bridge`) is installed and active there. It forwards every non-WordPress path to the server, signed with `PROXY_KEY`. |
| Server | Oracle VM `nuru@84.12.73.59` (1 ARM core, 6 GB, shared with NuruRoute and UCH). Direct address: `https://gotham.84-12-73-59.sslip.io` |
| App | Docker compose project `gotham` in `/srv/gotham`, container `gotham-crm-1` (Node 22, port 4100). Caddy (the `oracle` stack) proxies `{$GOTHAM_HOST}` to it. |
| Database | Postgres in `oracle-postgres-1`, database `gotham`. `schema.sql` runs on every boot. |
| Website files | Built static site in `/srv/gotham-site`, mounted as `/data/site` and served by the CRM (`SITE_DIR`) |
| Server env | `/srv/gotham/.env` (never in git). `PUBLIC_URL` and `SITE_URL` are `https://gothamconsult.com`. `MEDIA_URL` is the sslip address, so uploaded images load directly instead of through PHP. `REDIRECT_HOSTS` is the sslip host. `PROXY_KEY` is secret. Backup of the previous file: `.env.bak-20260928`. |
| WordPress | gothamconsult.com/wp-admin. Joy's account is now Administrator. Other active plugins: Brizy (+Pro), CookieAdmin, Loginizer, Duplicate Page, Extendify, Site Assistant. |
| Code | GitHub `Lobojuan/gotham-platform` (private: it contains the server IP). Uffe deploys from `~/Documents/CRM/gotham-repo` on his Mac. |

### Request path through the bridge
Visitor → gothamconsult.com (LiteSpeed/PHP) → plugin at `plugins_loaded` priority 0 → `wp_remote_request` to the sslip
origin with `X-GC-Proxy-Key` and `X-GC-Client-IP` → CRM. The response headers are copied back, including `Set-Cookie`,
and the `Location` host is stripped. Videos (`.mp4`/`.webm`) get a 302 to the origin.

- The server trusts `X-GC-Client-IP` **only** when the proxy key matches (rate limits stay per visitor).
- `REDIRECT_HOSTS`: a page request on the sslip host gets a 301 to gothamconsult.com. These are exempt: bridge
  requests (they would loop), `Sec-Fetch-Dest: iframe` (the WordPress fallback pages below), `/api/*` and `/media/*`.
- Sign-in cookie `gc_session` is host-only, so it belongs to gothamconsult.com. People signed in on the old sslip
  address sign in once more.
- Cost: every page and asset goes through PHP first, so the first byte arrives in about 1.5–3 s instead of about 0.8 s.

### Fallback if the plugin is switched off
The WordPress pages Home (id 277), Services (172), Contact (240) and FAQ (162) have Brizy turned off. Each contains a
full-screen iframe of the new site. Deactivating the plugin therefore still shows the new site, only framed.
The original pages are kept as drafts 782–785 ("… (backup of old WordPress page, 26 Sep 2026)").
`apps/site/build.py` adds a small head script for framed pages: no entrance animations, and `/admin` links open in
the top window.

## 2. Deploying (only what is on origin/main)

```bash
git pull --rebase             # the folder must be exactly origin/main, clean
bash scripts/deploy-site.sh   # builds with SITE_URL=https://gothamconsult.com, publishes /srv/gotham-site
bash scripts/deploy-crm.sh    # snapshots /srv/gotham, rsyncs apps/crm (no node_modules, no .env), rebuilds
```
Both scripts refuse a dirty folder or one that is not origin/main (see AGENTS.md "Git is the single source of truth"),
and write the deployed commit to `DEPLOYED_COMMIT` on the server. If another agent has uncommitted work in the main
folder, deploy from a worktree: `git worktree add /tmp/gotham-release origin/main`.
The health check hits the sslip address directly. `scripts/rollback-crm.sh` restores the snapshot.
Never edit files on the server. Never commit `.env` or the real `PROXY_KEY`: the repo copy of the plugin says `SET-ME`.

## 3. What changed in September

- **Registration** (Joy's complaint: people could not request invitations). Only full name, WhatsApp (9+ digits) and
  consent are required. Business details are optional and folded away. Email is optional; if given, it is validated.
  An unknown or missing category or "attending as" never blocks a registration. Errors show by the button. A forum
  "yes"/"maybe" creates a follow-up task the day after the event. Old form copies (Netlify) still post successfully.
- **Money: cedis only (Bank of Ghana).** The server forces `currency='GHS'` on items and sponsors. A boot migration
  moved M3/B1/B2 from USD to GHS (≈11.40 GHS/USD). "Received" counts only `amount>0`.
- **Accounts.**
  - Roles: owner (super admin), admin, staff.
  - Every request re-checks the session against `users` (`sv` column). Disabling, resetting or removing someone
    takes effect on their next click.
  - `/api/password` needs the current password. The new one must be 10+ characters, not the old one, not trivially
    weak. It is rate-limited, and it signs out the user's other devices.
  - A first or reset password must be changed first (`must_change`).
  - Adding an existing sign-in returns 409 `exists`.
- **CRM v2** (`admin.html` reshelled): grouped sidebar, top bar with global search (`/` key) and "+ New", phone
  bottom bar, hash routes (`#dash #tasks #pipe #contacts #rec/<id> #reports …`).
  - New tables: `deals`, `deal_events`, `tasks`, `notes`.
  - Endpoints: `/api/deals`, `/api/tasks`, `/api/notes`, `/api/contacts/:id/record`, `/api/search`, `/api/overview`,
    `/api/reports`.
  - Sponsor enquiries and Family Desk interest create inbound deals (`inboundDeal()`).
- **Phones.** QA sweep at 360–1440 px. Inputs are 16 px (no iPhone zoom), no text under 12 px, admin tables become
  cards on phones. Video is served with byte ranges (iPhone playback). Event times show in Accra time.
  See `docs/qa-report-2026-09.md` (21 defects fixed) and `docs/srs.md` (requirement → test map).
- **Main domain**: bridge plugin live, `MEDIA_URL`, redirect rules (section 1).
- **Back office links**: "View website" and the top-bar house icon go to gothamconsult.com.
- **Ask Gotham chat (AI)**: `/api/ask` plus `apps/crm/assistant.md` (see AGENTS.md). It is live once `OPENAI_API_KEY`
  is set with `scripts/set-secret.sh`; until then, and on any error, it uses the built-in answers. Deployed 28 Sep
  (no key yet). Codex's parallel `/api/support-chat` draft was superseded by this one at Uffe's choice. A test with
  Uffe's OpenAI key returned HTTP 429 (no API credit; ChatGPT/Claude/Kimi subscriptions don't include API use), so
  Uffe chose **Groq** (free tier, `openai/gpt-oss-120b`). The code is provider-neutral (OpenAI-compatible).
- **Deploy script**: rsync instead of `scp -r` (a local `npm install` made it copy thousands of files).

## 4. Tests

- API: `TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/gotham_test bash tests/run_api.sh` runs 12 suites on a
  fresh database each, about 200 checks. All pass as of 28 Sep. Suite 12 covers the bridge and redirect rules.
- UI (Playwright, phone sizes): `tests/ui/*.js`, seeded by `tests/ui/seed_demo.py` / `seed_crm.py` against a local
  server on :4199. Environment variables: `PLAYWRIGHT`, `CHROMIUM`, `QA_DIR`, `ADMIN_PW`.
- Never point tests at production, and never test with real people's credentials.

## 5. Open items (ask Uffe before acting on billable or public changes)

1. **Speed: move DNS.** Point the gothamconsult.com A record (and www) at 84.12.73.59 in Namecheap cPanel Zone
   Editor. Keep MX and mail records unchanged. Add gothamconsult.com and www to the Caddy site block, set
   `MEDIA_URL=` (empty) and `REDIRECT_HOSTS=www.gothamconsult.com,gotham.84-12-73-59.sslip.io`, redeploy, then
   deactivate the plugin. Old WordPress paths already redirect in `server.js` (`OLD` map).
2. **Off-box database backups.** Nothing leaves the VM today. Give Uffe an itemised monthly cost, compared with his
   Hetzner server, before provisioning anything billable.
3. **Resend API key.** Emails wait in the outbox until it is added.
4. **Domain renewal.** gothamconsult.com expires 2026-11-20; turn on auto-renew.
5. **Old Netlify copy** (`gotham-consult-gh.netlify.app`) is still live and can't be updated (no credits). It still
   posts successfully.
6. **Services from the old WordPress site** (insurance consulting, corporate training, advertising): Joy/Uffe to
   decide whether to add them to the new site.
7. Event details still to confirm: Tang Palace capacity, speakers.
8. The Mac repo has uncommitted local changes to `.env.example`, `.gitignore` and `apps/crm/package-lock.json` that
   were not made by these agents. Check with Uffe before committing or discarding them.
