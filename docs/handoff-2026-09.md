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

### Client database and broadcasts (email, SMS, WhatsApp) — 29 September 2026
- Contacts now have client type (corporate, international, government, investor, SME, media, partner, other), country,
  language, a separate WhatsApp number, and consent per channel (yes / no / not asked) with how and when it was given.
- Confirmed Brief subscribers and forum registrants join the client list every 15 minutes (tags `brief`, `event-<code>`),
  carrying the email consent they gave on the form ("Add Brief subscribers and registrants now" does it at once).
- Campaigns choose a channel. Email: Resend if `RESEND_API_KEY` is set, otherwise the gothamconsult.com mailbox by SMTP
  (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, port 465), capped per hour/day (`MAIL_HOURLY_LIMIT`, `MAIL_DAILY_LIMIT`);
  tickets and confirmations always go before newsletters. SMS: Arkesel (`ARKESEL_API_KEY`, `SMS_SENDER_ID`).
  WhatsApp: Meta WhatsApp Business (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`;
  webhook `/api/hooks/whatsapp`), approved template name + values per campaign; only to people who said yes.
  Without a provider, SMS/WhatsApp wait under Outreach → "Send by hand" (one tap each, then "Sent").
- Opt-out is per channel (`/u/<token>`): email link + List-Unsubscribe header, SMS link, WhatsApp link or "STOP".
  Anyone who opts out after being queued is skipped at send time. Every secret goes in with `bash scripts/set-secret.sh NAME`.
- Namecheap's terms require double opt-in for mass mailings from shared hosting: use the mailbox for tickets and for
  opted-in lists; bulk invitations to imported lists should go through Resend.
- Test: `tests/api/14_broadcast_channels.py` (mock SMTP, Arkesel and Meta).


## Importing client lists (back office → Import clients, `#imp`)
- One path for every format: `.xlsx` (ExcelJS), `.xls` / `.ods` / `.numbers` / `.xlsb` (SheetJS 0.20.3, installed from cdn.sheetjs.com, pinned by integrity in package-lock), CSV/TSV with any separator and encoding (UTF-8, UTF-16, Windows-1252), vCard 2.1–4.0, JSON, pasted rows, Google Sheets links shared as "anyone with the link".
- `POST /api/contacts/inspect` → sheets, columns, guessed mapping, samples. `POST /api/contacts/import-sheet` with `dry:true` answers what would happen; without it, one transaction.
- Matching: email, then phone/WhatsApp, then company + person. Re-importing fills gaps and adds tags; it never overwrites CRM edits, never turns a consent "no" into "yes", and leaves opted-out contacts alone.
- Consent "yes" for a whole list needs a written reason (`consent_source`); yes/no columns in the file are used per person and recorded as "<file>: column …".
- Tests: `tests/api/15_import_formats.py`. 20,000 rows ≈ 15 s.

## Calendar (back office `#cal`, website /forums, phone feeds)
- `GET /api/calendar?from&to[&mine=1&types=…]` (max ~4 months): events, tasks, deal next steps, deals won/lost, campaigns (scheduled starts + sends per day), notes (calls/meetings), registrations and payments per day, sponsor dates. Staff get events, own tasks, registration/payment counts only.
- Drag in the month/week view moves tasks (`PATCH /api/tasks/:id`), next steps (`PATCH /api/deals/:id`) and scheduled campaigns (`POST /api/campaigns/:id/start {at}`).
- Campaigns can be scheduled (`status='scheduled'`, `starts_at`); the 15-minute job starts them and builds the queue then.
- Private feed per person: `GET/POST /api/calendar/feed` → `/cal/<40 hex>.ics` (reset = new token). Public: `/cal/events.ics`, `/cal/event/<CODE>.ics`.
- Tests: `tests/api/16_calendar_footer.py`, `tests/ui/calendar_ui.js`, forums checks in `tests/e2e/site_e2e.js`.

## Email designer (Outreach → campaign → Design: "Designer")
- `campaigns.template='designer'` + `campaigns.blocks` (heading, text, image, image_text, button, event, sponsors, divider). Pictures upload as media kind `email` (≤1200 px, JPEG or PNG, never cropped).
- Every link becomes `/c/<token>?l=<n>`; n indexes `designerLinks(blocks)`, so the redirect can only go where the email already points.
- Saved designs: `email_templates` + three starters. Live preview: `POST /api/campaigns/render`.
- Carlson Capital Ltd and +233 55 239 5548 appear only on campaigns ticked "renewable energy or AI/software" (`campaigns.carlson`); everything else is Gotham + +233 55 041 6627.
- Tests: `tests/api/17_email_designer.py`, `tests/ui/email_designer_ui.js`.

## AI (Groq free tier, same key as Ask Gotham)
- Website chat: the model may end a reply with `[[register:CODE]]`, `[[lead]]` or `[[person]]`; `chatActions()` checks codes against open forums and turns them into buttons. "Leave your details" → `POST /api/chat-lead` (consent tick required) → contact (tag `chat-lead`), deal, task for tomorrow, note. No marketing consent assumed.
- Back office: `POST /api/ai {task: email|sms|whatsapp|designer|client|deal}` (admins, `AI_ADMIN_CAP`/day, default 200). Only fills fields; nothing saved until Save.
- WhatsApp: incoming messages are stored in `wa_messages` and as notes. With Settings → "WhatsApp: AI replies" on (`settings.wa_autoreply`), the AI answers inside Meta's 24-hour window; complaints, requests for a person, voice notes/pictures and meeting/quote requests become high-priority tasks. Opted-out numbers never get an automatic reply. Counts against `ASK_DAILY_CAP`.
- Tests: `tests/api/18_ai.py`, chat checks in `tests/e2e/site_e2e.js`, `tests/ui/ai_helper_ui.js`. The mock model (`tests/e2e/mock_ai.js`) adds tags and JSON.

## Calendar day pop-up
- Clicking a day opens a pop-up beside it (a bottom sheet on phones) with that day's items and quick add; nothing scrolls. `tests/ui/calendar_popup_ui.js`.

## Quotes, invoices, Ghana tax, Paystack, Sign in with Google, SEO (29 Sep 2026)
- **Back office → Invoices & quotes** (admin): quotations (QUO-YYYY-NNNN) and invoices (INV-YYYY-NNNN), numbered on issue, amounts locked after issue (void, never delete, so no gaps).
  Also from a deal (Quotation / Invoice buttons) and on each company record.
- **Tax** (Settings → Company & invoicing): VAT 15% + NHIL 2.5% + GETFund 2.5% on the same taxable value (20%), since 1 Jan 2026. Rates are settings; each invoice stores its rates.
  Modes: standard (only when "VAT-registered" is Yes), zero-rated or exempt (reason required), none. Withholding tax per invoice (3 / 7.5 / 20%); payments record WHT and whether the certificate came in.
  E-VAT: the GRA E-VAT reference is recorded on the invoice; a live link to GRA's certified invoicing system needs GRA credentials (not built).
  VAT report: `/api/invoices/vat.csv?month=YYYY-MM` (button on the list) in cedis.
- **Currency**: GHS for everyone in Ghana. EUR/USD only when the client is non-resident or expatriate (Bank of Ghana, Aug 2025), with an exchange rate (Suggest rate = open.er-api market mid-rate, check against BoG); cedi value stored for VAT.
- **Client page** `/i/<token>`: printable A4 (print → PDF), how to pay (MoMo, bank, FEA accounts), Accept quotation, Pay online.
- **Paystack** (`PAYSTACK_SECRET_KEY`): GHS and USD by card/MoMo; verified on return and by the signed webhook `POST /api/hooks/paystack` (set that URL in the Paystack dashboard); idempotent per reference. EUR by bank transfer.
- **Sign in with Google** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`): only for existing active team emails, never creates users. Redirect URI `https://gothamconsult.com/auth/google/callback`.
  State + PKCE; state kept server-side (single use, 10 min) because the WordPress bridge forwards only the gc_session cookie.
- **SEO**: keyword-led titles/descriptions (build.py V2 + PRACTICE_SEO), JSON-LD (ProfessionalService/LocalBusiness, WebSite, WebPage, BreadcrumbList, Service, FAQPage from the FAQ blocks, BusinessEvent on /teaser),
  invest FAQ, 1200×630 JPG share images (public/img/og), sitemap with lastmod (register left out, noindex), robots disallows /admin and /i/, site 404 page,
  server 301s: `/x/` and `/x.html` → `/x`, www (via bridge X-Forwarded-Host) → apex.
- Tests: `tests/api/19_invoices_google.py` (mock Paystack, Google, FX), `tests/ui/invoices_ui.js`.
- **Bank details (30 Sep)**: Settings → Company & invoicing → Bank account for payments, structured as on the bank's letter (bank, SWIFT, branch + code,
  account name, GHS account, optional USD/EUR/GBP foreign exchange accounts, correspondent banks per currency with the bank's account there, charges OUR/SHA),
  stored as settings key `inv_bank` (JSON; never in git, never on public pages). The client page shows Mobile Money, bank transfer in Ghana and
  international transfer (SWIFT) with the intermediary bank for the currency, copy buttons, no-IBAN note and a fraud warning. `/api/invoices/preview?c=GHS|USD|EUR|GBP`
  (admin) renders a sample. GBP added. A registration with "Invoice & bank transfer" now creates a draft invoice + task.

## Safety net, two-step sign-in, credit notes, receipts, recurring invoices, accountant pack, live rates (30 Sep 2026)
- **Backups**: `apps/crm/backup.sh` (deployed to /srv/gotham/backup.sh; cron 02:17): DB dump (custom) + media volume `gotham_gotham_media`,
  restore test into `gotham_restore_test`, checksums, 30 days kept, result in settings `backup_status`. Off-site: `scripts/mac-backup-install.sh`
  (LaunchAgent on Uffe's Mac, 09:40 + at log-in) pulls to ~/Documents/Gotham backups and writes `backup_offsite`.
- **Watchdog** (hourly in runJobs): backup failed/old, off-site copy > 4 days, > 5 failed emails/24 h, certificate < 14 days → email (Settings → Safety net
  recipients, default owners) and WhatsApp once connected; once per 12 h per problem. `GET/POST /api/safety`. External uptime: `.github/workflows/uptime.yml`.
- **Two-step sign-in** (TOTP): users.totp_* (secret AES-GCM with key from SESSION_SECRET, recovery codes hashed). `/api/login` → `{need_code, ticket}` →
  `/api/login/code`. `/api/2fa`, `/setup`, `/enable`, `/disable`; owner `PATCH /api/users/:email {reset_2fa:true}`. Google sign-in does not ask for the code.
- **Credit notes** CRN-YYYY-NNNN (`POST /api/invoices/:id/credit {reason, lines?}`), status `credited`; balances, reminders, Paystack and VAT CSV subtract them.
  **Receipts** RCT-YYYY-NNNN on every payment (manual and Paystack), page `/i/<token>/receipt/<pid>`, emailed when the client has an email.
- **Recurring invoices**: table `invoice_schedules` (template snapshot, every month/quarter/year, next_date, until, auto_send); `{month}` placeholder;
  GHS issued (and emailed), foreign currency → draft + task. `/api/invoice-schedules`.
- **Accountant**: `/api/invoices/pack.xlsx|xero.csv|quickbooks.csv?month=YYYY-MM` (Invoices → For the accountant).
- **Live rates**: `/api/rates` (open.er-api, cached hourly in settings `fx_cache`), shown in the home ticker and on /invest; the chatbot knows them.
- **Chatbot**: English questions answered in English; checked fact sheet in assistant.md; only numbers from the knowledge; temperature 0.2.
- **Insights** (30 Sep): articles are data in `apps/site/content/insights/<slug>.json` (EN + `fr`), listed in `index.json`; rendered by
  `apps/site/insights_fr.py` into /insights and /insights/<slug> with Article + FAQ JSON-LD. Add a guide = add a JSON file + its slug.
- **French site**: build makes /fr/... from the English pages and `i18n-fr.js` (same dictionary as the switch); titles in `FR_META`;
  hreflang both ways; `.fr-missing.txt` lists phrases still in English after a build. The switch moves between twins; Spanish stays in-page.
- **Visitors**: `/api/hit` beacon from v2.js (no cookies; visitor = daily-salted hash; bots, /admin, signed-in team ignored), enquiries credited to
  the landing page server-side; back office → Website visitors (`/api/web-stats`). Rows kept 400 days.
- **Going direct (DNS)**: `scripts/go-direct.sh` after the A records for @ and www point to 84.12.73.59 (Namecheap hosting zone editor;
  keep MX/mail/TXT). Adds the domains to GOTHAM_HOST in the oracle Caddy .env and www to REDIRECT_HOSTS; deploy-site then serves assets same-origin.

## The logo everywhere, dates on uploads, event pages (30 Sep 2026)
- **Logo files**: `apps/site/public/img/brand/` (website) and `apps/crm/public/brand/` (back office, emails, documents; served at `/admin/brand/*.png`).
- **Website build** (`apps/site/brand_media.py`): every photo, share image and video in `dist/img` gets the white logo with a soft shadow, bottom right. Files that already show the logo are listed in `public/img/already-branded.txt`, or have `.branded.` in the name. Needs ffmpeg; Homebrew's ffmpeg cannot write WebP, so `cwebp` is used (`brew install webp`). Results are cached in `~/.cache/gotham-brand`.
- **Back office and documents**: sign-in, sidebar, tab icon, all emails (`wrapMail`, the campaign designs), invoices/quotes/credit notes, receipts, confirmation pages, the QR poster, the accountant Excel (Summary sheet). The "plain personal email" campaign template stays plain on purpose.
- **Uploads** (`apps/crm/media-tools.js`):
  - Pictures, email pictures and PDFs get the logo unless "already shows our logo" is ticked. Partner and sponsor logos never do.
  - The unbranded original is kept (`<id>-orig.*`), never public.
  - Location is never published: pictures are re-encoded without metadata, videos with `-map_metadata -1`.
  - **Date taken**, stored in `media.taken_at` + `date_source`, best source first:
    1. `camera` (EXIF, with time zone), `video` (recording date), or `pdf`;
    2. `whatsapp` (the date in a WhatsApp file name = when it was sent);
    3. `filename`;
    4. `manual`.

    WhatsApp strips the real date, so the event gallery asks for it where missing. The public page shows only real dates, never the WhatsApp send date.
- **Videos**:
  - Upload in 4 MB pieces (`POST /api/uploads`, `PUT /api/uploads/:id?at=N`, `POST /api/uploads/:id/done`).
  - They are then converted one at a time with ffmpeg (in the Docker image): H.264 MP4 at most 1920 px, logo, poster frame.
  - `/media/*.mp4` answers byte ranges. Limit: `MAX_VIDEO_MB` (600).
- **Older pictures**: Settings → "Logo on pictures" adds the logo to pictures uploaded before, keeping `*.pre-logo` copies.
- **Event pages** (`apps/crm/events-pages.js`, frame = `dist/event-shell.html` from the site build):
  - `/events` lists upcoming and past events; `/events/<slug>` shows one.
  - Before an event: countdown, register, add to calendar, programme, speakers, downloads.
  - After it: the "What happened" recap (`items.recap`), a gallery with lightbox, and the videos.
  - Search data: Event + Breadcrumb JSON-LD, and `/sitemap.xml` gets the event URLs added live.
  - The past-events strip on home and /forums comes from `/api/items`.
- **Drafts with gaps** like `[Speaker 1]` or `[time]` cannot be started or scheduled (`placeholder_left`).
- **Content import**: `bash scripts/import-content.sh <folder>` runs `node server.js --import manifest.json` inside the container. It is safe to repeat. It was used to load:
  - The Business Boot Camp (BOOT1): 9 café photos, 2 frames and the recap video. The date and venue are unknown; add them in the back office.
  - The Business Pitch Deck Round Table (PDRT1): the flyer and the invitation video.
  - The SMEs at the Centre content calendar as 30 tasks, plus 7 SMS/email drafts (not sent) for F1.

## Carlson Capital logo, cleaner partner line, the globe turning a full circle (30 Sep 2026)
- **Carlson Capital mark "Ascend"**: three rising gold bars and a white chip, drawn with the same slant, corners and gap as the Gotham mark.
  - Files are in `apps/site/public/img/brand/carlson-*` (SVG, PNG, tile for app icons, an "ink" version for light backgrounds). A copy is in `apps/crm/public/brand/`.
  - The Carlson line reads "AI, software, apps & mining" (Uffe's choice, 30 Sep). It is used in the home-page pill, the About section, the footer credit, the Carlson campaign footer, the chatbot fact sheet and the back-office campaign checkbox.
- **Header and footer brand**: Gotham only (logo and name). The partner is named once, in the home pill and in the website credit.
- **Globe** (`apps/site/public/assets/v2/globe.js`):
  - A full 360° turn every 48 s. The card no longer steers the globe.
  - 30 business cities linked to Accra across Europe, the Gulf, Asia, the Americas and Africa.
  - A faint latitude/longitude grid, with the Equator and Greenwich in gold (they cross just off Accra).
  - City labels show the local time.
  - A live strip shows Accra's clock and GHS against USD/EUR/GBP.
  - Each city card shows distance, local time, the difference from Accra, whether it is day or night there now, and what 1 unit of its currency is worth in cedis.
  - `/api/rates` now also returns `more` for those currencies.
