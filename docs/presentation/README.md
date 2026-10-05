# Gotham services presentation

Five slides, designed for a short introduction on a 16:9 projector:

1. Gotham Consult and partnerships in Ghana.
2. Business and investment services.
3. AI, digital and creative services.
4. Projects, people and partnerships.
5. Two large QR codes: website and LinkedIn.

## Present it

Open `https://gothamconsult.com/downloads/gotham-services.html`. Choose English, French or Spanish before starting. It uses the website's saved `gc-language` preference when available. `?lang=en`, `?lang=fr` and `?lang=es` select a language explicitly. The slides, controls and download links all follow that choice. You can also change language during the presentation.

Use the Previous/Next buttons or arrow keys. Home/End go to the first/final slide. Full screen hides the controls until hovered or focused. Leave the final slide visible while the audience scans. A LinkedIn scan opens the company page; visitors still need to press Follow themselves.

Download the selected PDF before an event for offline projection. PowerPoint files contain editable text and presenter notes. The browser presentation uses reviewed slide renders, with slide text also available in image alt descriptions.

## Sources and scope

The copy summarizes the existing published services at https://gothamconsult.com/services, https://gothamconsult.com/services/ai and https://gothamconsult.com/about. The LinkedIn destination is the company page linked in the website footer: https://www.linkedin.com/company/gotham-consult/.

No new prices, clients, project returns, certified integrations or delivery guarantees are asserted. Existing site pictures and the actual Gotham logo are reused. The PowerPoint notes describe scope and source URLs. English, French and Spanish copy is in `copy.json`.

## Rebuild

`build.mjs` uses the bundled `@oai/artifact-tool` runtime and the existing CRM `qrcode` dependency. Supply `GOTHAM_REPO`, `PRESENTATION_WORKSPACE`, `PRESENTATION_SKILL`, `RUNTIME_PYTHON`, and `RUNTIME_NODE_MODULES`. A fresh `PRESENTATION_OUTPUT_STEM` avoids overwriting a finalized artifact. It exports PowerPoint, runs the presentation package, geometry and import validators, and renders each slide to PNG for review.

After visual review, run `package.py` with the same workspace/output stem plus `RUNTIME_NODE`. It makes the PDF, lossless WebP slide images and browser player in `apps/site/public/downloads/`. Do not regenerate public artifacts without reviewing the renders. The artifact runtime is a build-time document tool and is not needed by the live website.

QA: all 15 rendered slides reviewed, final English cover wrapping corrected, both QR destinations decoded successfully from each language's final slide. `tests/ui/presentation_ui.js` covers all three languages, all five slides, downloads, stored language and full-screen/keyboard navigation across six screen sizes. It is part of `tests/e2e/run.sh`.
