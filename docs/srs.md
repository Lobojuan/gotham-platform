# Gotham Consult platform: requirements and test map

Software requirements for the website, registration and back office at one address
(`/` website, `/register`, `/family`, `/admin`, `/api/*`). Each requirement names the test that proves it.
Tests live in `tests/` (API: `tests/api/*.py`, run with `bash tests/run_api.sh`; phone UI: `tests/ui/*.js`).

All 14 API suites passed on 28 September 2026 (230 reported checks) against a disposable local database.
Browser E2E and the live domain are not certified by that run; device results in the 26 September QA report
are historical. The suites include Ask Gotham provider/locale behavior, MoMo payment reporting, and CRM
pipeline, task, contact record and report coverage. Current execution status is tracked in
[`qa-report-2026-09.md`](qa-report-2026-09.md).

## 1. Registration (public)

| ID | Requirement | Test |
|---|---|---|
| R-1 | Anyone can register with **name, WhatsApp number and consent** only. Business name, email, registration number, job title, sector and the event questions are optional. | api/10, ui/register_phone |
| R-2 | A missing or wrong field is named in words, shown **next to the button** and the page scrolls to the field. | ui/register_phone |
| R-3 | A bad email is refused; an empty one is accepted. Phone numbers under 9 digits are refused. | api/10 |
| R-4 | Ghana numbers are stored as +233…; numbers from abroad keep their country code. | api/07 |
| R-5 | The consent box is at least 24 px and ticks with one tap on a phone. | ui/register_phone |
| R-6 | Old copies of the form (e.g. the Netlify link in WhatsApp groups) still register successfully. | api/08, api/10 |
| R-7 | An unknown or missing "attending as" never blocks a registration. | api/10 |
| R-8 | Invitation-only events create a *pending* application; open free events confirm at once; seats never exceed the venue limit. | api/02, api/10 |
| R-9 | "Yes" / "Maybe" to follow-up puts the person on the Outreach list; "No" and do-not-contact are respected. | api/08 |
| R-10 | Registration is also possible by WhatsApp or email from the same screen, with only the lines the person filled in. | manual |
| R-11 | After an event ends, it is marked past automatically and retained in the back office; it is removed from the homepage and registration choices, and stale registration links are refused. Historical event pages may remain in the public events archive. | api/08; site build; browser E2E |
| EVT-1 | An event record keeps a private client brief, event lead, guest target, budget ceiling, contingency, notes and assigned readiness checklist; private planning fields never appear in the public events API. | api/01_media_events |
| EVT-2 | Event budgets identify category, supplier, estimate and payer route. Supplier-direct estimates are planning-only and are never silently counted as Gotham revenue or copied into a quote. | api/01_media_events; admin event planner |
| EVT-3 | Joy can select priced lines explicitly marked for Gotham's quote, save the plan and create an editable draft GHS quotation; issuing or emailing remains a deliberate review action in Invoices & quotes. | admin event planner; invoices API |

## 2. Prices and money

| ID | Requirement | Test |
|---|---|---|
| M-1 | Every price is shown and stored in **Ghana cedis** (Bank of Ghana rule). The back office cannot save another currency. | api/10 |
| M-2 | Earlier USD items (M3, B1, B2) are converted to cedis on start-up if nobody has repriced them. | boot migration |
| M-3 | "Received" counts only money actually paid, never free seats. | api/10 |
| M-4 | A paid registration returns the configured MoMo destination and registration reference; existing blank settings are seeded to Joy’s confirmed WhatsApp/MoMo number. | api/12 |
| M-5 | A customer transaction report requires a valid ID/network, applies only to an unpaid MoMo registration, cannot be claimed twice, and never marks itself paid. Staff reconcile it in the back office. | api/12 |

## 3. Accounts and sign-in (back office)

| ID | Requirement | Test |
|---|---|---|
| A-1 | Passwords are stored as scrypt hashes; nobody can read them, only reset them. | api/09 |
| A-2 | Anyone signed in can change their own password: current password + new one twice, 10+ characters, not the old one, not trivially guessable. | api/09, ui/admin_accounts_phone |
| A-3 | A first or reset password must be replaced before any other screen opens. | api/09, ui/admin_accounts_phone |
| A-4 | Only an **owner (super admin)** can add people, change roles, reset passwords, turn access off or remove someone. Admins and staff cannot. | api/09 |
| A-5 | Adding a sign-in that already exists is refused with a clear message (never a fake password). | api/09, ui/admin_accounts_phone |
| A-6 | Turning access off, resetting or removing someone ends their open sessions on their next click; a role change applies at once. | api/09 |
| A-7 | Changing your own password signs out your other devices and keeps this one signed in. | api/09 |
| A-8 | An owner cannot remove or demote themselves by accident. | api/09 |
| A-9 | Staff see no client contact details and cannot read the team roster or its names/emails; the user list never exposes password data. | api/01, api/09 |
| A-10 | Sign-in is rate-limited per visitor; a signed-out or expired session returns to the sign-in screen with a message. | api/06 |
| A-11 | The sign-in page has an accessible show/hide password control and reports when Google sign-in has not been configured; Google OAuth only admits an active team account with a matching verified Google email. | api/19, manual login UI |
| A-12 | A person can request a password reset from sign-in using their account email when SMTP or Resend is configured. Responses do not reveal whether an account exists; links are hashed at rest, expire after 30 minutes, work once, enforce password rules, revoke existing sessions, and preserve two-step verification. With no mail transport, the page explains that owner assistance is required. | api/09, manual login UI |
| A-13 | Google sign-in does not require a prior password sign-in, but requires configured OAuth credentials and a verified Google email matching an existing active CRM team account. | api/19 |
| A-14 | Account administration has a dedicated Users space; owners see a prominent Add user action and account controls, while admins can view users but cannot change them. Settings links to Users; staff cannot access the page. | `tests/ui/users_space_ui.js`, api/09 |
| A-15 | All signed-in users can open Help & workflows, view role-appropriate CRM quick guides, and ask a grounded AI help question; answers do not access client records or perform actions, and role-restricted workflows remain protected. | `tests/ui/users_space_ui.js`, api/09 |

## 3A. Invoicing and payment settings (back office)

| ID | Requirement | Test |
|---|---|---|
| FIN-1 | Admins can securely add, edit, remove and select a default receiving bank account per currency in Company & invoicing settings. Account data is returned only to admins and appears on client invoice links, never in public content feeds. Existing single-account settings remain compatible. | api/19_invoices_google.py; admin UI smoke |

## 4. Back office content

| ID | Requirement | Test |
|---|---|---|
| C-1 | Events: cover image auto-cropped to every size the site needs; PDFs checked and served; in-use media cannot be deleted. | api/01 |
| C-2a | Event administrators can save editable flyer copy, locale, theme, photo choice, print/social format and a tracked registration QR with the event; AI copy suggestions are admin-only, grounded in saved event details, and manual editing remains available. | api/01; admin UI smoke |
| C-2 | Sponsors: tiers, logos kept transparent, expired sponsors hidden. | api/02 |
| C-3 | Contacts: Excel/CSV import with column mapping, re-import updates instead of duplicating, manual add/edit. | api/04, api/05 |
| C-4 | Campaigns: suppression of opted-out/bounced/do-not-contact, daily pace, click and opt-out links. | api/03 |
| C-5 | Family Desk interest form: validated lists, honeypot, rate limit, confirmation email. | api/07 |

## 5. Website and phones

| ID | Requirement | Test |
|---|---|---|
| W-1 | One address serves website, registration, Family Desk and back office; Login opens the same-origin back office in a full-screen dialog without leaving the current page. | api/06 |
| W-2 | No page scrolls sideways on 360–1440 px wide screens. | ui/layout_sweep |
| W-3 | Text inputs are 16 px on phones and touch screens, so iPhones do not zoom in when typing. | ui/layout_sweep |
| W-4 | No text below 12 px. | ui/layout_sweep |
| W-5 | The back office works on a phone: Menu button, tables shown as cards, drawers full width. | ui/layout_sweep, ui/admin_accounts_phone |
| W-6 | Video is served with byte ranges (iPhones need them to play it). | manual curl, see QA report |
| W-7 | Event dates and times show in Accra time for visitors abroad. | manual |
| W-8 | The home page "Next forum" band follows the next event in the back office and stays hidden when there is no upcoming event. | manual, browser E2E |
| W-9 | Share links (WhatsApp, LinkedIn, copy) contain the full address. | manual |
| W-10 | Public landing pages have English, French, Spanish, German, Arabic and Simplified Chinese copy with an accessible language toggle preserving page, query and section. Core pages and insight articles have crawlable locale URLs, localized metadata/schema and reciprocal EN/FR/ES/DE/AR/ZH/x-default links. | api/31_seo, api/34_new_languages, ui/seo_locales_ui, e2e/site_e2e (six screens); legacy forms and event records retain browser translation |
| W-11 | Ask Gotham keeps `/api/ask` history and fallback behavior, follows the selected English/French/Spanish/German/Arabic/Mandarin page language, and gives the MoMo destination plus staff verification instructions for payment questions. | api/13, local fallback in `pages/index.html`; browser QA pending |
| W-12 | Chat replies use regional voices: Kokoro Fable (`bm_fable`) for English, Piper UPMC Pierre (speaker 1, France French) for French, Piper Sharvard M (speaker 0, Spain Spanish) for Spanish; Piper Thorsten for German (Germany), Kokoro 1.1 Chinese `zf_001` for Mandarin, and Supertonic 3 `M1` for Modern Standard Arabic. Uffe approved all three free demos before release. The shared map applies to dynamic answers, welcome and payment recordings; fixed cache filenames identify the speaker. Voice is enabled until muted; payment answers speak in the chat without a WhatsApp handoff; mute, stop and replay work; failures preserve text. Only short-lived, visitor-bound tickets can request speech; background jobs avoid the WordPress request timeout. | api/28, ui/ask_voice_ui; real audio smoke checks at deployment |
| W-13 | Investor research links primary sources, distinguishes reporting periods from check times, retains verified economic data during outages and shows USD/EUR/GBP/AED and other market rates with publication dates. | api/29, ui/investor_portal_ui |
| W-14 | Five-year company case studies identify price-only nominal cedi returns, show intermediate years and risks in a touch/keyboard interactive chart, and link original exchange/company reports. Five/ten-year scenarios use visitor assumptions and account for FX. | api/29, ui/investor_portal_ui, docs/ghana-investor-research-2026-10.md |
| W-15 | Chat answers current currency questions directly from the dated feed, with inverse rates and stale-data warnings. Other answers retrieve published website material and sourced investor research; missing worldwide quotes or investment returns are never invented. | api/29, api/13; live text and regional voice smoke checks at deployment |
| W-16 | The chat’s broad site introduction is shared in six languages and speaks with each language's matching voice after the visitor opens chat. Cited investment research and report/newsroom sources are checked every six hours; changed or unavailable publications show review status without inventing updated historical figures. | api/28, api/29, api/32, ui/ask_voice_ui, ui/investor_portal_ui |
| W-17 | Every law, fee, rate, figure and price on the site is in a fact register with its sources and last human check; the build test fails if the site and register disagree; sources are re-checked daily (missing wording, vanished pages, live-figure mismatch, overdue reviews, broken article links) with one alert per new problem; admins confirm facts; /sources shows each fact publicly. | api/30_facts (unit, register/site agreement, server, alerts, confirm, public status) |
| W-18 | Arabic and Simplified Chinese pages render native-script text in the body, shared header/footer and dynamic globe card/canvas labels using suitable fonts; dynamic globe content follows the active page language rather than stale saved preference. The shared logo and Carlson Capital partnership line remain consistent across translated pages. | api/34_new_languages; e2e/site_e2e; visual Arabic/Chinese browser check |
| W-19 | The 3D practice picker supports direct selection, arrows, keyboard, pointer/touch, trackpad and a localized pause/resume control for automatic rotation across all six locales. | api/34_new_languages; ui/v2_carousel_language.js (pause, resume, swipe and locale label); e2e/run.sh |
| W-20 | Landing-page economic figures are filled from the dated official-data API, preserve each reporting period, and show when the last source check is stale or unavailable. Initial HTML must not present an older snapshot as a current figure. | api/29_ghana_data; ui/investor_portal_ui.js; e2e/run.sh |
| W-21 | The investor page offers a six-language feed of dated, source-linked market updates. New source changes stay private in the back office until a human publishes them; an empty feed says no reviewed update is available. External links are HTTPS-only and text is escaped. | api/32_report; ui/investor_portal_ui.js; e2e/run.sh |

## 6. CRM pipeline and service operations

| ID | Requirement | Test |
|---|---|---|
| P-1 | Website enquiries create a contact, an open deal and a dated follow-up task so enquiries enter a working queue. | api/11 |
| P-2 | Deals have stage, value, source, owner, next action and contact history; stage changes and deletion are recorded. | api/11 |
| P-3 | Tasks can be assigned, prioritised, due-dated and completed; staff can only complete or edit tasks allowed by their role. | api/11, manual permissions review |
| P-4 | Contact records combine deals, registrations, campaign activity, notes and tasks in a searchable timeline. | api/11 |
| P-5 | Reports reconcile deal pipeline, won/lost reasons, event registrations, payments and task completion against source records. | api/11, manual reconciliation |
| P-6 | Search and reports are restricted to signed-in staff and hide contact details from roles without contact access. | api/11, api/09 |
| P-7 | Admins can generate an individual investor-letter draft from a contact record using business context only; personal identifiers stay out of the AI prompt, and a draft is saved only as an internal note after review. No send action is part of drafting. | api/18 |
| P-8 | Email campaigns can be checked in English, translated into French, Spain Spanish, German, Arabic and Simplified Chinese, edited, and routed by each contact's preferred language. Translation requires a fresh English review; unsupported or missing languages receive English. Email consent and opt-out checks still apply. | api/18, api/03 |

## 7. Operational readiness requirements (not yet certified)

These are release requirements for operating the back office reliably. The current repository does not
yet provide evidence for all of them; see the current QA findings before using the system with real users.

| ID | Requirement | Evidence needed |
|---|---|---|
| O-1 | Database and uploaded media are backed up on a schedule, encrypted, retained, and restored in a rehearsal. | backup script and local restore rehearsal verified; schedule and off-site encryption still require host setup |
| O-2 | Health checks cover database availability, disk space and email delivery; failures alert an owner. | deployed monitoring check |
| O-3 | A release can be rolled back without losing registrations or media uploaded after the release. | deployment/restore rehearsal |
| O-4 | Public forms show a reference and next step only after the server confirms storage; payment instructions never imply payment is verified automatically. | api/12 passed; browser E2E still needed |
| O-5 | Data retention, export, correction and deletion workflows are defined for contacts, registrations and campaign consent. | approved retention policy and tested operations |
| O-6 | Every admin action affecting accounts, money, contacts, campaigns and deals is attributable and reviewable. | audit-log coverage review |
| O-7 | Public pages meet keyboard, screen reader, contrast and reduced-motion expectations as well as responsive layout checks. | accessibility audit with automated and manual evidence |

## Known limits

- The old copy at `gotham-consult-gh.netlify.app` cannot be updated (Netlify credits exhausted). It still posts to the
  live system and is accepted (R-6), but its own form asks for company and email and has the old consent box.
  Stop sharing it; a one-off Netlify top-up would allow a redirect.
- When neither Resend nor SMTP is configured, emails wait in the outbox. The admin-only CRM inbox uses the configured cPanel IMAP mailbox when credentials are available.
- Layout tests run in Chromium with phone sizes and phone user agents; a final check on a real iPhone (Safari) is still worth doing.

## SEO release, 7 October 2026

| ID | Requirement | Evidence |
|---|---|---|
| SEO-1 | All 24 page families have English, French, Spanish, German, Arabic and Simplified Chinese static twins, matching canonical/sharing/structured-data URLs, translated titles/descriptions/services/FAQs, reciprocal hreflang and sitemap inclusion. | api/31_seo.py |
| SEO-2 | Language anchors are crawlable without JS; switching preserves query/section and explicit locale URLs select the correct language; phone/desktop navigation works. | ui/seo_locales_ui.js, e2e/site_e2e.js |
| SEO-3 | The signed WordPress hostname survives Caddy so www returns a 301 to the apex with the same path/query. Unsigned/unrelated host headers cannot trigger it. Shared proxy changes are scoped, validated, backed up and reload without restarting other sites. | api/12_bridge_redirect.py, api/31_seo.py; scripts/bridge-host.py invoked by guarded deploy-crm.sh; public smoke checks after deploy |

## Email inbox

| ID | Requirement | Evidence |
|---|---|---|
| MAIL-1 | Admins can sync the latest 50 incoming messages from the configured mailbox over TLS, see the latest 100 in the CRM, and retain at most 500 mirrored messages. Sync is manual or runs every 15 minutes in production. | api/38_email_inbox.py |
| MAIL-2 | The inbox stores plain text only, does not import attachments or HTML, and never returns message content or mailbox status to guests/staff. SMTP/IMAP credentials remain server-side. | api/38_email_inbox.py; admin-only route checks |
| MAIL-3 | An admin can send a plain-text reply through the Gotham SMTP mailbox; valid thread headers are preserved and the sent copy appears in the CRM inbox. No email is sent by syncing or opening a message. | api/38_email_inbox.py |

| CHAT-17 | Public provider prompts retain full instructions/current question and select whole knowledge/source sections within a 22,000-byte UTF-8 bound. Irrelevant website matches and long old history cannot overwhelm the free text provider. Provider outages preserve localized unavailable answers. | api/35_ask_context.py, api/13_ask_gotham.py |
| CHAT-18 | Consented website chat leads, sponsor/partner enquiries, investor enquiries, report requests explicitly seeking follow-up, and forum registrations explicitly requesting follow-up queue email alerts to the configured Gotham team inboxes. Generic report downloads and registrations without follow-up do not alert. Alerts are configurable and can be paused by an admin; missing SMTP credentials never blocks CRM lead capture, and queued alerts remain in the email outbox. | api/39_website_enquiry_emails.py; ui/users_space_ui.js |

| REPORT-1 | The report request passes the selected language and explicit download consent, does not opt visitors into marketing by default, and provides an on-screen download. Its confirmation must not claim that queueing an email proves delivery. A success response without a download URL remains retryable. | api/32_report.py; ui/report_download_ui.js (30 checks in EN/FR/ES/DE/AR/ZH), included in e2e/run.sh |
