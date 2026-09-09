# Water Potential Calculator

**Water Potential · Participation · Reporting**

Water Potential Calculator is a browser-local analysis and reporting tool for field engineers, practitioners and programme/M&E teams. It turns an input workbook into readable water-potential results, structure intelligence, geography summaries, participation results and decision-ready reports.

**Released version: 1.1.0**  
Live application: https://knightfox789.github.io/water-potential-calculator/

The public product intentionally uses practitioner language. Internal controlled schema, route, formula, validation and audit identifiers remain protected and are kept out of normal screens and reports.

## User workflow

1. Open the launch page and upload an input workbook, or download the current input template.
2. Review workbook structure and field matches.
3. Prepare the data and check data-quality findings.
4. Calculate valid records and scopes.
5. Explore Results, Structures and Review & Evidence.
6. Download management, technical/M&E, CSV or XLSX outputs from Reports.
7. Use Methodology for practical interpretation help. Specialist audit files remain separate.

Processing occurs locally in the browser. Source workbook data is not sent to an application backend. Replacing or correcting source data invalidates dependent results before recalculation.

## v1.1 productization

Version 1.1 prioritizes field readability and analytical storytelling:

- launch page with a simple Upload → Check → Calculate → Explore → Report journey;
- short practitioner-facing labels instead of software-development language;
- restrained consulting-style visual grammar with purposeful colour and answer-first analytical headings;
- executive KPI summaries, geography contribution, status/coverage and structure-type views;
- structure pages that explain Structure → Method → Period → Result → Status;
- a three-part daily water-balance story: rainfall/storage, daily movement and cumulative infiltration;
- management and Technical/M&E PDFs with cover pages and readable numbers;
- normal CSV/XLSX/PDF outputs without raw run IDs, route/formula codes, hash dumps or personal branding;
- specialist audit JSON/ZIP retained separately for software/audit verification.

The web launch page includes a small developer profile block. **Personal branding is prohibited in PDF, CSV, XLSX, JSON and ZIP reporting outputs.**

## Calculation and governance boundary

The protected E01–E09 methodology remains unchanged. The application preserves the controlled rules for input interpretation, canonicalization, validation, routing, calculation, assurance, aggregation and audit. Presentation changes do not create new KPI formulas or recalculate dashboard values independently.

Missing, HOLD, excluded and not-calculated values remain distinct from numeric zero. Display-unit conversion is presentation-only. Water volumes and person-days remain separate result families.

## Release qualification

v1.1.0 passed:

- 154/154 Design-6 logical acceptance;
- 15/15 physical workbook fixtures;
- 90 product-flow checks;
- 319 report-contract checks;
- 39 export-reconciliation scopes;
- 24/24 live field-user browser checks with zero page/console errors;
- fixed-budget synthetic browser qualification for 1,000 structures + 1,000 person-day records, 365/366 days, five districts and at least 50 villages;
- GitHub Pages deployment and live smoke verification;
- protected methodology hash verification with `methodologyChanged=false`.

The synthetic capacity qualification is not a claim of maximum actual production volume. Formal HUF confirmation remains separate governance and is not claimed by the software release.

See `RELEASE_CERTIFICATE.json` and `FINAL_VALIDATION_STATUS.json` for the machine-readable release state.

## Recovery and future changes

The active release repository is `knightfox789/water-potential-calculator`. Preserve the protected-core hashes and release evidence before future changes. User-facing presentation improvements must continue to calculate once from the protected pipeline rather than introducing independent dashboard/report formulas.
