/**
 * Sample Monthly Financial Summary output from anonymized fixtures (no customer data, no database, no network):
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/sample-financial-summary.tsx <outDir>
 * Writes the sample .xlsx and preview HTML pages (main, invoices, committed cost) rendered with the real ReportView.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ReportView from "@/app/reports/components/ReportView";
import { definition } from "@/lib/reports/financial-summary/definition";
import { filterOptions } from "@/lib/reports/financial-summary/build";
import { AS_OF, DATA } from "@/lib/reports/financial-summary/fixtures/data";
import { sampleFinancialSummary } from "@/lib/reports/financial-summary/fixtures/sample";
import { buildWorkbook, workbookFileName } from "@/lib/reports/excel";
import { parseFilters } from "@/lib/reports/filters";

const out = resolve(process.argv[2] ?? "sample-output");
mkdirSync(out, { recursive: true });

function page(tab: string, query: Record<string, string>) {
  const result = sampleFinancialSummary(query);
  const filters = parseFilters(definition.filters, query, AS_OF);
  const spec = definition.views.details!.find((d) => d.id === tab);
  const body = renderToStaticMarkup(
    <ReportView
      def={definition}
      result={result}
      options={filterOptions(DATA)}
      filters={filters}
      grouping={definition.groupings[0]}
      today={AS_OF}
      view={{ sort: spec?.defaultSort ?? null, tab, page: 1 }}
      refresh={<button type="button" style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff", fontSize: 13 }}>Refresh</button>}
      preview
    />,
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Monthly Financial Summary (sample)</title></head>
<body style="font-family: system-ui, sans-serif; margin: 0; background: #f7f7f8; color: #1a1a1a">
<header style="background:#fff;border-bottom:1px solid #e5e5e5"><div style="max-width:1100px;margin:0 auto;padding:14px 24px;display:flex;justify-content:space-between;align-items:center">
<strong style="font-size:18px">Report Engine</strong><span style="font-size:13px;color:#555;border:1px solid #e5e5e5;border-radius:999px;padding:6px 14px">Pat Example · Sample Flooring Co.</span></div></header>
<main style="max-width:1240px;margin:24px auto;padding:0 24px 48px"><a href="#" style="color:#667085;font-size:13px;text-decoration:none">← All reports</a><div style="margin-top:8px">${body}</div></main>
</body></html>`;
}

writeFileSync(join(out, "fs-preview-main.html"), page("main", { year: "2026" }));
writeFileSync(join(out, "fs-preview-invoices.html"), page("invoices", { year: "2026", in: "2026-02-01_2026-02-28" }));
writeFileSync(join(out, "fs-preview-committed.html"), page("committed", { year: "2026" }));
const result = sampleFinancialSummary();
const file = workbookFileName(definition.id, result.header.company, result.header.reportDate);
buildWorkbook(definition, result).then((buf) => {
  writeFileSync(join(out, file), buf);
  console.log(`Wrote ${join(out, file)} and preview HTML to ${out}`);
});
