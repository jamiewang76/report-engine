import { requireSuperAdminPage } from "@/lib/admin/guard";
import { orgOverview, usersByOrg } from "@/lib/admin/data";
import { searchOrgsForAdmin } from "@/lib/admin/orgLookup";
import { AdminNav, Badge, button, card, fmt, fmtDate, input, muted, table, td, th } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminOrganizations({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSuperAdminPage();
  const q = ((await searchParams).q ?? "").trim();
  // CRM-wide search runs only when the admin submits a keyword, never on page load.
  const [orgs, search] = await Promise.all([orgOverview(), q ? searchOrgsForAdmin(s, q) : Promise.resolve(null)]);
  const seen = (o: { first_seen_at: string | null; added_at: string | null }) => o.first_seen_at ?? o.added_at ?? "";
  const fresh = orgs.filter((o) => Number(o.active_reports) === 0).sort((a, b) => seen(b).localeCompare(seen(a)));
  const freshUsers = await usersByOrg(fresh.map((o) => o.org_id));
  const link = (id: string) => `/admin/orgs/${encodeURIComponent(id)}`;

  return (
    <>
      <AdminNav active="orgs" />
      <form method="get" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="Find any CRM organization by name or org ID" autoComplete="off" style={{ ...input, flex: 1, fontSize: 14, padding: "8px 10px" }} />
        <button type="submit" style={button(true)}>Search</button>
        {q && <a href="/admin" style={{ ...button(), textDecoration: "none" }}>Clear</a>}
      </form>
      {search && (
        <div style={{ ...card, padding: 0, marginBottom: 28 }}>
          {search.crmNote && <div style={{ ...muted, padding: "10px 16px", borderBottom: "1px solid #f0f0f0", background: "#fffaeb" }}>{search.crmNote}</div>}
          {!search.hits.length ? (
            <div style={{ ...muted, padding: 16 }}>No organizations match &quot;{q}&quot;.</div>
          ) : (
            <table style={table}>
              <thead><tr><th style={th}>Organization</th><th style={th}>Org ID</th><th style={th}>In app</th><th style={th}>Active reports</th></tr></thead>
              <tbody>
                {search.hits.map((h) => (
                  <tr key={h.id}>
                    <td style={td}><a href={link(h.id)} style={{ color: "#1f4fd1", fontWeight: 600 }}>{h.name}</a></td>
                    <td style={{ ...td, ...muted }}>{h.id}</td>
                    <td style={td}>
                      {!h.inApp ? <Badge>Not in app yet</Badge>
                        : h.inApp.first_seen_at ? <Badge tone="green">Signed in</Badge> : <Badge tone="amber">Added, not signed in</Badge>}
                    </td>
                    <td style={td}>{h.inApp ? h.inApp.active_reports : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>New / no reports assigned <span style={muted}>({fresh.length})</span></h2>
      <div style={{ ...card, padding: 0, marginBottom: 28, overflowX: "auto" }}>
        {!fresh.length ? (
          <div style={{ ...muted, padding: 16 }}>Every organization has at least one report.</div>
        ) : (
          <table style={table}>
            <thead><tr><th style={th}>Organization</th><th style={th}>First seen</th><th style={th}>Signed in</th></tr></thead>
            <tbody>
              {fresh.map((o) => (
                <tr key={o.org_id}>
                  <td style={td}><a href={link(o.org_id)} style={{ color: "#1f4fd1", fontWeight: 600 }}>{o.name}</a><div style={muted}>{o.org_id}</div></td>
                  <td style={td}>{o.first_seen_at ? fmt(o.first_seen_at) : <span style={muted}>Not signed in yet (added {fmtDate(o.added_at)})</span>}</td>
                  <td style={td}>
                    {(freshUsers.get(o.org_id) ?? []).map((u) => (
                      <div key={u.user_id}>{u.name ?? u.email ?? u.user_id} {u.email && u.name && <span style={muted}>{u.email}</span>}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>All organizations <span style={muted}>({orgs.length})</span></h2>
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Name</th><th style={th}>Org ID</th><th style={th}>Active reports</th><th style={th}>Last sync</th>
              <th style={th}>Last export</th><th style={th}>Users</th><th style={th}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.org_id}>
                <td style={td}><a href={link(o.org_id)} style={{ color: "#1f4fd1", fontWeight: 600 }}>{o.name}</a></td>
                <td style={{ ...td, ...muted }}>{o.org_id}</td>
                <td style={td}>{o.active_reports}</td>
                <td style={td}>{fmt(o.last_sync_at)}</td>
                <td style={td}>{fmt(o.last_export_at)}</td>
                <td style={td}>{o.user_count}</td>
                <td style={td}>{fmtDate(o.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
