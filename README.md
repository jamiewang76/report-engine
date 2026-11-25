# Report Engine

Custom reports on MeasureSquare CRM data. Customers sign in with their own MeasureSquare (id4) account, the app syncs their CRM data into a per-organization cache, and they view or download reports (Excel).

## Architecture

| Piece | Choice | Notes |
|---|---|---|
| App + server | Next.js on Vercel | Sign-in, sync and report routes run server-side |
| Sign-in | id4 (`https://id4.measuresquare.com`) | Authorization code + PKCE; scopes `openid profile email crm-api offline_access` |
| Data source | CRM **standard API** (`crm11api`) | Calls use the customer's own token, so the API scopes data to their org. **Do not use OData here** (no tenant isolation yet, per Andrew). |
| Cache | Supabase Postgres | Every table keyed by `org_id`; RLS on; refresh tokens AES-256-GCM encrypted |
| Sync | Vercel cron daily (`/api/sync`) + "Refresh now" (rate-limited to 1 per 15 min per org) | Deals: incremental via `UpdatedStart`. Invoices: full list, detail only for new/open/retainage invoices. Concurrency 4. |

**Safety rules:** CRM tokens never reach the browser. Every query filters by the session's `org_id` (use `forOrg()`), never raw `db()` in report code. Never commit `.env` or `probe-output.json`.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in.
3. **id4:** register a client (confidential, authorization code + PKCE, `offline_access` allowed), redirect URI `${APP_URL}/api/auth/callback`.
4. **Supabase:** run the files in `supabase/migrations/` in order (`0001` … `0005_admin_added_orgs.sql`). After your first sign-in, optionally run `supabase/seed/super_admin_jamie.sql`; `supabase/tests/report_events_immutable.sql` checks the activity log is insert-only (every row should say PASS).
5. `npm run dev`, then sign in at `http://localhost:3000`.
6. **Vercel:** set the same env vars; the cron in `vercel.json` calls `/api/sync` with `CRON_SECRET`.

## Access control & admin

- Reports live in `src/lib/reports/registry.ts` (status `draft` | `live` | `retired`, per-org `configSchema`, JSON + XLSX handlers). Only **live** reports can be assigned.
- Customers see and run only reports with an active row in `report_assignments` for their org; `/api/reports/[id]` returns 401/403 otherwise. Every view/export is logged to `report_events` (insert-only). Sync runs only for orgs with an active report.
- Organizations and users are recorded automatically on sign-in and org switch. Super Admins can also find any CRM org (Admin → search) and assign reports before anyone from it signs in.
- **Super Admin** = `@measuresquare.com` email **and** (id4 `isSuper=true` or a row in `super_admins`), re-checked on every admin request. Admin console at `/admin`; it never reads customers' cached CRM data.

## Phase 0: data probe (run first)

```
CRM_ACCESS_TOKEN=... npm run probe
```

Answers: which token claim carries the org id (update `identityFromTokens()` in `src/lib/auth/id4.ts`), 0- vs 1-based paging, which deal fields/custom fields are populated, whether the timeline logs takeoff-done / proposal-sent / approved events, invoice retainage/tax fields, whether `Filter=lastUpdatedOn gt …` works on invoices, and response times. Use a **test org**.

## Reports

| Report | Pilot | Status | Data |
|---|---|---|---|
| A/R Aging | Design Construct | ✅ live (`src/lib/reports/arAging.ts`, tested); settings: priority threshold, include deposits | Invoices: due date, amount, paid, credits, retainage |
| Bid Timing | Select Interiors | ⏳ after probe | Deals: created, bid due; takeoff/proposal from timeline or custom fields |
| Financial Summary | M&P Flooring | ⏳ partial | Invoiced revenue + tax by month now; payments + COGS need the Payments/Bills endpoints |
| Forecast, WIP variants, labor budget, claims | Provincial, Coverings, PK, Design Floors, Precision, Goduco, MeasureUp, MSS | Phase 2 | Standard API |

## Blocked on API work (requested from Andrew)

- Payments list (date, amount, method, invoice) and Bills list (date, vendor, ref #, lines with type/cost code, linked PO/WO), in the standard API with org scoping.
- Expenses list; bid/quote sent/approved dates; `lastUpdatedOn` filters.
