# Handoff: state of the platform, 28 September 2026

## 7 October 2026 — Codex: France French and Spain Spanish voices

- Root cause: dynamic answers and fixed recordings forced British English `bm_fable` despite changing the French/Spanish phonemizer. User subsequently specified metropolitan France French and Castilian Spain Spanish. Initial generic Kokoro Siwis/Dora candidates were not deployed. Uffe listened to replacement regional Piper demos and explicitly approved both ("Both sound right").
- `ask-voices.json` is shared by Node ticket metadata, workers and fixed builds: English keeps Kokoro Fable (`en-gb`); French uses `fr_FR-upmc-medium`, Pierre (speaker 1), France French; Spanish uses `es_ES-sharvard-medium`, male M (speaker 0), Spanish (Spain). Models identify the country, not a Madrid birthplace; do not claim a precisely documented city accent. Source model cards/datasets and licence attributions are in README and public `/downloads/voice-credits.txt`.
- Dynamic EN runs in the existing Kokoro venv; FR/ES each use the existing Piper venv with lazy warm workers (`ask-piper.py`). No external speech provider, credentials or receptionist Jenny change. Language mismatch is rejected, never routed through an English speaker. Regional models/configs are verified by pinned SHA256 in the Docker image. Builds generate fixed speech in the appropriate runtime; filenames include the speaker so stale recordings cannot be selected.
- Localized UI says France French/Pierre and Castilian Spain instead of calling all speech Fable. JS version 37 refreshes clients. Existing default voice, mute/stop/replay, ordered packets, visitor-bound tickets, limits and cancellation remain. Real regional demos: France French 12.43 seconds / synthesis including model load 4.96 seconds; Spain Spanish 11.23 seconds / synthesis including model load 4.44 seconds on the existing host. These timings exclude the public WordPress bridge.
- API 28 exercises actual Python entry points with synthesis doubles, explicit regional models/speaker IDs, ticket routing, unsupported-language English fallback and stale-cache rejection. Browser voice tests cover all locale URLs, API language and speaker labels. Revised regression passed all 33 API suites, 8,557 browser sweep checks (zero failures), 591 presentation checks and 16 locale browser checks. Public welcome/payment/dynamic MP3 verification remains required after guarded deployment. Evidence and approved demos: `/Users/uffe/Documents/CRM/Gotham audit/2026-10-07/native-voices/`.
- Uffe explicitly authorized Arabic, German and Mandarin for the site/chatbot, with voice demos and translation previews before publication. ElevenLabs subscription has ended: use free local speech, no paid provider. German Thorsten (Piper), Mandarin Kokoro v1.1-zh and Arabic Supertonic 3 candidates were generated locally; approval pending. Demo/evidence folder: `/Users/uffe/Documents/CRM/Gotham audit/2026-10-07/free-voices/`. These three languages are not implemented/live yet. No pricing or financial fact changes in this regional voice release.

## 7 October 2026 — Codex: multilingual SEO

- Spanish is now a real static `/es` site for the same 24 families as French: home, services and ten practice pages, investor portal, mining, forums, about, insight index and seven articles. Existing translations are reused; no new financial claims or prices are introduced. Legacy forms, fact register and dynamic event records retain browser translation instead of fake `/es` twins.
- Every twin has localized titles/descriptions and sharing metadata, a self canonical, reciprocal EN/FR/ES/x-default links and sitemap inclusion. JSON-LD is rebuilt from the translated page, correcting French WebPage/service/breadcrumb URLs and names and visible FAQ text. French investor search metadata now describes the current portal. Duplicated French/Spanish partnership CTA words are corrected.
- Core language choices are real anchors on desktop and phone, usable without JavaScript. JS carries the current query and section; explicit `/fr` and `/es` URLs win over saved preferences. Current-page menu highlighting recognizes the locale prefix. Shared assets are versioned to refresh cached clients.
- Live audit traced `www` returning 200 to Caddy replacing the bridge's `X-Forwarded-Host`. Guarded CRM deployment applies `scripts/bridge-host.py` only to Gotham's proxy block, backing up, validating and reloading the existing config with rollback on failure. It preserves the original header as `X-GC-Forwarded-Host`; the CRM trusts it only with the correct bridge key and exact `www.gothamconsult.com`. Other sites, DNS and WordPress plugin code are unchanged. Caddy's upstream documentation: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers.
- Regression coverage: `tests/api/31_seo.py` checks 850 static SEO assertions; `tests/ui/seo_locales_ui.js` checks 16 no-JS/locale/navigation cases. `12_bridge_redirect.py` covers the Caddy-preserved host and untrusted-host rejection. The six-screen E2E crawl includes Spanish (86 routes). E2E cleanup now stops its own PIDs only; fact checks use local source-link fixtures; chatbot API mocks bind an available port instead of conflicting with E2E.
- Local test setup: disposable native PostgreSQL on loopback port 5439, test-only databases ending `_test`, bundled Node 22/Python with Pillow/openpyxl. `scripts/dev.sh` cannot start because the installed Docker/Colima daemon is stopped; the same Node app and actual browser flows run in the E2E harness. Never use the production database for these tests.
- Full regression passed: all 33 API suites; 8,557 website checks over 86 routes on six screens with zero failures; voice and investor UI suites; 591 presentation checks; 16 locale browser checks. Public deployment verification follows the guarded scripts. Known operational work remains separate: WordPress/PHP upgrade, mail/payment provider setup, account 2FA, domain auto-renew verification, new Fable inference latency and field performance/Search Console coverage.

## 5 October 2026 — Codex: Fable voice and Ghana investor research

- Final voice release verified on the public WordPress domain: complete ordered JSON audio packets, cached payment answers in English/French/Spanish, current-time and general-knowledge answers. Prepared payment audio started in approximately 3.4 seconds. A final short clock opening started in 16.11 seconds and completed two parts in 26.43 seconds. New synthesis still takes roughly 10–19 seconds to first audio on this shared one-CPU Oracle host; moving it to WordPress has **not** happened.
- WordPress admin access was verified. Site Health reports LiteSpeed/PHP 8.1.34 with a 1024 MB PHP memory limit. These values do not establish the hosting account's CPU allowance or Python app capability. The actual cPanel URL `https://gothamconsult.com:2083/` reaches its login page, but no authenticated hosting session or valid cPanel account username was available. The supplied email is a WordPress login, not proof of a Namecheap/cPanel account. Next migration action: authenticate the actual hosting panel, inspect resource limits and Python controls, benchmark a separate voice worker before switching production. Keep the existing backend running until that succeeds.
- Final voice/backend regression: all 31 API suites passed. Full website sweep: 6,086 checks passed, zero failures across six screen sizes, plus the trilingual voice and investor chart suites. Live browser payment replay displayed “Fable is speaking…” and retained the verified MoMo number in chat. Daily economic refresh was also observed updating GSE-CI to the new 5 October publication, with the publication date preserved.
- New service presentation: `docs/presentation/` contains the English/French/Spanish copy, Artifact Tool builder, browser player template, packaging script, finalization receipts and usage/source notes. `apps/site/public/downloads/gotham-services.html` offers language selection before presenting and follows the website's saved language. Five slides, full-screen projection, keyboard navigation, matching PDFs and editable PowerPoints. Final QR slide links the existing website and LinkedIn company page; each rendered language's two QR codes decoded to those exact destinations, including the lossless web images. No added prices, investment-return promises or fabricated service claims. `tests/ui/presentation_ui.js` passed 591 checks on all languages/slides across six screens, including stored-language persistence, downloads and desktop full-screen/keyboard navigation. The final complete website run also passed all 6,086 page/journey checks and both focused voice/investor suites.
- Claude's loaded conversation contained older uncommitted/pending deployment status, superseded by the pushed release. Its suggested USD 13.66bn annual trade surplus uses an older series than the September BoG revision documented here (USD 13.7959bn). The older mining royalty “pending” copy elsewhere on the site requires reconciliation against the applicable legislation; do not replace it merely from a chat summary.

- Fable means **Kokoro `bm_fable`**, the same free local voice Uffe chose for Jarvis, not OpenAI's separately named voice. No new API credential is needed; Groq `/api/ask` remains the text provider.
- `apps/crm/ask-voice.js` issues visitor-bound, one-use speech tickets for generated answers. `/api/ask/voice` accepts a ticket, never arbitrary visitor text. Tickets expire after ten minutes; limits: 20/visitor/hour, 20/minute globally, two outstanding synthesis jobs, 400/day (`ASK_TTS_DAILY_CAP`). Cached introductions require no inference. Text remains available when voice fails.
- `ask-voice.py` is a warm Kokoro worker using `bm_fable` and English/French/Spanish phonemizers. Docker downloads checksum-verified model files; TTS is made on our server. `tts.js` now accepts a language and worker settings without changing the receptionist's Jenny voice.
- Website: speech starts only after the visitor opens chat or asks a question, with persistent mute, stop/replay, close/tab-hide cancellation, localized controls and AI-voice disclosure. Offline payment answers include +233 55 041 6627 instead of only deferring to WhatsApp.
- Uffe’s later steering: first opening the chat speaks a broad welcome covering the whole site, with voice enabled and a user gesture. `ask-welcome.json` is the shared trilingual copy for displayed and spoken introductions, served without an LLM call. Sending a question or closing the chat cancels the introduction.
- Production timing check found the first introduction took 41 seconds on this one-CPU host, exceeding the browser’s former 40-second deadline. Fixed introductions are now rendered into the Docker image once and served immediately. New answer speech starts a visitor-bound background job; the browser polls `/api/ask/voice/result` so no synthesis request needs to remain open through the WordPress bridge’s 45-second timeout. Text stays available during preparation. One-time job results expire after ten minutes; no speech text or audio is stored in the database. Dynamic speech can take longer on this shared host.
- Automatic economic publications: public `/api/ghana-data` checks GSS, BoG and GSE at most hourly, verifies source formats and retains the persisted last-good snapshot on an outage. Values show their reporting periods, source links and verification dates. `ghana-snapshot.json` provides an offline seed; settings are included in existing database backups. Annual export components were reconciled to the latest BoG revision.
- `/invest#research`: trilingual investor dashboard, eight exchange-rate pairs with inverses, four sourced five-year company share-price histories, interactive chart, conditional 2031/2036 sector outlook and a blank-input scenario calculator that accounts for currency depreciation. See `docs/ghana-investor-research-2026-10.md` for primary sources, exact report pages and limitations. Returns are price-only; no invented twenty-year total returns or guaranteed ROI.
- Chat reads a topic-retrieved public `site-knowledge.json` built with the website, plus the same dated economic snapshot and currency feed. Direct exchange questions are calculated server-side and return both directions with provider publication time; they work even when Groq is unavailable. No private CRM records are included.
- `research-sources.json` is the shared source registry for the investor page and `research-checks.js`. All eight original cited sources were downloaded and fingerprinted on 5 October. The scheduled data job checks them once per UTC day, persists results in the same economic cache, and flags changed or unavailable sources on the page and in chat knowledge. HTML checks exclude scripts/styles; PDF checks compare document fingerprints. IMF uses its official PDF because the landing page blocks automated requests. A changed document is never silently treated as newly reviewed investment analysis.
- Regression exposed a pre-existing two-step sign-in bug: valid recovery codes containing only digits were rejected. The route now accepts the generated ten-hex-character format, with a deterministic one-use regression.
- Evidence: all 31 API suites and the six-screen sweep passed before the production timing fix (6,085 page/flow checks plus voice and investor suites). Real local Fable audio produced for all three languages. After the background-job change, all 31 API suites and the full six-screen E2E sweep passed again, including trilingual voice and investor portal checks. The public-domain English, French and Spanish broad welcome recordings returned valid Fable MP3 audio in about 3.2 seconds each; live dynamic-answer checks are the remaining smoke check. Use only the two guarded deploy scripts and check both `DEPLOYED_COMMIT` markers.
- Follow-up steering: voice remains enabled for every generated answer unless the visitor explicitly mutes it. The payment chip uses verified trilingual MoMo instructions, number +233 55 041 6627, registration-page transaction reporting and staff verification, without unrelated incorporation fees. Its fixed recordings are built into the image for immediate playback. Provider outage/cap answers can also receive speech tickets. Chat human-help buttons stay on-site; no automatic WhatsApp answer handoff. Foreign-currency invoicing commentary is restricted to explicit questions and the cited BoG non-resident/expatriate exception, rather than appended to stock answers. Follow-up regression: all 31 API suites passed, the final voice API suite passed again after cancellation changes, and focused trilingual speech/graphics checks passed. The final six-screen sweep is running; public smoke checks follow the guarded deployment.
- Latency follow-up: dynamic Fable answers are synthesized as a short opening phrase followed by ordered chunks. The widget explicitly requests `stream:true`; older cached widgets receive a single complete recording for compatibility. The page schedules chunks in order, joins received buffers for complete replay, and cancels visitor-bound jobs when the answer is replaced, muted or closed. `tts.js` aborts an active synthesis or skips a cancelled queued job. Source URLs stay visible in text and are spoken as source links rather than letter-by-letter addresses. Longer speech still depends on the shared one-CPU host.
- Public-domain testing caught WordPress stripping the custom `X-Voice-More` header. Widget v30 requests `packets:true` when polling; audio and continuation metadata travel together in JSON (`audio` base64 MP3, `more` boolean), preserving all chunks through the existing bridge. Direct MP3 responses remain available to older clients. The phone regression deliberately supplies no custom response headers. Initial live timings: cached payment MP3s 3.85–4.35 seconds across EN/FR/ES, current-time first chunk 18.05 seconds, geography 10.02 seconds; timings are measured observations, not a latency guarantee. Recheck complete public playback after deploying this protocol fix.
- General knowledge is now within chat scope: ordinary geography, history, science and everyday concepts are allowed. Gotham-specific facts, investment figures and changing live information still require the supplied verified sources; unverified current news/weather/quotes must be disclosed. Every normal answer uses the same Fable speech flow unless muted.
- Simple current-time questions use the server clock and named-city time zones directly, defaulting to Accra, with speech tickets. They do not require the LLM.
- The opening speech chunk is capped at 45 characters to reduce time to first sound; clock answers put the actual time before the date so the opening phrase contains the requested answer. This cannot remove the shared host's inference delay.
- Investor visual follow-up: a navy/gold animated 2D area/line chart uses the same sourced 2020–2025 company prices, with company switching, hover/touch/keyboard year readouts, visible price-only limitations and reduced-motion support. No invented series, smoothing or projected returns.
- Open research scope: historical company cases and World Bank/IMF forecast commentary are dated editorial content, requiring review after new publications. Individual stock quotes, adjusted twenty-year total returns and a verified deal catalogue are not shipped. The legacy `/classic` archive remains separate from the current market dashboard.

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

## Prices at a 70% markup, Carlson prices, fact register and weekly source checks (6 Oct 2026, Claude)

- Pricing rule (Uffe): price = cost × 1.7; government fees at cost; Gotham is VAT registered, so every price says "excluding VAT (20% in total)". New Gotham list and Carlson Capital's AI/web price section went live in `e81870a` (back-office memberships moved from old default prices). Cost assumptions: `Gotham_pricing_review_DRAFT.xlsx` → "Draft 70% markup" (Joy to confirm real costs).
- Fact register `apps/crm/facts.json` (22 facts): claim, kind, `where` + `says` (must be on those pages), sources with `expect` phrases, `checked`, `review_days`, optional `live` (Bank of Ghana / GSS figure).
- `apps/crm/fact-watch.js`: daily from `runJobs` in production (`FACTS_EVERY_DAYS`, server default 1; changed from weekly on 6 Oct at Uffe's request). Claude also reports the status in Uffe's chat every day. Statuses: ok, changed (page changed since the last human check: soft), review (expected words gone, 404 twice, unreachable three times, live figure moved, overdue), unverified. Alerts via the safety-net contacts, once per new problem. State in `settings.facts_state`.
- API: `GET /api/facts` and `POST /api/facts/check|review` (admin), `GET /api/facts/public`. Back office: Settings → Facts and sources (“Still correct” records who/when/why in `jobs_log`).
- Site: `apps/site/facts_page.py` builds `/sources` (footer link “Sources & fact checks”, EN/FR/ES chrome) and `dist/source-links.json` (every article source link, checked weekly for 404s). Build prints `WARNING fact …` if the register drifted.
- Found and fixed while building it: the ORC VIP fee is GHS 1,300 on top (1,885 in total), not 1,885 on top; the free tools again show the GHS 130 business-name fee (ORC 2026).

## Approved free six-language release — 7 October 2026, Codex

Uffe approved German, Mandarin Chinese and formal Modern Standard Arabic demos. All speech is synthesized locally without an ElevenLabs subscription. English Fable, France French Pierre and Spain Castilian Sharvard remain. Site selection controls chatbot answers and native voice routing. New DE/AR/ZH public pages include Simplified Chinese and Arabic RTL, reciprocal SEO alternates, native investor content and translated globe labels. Public provenance/licence notices are linked from terms and voice credits. New five-slide PDF/PPTX/QR presentations are staged in all three languages; source lives under docs/presentation.

Actual Mac workers and HTTP welcome/payment/clock packets passed decoding and speaker-ID checks. Local warm timings exclude WordPress and production hardware. All 35 API suites passed after integration with Claude’s 5389785 investment-report commit. All six focused voice UI flows and 60 locale/globe/phone checks passed. The combined six-screen regression passed: 159 routes, 15,798 site checks, zero failures; six voice-control flows, investor flows, 1,167 presentation checks and 60 locale/globe/phone checks passed. Guarded deployment remains pending; do not call the new languages live until those pass. Claude’s pricing/source claims are preserved. Models are pinned by SHA256 in apps/crm/voice-models.json, not stored in Git.

Open: verify Linux Docker build; deploy only through guarded scripts; check all six voices on the public domain; append deployment evidence. Editable Arabic PowerPoint should also receive a native PowerPoint app check; reviewed browser/PDF slides already use correct RTL rasters.

## Public six-language verification and bounded chat — 7 October 2026, Codex

Guarded deployment of 6e2bf45 succeeded. The actual Linux Docker image verified every model checksum and generated all 12 native welcome/payment recordings. Eighteen public-domain audio checks passed (six languages × welcome/payment/fresh clock): correct speaker IDs and every MP3 packet decoded. Public locale pages, SEO alternates/direction, presentation and API health passed. An actual public browser played Arabic welcome/payment through native Web Audio, with the payment phone in chat and no WhatsApp link. Evidence: `/Users/uffe/Documents/CRM/Gotham audit/2026-10-07/free-voices/public-evidence/`, `public-arabic-chat.png`, `/tmp/gotham-six-public-voices.log`, `/tmp/gotham-public-audio-browser.log`. Public cached first audio took 5.79–6.48 seconds; cold dynamic first audio took 9.52–35.04 seconds. Free CPU speech is functional, not instantaneous.

A general-knowledge check exposed provider failures: the third model was retired, and Qwen rejected the old 8,207-token prompt against the account's 7,000-token input limit. The supported set-secret script changed only OPENAI_MODEL to `openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b`. No new key or paid plan. New ask-context.js bounds input while retaining whole facts/rules/source paragraphs; retrieval requires relevant matches. All 36 API suites passed, including new API 35. Full final browser regression is running; backend public provider verification remains pending after deployment. Arabic phone groups are now nowrap and globe coordinates explicitly LTR; website deployment must wait for the final E2E pass.

Claude's a4236e5 investment report update is preserved. The report body remains English; translating it and a native PowerPoint app review of editable Arabic slides are open. Site/API hosting still uses the existing WordPress bridge and Oracle backend.

## Final regression and real-provider verification — 7 October 2026, Codex

All 36 API suites passed. Final six-screen browser run passed: 159 routes, 15,799 site checks, zero failures (979 seconds); all six voice-control flows, investor flows, 1,167 presentation checks and 60 locale/globe/phone checks passed. Logs: `/tmp/gotham-context-api.log`, `/tmp/gotham-context-final-e2e.log`, `/tmp/gotham-final-focused-voice.log`. The final Arabic nowrap/LTR fixes were included in the tested build (CSS v30, globe v7).

Backend 45b456e deployed through the guarded script and passed database health. Real compound-interest answers followed the selected language in all six languages and every native speech packet decoded with the correct speaker ID. Spanish initially hit a temporary provider input-tokens-per-minute quota (not an oversized request); the retry after its stated interval passed. Evidence: `/tmp/gotham-six-general-fixed.log`, `/tmp/gotham-six-general-retry.log`, `free-voices/public-evidence/public-six-general-checks.json`. First audio, including the public bridge: German 16.45s, Arabic 18.04s, Mandarin 33.12s, English 19.49s, French 10.90s, Spanish 14.07s. Free-provider quota and cold speech delays remain material limitations; payment/clock answers do not depend on the text provider.

Normal Git HTTPS pushes returned GitHub internal errors. The exact two local commits were published through the official Git-data API: each blob/tree/commit hash matched, and main was advanced with force=false after checking its parent. No history rewriting or guard override. Main checkout was fast-forwarded cleanly. Claude's a4236e5 report/pricing content remains preserved. Final documentation-only revision will be deployed through both guarded scripts, followed by public page and Arabic Web Audio checks.

## Latest-code audit and honest report downloads — 7 October 2026, Codex

Claude's five subsequent commits through `f4f3d35` are committed, pushed and present on both live deployment markers. They add six native report pages/PDFs and contact-source/list/export improvements. This supersedes the earlier English-only report limitation. The public six-language report checks passed: native headings, Arabic RTL, self-canonicals, reciprocal alternates and all 61 chapter figure hooks. Report source monitoring also includes 14 outlook anchors; do not confuse these 75 monitored records with Claude's wider manual claim review.

The report download confirmation incorrectly claimed that an email had been delivered, although outbound mail is unconfigured. It now offers the immediate download with its existing 30-day validity, in all six languages. An API success without a download URL is retryable. New `tests/ui/report_download_ui.js` covers consent, language, no default marketing opt-in, on-screen links and the missing-link case; all 30 focused checks passed. It is included in the full browser runner.

All 36 API suites passed on a disposable database after rebuilding local output. The first latest-main run failed SEO against stale ignored `dist`; rebuilding resolved it. Do not report that as a production SEO defect. Evidence: `/tmp/gotham-latest-status-api-rebuilt.log`, `/tmp/gotham-honest-download-api.log`. The latest full run passed: 164 pages across six screens, 16,369 site checks and zero failures (865 seconds), all six voice-control flows, investor flows, 1,167 presentation checks, 60 locale checks and 30 report download checks. Additional CRM, invoice, payment/security, campaign and account browser journeys also passed on disposable databases. Evidence: `/tmp/gotham-honest-download-e2e.log`, `/tmp/gotham-admin-final-ui.log`, `/tmp/gotham-admin-final-account.log`. Publish only through both guarded deployment scripts and verify their markers against origin/main.

Uffe confirmed MoMo and bank transfer are sufficient. No card provider is required for this release. Separate Ghanaian and foreign-owner registration packages are preserved; no price amount was invented or merged. Existing foreign-currency advertising needs a separate confirmed cedi display decision; changing audience packages is not the solution.

Read-only live operational checks found healthy database, a successful nightly backup dated 7 October and an off-site record dated 5 October. Outbound SMTP/Resend is unconfigured and seven messages are queued. Neither structured nor legacy invoice bank settings contain account details; this describes website configuration, not whether Gotham owns a bank account. Do not invent banking instructions. Payment reconciliation remains manual.

Core facts are checked daily; report sources currently weekly. The two automatically unverified core facts (minimum wage and SSNIT rates) were independently corroborated on the official FWSC and SSNIT websites during this audit, but the server's automated fetch status remains unverified. Sources: https://fairwages.gov.gh/2260-2/ and https://www.ssnit.org.gh/become-an-employer/. A successful test suite does not establish that every investment claim is current or that unconfigured email will send. Cold voice latency/free-provider quotas, a real Safari check and editable Arabic PowerPoint review remain known limitations.

## Audit fixes and release verification — 10 October 2026, Codex

- Forum events: expired items are archived from public listings and booking, remain available to administrators, and existing stale links receive a clear ended state. No expired event is promoted as current on the landing page.
- Market data: removed stale hard-coded landing-page financial figures and show official source/period/freshness state. Historical observations retain their actual reporting periods; missing current data is not presented as current.
- GIPA Act 1173: corrected the trading-enterprise capital and workforce rule, expatriate-quota application/bands and work-permit distinction across the website, reports, FAQ, chatbot context and fact register. Law copy identifies its statutory-text transcription and recommends checking the Gazette for reliance. Removed dated, unsupported work-permit prices/penalties.
- Language coverage: completed the legal-section additions for German, formal Arabic and Simplified Chinese, including page generation and runtime switching; added route and browser assertions.
- Rebuilt all language routes: 27 pages each for French, Spanish, German, Arabic and Chinese. Build passed; remaining 5 untranslated phrases in DE/AR/ZH are proper names, while French/Spanish report 33 proper-name phrases.
- Verification: all 38 API suites passed (0 failed); E2E passed 17,527 checks across 176 routes and six screen sizes (0 failed), plus all chained browser suites: voice, investor portal, 1,167 presentation checks, 73 locale checks, 30 six-language report-download checks and 512 phone touch-target checks. Logs: `/tmp/gotham-audit-api-rerun.log`, `/tmp/gotham-audit-e2e.log`.
- Before this commit, `origin/main` and the local base were both `1f7ec9ffcdae70ca1e030652dbfa1214bac6c7fd`. Pending: commit, push and deploy through both guarded scripts, then verify the deployment markers and public read-only health.
- Evidence boundary: the test run does not independently prove every public claim is current; pricing/permit figures removed above need authoritative source confirmation before reintroduction. Automated freshness is only as current as each feed's last successful fetch.
