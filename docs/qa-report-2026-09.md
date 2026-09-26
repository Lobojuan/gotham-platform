# QA sweep, 26 September 2026

The full site and back office were tested on iPhone SE (375), iPhone 15 (393), Galaxy A (360), Pixel 7 (412), iPad (820)
and desktop (1440): every public page and every back office tab, with drawers and the event editor open. Checks
covered sideways scrolling, clipped text, text under 12 px, iPhone input zoom, tap target size, broken images,
console errors and failed requests. The flows were then tested end to end, both through the API and in a phone browser.

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
