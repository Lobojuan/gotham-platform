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
| A-9 | Staff see no contact details; the team list never exposes password data. | api/01, api/09 |
| A-10 | Sign-in is rate-limited per visitor; a signed-out or expired session returns to the sign-in screen with a message. | api/06 |

## 4. Back office content

| ID | Requirement | Test |
|---|---|---|
| C-1 | Events: cover image auto-cropped to every size the site needs; PDFs checked and served; in-use media cannot be deleted. | api/01 |
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
| W-8 | The home page "Next forum" band follows the next event in the back office. | manual |
| W-9 | Share links (WhatsApp, LinkedIn, copy) contain the full address. | manual |
| W-10 | Public landing pages have complete English, French and Spanish copy with an accessible language toggle that preserves the current page/section. | landing toggle and static-copy translations implemented; interactive results and CRM event text plus browser QA remain |
| W-11 | Ask Gotham keeps `/api/ask` history and fallback behavior, follows the selected English/French/Spanish page language, and gives the MoMo destination for payment questions when AI is unavailable. | api/13, local fallback in `pages/index.html`; browser QA pending |

## 6. CRM pipeline and service operations

| ID | Requirement | Test |
|---|---|---|
| P-1 | Website enquiries create a contact, an open deal and a dated follow-up task so enquiries enter a working queue. | api/11 |
| P-2 | Deals have stage, value, source, owner, next action and contact history; stage changes and deletion are recorded. | api/11 |
| P-3 | Tasks can be assigned, prioritised, due-dated and completed; staff can only complete or edit tasks allowed by their role. | api/11, manual permissions review |
| P-4 | Contact records combine deals, registrations, campaign activity, notes and tasks in a searchable timeline. | api/11 |
| P-5 | Reports reconcile deal pipeline, won/lost reasons, event registrations, payments and task completion against source records. | api/11, manual reconciliation |
| P-6 | Search and reports are restricted to signed-in staff and hide contact details from roles without contact access. | api/11, api/09 |

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
- Emails wait in the outbox until a Resend key is added.
- Layout tests run in Chromium with phone sizes and phone user agents; a final check on a real iPhone (Safari) is still worth doing.
