import { forbidden, notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { checkReportAccess, logEvent } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";
import { FilterError } from "@/lib/reports/filters";
import { resortGroups } from "@/lib/reports/grouping";
import { runReport } from "@/lib/reports/runner";
import AppHeader from "../../components/AppHeader";
import ReportView, { type ViewState } from "../components/ReportView";
import { PreparingData, RefreshButton } from "../components/SyncControls";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Shared web page for every registered report. Access is checked server-side on every request. */
export default async function ReportPage({ params, searchParams }: { params: Promise<{ report: string }>; searchParams: Promise<Search> }) {
  const s = await getSession();
  if (s && !s.homeOrgId) redirect("/api/auth/login");
  const { report: reportId } = await params;
  const sp = await searchParams;

  const access = await checkReportAccess(supabaseStore, s, reportId);
  if (!access.ok) {
    if (access.status === 401) redirect("/api/auth/login");
    if (access.status === 404) notFound();
    if (access.status === 403) forbidden();
  }
  const session = s!;

  const shell = (body: React.ReactNode) => (
    <>
      <AppHeader session={session} />
      <main style={{ maxWidth: 1240, margin: "24px auto", padding: "0 24px 48px" }}>
        <a href="/" style={{ color: "#667085", fontSize: 13, textDecoration: "none" }}>← All reports</a>
        <div style={{ marginTop: 8 }}>{body}</div>
      </main>
    </>
  );

  if (!access.ok) {
    // 409: the org's saved settings for this report no longer validate.
    return shell(<div style={{ background: "#fff", border: "1px solid #e4e7ec", borderRadius: 12, padding: 32, textAlign: "center" }}>{access.error}</div>);
  }

  let run;
  try {
    run = await runReport({ report: access.report, session, config: access.config, params: sp });
  } catch (e) {
    if (!(e instanceof FilterError)) throw e;
    return shell(
      <div style={{ background: "#fff", border: "1px solid #e4e7ec", borderRadius: 12, padding: 32, textAlign: "center" }}>
        <div style={{ fontWeight: 600 }}>{e.message}</div>
        <a href={`/reports/${reportId}`} style={{ color: "#1f4fd1", display: "inline-block", marginTop: 8 }}>Clear filters</a>
      </div>,
    );
  }
  if (run.state === "preparing") return shell(<PreparingData running={run.sync.running} />);

  const def = access.report;
  const r = run.result;
  const sortKey = one(sp.sort);
  const view: ViewState = {
    sort: sortKey ? { key: sortKey, dir: one(sp.dir) === "asc" ? "asc" : "desc" } : null,
    tab: one(sp.tab) === "detail" && r.detail ? "detail" : "main",
    page: Number(one(sp.page)) || 1,
  };
  if (view.sort && r.main.kind === "grouped" && r.main.columns.some((c) => c.key === view.sort!.key)) {
    r.main = { ...r.main, groups: resortGroups(r.main.groups, view.sort) };
  }

  await logEvent(supabaseStore, {
    orgId: session.orgId, userId: session.userId, userEmail: session.email, reportId, action: "view",
    params: { version: r.meta.version, grouping: r.meta.grouping, filters: r.header.filters, tab: view.tab, ...r.meta.params },
    rowCount: r.rowCount,
  });

  return shell(
    <ReportView
      def={def}
      result={r}
      options={run.options}
      filters={run.filters}
      grouping={run.grouping}
      today={run.today}
      view={{ ...view, sort: view.sort ?? (r.main.kind === "grouped" && view.tab === "main" && def.views.main.kind === "grouped" ? def.views.main.defaultSort : view.tab === "detail" ? def.views.detail?.defaultSort ?? null : null) }}
      refresh={<RefreshButton running={run.sync.running} />}
    />,
  );
}
