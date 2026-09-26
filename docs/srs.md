# Gotham Consult platform: requirements and test map

Software requirements for the website, registration and back office at one address
(`/` website, `/register`, `/family`, `/admin`, `/api/*`). Each requirement names the test that proves it.
Tests live in `tests/` (API: `tests/api/*.py`, run with `bash tests/run_api.sh`; phone UI: `tests/ui/*.js`).

Status as of 26 September 2026: all 10 API suites pass (170 checks); the phone UI tests pass on iPhone SE,
iPhone 15, Galaxy A and Pixel 7 sizes.

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
| W-1 | One address serves website, registration, Family Desk and back office; Login opens in the same tab. | api/06 |
| W-2 | No page scrolls sideways on 360–1440 px wide screens. | ui/layout_sweep |
| W-3 | Text inputs are 16 px on phones and touch screens, so iPhones do not zoom in when typing. | ui/layout_sweep |
| W-4 | No text below 12 px. | ui/layout_sweep |
| W-5 | The back office works on a phone: Menu button, tables shown as cards, drawers full width. | ui/layout_sweep, ui/admin_accounts_phone |
| W-6 | Video is served with byte ranges (iPhones need them to play it). | manual curl, see QA report |
| W-7 | Event dates and times show in Accra time for visitors abroad. | manual |
| W-8 | The home page "Next forum" band follows the next event in the back office. | manual |
| W-9 | Share links (WhatsApp, LinkedIn, copy) contain the full address. | manual |

## Known limits

- The old copy at `gotham-consult-gh.netlify.app` cannot be updated (Netlify credits exhausted). It still posts to the
  live system and is accepted (R-6), but its own form asks for company and email and has the old consent box.
  Stop sharing it; a one-off Netlify top-up would allow a redirect.
- Emails wait in the outbox until a Resend key is added.
- Layout tests run in Chromium with phone sizes and phone user agents; a final check on a real iPhone (Safari) is still worth doing.
