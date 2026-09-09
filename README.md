# Water Potential Calculator

**Water Potential · Participation · Reporting**

Water Potential Calculator is a browser-local analysis and reporting tool for field engineers, practitioners and programme/M&E teams. It turns a controlled input workbook into readable water-potential results, structure intelligence, geography summaries, participation results and decision-ready reports.

**Release target: 1.1.0.** The public product intentionally uses practitioner language. Internal controlled schema, route, formula, validation and audit identifiers remain protected and are kept out of normal screens and reports.

## User workflow

1. Open the launch page and upload an input workbook, or download the current input template.
2. Review workbook structure and field matches.
3. Prepare the data and check data-quality findings.
4. Calculate valid records and scopes.
5. Explore Results, Structures and Review & Evidence.
6. Download management, technical/M&E, CSV or XLSX outputs from Reports.
7. Use Methodology for practical interpretation help. Specialist audit files remain separate.

Processing occurs locally in the browser. Source workbook data is not sent to an application backend. Replacing or correcting source data invalidates dependent results before recalculation.

## Product design in v1.1

The v1.1 productization release prioritizes field readability and analytical storytelling:

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

The protected E01–E09 methodology remains unchanged. The application still preserves the controlled rules for input interpretation, canonicalization, validation, routing, calculation, assurance, aggregation and audit. Presentation changes do not create new KPI formulas or recalculate dashboard values independently.

Missing, HOLD, excluded and not-calculated values remain distinct from numeric zero. Display-unit conversion is presentation-only. Water volumes and person-days remain separate result families.

## Verification

```sh
npm install --no-save --package-lock=false jszip@3.10.1 @xmldom/xmldom@0.9.12 playwright@1.55.0
npm test
npm run test:product
node tests/protected/run.mjs
node tests/protected/remaining80.mjs
node tests/protected/design6-summary.mjs
npm run build:pages
npx playwright install --with-deps chromium
npm run accept:browser
```

Final release requires protected regression, 154/154 Design-6 logical acceptance, 15/15 physical fixtures, browser acceptance, the existing fixed-budget 1,000-structure/1,000-person-day synthetic capacity envelope, deployed-file equality and live Pages acceptance.

## Recovery

The sole authorized release repository is `knightfox789/HUF-KPI-acceptance-test`. See `docs/release/RECOVERY_AND_CHANGE_GUIDE.md`, `docs/release/USER_GUIDE.md`, the release certificate/checksums and `docs/continuity/master-plan.md` before changing a released build.
