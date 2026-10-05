# Ghana investor research — verified 5 October 2026

## Sources and definitions

- **Actual GDP / CPI:** [Ghana Statistical Service](https://www.statsghana.gov.gh/). Latest published quarterly real GDP growth: 6.0%, Q2 2026. August consumer inflation: 5.0%. These are different reporting periods.
- **Trade / reserves / rates:** [BoG September economic summary](https://www.bog.gov.gh/wp-content/uploads/2026/09/Summary-of-Economic-and-Financial-Data-September-2026.pdf), published 23 September. Trade figures are cumulative; reserves are stocks. Monthly data through August; 2025 trade figures were revised. Annual exports USD31.248bn and trade surplus USD13.7959bn. Gold20.9753, cocoa4.0008, oil2.6203 and other3.6515bn reconcile within rounding. End-August reserves USD11.0715bn; the separate footnote reports USD12.04867bn on22 September. Never mix the two dates.
- **Policy decision:** [BoG September MPC release](https://www.bog.gov.gh/wp-content/uploads/2026/09/MPC-Press-Release-September-2026.pdf), 24 September: policy rate held14.0%. The monthly rate on the dashboard is explicitly August, not a live decision feed.
- **Currencies:** [ExchangeRate-API public USD feed](https://open.er-api.com/v6/latest/USD). Market mid-rates, not BoG reference or retail transaction rates. Server caches hourly; provider publishes daily. Show provider publication time, currency direction, inverse rate and fees/spread caveat. USD, EUR, GBP, AED, CHF, CAD, CNY and XOF are visible in the portal; the chatbot can quote USD/EUR/GBP/AED/CHF/CAD/CNY directly.
- **Market:** [GSE](https://gse.com.gh/) latest verified daily index: 2 October2026, GSE-CI14071.44 and60.45% YTD in cedis. Exchange holidays/weekends and publication lags matter.

## Five-year company examples

Period:31 December2020 to31 December2025. Prices in nominal GHS. Calculation: `(last / first - 1) × 100`. Annualisation uses exactly five years. **Price appreciation only**: dividends, tax, brokerage fees, inflation and foreign exchange excluded. No portfolio ranking, total-return claim or buy recommendation.

| Company | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | Five-year price change |
|---|---:|---:|---:|---:|---:|---:|---:|
| BOPP |2.00|6.65|7.65|22.00|25.26|55.82|2691.00%|
| MTN Ghana |0.64|1.11|1.11|1.44|2.50|4.20|556.25%|
| GCB Bank |4.00|5.24|3.94|3.40|6.37|20.11|402.75%|
| Ecobank Ghana |7.20|7.60|6.64|5.50|6.50|25.00|247.22%|

2020–24 prices: [GSE2024 factbook](https://gse.com.gh/wp-content/uploads/2025/12/GSE-2024-FACTBOOK.pdf), PDFpages50,131,92,77 respectively (printed44,125,86,71). 2025: [December2025 market report](https://gse.com.gh/wp-content/uploads/2026/01/GSE-Equities-Market-Report-December-2025.pdf), PDFpage16 / printed14. BOPP traded only49,032 shares in2025 (same report), limiting practical exits. GCB and Ecobank reported2022 losses; several intermediate years had falling share prices. Selected survivors and a strong final year are not representative of all listed companies.

[MTN FY2025 annual report](https://mtn.com.gh/wp-content/uploads/2026/03/MTN-FY-AR-2025.pdf), pages12/55: GHS0.48 total dividend for2025, including GHS0.40 final dividend paid in2026. The price-only comparison does not add this dividend, or imply a2025 holder received it before year-end.

No twenty-year company return is published: corporate actions, dividend cash flows and currency redenomination must first be reconciled. No historical USD/EUR return is invented from today's exchange rate.

## Macro outlook and global links

[World Bank tenth Ghana Economic Update,26 August2026](https://www.worldbank.org/en/news/press-release/2026/08/26/ghana-must-turn-strong-recovery-into-quality-jobs-and-lasting-growth) forecasts4.8% national growth in2026 and around5% medium-term, conditional on reforms. Transport costs, maintenance and connections constrain competitiveness; global commodity, energy and financing shocks affect Ghana. This annual forecast is not Q2 actual growth or a sector ROI.

[IMF2026 Article IV assessment,4 August2026](https://www.imf.org/en/publications/cr/issues/2026/08/04/ghana-2026-article-iv-consultation-sixth-review-under-the-arrangement-under-the-extended-578480) supports the stabilization assessment while identifying non-performing loans, state-owned enterprise risks, debt and spending trade-offs. IMF program reserves and BoG gross reserves use different definitions. Do not force them into one series or substitute a revised observation into an older forecast.

[GIPA2024 sector roadmap](https://www.gipc.gov.gh/wp-content/uploads/2024/07/Investment-Roadmap-Document.pdf) supports the sector opportunity categories, not current market sizes, capital rules or projected returns. Check current regulations independently. [Licensed GSE brokers](https://gse.com.gh/licensed-dealing-members/) provide the appropriate route for securities transactions.

2031/2036 sector scenarios in `apps/site/investor_content.py` are **Gotham interpretations**: digital services, agro-processing, industrial solar, logistics/manufacturing, mining services and listed businesses. Each states commercial prerequisites and risks. No guaranteed project returns, fake investment offers or unaudited private-company success stories.

## Update and backup behaviour

`apps/crm/ghana-data.js` checks official GSS, BoG and GSE publications at most hourly, with background scheduled refresh in production. The public `/api/ghana-data` returns dated values and source links. GSS SSR JSON and GSE current-index tables are parsed without executing source scripts; BoG PDF parsing removes watermark glyphs and verifies export components. Source changes, invalid values, older publications and outages retain the last verified snapshot. Original source SHA256 hashes and check times are retained.

The persisted `settings.ghana_data_cache` is included in existing database backups; `apps/crm/ghana-snapshot.json` is a committed offline fallback. Fixture excerpts and source hashes live in `tests/fixtures/ghana/`. Raw third-party reports are linked, not bundled as large Git files.

Historical company case studies and World Bank/IMF narrative forecasts remain **dated editorial research**, requiring review when a new annual report or economic update is published. They are not labelled automatically current. A twenty-year adjusted total-return study, live individual stock quotes, automated forecast ingestion and a verified investable-deal catalogue are future work, not shipped claims.

The eight cited research sources are verified daily by `research-checks.js`, using the shared `research-sources.json` registry. HTML text is normalized without scripts/styles; PDFs retain their full fingerprints. Changed documents are flagged for review and inaccessible sources retain their previous verification date. The investor portal displays daily check status in all three languages; chat receives the same flags. A daily check verifies the cited publication, not the absence of every newer publication worldwide. Source changes require editorial reconciliation before replacing historical claims. The IMF’s official [report PDF](https://www.imf.org/-/media/files/publications/cr/2026/english/1ghaea2026001.pdf) is used for the automated check; its landing page can block automated requests.

Chat knowledge is generated from public website content at site build time and retrieved by topic; the same dated economic cache and currency feed are added server-side. No private CRM records are included. Direct currency questions bypass model arithmetic and can answer even if the model provider is unavailable. Speech uses visitor-bound answer tickets and local Kokoro Fable.

The broad site introductions are built once in English, French and Spanish. Dynamic answers prepare as background speech jobs and are collected through visitor-bound, one-use results, avoiding the WordPress request timeout. Text is immediate; speech preparation can take longer on the shared one-CPU host. The official int8 model was benchmarked but did not improve throughput there, so the release retains Jarvis’s original model and voice files.

## Visual design and response speed

The interactive SVG chart uses line/area, price-scale, legend and point-readout conventions reviewed against TradingView’s public chart examples (https://www.tradingview.com/lightweight-charts/) and the Financial Times markets layout (https://www.ft.com/markets). It is implemented locally without a third-party chart dependency. Year buttons support touch and keyboard use; reduced motion disables reveal animation. Company returns remain nominal price-only case studies.

New Fable answers prepare ordered speech chunks, so the first phrase can play before full synthesis finishes. Replaced, muted and closed answers cancel their visitor-bound jobs. Welcome and payment instructions use fixed recordings built once. General knowledge is allowed; live financial values require a supplied dated source. Time questions use the server clock.
