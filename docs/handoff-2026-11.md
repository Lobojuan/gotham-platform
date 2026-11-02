# Gotham Consult — November 2026 handoff

### 2026-11-02 — Centralized membership prices and benefits

- The CRM Members screen is the editing point for Pro and Compliance plan prices and public benefit descriptions. Benefit copy is editable in English, French, Spanish, German, Arabic and Chinese; it does not change plan entitlements or service delivery.
- The public membership page reads prices and benefit copy from the CRM catalog. Its built-in translations remain as a fallback if the CRM is unavailable. Price changes apply to future invoices; issued invoices and historical registrations remain unchanged.
- Legacy M1, M2 and M3 membership offers are unpublished and excluded from public listings. New registrations using those codes are rejected, and the back office prevents editing or deleting those historical records.

### Verification

- `node --check apps/crm/server.js`, `node --check apps/crm/members.js`, Python compilation for the changed site and test files, and `git diff --check` passed.
- `tests/api/36_members.py` passed, including catalog authorization, six-language copy validation, partial price updates, new invoice pricing and retired registration codes.
- The public site build completed for all six languages. It warned that `ffmpeg` is unavailable, so video/logo processing was skipped in this local build.
- The full API run passed 33 of 40 suites. Seven non-membership test/environment failures remain: five suites attempt to register or act on the expired F1 forum, one expects a hard-coded 2026-10-25 task date, and the media suite requires `ffmpeg`. These are outside this membership change and were not altered.
- A browser smoke test signed in to the CRM, opened Members, edited a price and English benefit copy, and received successful save confirmations. It used only the disposable local test database.

### 2026-11-02 — Design and digital review service

- Added a standalone one-off design-review offer for members and non-members: a tightly limited free preview of one authorized public link, followed by a starting GHS 400 full review. The full review includes a prioritized written report, annotated examples and a 60-minute Q&A; larger scopes receive a separate quote.
- The starting fee is in the centrally editable CRM price list and updates public membership and services pages. Members can order it directly through their account; for preview requests from anyone, the CRM creates a consulting deal at the current starting price and a task for staff to prepare the preview and issue a scope/quote. Standard invoices provide the existing payment options.
- The preview form collects name, email, optional company, one public link, material type and a response-only consent. The CRM validates the URL and authorization declaration; it does not fetch or scan the supplied link. No passwords, confidential material or security testing.
- The services page, preview form and asynchronous status messages are translated in all six site languages. Focused API suites `30_facts.py`, `36_members.py` and `39_website_enquiry_emails.py` passed; the site build completed without a design-review fact or membership-copy warning. The build still reports the known missing-`ffmpeg` warning and existing untranslated phrases elsewhere on the site.

### Follow-up

- Refresh the date-dependent forum fixtures and install `ffmpeg` in the test environment before treating the full API suite as a clean release gate.
