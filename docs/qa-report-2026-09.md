# QA sweep, 28 September 2026

## Regional France/Spain speech, 7 October 2026 — Codex

- Root cause: British English speaker reused for French/Spanish. Initial language-matched Kokoro candidates passed 33 API suites and the complete E2E sweep (8,557 site checks over 86 routes/six screens, plus voice/investor/presentation/locale suites), but were not published. User clarified the desired France and Spain accents.
- Revised real Piper demos: France French UPMC Pierre (speaker 1), 12.43 seconds; Spain Spanish Sharvard M (speaker 0), 11.23 seconds; valid mono 22.05 kHz MP3s. Uffe listened and explicitly approved both. Models specify country locales; no documented Madrid birthplace is claimed. Synthesis including model loading: 4.96 / 4.44 seconds, excluding the WordPress bridge.
- API 28 now exercises all three worker paths and the split-runtime fixed builds, with regional model/speaker IDs, wrong-language rejection, ticket metadata, English fallback and stale-cache rejection. Mock synthesis proves routing; the actual approved demos prove the selected voices can synthesize.
- Evidence: `/Users/uffe/Documents/CRM/Gotham audit/2026-10-07/native-voices/`, including `regional-demo-copy.json`, `demo-fr-france.mp3`, `demo-es-spain.mp3`. Revised full regression passed: 33 API suites; 8,557 browser sweep checks, zero failures (568 seconds); 591 presentation checks; 16 locale checks; focused voice checks passed. Public welcome/payment/dynamic speech smoke checks subsequently passed for all three regional voices after guarded a29ec4b deployment.

## SEO verification, 7 October 2026 — Codex

- Full API regression: **33 suites passed, zero failed**, including the new SEO suite (850 assertions), exact signed-host redirects, chat/voice, financial sources, fact monitoring and payment reports. Run with bundled Node/Python and disposable `gotham_seo_test` on loopback PostgreSQL.
- Focused locale browser checks: **16 passed**. French/Spanish work without JavaScript; real language anchors are discoverable; direct Spanish URL overrides saved English; switching EN/FR/ES preserves the query and research anchor; localized menu highlighting and canonical URLs agree.
- Build: 24 English/French/Spanish page families, 48 localized static pages; Spanish article index, article/breadcrumb/FAQ schema and internal links use `/es`. Canonical/OG URLs, WebPage/service/FAQ/breadcrumb metadata, reciprocity and sitemap membership are checked automatically.
- Test harness corrections: Python image/spreadsheet dependencies supplied by the bundled runtime; API chatbot mock binds an available port; facts suite uses local source-link fixtures so it cannot time out on unrelated real research pages; E2E cleanup kills only its own processes.
- `node --check`, Python compilation, shell syntax and `git diff --check` passed. The Docker-based `scripts/dev.sh` could not start because Colima's Docker daemon is stopped; actual Node/browser flows were exercised by the E2E harness with native disposable PostgreSQL.
- Full E2E: **8,557 checks passed, zero failed** over 86 routes on six screen sizes (525 seconds), plus passing Fable widget, investor portal, 591 presentation checks and 16 locale browser checks. Public-domain smoke checks follow the guarded deploy. Rankings, Google indexing coverage and field Core Web Vitals are not established by these technical checks.

## Current checkout verification, 28 September 2026

The committed release is based on `origin/main` `41ba281` plus the release commit recorded in Git. After rebasing,
all 14 API suites passed against a disposable local PostgreSQL 16 database: 230 reported checks, including the
13 upstream suites and the MoMo payment-report suite. The Ask Gotham suite used a local mock provider and verified
that the selected French locale and the MoMo receiving number/staff verification rule reach the `/api/ask` prompt. `node --check apps/crm/server.js` and
`git diff --check` also passed. The site build and production deploy scripts are run separately as part of release.
- Fixed during this review: API suites 02, 03, 04 and 05 no longer depend on a former machine's absolute
  checkout path. Suite 04 now creates its own deterministic workbook instead of requiring a private upload.
- Hardened during this review: `tests/run_api.sh` refuses database names that do not end in `_test` and
  no longer broadly kills every process named `node server.js`.
- Login now opens the back office in a same-origin full-screen dialog over the current public page. The
  back-office response allows same-origin framing only; the cross-origin framing block is retained.
- Payment settings now seed missing MoMo numbers to Joy's WhatsApp line (`+233 55 041 6627`),
  validate changes, and show the same destination and registration reference in the customer flow. Payment
  transaction reports are validated, deduplicated, audited, and remain unverified until staff reconcile them.
- The home page now leads with the chosen shared audience and action: building partnerships in Ghana. The hero
  video and its controls are removed. A same-page English/French/Spanish selector remembers the visitor's choice.
  Static landing copy, chat welcome and scripted fallbacks are translated; `/api/ask` receives the selected locale.
  Interactive calculator results and CRM-supplied event content still need browser review.
- `tests/api/12_momo_payment_flow.py` passes the MoMo path, duplicate claims, manual verification and concurrent
  capacity reservation checks.
- `scripts/backup-crm.sh` was exercised against a disposable database and media directory. Its archive checksums
  verified, and both the database row and media file were restored successfully.
- Not reverified in this API run: browser E2E, responsive visuals, live domain and WordPress bridge. The
  26 September browser results below are historical, not evidence about the current release or live host.

### Product and design assessment

- The concept offers useful entry points for events, investor/mining enquiries, membership, Family Desk and
  a weekly brief. The site has a coherent visual palette, strong event imagery, clear calls to action and
  mobile-specific layout work.
- The public proposition is broad: business consulting, events, investor services, mining, membership,
  newsletter and family care compete for attention on a very long home page. Joy has identified startups, CEOs,
  business owners, government representatives, investors and venture capitalists as the intended audiences.
  The primary audience, offer and call to action still need to be chosen before rewriting or translating the page.
- The back office includes accounts/roles, events, registrations, sponsors, media, outreach, contacts,
  a deal pipeline, tasks, notes, search, reports, QR/poster tools and audit events. That is a strong demo
  foundation; scheduled off-site backups, alerting, data-retention workflows, and verified payment
  reconciliation still need setup or evidence before it can be called dependable for day-to-day service.
- Payment status is still manually reconciled by staff; the website does not claim that a customer-submitted
  transaction ID proves money was received. Automated provider confirmation would require an official payment
  integration and credentials.
- The README now describes the single-origin development topology, CRM host and WordPress bridge checks. Live
  routing still needs an external check because this environment could not reach the public host.

### Next release plan

1. Run the UI E2E suite in an environment with Chromium; capture failures and screenshots, then fix every
   reproducible regression. All 14 API suites passed locally.
2. Do a focused journey review: visitor enquiry and registration, staff triage, task completion, payment
   reconciliation, opt-out, account disable/reset, and event cancellation/refund handling.
3. Configure scheduled encrypted off-site backups, monitoring/alert route, safe rollback, retention
   and export procedure, and audit-log coverage. The backup script itself passed a local restore rehearsal.
4. Confirm MoMo merchant instructions and live domain routing, remove misleading demo copy/unused confirmation
   code, and validate the WordPress bridge end to end.
5. Run accessibility and content review, then verify every translated landing section and dynamic result in
   a browser at desktop and phone widths.

The following device sweep and browser flow results were recorded on 26 September, before the current checkout changes:
iPhone SE (375), iPhone 15 (393), Galaxy A (360), Pixel 7 (412), iPad (820) and desktop (1440). They covered public pages,
back-office tabs, drawers, layout, text size, tap targets, images, console errors and phone flows. Treat them as historical;
this checkout has not had browser E2E revalidation in the current environment.

## Defects found and fixed

| # | Severity | Where | Defect | Fix |
|---|---|---|---|---|
| 1 | Critical | Register | People could not complete registration: company name and email were required, event questions were required, and on a phone the error appeared far above the button, so nothing seemed to happen | Only name + WhatsApp + consent required; business details optional and folded away; errors by the button and scroll to the field |
| 2 | Critical | Register (server) | A missing "attending as" answer refused the registration | No longer blocks |
| 3 | Critical | Live data | No registration had ever reached the database; people were using the old Netlify copy | New link shared; server accepts the old form's payload |
| 4 | High | Prices | Ten investor/mining prices and three products were in USD (Bank of Ghana rule) | Converted to GHS at ~11.40, rounded; back office locked to GHS; live rows migrated |
| 5 | High | Accounts | Removing, disabling or resetting someone left them signed in for up to 12 hours | Sessions checked on every request |
| 6 | High | Accounts | Changing a password did not ask for the current one | Current password required, new one typed twice |
| 7 | High | Accounts | Adding an existing user showed a password that did not work | Refused with a clear message |
| 8 | High | Accounts | A first/reset password did not have to be changed after a page reload | Enforced by the server |
| 9 | High | Home video | Server ignored byte ranges; iPhones cannot play video without them | Range requests supported |
| 10 | High | Back office | Sidebar, "View website" and campaign link defaults pointed at the stale Netlify copy | Same-domain links |
| 11 | Medium | Back office on phones | Menu filled the first screen; tables needed sideways swiping; buttons stretched into ovals | Menu button, tables as labelled cards, fixed button layout |
| 12 | Medium | All forms on iPhone | Inputs at 13–15 px made iPhone zoom in on every field | 16 px on phones and touch screens |
| 13 | Medium | Teaser | Share buttons shared "/teaser.html" with no address | Full address |
| 14 | Medium | Home | "Ghana in numbers" figures clipped on small phones; sector tabs wrapped into a blob; video controls covered the headline | Resized; tabs full width; controls moved |
| 15 | Medium | Home | "Next forum" band was hard-coded and would go stale when Joy edits the event | Follows the back office |
| 16 | Medium | Home/Register | Event times shown in the visitor's own time zone | Always Accra time |
| 17 | Low | Home | Footer section names were plain text, not links | Linked |
| 18 | Low | Family/Register | Phone header wrapped onto three lines; call-to-action hung off the edge | One scrollable row, main action first |
| 19 | Low | All | Labels at 10.5–11.5 px | 12 px minimum |
| 20 | Low | Dashboard | Free seats counted as "Received GHS 0" | Only paid money counted |
| 21 | Low | Legal pages | Page generator still pointed at Netlify and was out of step with the served copy | Regenerated, relative links |

## Accepted, not changed

- Inline text links inside sentences and footers are under 24 px tall. WCAG 2.5.8 exempts inline links.
- Native file pickers in the event editor are small; they are the browser's own control.
- Chromium's iPad emulation does not report a touch pointer, so the 16 px rule shows as missing there. Real iPads match `pointer:coarse`.
- The home page is long on phones (about 50 screens). This is content scope, not a layout fault.

## How to re-run

```
TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/gotham_test bash tests/run_api.sh
python3 tests/ui/seed_demo.py            # against a local server on :4199
node tests/ui/register_phone.js
node tests/ui/admin_accounts_phone.js
OUT=/tmp/shots node tests/ui/layout_sweep.js
```

## 7 October 2026 — approved free German, Mandarin and Arabic candidates

Uffe approved all three audio demos before release. Actual local workers generated welcome and full payment MP3s with the selected native speakers. German and Mandarin rejected wrong-language requests; Arabic did too. The framed READY/WAV protocol remains intact despite native library diagnostics. First short warm synthesis on this Mac measured German 0.39s, Mandarin 1.17s and Arabic 1.55s; these timings exclude the public WordPress bridge and are not production promises. Evidence: `/Users/uffe/Documents/CRM/Gotham audit/2026-10-07/free-voices/` (`worker-checks.json`, `warm-checks.json`, demo/worker-payment MP3s); `/tmp/gotham-free-fixed-payments/` contains matching fixed recordings, decoded successfully by ffmpeg.

New presentation covers and every service/QR slide were reviewed individually. German QR caption overlap was corrected. Native Arabic raster word order was corrected with Chromium RTL rendering; native editable PPTX paragraphs carry RTL flags (22 verified). Both actual QR targets decoded from each new language's final slide via macOS Vision. Each PPTX passed package/geometry/import finalization. Evidence: `/Users/uffe/Documents/CRM/Gotham audit/2026-10-07/six-language-presentation/`, `/tmp/gotham-new-qr-check.log`. A PowerPoint app check of the editable Arabic deck is still advisable; browser/PDF slides use the reviewed Arabic rasters.

Real isolated HTTP speech checks passed for DE/AR/ZH: welcome, payment and fresh clock answers carried the expected voice ID, and every returned MP3 packet decoded. Fixed welcome/payment audio returned immediately on loopback; cold dynamic first audio including polling measured 2.43s German, 4.02s Arabic and 4.83s Mandarin on this Mac. This excludes WordPress and production hardware. Evidence: `/tmp/gotham-free-native-api-check.log` and free-voices/live-checks.json. Full API regression passed all 34 suites, zero failures; expanded SEO assertions passed 2,839 checks across 120 localized pages. A strict French HTML assertion was updated for explicit LTR direction; article FAQ schema now normalizes whitespace to match visible copy.

Combined release rebased onto Claude’s 5389785 investment-report commit. Full API rerun: 35 suites passed, zero failed (bundled Node 24.19.0/Python, disposable native PostgreSQL). Focused six-language voice UI and 60 locale/globe/phone checks passed. The report remains English; its new navigation links are translated into the six-language chrome. Final combined browser regression passed: 159 routes on six screens, 15,798 site checks and zero failures (987 seconds), all six voice-control flows, investor flows, 1,167 presentation checks and 60 locale/globe/phone checks. Evidence: /tmp/gotham-six-language-combined-api.log and /tmp/gotham-six-language-combined-e2e.log. Public speech verification follows guarded deployment.

### Public release evidence and input-limit follow-up (7 October, Codex)

Actual Linux Docker build and all 12 fixed recordings passed. All 18 real public-domain welcome/payment/clock voice cases decoded with correct speaker IDs. Public page/SEO checks and actual Arabic Web Audio playback passed. Evidence: free-voices/public-evidence, public-arabic-chat.png; `/tmp/gotham-six-public-voices.log`, `/tmp/gotham-six-public-pages.log`, `/tmp/gotham-public-audio-browser.log`. Cached first audio: 5.79–6.48 seconds; cold dynamic: 9.52–35.04 seconds. These are public timings, not local promises.

General knowledge exposed a retired fallback and oversized provider prompts. Current follow-up adds bounded whole-section context, relevant source filtering and current fallback coverage. All 36 API suites pass (`/tmp/gotham-context-api.log`). Final six-screen E2E and real-provider checks remain pending; do not infer real-provider availability from mock tests.
