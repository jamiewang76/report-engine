/**
 * Sample A/R Aging output from anonymized fixtures (no customer data, no database, no network):
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/sample-ar-aging.tsx <outDir>
 * Writes <outDir>/ar-aging_Sample-Flooring_2026-11-25.xlsx and preview HTML pages (main + detail tab)
 * rendered with the real ReportView component, for screenshots and review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ReportView from "@/app/reports/components/ReportView";
import { definition } from "@/lib/reports/ar-aging/definition";
import { filterOptions } from "@/lib/reports/ar-aging/build";
import { AS_OF, DATA } from "@/lib/reports/ar-aging/fixtures/invoices";
import { sampleArAging } from "@/lib/reports/ar-aging/fixtures/sample";
import { buildWorkbook, workbookFileName } from "@/lib/reports/excel";
import { parseFilters } from "@/lib/reports/filters";

const out = resolve(process.argv[2] ?? "sample-output");
mkdirSync(out, { recursive: true });

const result = sampleArAging();
const filters = parseFilters(definition.filters, {}, AS_OF);
const grouping = definition.groupings[0];

function page(tab: "main" | "detail") {
  const body = renderToStaticMarkup(
    <ReportView
      def={definition}
      result={result}
      options={filterOptions(DATA)}
      filters={filters}
      grouping={grouping}
      today={AS_OF}
      view={{ sort: tab === "main" ? { key: "total", dir: "desc" } : { key: "daysPastDue", dir: "desc" }, tab, page: 1 }}
      refresh={<button type="button" style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #d0d5dd", background: "#fff", fontSize: 13 }}>Refresh</button>}
      expandedGroups={["Acme Builders"]}
    />,
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A/R Aging (sample)</title></head>
<body style="font-family: system-ui, sans-serif; margin: 0; background: #f7f7f8; color: #1a1a1a">
<header style="background:#fff;border-bottom:1px solid #e5e5e5"><div style="max-width:1100px;margin:0 auto;padding:14px 24px;display:flex;justify-content:space-between;align-items:center">
<strong style="font-size:18px">Report Engine</strong><span style="font-size:13px;color:#555;border:1px solid #e5e5e5;border-radius:999px;padding:6px 14px">Pat Example · Sample Flooring Co.</span></div></header>
<main style="max-width:1240px;margin:24px auto;padding:0 24px 48px"><a href="#" style="color:#667085;font-size:13px;text-decoration:none">← All reports</a><div style="margin-top:8px">${body}</div></main>
</body></html>`;
}

writeFileSync(join(out, "ar-aging-preview-main.html"), page("main"));
writeFileSync(join(out, "ar-aging-preview-detail.html"), page("detail"));
const file = workbookFileName(definition.id, result.header.company, result.header.reportDate);
buildWorkbook(definition, result).then((buf) => {
  writeFileSync(join(out, file), buf);
  console.log(`Wrote ${join(out, file)} and preview HTML to ${out}`);
});
