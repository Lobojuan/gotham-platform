# Gotham Consult — October 2026 handoff

## 2026-10-08 · Codex

### CRM investor outreach and localized email drafts

- Added an investor-letter draft area to each CRM contact. It uses business context and operator-entered relevance/source notes; it does not send. The draft can be edited and saved as a contact note.
- Added AI wording review and translation for campaign email copy in French (France), Spanish (Spain), German, Modern Standard Arabic and Simplified Chinese. Staff must apply the reviewed English before translation, can edit every translation, and must save the campaign. Campaign previews support a selected locale. Delivery selects the contact's saved language and falls back to English for other languages. Plain email campaigns are required for whole-message localization.
- AI copy review/translation receives campaign text only. The investor-letter prompt omits the prospect's name, email and phone. Human review remains required for claims, sources and outreach permissions.
- Set the CRM default sender and SMTP user to `uffe.carlson@gothamconsult.com`; explicit `MAIL_FROM` and `SMTP_USER` environment values still take precedence.
- Replaced the previous personal Gmail address in tracked site/CRM source text, CRM report data and AI knowledge. Regenerated all six October PDF editions under `apps/crm/report-files/` from the live report using the repo's PDF renderer. Searchable text contains the Gotham address and no longer contains the old Gmail address; all covers were rendered and visually reviewed.
- The user supplied a cPanel Webmail session URL. It is not an SMTP credential. No SMTP password or provider key is configured in the local environment, and no email was sent. To enable delivery, verify the mailbox's SMTP host/port and securely set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `MAIL_FROM` on the server. Never store the webmail session URL or password in Git or this handoff.

### Verification

- `tests/run_api.sh`: 37 suites passed, 0 failed, disposable local database only.
- `tests/e2e/run.sh`: 17,509 checks passed across the 176-page crawl and six device profiles. Chat voice, investment portal, presentation, six-language SEO/navigation, six-language report download and phone touch-target UI suites passed.
- `node --check apps/crm/server.js`, `git diff --check`, and `bash scripts/build-site.sh` passed.

### Release state and next actions

- This handoff records implementation and local verification; it does not claim a commit, push or deployment. Check `origin/main`, then commit/push and deploy only with the guarded scripts after the working tree is clean and exactly on `origin/main`.
- The local PDF toolchain is now installed through Homebrew. Future updates can use `scripts/report-pdf/make.py` directly with Python Playwright, Poppler, qpdf and Ghostscript available.
- Configure and test SMTP on the server using cPanel's verified mail-client settings and a hidden password prompt. First send only a single test message to an authorized internal mailbox; do not start investor outreach until a campaign has been reviewed and approved.

### 2026-10-08 — PDF contact refresh

- Rebuilt the English, French, Spanish, German, Arabic and Chinese downloadable report editions. All 54 heading markers were found in each edition and adjusted until no heading remained in the configured bottom-page danger zone. Result sizes: 915 KB, 960 KB, 951 KB, 969 KB, 1,096 KB and 2,893 KB respectively.
- `pdftotext` verified the new Gotham address in all six and confirmed the previous Gmail address is absent. Covers were rendered to PNG and inspected as a six-language contact sheet. Artifacts were written to the stable `apps/crm/report-files/ghana-investment-report-2026-10*.pdf` paths.
- SMTP remains unconfigured on the server; no mail was sent. The cPanel Webmail session URL is not a server-side SMTP credential. Next: set verified SMTP host/port/user and enter mailbox password only through a hidden server prompt, then send one internal test.
