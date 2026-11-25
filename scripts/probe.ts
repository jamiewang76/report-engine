/**
 * Phase 0 data probe. Answers the open questions before we build more reports.
 *
 *   CRM_ACCESS_TOKEN=eyJ... CRM_API_BASE=https://crm11api.measuresquare.com npm run probe
 *
 * Get a token by signing into the app once (or, for a test org only, from the CRM web app's
 * network requests). Use a TEST organization. Output is written to probe-output.json (git-ignored;
 * it contains customer data).
 */
import { writeFileSync } from "node:fs";
import { decodeJwt } from "jose";

const token = process.env.CRM_ACCESS_TOKEN;
const base = process.env.CRM_API_BASE ?? "https://crm11api.measuresquare.com";
if (!token) throw new Error("Set CRM_ACCESS_TOKEN");

async function get(path: string, params: Record<string, string | number> = {}) {
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const t0 = Date.now();
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  const ms = Date.now() - t0;
  const body = res.ok ? await res.json() : await res.text();
  return { status: res.status, ms, body };
}

const keysOf = (o: unknown) => (o && typeof o === "object" ? Object.keys(o as object) : []);
const nonNull = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] != null && o[k] !== "");

async function main() {
  const out: Record<string, unknown> = {};

  // Q1: which claim carries the organization id?
  out.claims = decodeJwt(token!);

  // Q2: paging shape + whether PageIndex is 0- or 1-based
  const p0 = await get("/api/Deals", { PageIndex: 0, PageSize: 5, IsViewAll: "true" });
  const p1 = await get("/api/Deals", { PageIndex: 1, PageSize: 5, IsViewAll: "true" });
  out.paging = {
    page0: { status: p0.status, keys: keysOf(p0.body), firstId: (p0.body as any)?.data?.[0]?.id },
    page1: { status: p1.status, keys: keysOf(p1.body), firstId: (p1.body as any)?.data?.[0]?.id, totalCount: (p1.body as any)?.totalCount },
  };

  // Q3: deal detail — which date/financial fields are populated? custom fields shape?
  const dealId = (p1.body as any)?.data?.[0]?.id ?? (p0.body as any)?.data?.[0]?.id;
  if (dealId) {
    const d = await get(`/api/Deals/${dealId}`);
    out.dealDetail = { ms: d.ms, populated: nonNull(d.body as any), customFields: (d.body as any)?.customFields, labels: (d.body as any)?.labels };
    for (const ep of ["InvoicesSummary", "BillsSummary", "CommittedCost", "ExpectedCost", "BilledCost", "AccountReceivable"]) {
      const r = await get(`/api/Deals/${dealId}/${ep}`);
      out[`deal_${ep}`] = { status: r.status, ms: r.ms, body: r.body };
    }
    const ps = await get("/api/ProjectSummaries", { dealId });
    out.projectSummary = { status: ps.status, ms: ps.ms, keys: keysOf(ps.body), expensesSample: (ps.body as any)?.expenses?.slice?.(0, 2) };

    // Q4 (Select Interiors / MeasureUp): does the timeline log takeoff done / proposal sent / approved?
    const tl = await get("/api/Timelines", { TargetId: dealId, PageIndex: 1, PageSize: 100 });
    const items = ((tl.body as any)?.data ?? (tl.body as any)?.items ?? []) as any[];
    out.timeline = {
      status: tl.status,
      keys: keysOf(tl.body),
      types: [...new Set(items.map((i) => `${i.module ?? ""}|${i.type ?? ""}|${i.name ?? ""}`))],
      sample: items.slice(0, 15).map((i) => ({ type: i.type, module: i.module, name: i.name, content: String(i.content ?? "").slice(0, 160), createdOn: i.createdOn })),
    };
  }

  // Q5: invoices — list fields, detail fields (retainage/tax), and whether Filter supports lastUpdatedOn
  const inv = await get("/api/Invoices", { PageIndex: 1, PageSize: 5 });
  const invId = (inv.body as any)?.data?.[0]?.id;
  out.invoiceList = { status: inv.status, ms: inv.ms, rowKeys: keysOf((inv.body as any)?.data?.[0]) };
  if (invId) {
    const det = await get(`/api/Invoices/${invId}`);
    const b = det.body as any;
    out.invoiceDetail = {
      populated: nonNull(b ?? {}),
      retainage: { retainage: b?.retainage, retainageAmount: b?.retainageAmount, retainageDueDate: b?.retainageDueDate },
      tax: { taxAmount: b?.taxAmount, preTaxTotal: b?.preTaxTotal, amount: b?.amount },
      // any embedded payment records? (we expect none — that's the ask to Andrew)
      paymentLikeKeys: keysOf(b).filter((k) => /pay|receipt|transaction/i.test(k)),
    };
  }
  const f = await get("/api/Invoices", { PageIndex: 1, PageSize: 1, Filter: "lastUpdatedOn gt 2026-11-01" });
  out.invoiceUpdatedFilter = { status: f.status, note: "200 + fewer rows would mean Filter works for incremental sync", body: typeof f.body === "string" ? f.body.slice(0, 300) : { totalCount: (f.body as any)?.totalCount } };

  // Q6: timing — how heavy is a full deal pull?
  const t0 = Date.now();
  const big = await get("/api/Deals", { PageIndex: 1, PageSize: 100, IsViewAll: "true" });
  out.timing = { dealsPage100ms: Date.now() - t0, totalDeals: (big.body as any)?.totalCount };

  writeFileSync("probe-output.json", JSON.stringify(out, null, 2));
  console.log("Wrote probe-output.json. Do NOT commit it (contains CRM data). Summary:");
  console.log(JSON.stringify({
    claimKeys: Object.keys(out.claims as object),
    paging: out.paging,
    timelineTypes: (out.timeline as any)?.types,
    invoicePaymentKeys: (out.invoiceDetail as any)?.paymentLikeKeys,
    invoiceUpdatedFilter: (out.invoiceUpdatedFilter as any)?.status,
    timing: out.timing,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
