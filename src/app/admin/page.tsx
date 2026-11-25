import { requireSuperAdminPage } from "@/lib/admin/guard";
import { orgOverview, usersByOrg } from "@/lib/admin/data";
import { AdminNav, card, fmt, fmtDate, muted, table, td, th } from "./ui";

export const dynamic = "force-dynamic";

export default async function AdminOrganizations() {
  await requireSuperAdminPage();
  const orgs = await orgOverview();
  const fresh = orgs.filter((o) => Number(o.active_reports) === 0).sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at));
  const freshUsers = await usersByOrg(fresh.map((o) => o.org_id));
  const link = (id: string) => `/admin/orgs/${encodeURIComponent(id)}`;

  return (
    <>
      <AdminNav active="orgs" />
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
                  <td style={td}>{fmt(o.first_seen_at)}</td>
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
