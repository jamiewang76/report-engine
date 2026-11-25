# Report Engine

Customer-facing custom reports on MeasureSquare CRM data. See README.md for architecture and setup.

## Hard rules

- **Never use the CRM OData endpoints (`/crmOdata/*`).** They have no tenant isolation yet and could leak data across customers. Use the standard API only, with the customer's own token.
- CRM tokens and the Supabase service key never reach the browser.
- Every query filters by the session's `org_id`: use `forOrg(orgId)` from `src/lib/db.ts`, never raw `db()` in report code.
- Be gentle on crm11api: sync incrementally, keep concurrency low, cache in Supabase.
- Never commit `.env*` or `probe-output.json`. Never ask for secrets in chat.
- Supabase migrations are applied by hand in the SQL editor. Show the SQL before applying, and deploy code that depends on a migration only after it has been applied.

## Reports

- **All reports must follow [docs/report-standard.md](docs/report-standard.md).** It sets the default structure for every report: sections, definition fields, column types, filters, grouping/totals, the Excel layout, freshness, logging and tests.
- **A report's own spec overrides the standard**: either its `definition.ts` `overrides` or the instructions given for that report. Every override must be recorded in `overrides` with a one-line reason (`{ section: "§1 Summary", reason: "…" }`). Anything not overridden follows the standard.
- **Reports read only from the Supabase cache via `forOrg()`.** No CRM API calls at render time. If the data isn't cached, extend the sync (`src/lib/sync.ts`) instead.
- **Never use the CRM OData endpoints**, in reports or anywhere else.
- `build.ts` is a pure function: no network, no database, no clock (`asOf` is passed in). The same `ReportResult` feeds the web page, the JSON API and the Excel export.
- Money math goes through the cents helpers in `src/lib/reports/format.ts` (`addMoney`, `subMoney`, `sumMoney`, `roundMoney`). Percent totals are weighted averages (`weightedBy`), never sums or simple averages.
- Access is checked server-side on every report page, API and export route (`checkReportAccess`). Every view/export is logged to `report_events` with the report version, filters and row count.

### Shared framework (don't re-implement per report)

| Piece | File |
|---|---|
| Types (`ReportDefinition`, `ColumnDef`, `FilterDef`, `ReportResult`) | `src/lib/reports/types.ts` |
| Registry | `src/lib/reports/registry.ts` |
| Formatting + money helpers | `src/lib/reports/format.ts` |
| Grouping, subtotals, grand total, matrix | `src/lib/reports/grouping.ts` |
| Filters (date presets, as-of, multi-selects; URL query string) | `src/lib/reports/filters.ts` |
| Excel export (§6 layout) | `src/lib/reports/excel.ts` |
| Load → build → header | `src/lib/reports/runner.ts` |
| CRM deep links | `src/lib/reports/crmLinks.ts` |
| Web page (any report) | `src/app/reports/[report]/page.tsx` + `src/app/reports/components/` |

Reference implementation: `src/lib/reports/ar-aging/`.

### How to add a new report

1. **Create the folder** (standard §2): `src/lib/reports/<report-id>/` with `definition.ts`, `build.ts`, `build.test.ts`, `data.ts`, `fixtures/` (small anonymized sample data), and an `index.ts` exporting the `ReportModule`.
2. **`definition.ts`**: fill every field (`id`, `name`, `description`, `status: "draft"`, `version`, `requestedBy`, `dataSources`, `columns`, `filters`, `views`, `kpis`, `groupings` (max 2 levels, one default), `configSchema`, `notes`, `limitations`, `overrides` (each with a reason), `rowNoun`). Use CRM terms customers know (Job, Invoice, PO…), not internal ones (deal, org_id).
3. **`data.ts`**: read the needed cache tables with `forOrg(orgId).selectAll(...)`. If a field isn't cached yet, add it to the sync and a migration first.
4. **`build.ts`**: a pure `(data, filters, config, asOf, grouping) -> ReportBody` using the shared grouping/totals/money helpers.
5. **Register it** in `src/lib/reports/registry.ts` (replacing any draft stub for that id).
6. **Tests** (standard §9): known totals (hand-calculated), empty data, zero/negative amounts, missing dates, a bucket/date boundary, another org's rows never included, grand total = Σ subtotals = Σ detail rows, and an Excel test (header rows, sheet order, typed values, SUBTOTAL totals).
7. **Run** `npm run typecheck`, `npm test`, `npm run build`; all must pass.
8. **Review before `live`**: work through the review checklist in standard §9 (reconcile against the CRM, every calculated column defined in Notes, limitations bannered, useful defaults, Excel opens cleanly, the requesting customer has seen a sample, assigned only to the orgs that need it). Then set `status: "live"` and assign it in Admin.
