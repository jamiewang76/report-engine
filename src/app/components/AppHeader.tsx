import type { Session } from "@/lib/auth/session";
import { listUserOrgs } from "@/lib/orgs";
import { isSuperAdmin } from "@/lib/access";
import { supabaseStore } from "@/lib/access/store";
import UserMenu from "./UserMenu";

/** Shared top bar: title, Admin link (live check; /admin re-checks server-side on every request), user/org menu. */
export default async function AppHeader({ session: s, active }: { session: Session; active?: "reports" | "admin" }) {
  const [orgs, admin] = await Promise.all([listUserOrgs(s.userId, s.homeOrgId!), isSuperAdmin(supabaseStore, s)]);
  const current = orgs.find((o) => o.id === s.orgId) ?? { id: s.orgId, name: s.orgName ?? "Current organization" };
  if (!orgs.some((o) => o.id === current.id)) orgs.unshift(current);
  const link = (on: boolean): React.CSSProperties => ({ fontSize: 14, color: on ? "#1a1a1a" : "#555", fontWeight: on ? 600 : 400, textDecoration: "none" });

  return (
    <header style={{ background: "#fff", borderBottom: "1px solid #e5e5e5" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <a href="/" style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", textDecoration: "none" }}>Report Engine</a>
          {admin && (
            <>
              <a href="/" style={link(active !== "admin")}>Reports</a>
              <a href="/admin" style={link(active === "admin")}>Admin</a>
            </>
          )}
        </div>
        <UserMenu name={s.name} email={s.email} currentOrg={current} orgs={orgs} />
      </div>
    </header>
  );
}
