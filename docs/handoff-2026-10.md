# Gotham Consult — October 2026 handoff

## 2026-10-08 · Codex

### CRM investor outreach and localized email drafts

- Added an investor-letter draft area to each CRM contact. It uses business context and operator-entered relevance/source notes; it does not send. The draft can be edited and saved as a contact note.
- Added AI wording review and translation for campaign email copy in French (France), Spanish (Spain), German, Modern Standard Arabic and Simplified Chinese. Staff must apply the reviewed English before translation, can edit every translation, and must save the campaign. Campaign previews support a selected locale. Delivery selects the contact's saved language and falls back to English for other languages. Plain email campaigns are required for whole-message localization.
- AI copy review/translation receives campaign text only. The investor-letter prompt omits the prospect's name, email and phone. Human review remains required for claims, sources and outreach permissions.
- Set the CRM default sender and SMTP user to `uffe.carlson@gothamconsult.com`; explicit `MAIL_FROM` and `SMTP_USER` environment values still take precedence.
- Replaced the previous personal Gmail address in tracked site/CRM source text, CRM report data and AI knowledge. The PDFs under `apps/crm/report-files/` are historical generated snapshots and still need regeneration before claiming the new address is present inside each downloadable edition.
- The user supplied a cPanel Webmail session URL. It is not an SMTP credential. No SMTP password or provider key is configured in the local environment, and no email was sent. To enable delivery, verify the mailbox's SMTP host/port and securely set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `MAIL_FROM` on the server. Never store the webmail session URL or password in Git or this handoff.

### Verification

- `tests/run_api.sh`: 37 suites passed, 0 failed, disposable local database only.
- `tests/e2e/run.sh`: 17,509 checks passed across the 176-page crawl and six device profiles. Chat voice, investment portal, presentation, six-language SEO/navigation, six-language report download and phone touch-target UI suites passed.
- `node --check apps/crm/server.js`, `git diff --check`, and `bash scripts/build-site.sh` passed.

### Release state and next actions

- This handoff records implementation and local verification; it does not claim a commit, push or deployment. Check `origin/main`, then commit/push and deploy only with the guarded scripts after the working tree is clean and exactly on `origin/main`.
- Regenerate the six PDF editions with `scripts/report-pdf/make.py` after installing/locating its documented dependencies (Playwright Python, Poppler, qpdf and Ghostscript), then verify their author contact text.
- Configure and test SMTP on the server using cPanel's verified mail-client settings and a hidden password prompt. First send only a single test message to an authorized internal mailbox; do not start investor outreach until a campaign has been reviewed and approved.
