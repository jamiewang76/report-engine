import { requireSuperAdminPage } from "@/lib/admin/guard";
import { activity, orgOverview, type ActivityFilters } from "@/lib/admin/data";
import { REPORTS } from "@/lib/reports/registry";
import ActivityTable from "../ActivityTable";
import { AdminNav, button, input, muted } from "../ui";

export const dynamic = "force-dynamic";

const ACTIONS = ["view", "export_xlsx", "view_empty", "admin_assign", "admin_revoke", "admin_config_change", "admin_export_activity"];
const PAGE_SIZE = 50;

type Q = { org?: string; report?: string; user?: string; action?: string; from?: string; to?: string; page?: string };

export default async function AdminActivity({ searchParams }: { searchParams: Promise<Q> }) {
  await requireSuperAdminPage();
  const q = await searchParams;
  const f: ActivityFilters = { orgId: q.org || undefined, reportId: q.report || undefined, user: q.user || undefined, action: q.action || undefined, from: q.from || undefined, to: q.to || undefined };
  const page = Math.max(1, Number(q.page) || 1);
  const [result, orgs] = await Promise.all([activity(f, page, PAGE_SIZE), orgOverview()]);
  const orgNames = new Map(orgs.map((o) => [o.org_id, o.name]));
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const qs = (over: Partial<Q>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...q, ...over })) if (v) p.set(k, String(v));
    return p.toString();
  };
  const csv = new URLSearchParams();
  for (const [k, v] of Object.entries({ org: q.org, report: q.report, user: q.user, action: q.action, from: q.from, to: q.to })) if (v) csv.set(k, v);

  return (
    <>
      <AdminNav active="activity" />
      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 16 }}>
        <label style={muted}>Organization<br />
          <select name="org" defaultValue={q.org ?? ""} style={input}>
            <option value="">All</option>
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
        </label>
        <label style={muted}>Report<br />
          <select name="report" defaultValue={q.report ?? ""} style={input}>
            <option value="">All</option>
            {REPORTS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label style={muted}>User (email)<br /><input name="user" defaultValue={q.user ?? ""} style={input} /></label>
        <label style={muted}>Action<br />
          <select name="action" defaultValue={q.action ?? ""} style={input}>
            <option value="">All</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label style={muted}>From<br /><input type="date" name="from" defaultValue={q.from ?? ""} style={input} /></label>
        <label style={muted}>To<br /><input type="date" name="to" defaultValue={q.to ?? ""} style={input} /></label>
        <button type="submit" style={button(true)}>Filter</button>
        <a href="/admin/activity" style={{ ...button(), textDecoration: "none" }}>Clear</a>
        <a href={`/api/admin/activity?${csv.toString()}`} style={{ ...button(), textDecoration: "none", marginLeft: "auto" }}>Export CSV</a>
      </form>

      <div style={{ ...muted, marginBottom: 8 }}>{result.total.toLocaleString()} events · page {result.page} of {pages} · times in PT</div>
      <ActivityTable rows={result.rows} orgNames={orgNames} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        {page > 1 && <a href={`/admin/activity?${qs({ page: String(page - 1) })}`} style={{ ...button(), textDecoration: "none" }}>← Newer</a>}
        {page < pages && <a href={`/admin/activity?${qs({ page: String(page + 1) })}`} style={{ ...button(), textDecoration: "none" }}>Older →</a>}
      </div>
    </>
  );
}
