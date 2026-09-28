# QA sweep, 28 September 2026

## Current checkout verification, 28 September 2026

This checkout is based on `5f7c097` (`main`, matching the locally recorded `origin/main` at inspection time), with uncommitted changes listed in the current working tree.
The remote could not be contacted from this environment, so this does not prove GitHub has no newer commit.

- Passed on 28 September: all 12 API suites, totaling 209 checks, using a disposable local PostgreSQL database;
  `node --check apps/crm/server.js`; Python compilation of API test files; shell syntax checks for the backup and dev scripts; and `python3 apps/site/build.py`.
  The site build completes without the previous invalid-escape warning.
- Fixed during this review: API suites 02, 03, 04 and 05 no longer depend on a former machine's absolute
  checkout path. Suite 04 now creates its own deterministic workbook instead of requiring a private upload.
- Hardened during this review: `tests/run_api.sh` refuses database names that do not end in `_test` and
  no longer broadly kills every process named `node server.js`.
- Login now opens the back office in a same-origin full-screen dialog over the current public page. The
  back-office response allows same-origin framing only; the cross-origin framing block is retained.
- Payment settings now seed missing MoMo numbers to Joy's WhatsApp line (`+233 55 041 6627`),
  validate changes, and show the same destination and registration reference in the customer flow. Payment
  transaction reports are validated, deduplicated, audited, and remain unverified until staff reconcile them.
- The home page now leads with the chosen shared audience and action: building partnerships in Ghana. A
  same-page English/French/Spanish selector remembers the visitor's choice. The translation dictionary covers
  the published static landing copy; interactive calculator results and CRM-supplied event content still need
  a browser review before the language requirement can be considered complete.
- `tests/api/12_momo_payment_flow.py` passes the MoMo path, duplicate claims, manual verification and concurrent
  capacity reservation checks.
- `scripts/backup-crm.sh` was exercised against a disposable database and media directory. Its archive checksums
  verified, and both the database row and media file were restored successfully.
- Not reverified: browser E2E, responsive visuals, live domain and WordPress bridge. Browser access to the
  local site and outbound DNS/network were unavailable in this environment. The 26 September browser results
  below are historical, not evidence about the current checkout or live host.

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
   reproducible regression. The 12 API suites passed locally.
2. Do a focused journey review: visitor enquiry and registration, staff triage, task completion, payment
   reconciliation, opt-out, account disable/reset, and event cancellation/refund handling.
3. Configure scheduled encrypted off-site backups, monitoring/alert route, safe rollback, retention
   and export procedure, and audit-log coverage. The backup script itself passed a local restore rehearsal.
4. Confirm MoMo merchant instructions and live domain routing, remove misleading demo copy/unused confirmation
   code, and validate the WordPress bridge end to end.
5. Run accessibility and content review, then focus the home page around the selected primary audience and
   add reviewed French and Spanish translations with a language toggle.

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
