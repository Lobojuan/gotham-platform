# Handoff — 16 October 2026: unified CRM member brief

## Decision and implementation

- Gotham CRM uses its existing PostgreSQL database as the single system of record. Members, contacts, event registrations, events, reviewed investment-report updates, consent/preferences, email outbox, and per-day brief claims remain linked records in that database; this release adds no separate mailing-list database.
- Free-account members receive the daily Ghana business brief only after verifying their account, enabling daily alerts, and explicitly opting in to email updates. The email contains human-reviewed report changes from the last 24 hours, applicable account deadlines, and up to three published events in the next 60 days with direct registration links. It still sends a brief on quiet news days, clearly says when there are no new reviewed report updates, and provides a one-click stop link.
- The daily claim is keyed by member and Accra calendar date, so scheduler retries do not queue duplicates. Delivery goes through the existing CRM outbox and mail transport configuration. This code does not send email during tests and does not configure a mail provider.
- Added the feature and data-storage requirements to `docs/srs.md`; updated signup/account/member-plan wording and six-language email labels.

## Evidence

- `TEST_DATABASE_URL=postgres://test@127.0.0.1:55439/gotham_daily_brief_20261016_test bash tests/run_api.sh` — 40 suites passed, 0 failed (disposable `_test` database).
- `E2E_PORT=4209` browser run with the disposable test database and mock AI — passed: 18,073 page/device checks across 182 pages and six screen sizes; event-help, six-language Ask Gotham, investor data, presentation, locale/SEO, report download, phone touch targets, and user-role/mobile flows passed.
- `git diff --check`, Node syntax checks, Python compile, locale JSON validation, and `SITE_URL=https://gothamconsult.com bash scripts/build-site.sh` passed.
- Test output also verified that signup alone does not opt a member into promotional email, daily sends are deduplicated, upcoming events link to registration, and a member who stops emails receives no subsequent brief.

## Release status

- Tests and local build passed. This handoff records the tested state; it does not mean the changes are live. Reconcile with current `origin/main`, push the release, and deploy only from a clean checkout exactly matching `origin/main` using the guarded deployment scripts. Confirm CRM and site `DEPLOYED_COMMIT` markers afterward.
- Before release, verify the current mail transport is configured. If it is absent or failing, the CRM can store messages in its outbox but cannot deliver the daily brief.
