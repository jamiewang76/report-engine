import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { forOrg } from "@/lib/db";
import { buildArAging, type AgingRow } from "@/lib/reports/arAging";
import { toXlsx } from "@/lib/reports/excel";

/** GET /api/reports/ar-aging?asOf=2026-11-30&format=xlsx — always scoped to the signed-in user's org. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { report } = await params;
  const asOf = new Date(req.nextUrl.searchParams.get("asOf") ?? Date.now());
  const format = req.nextUrl.searchParams.get("format") ?? "json";

  if (report === "ar-aging") {
    const { data, error } = await forOrg(s.orgId).select("invoices");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const result = buildArAging((data ?? []) as any, asOf);
    if (format !== "xlsx") return NextResponse.json(result);
    const xlsx = await toXlsx<AgingRow>(`A/R Aging as of ${result.asOf}`, [{
      name: "A/R Aging", totals: true, rows: result.rows,
      columns: [
        { header: "Invoice #", value: (r) => r.number },
        { header: "Customer / GC", value: (r) => r.customer, width: 28 },
        { header: "Project", value: (r) => r.project, width: 32 },
        { header: "Invoice Date", value: (r) => (r.invoiceDate ? new Date(r.invoiceDate) : null) },
        { header: "Due Date", value: (r) => (r.dueDate ? new Date(r.dueDate) : null) },
        { header: "Days Past Due", value: (r) => r.daysPastDue },
        { header: "Bucket", value: (r) => r.bucket },
        { header: "Invoice Amount", value: (r) => r.amount, money: true },
        { header: "Paid", value: (r) => r.paid, money: true },
        { header: "Open Balance", value: (r) => r.openBalance, money: true },
        { header: "Retainage Held", value: (r) => r.retainageHeld, money: true },
        { header: "Retainage Due", value: (r) => (r.retainageDueDate ? new Date(r.retainageDueDate) : null) },
      ],
    }]);
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ar-aging-${result.asOf}.xlsx"`,
      },
    });
  }
  return NextResponse.json({ error: `Unknown report ${report}` }, { status: 404 });
}
