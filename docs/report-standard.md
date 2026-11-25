# Report Standard

Every report in Report Engine follows this structure, so customers get the same experience on every report and each new report is mostly "fill in the template".

## 0. Precedence

This document sets the **defaults** for all reports. A report's own spec can override any section of it (e.g. Bid Timing has no Summary section). When it does:

- The override is written in the report's `definition.ts` (`overrides` field, with a one-line reason), so it's visible in code review.
- Anything the report spec doesn't override, this standard still applies.
- Typical pattern: financial reports use the full structure (with Summary); list/tracking reports (e.g. Bid Timing) may skip the Summary and the Detail view.

---

## 1. Anatomy of a report (what the customer sees)

Every report page and every Excel export has the same sections, in this order. A section can be left out only where noted.

| # | Section | Contents | Required |
|---|---|---|---|
| 1 | **Header** | Report name · company name · one-line description · "Data as of {last sync time}" + Refresh button | Yes |
| 2 | **Controls** | Filters (see §4) · grouping toggle (if offered) · Download Excel | Yes |
| 3 | **Summary (KPI cards)** | 3–5 headline numbers for the current filters (e.g. Total Open A/R, 90+ Days, Retainage Held) | Default yes for financial reports; a report may omit it |
| 4 | **Main view** | One of: grouped table (rows grouped with subtotals) or matrix (rows × columns, e.g. pipeline × month). Grand total row at the bottom. | Yes |
| 5 | **Detail view** | Record-level rows behind the main view (invoices, jobs, POs). Reached by expanding a group or a "Detail" tab. | If main view is aggregated |
| 6 | **Notes & definitions** | How each calculated column is defined, and any data limitations (e.g. "Cost to Date reflects current bills, not as of the selected date") | Yes |

**Empty state:** "No records match these filters." Show the filters that are active, with a "Clear filters" link.

**Partial-data banner:** if a report depends on data the API doesn't provide yet, show a yellow banner at the top naming what's missing and what's shown instead. Example: "Payments received will appear once payment data is available. COGS currently shows committed cost from POs and WOs." Never silently show a stand-in metric under a real metric's name.

---

## 2. Report definition (in code)

Each report lives in its own folder and registers one entry in `src/lib/reports/registry.ts`.

```
src/lib/reports/<report-id>/
  definition.ts      // metadata, columns, filters, configSchema, notes
  build.ts           // pure function: (data, filters, config, asOf) -> ReportResult
  build.test.ts      // fixture tests, incl. edge cases
  data.ts            // reads from the Supabase cache (forOrg) — no API calls at render time
  fixtures/          // small anonymized sample data for tests
```

**`definition.ts` fields:**

| Field | Description |
|---|---|
| `id` | kebab-case, stable forever (e.g. `ar-aging`). Used in URLs, assignments, logs. |
| `name` | Customer-facing title, Title Case, no company names (e.g. "A/R Aging"). |
| `description` | One sentence, shown in the header and report list. |
| `status` | `draft` / `live` / `retired`. |
| `version` | Bumped when calculations change; written to the Excel "About" sheet and the event log. |
| `requestedBy` | Org(s) that asked for it (internal only, never shown to customers). |
| `dataSources` | Cache tables / API endpoints used (for docs and the sync planner). |
| `columns` | Column definitions (see §3). |
| `filters` | Filter definitions (see §4). |
| `views` | `main` (grouped table or matrix spec) + optional `detail`. |
| `kpis` | Summary cards: label, column/aggregate, format. |
| `configSchema` | Per-org settings (validated), e.g. stage lists, custom field names. |
| `notes` | Definitions and limitations shown in section 6. |
| `limitations` | Machine-readable flags that drive the partial-data banner. |
| `groupings` | The predefined grouping options for this report (see §5), with the default marked. |
| `overrides` | Sections of this standard the report deliberately changes, each with a one-line reason (see §0). |

**`build.ts` rules:**

- A pure function: no network, no database, no current-time reads (`asOf` is passed in). This makes it testable and reproducible.
- Returns a `ReportResult`: `{ kpis, main, detail, totals, notes, limitations, rowCount, meta }`.
- All money math rounds to cents at each sum (no floating-point drift).
- The same result object feeds both the web view and the Excel export, so they always agree.

---

## 3. Columns

Each column has: `key`, `header`, `type`, `align`, optional `aggregate` (sum / avg / count / min / max / none), `description` (shown as a tooltip and in Notes), and `width` for Excel.

| Type | Display (web) | Excel | Rules |
|---|---|---|---|
| `money` | $12,345.67, negatives in red with a minus sign | Number, format `"$"#,##0.00;[Red]-"$"#,##0.00` | Right-aligned. Always a real number, never text. |
| `number` | 1,234 | Number `#,##0` (or decimals as defined) | Right-aligned. |
| `percent` | 23.5% | Number stored as fraction, format `0.0%` | Right-aligned. Average-type totals use weighted averages, not a sum. |
| `date` | Nov 25, 2026 | Real Excel date, format `mmm d, yyyy` | Dates shown in the org's local date; no times unless needed. |
| `days` | 45 | Number | Integer; negative allowed (e.g. days early). |
| `text` | As-is | Text | Left-aligned; long text truncated with tooltip on web. |
| `flag` | Colored pill (e.g. "Late", "High") | Text | Fixed value list defined in the column. |
| `link` | Opens the record in MeasureSquare CRM in a new tab | Text + hyperlink | Used for job #, invoice #, PO #. |

**Column order convention (left → right):**
1. Identifiers (Job #, Invoice #)
2. Names (Job, Customer/GC)
3. People (Owner, Estimator)
4. Dates
5. Status / flags
6. Money and numbers (inputs first, calculated results last)

**Naming:** use CRM terms customers already know (Job, Bid, Quote, Proposal, Change Order, Work Order, PO, Invoice, Bill, SOV, Retainage). Avoid internal terms (deal, DTO, org_id).

---

## 4. Filters

**Standard filters** (reuse the shared components; include only those that apply):

| Filter | Behavior |
|---|---|
| **Date range** | Presets: This month · Last month · This quarter · Last quarter · Year to date · Last year · Custom. Each report states *which date* it filters on (e.g. "Invoice date"). |
| **As-of date** | For point-in-time reports (aging, WIP). Default: today. |
| **Pipeline / Stage** | Multi-select, from the org's own pipelines. |
| **Customer / GC** | Searchable multi-select. |
| **Owner / Estimator / Salesperson** | Multi-select of users. |
| **Status** | Multi-select (open/closed, etc.). |
| **Labels / tags** | Multi-select. |

**Rules:**
- Defaults must produce a useful report with no clicks (e.g. A/R aging defaults to today, all customers).
- Active filters appear in the header of the web view and are written into the Excel file and the event log `params`.
- Filters are kept in the URL (shareable, bookmarkable).
- Per-org settings (configSchema) are not filters: they're set by a Super Admin and customers can't change them.

---

## 5. Grouping, sorting and totals

- **Grouping is predefined per report.** Customers can't build their own report templates yet (that comes later, once the CRM's flexible query API is safe for customers). Each report defines its grouping in `definition.ts`:
  - At most two levels (e.g. Customer → Invoice).
  - A report may offer a few predefined grouping options for customers to switch between (e.g. A/R Aging: by Customer/GC, or by Job), with one marked as the default. Customers pick from these options; they can't create new ones.
  - Each group shows a subtotal row. Groups are collapsible on the web.
- **Default sort:** defined per report and chosen to answer the main question (e.g. most overdue first). Every column is sortable on the web.
- **Totals:** a grand total row on every table and matrix. Money and number columns sum; percent columns use weighted averages (e.g. margin % = Σ profit / Σ revenue), never a sum or simple average.
- **Matrix reports:** row totals on the right and column totals at the bottom; month columns in calendar order; empty cells show "–", not 0.
- **Row count:** shown under the table ("128 invoices").

---

## 6. Excel export standard

One workbook per export. File name: `{report-id}_{company-short-name}_{YYYY-MM-DD}.xlsx`.

**Sheet 1: Report.** Top section (header block), then the report body:

| Row | Content | Source |
|---|---|---|
| 1 | **Report title** (large, bold) | `definition.name` |
| 2 | **Description**: brief explanation of what the report does | `definition.description` (the default entered when the report is created) |
| 3 | **Company:** {customer's org name} | Signed-in user's organization |
| 4 | **Reporter:** {name of the user who generated it} | Signed-in user (e.g. "Rackel Peña") |
| 5 | **Report date:** {date generated} | Export timestamp, in the org's local date |
| 6 | **Filters:** {as-of date / date range and other active filters} · Data as of {last sync} | Active filters + last sync |
| 7 | (blank) | |
| 8+ | **Summary** numbers (if the report has them), then the **Report detail**: the main body of data, i.e. the grouped table or matrix with subtotals and grand total | `ReportResult` |

**Sheet 2: Detail** (only if the main view is aggregated): record-level rows with all columns.

**Sheet 3: Notes:** column definitions, limitations, report version. Kept on its own sheet so the Report sheet stays clean.

The same header block (title, description, company, reporter, report date) also appears at the top of the web view and in any future PDF export.

Formatting rules:
- Header row bold, frozen panes below the header, autofilter on.
- All numbers, money, percents and dates are real typed values, never text (PK Flooring's complaint).
- Totals use `SUBTOTAL(9, …)` so they still work when the customer filters in Excel.
- Column widths set; no merged cells inside data ranges (merged cells break filtering and pivots).
- No hidden sheets, macros or external links.

---

## 7. Data and freshness

- Reports read **only from the Supabase cache** (via `forOrg(orgId)`), never from the CRM API while a customer is waiting. The sync job keeps the cache fresh.
- The header always shows "Data as of {time of last successful sync}". If the last sync failed or is more than 36 hours old, show a warning.
- Each report declares which cache tables it needs. If they haven't been synced yet for this org, show "Preparing your data…" and trigger a sync instead of an empty report.
- All calculations use the same definitions as the CRM where one exists (e.g. WIP formulas). Where a report defines a number differently from the CRM, say so in Notes.

---

## 8. Access, logging and performance

- Access: only orgs with an active assignment (server-side check, see access-control spec). Super Admins can't view other orgs' report data.
- Logging: every web view and export writes a `report_events` row with report id, version, action, filters (`params`) and `rowCount`.
- Performance target: under 2 seconds to render for an org with 1,000 jobs / 5,000 invoices. Paginate detail views over 500 rows on the web; Excel exports include all rows.

---

## 9. Testing and review

**Each report must have tests for:**
- A normal case with known expected totals (hand-calculated).
- Edge cases: empty data, zero / negative amounts, missing dates, a record exactly on a bucket or date boundary, a different org's rows not leaking in.
- Totals: grand total = sum of subtotals = sum of detail rows.
- Excel export: values are numeric, totals formulas present, sheets in the right order.

**Review checklist before setting a report `live`:**
- [ ] Reconciled against the CRM for at least one real job/org (e.g. a WIP row matches the CRM WIP report, or the difference is explained in Notes).
- [ ] Every calculated column has a definition in Notes.
- [ ] Limitations are shown in the partial-data banner where they apply.
- [ ] Default filters produce a useful report.
- [ ] Excel opens cleanly; totals still work after filtering.
- [ ] Requesting customer has seen a sample (screenshot or file) and confirmed it answers their question.
- [ ] Assigned only to the orgs that need it.

---

## 10. Example: A/R Aging in this structure

| Section | A/R Aging |
|---|---|
| Header | "A/R Aging" · "Open invoices by days past due, with retainage held separately." |
| Filters | As-of date (default today) · Customer/GC · Job · Owner |
| KPIs | Total Open A/R · Past Due · 90+ Days · Retainage Held · # Open Invoices |
| Main view | Grouped table by Customer/GC; columns Current · 1–30 · 31–60 · 61–90 · 90+ · Retainage · Total; grand total row. Default sort: Total desc. |
| Detail view | One row per open invoice: Invoice # (link) · Customer/GC · Job · Invoice Date · Due Date · Terms · Days Past Due · Bucket · Invoice Amount · Paid · Credits · Open Balance · Retainage Held · Retainage Due · Priority (flag). Default sort: Days Past Due desc. |
| Notes | Open Balance = Invoice Amount − Paid − Credits − Retainage Held. Buckets use Due Date (Invoice Date if no due date). Retainage is shown separately because it isn't collectible until released. |
| Limitations | "Payment history by date will appear once payment data is available." |
| Config (per org) | Priority threshold amount; include deposit invoices (Y/N). |
| Groupings | By Customer/GC (default) · By Job. Two levels: group → invoice. |
| Overrides | None. Uses the full standard. |
| Excel header | A/R Aging · "Open invoices by days past due, with retainage held separately." · Company: Design Construct Flooring LLC · Reporter: Jude Bontemps · Report date: Nov 25, 2026 · Filters: As of Nov 25, 2026; all customers |

## 11. Example override: Bid Timing

| Section | Bid Timing |
|---|---|
| Overrides | **No Summary section** (it's a tracking list; the estimator table carries the totals). **No Detail view** (the main table is already one row per job). |
| Main view | One row per job, grouped by Estimator (default) or Bid Due Month. |
| Excel | Same header block (title, description, company, reporter, report date, filters), then the report detail. |
