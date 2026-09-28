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
- **Landing page and languages**: the hero video and presenter controls are removed; the headline is "Build partnerships in Ghana". `apps/site/public/js/landing-i18n.js` adds the English/French/Spanish selector and translates the published landing copy. The Ask Gotham widget keeps the `/api/ask` history and local fallback flow, with localized welcome/fallback answers and Joy's MoMo destination in payment answers.
- **MoMo reports**: customer registrations show Joy's WhatsApp/MoMo number and can submit a transaction ID for staff reconciliation. Reports are audited and deduplicated; they do not mark a registration paid automatically.
- **Deploy script**: rsync instead of `scp -r` (a local `npm install` made it copy thousands of files).

## 4. Tests

- API: `TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/gotham_test bash tests/run_api.sh` runs 14 suites on a
  fresh database each. All 14 passed on 28 Sep (230 reported checks), including bridge/redirect, MoMo reports,
  and Ask Gotham with a mocked provider and selected-language prompt.
- UI (Playwright, phone sizes): `tests/ui/*.js`, seeded by `tests/ui/seed_demo.py` / `seed_crm.py` against a local
  server on :4199. Environment variables: `PLAYWRIGHT`, `CHROMIUM`, `QA_DIR`, `ADMIN_PW`.
- **Website end-to-end (run before every site deploy):**
  `PLAYWRIGHT=… CHROMIUM=… TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/gotham_test bash tests/e2e/run.sh`.
  It builds the site, starts the server on a fresh test database with a mock AI provider (`tests/e2e/mock_ai.js`), then
  `tests/e2e/site_e2e.js` crawls every internal link and #anchor, loads every page on iPhone SE, iPhone 15, Galaxy A,
  Pixel 7, iPad and desktop (JS errors, failed requests, sideways scrolling, one header/footer, alt text, button names,
  40 px tap targets, skip link), and walks the journeys: mega menu, phone sheet and dock, carousel, "More about this",
  FAQ, the AI panel and Ask Gotham chat (question → answer, follow-ups), French/Spanish, free tools, registration,
  redirects, 404 and sitemap. 2,333 checks passed on 28 Sep.
- **Live read-only run** (sends no registrations or signups, asks the AI a few questions):
  `LIVE=1 WEBKIT=1 BASE=https://gothamconsult.com PLAYWRIGHT=… node tests/e2e/site_e2e.js` — `WEBKIT=1` runs the
  iPhone/iPad sizes in WebKit, Safari's engine (needs `npx playwright install webkit`, e.g. on the Mac).
- Translations: one engine (`v2.js`) for every page; phrases in `public/assets/v2/i18n-fr.js` and `i18n-es.js`
  (loaded only when chosen). The older `js/landing-i18n.js` is no longer loaded; its phrases were merged in.
- Never point tests at production, and never test with real people's credentials (the LIVE mode above is read-only).

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

## 6. Redesign in progress (owner: Claude) — please don't edit these files in parallel

Uffe asked for a new "2030" look: an uncluttered menu, 3D graphics, and flawless behaviour on iPhone and Android.
Agreed plan, in phases, previewed at **gothamconsult.com/v2** (noindex) before it replaces the live home page:
1. Design system, new header (Services mega-menu, Invest in Ghana, Forums, About, Contact, language, Log in,
   Register; full-screen menu on phones), canvas 3D globe hero with partnership arcs from Accra, short home page. **Done.**
2. Separate pages: Services, Invest in Ghana, Mining, Forums, About/Contact (content moved from the long index.html). **Done:**
   `/v2/services|invest|mining|forums|about` (`pages/v2/*.html`, shared header/footer in `pages/v2/_top.html` and
   `_bottom.html`, included by `build.py`). Forums list, brief signup, sponsor enquiry and partner logos are live from the API.
   Free tools still live on the old page (`/#tools`) until they are moved.
3. Translations: **done** for all v2 pages — `public/assets/v2/i18n.js` (English text → French/Spanish, loaded only when
   chosen; the choice is shared with the old pages via `gc-language`). Home services area is now a 3D carousel.
   Still to do: v2 versions of Register, Family Desk, Free tools and the legal pages; phone QA on real devices; speed check;
   then switch `/` to v2 and move `/v2/*` to root paths.

Files: `apps/site/pages/v2.html`, `apps/site/public/assets/v2/{v2.css,v2.js,globe.js}`, `build.py` (per-page
`extra` head). Phone checks: `/tmp`-style Playwright sweep at 320–1440 px (no sideways scroll, 44 px taps,
16 px inputs, content visible with and without scroll animations, menu/mega/chat open and close).
The globe is dependency-free Canvas 2D (no WebGL), half density on phones, paused off screen, still frame
for reduced motion.

### Live since 28 September 2026 (evening)
- The new design **is the website**: `/` (was `/v2`), `/services`, `/invest`, `/mining`, `/forums`, `/about`.
  Sources: `apps/site/pages/{index,services,invest,mining,forums,about}.html`; shared header/menu/dock/chat/footer in
  `apps/site/pages/_partials/_top.html` and `_bottom.html`; styles `public/assets/v2/v2.css`; behaviour `v2.js`;
  translations `i18n.js`; globe `globe.js`.
- The older one-page site lives on at `/classic` (noindex) only for the free tools. Register, Family Desk, teaser,
  privacy and terms keep their own styles, but `build.py` gives them the same header, menus, dock, chat and footer:
  it removes their old top bar and footer and injects the partials plus `assets/v2/chrome.css` (generated from v2.css by
  `apps/site/chrome_css.py`, scoped to `.v2c` so nothing leaks either way).
- Redirects in `server.js` (`OLD` map): `/v2/*` → new paths, `/contact` and `/faq` → `/about#contact`.
- Practice detail pages at `/services/<slug>` (investment-readiness, market-entry, ai, digital, creative-studio,
  energy-mining, compliance-esg, education, family-support, media-forums): who it is for, what you get, examples,
  steps, packages/prices, FAQ, an "Ask Gotham · AI" panel (questions open the chat with the practice as context), CTA.
  Sources `apps/site/pages/services/*.html`; titles/descriptions in `build.py` `PRACTICES`. Linked from the Services
  page ("More about this"), the home carousel and the menus. Joy/Uffe should read them once for accuracy.
- `/tools`: the free tools on their own page (built from `/classic` by `build.py`, rest hidden). Menus point here.
- Register, Family Desk and `/tools` open with the dark hero of the new design (`chrome_css.py` EXTRA).
- `v2.js` runs only the shared chrome on the older pages (`body.v2-legacy`): their own forms, tabs and counters are
  left to their own scripts (it used to fill terms' `#events` heading with forum cards and double-send the classic brief form).
- Next: phone QA on real devices (Uffe/Joy).
