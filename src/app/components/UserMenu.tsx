"use client";

import { useEffect, useRef, useState } from "react";
import type { CrmOrg } from "@/lib/crm/orgs";

type Props = {
  name: string | null;
  email: string | null;
  currentOrg: CrmOrg;
  orgs: CrmOrg[]; // every org the user belongs to, including the current one
};

function initials(name: string | null, email: string | null) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (name && parts[1] ? parts[1][0] : "")).toUpperCase();
}

/** Top-right profile chip: user + current org; dropdown with org switcher and sign out. */
export default function UserMenu({ name, email, currentOrg, orgs }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [filter, setFilter] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const shown = orgs.filter((o) => o.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const item: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: 0, background: "none", font: "inherit", fontSize: 14, color: "#1a1a1a", textDecoration: "none", cursor: "pointer", borderRadius: 6 };
  const section: React.CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "#888", padding: "8px 12px 4px" };

  return (
    <details ref={ref} style={{ position: "relative" }}>
      <summary style={{ listStyle: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e5e5", background: "#fff" }}>
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: "50%", background: "#1f4fd1", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}>
          {initials(name, email)}
        </span>
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, maxWidth: 240 }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name ?? email}</span>
          <span style={{ fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentOrg.name}</span>
        </span>
        <span aria-hidden style={{ color: "#888", fontSize: 12 }}>▾</span>
      </summary>

      <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 300, background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", padding: 6, zIndex: 10 }}>
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontWeight: 600 }}>{name ?? email}</div>
          {email && name && <div style={{ fontSize: 13, color: "#666" }}>{email}</div>}
        </div>
        <hr style={{ border: 0, borderTop: "1px solid #eee", margin: "4px 0" }} />
        <div style={section}>{orgs.length > 1 ? "Switch organization" : "Organization"}</div>
        {orgs.length > 8 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search organizations"
            style={{ width: "calc(100% - 24px)", margin: "4px 12px 6px", padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, font: "inherit", fontSize: 13 }}
          />
        )}
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {shown.map((o) =>
            o.id === currentOrg.id ? (
              <div key={o.id} style={{ ...item, cursor: "default", fontWeight: 600 }}>✓ {o.name}</div>
            ) : (
              <form key={o.id} action="/api/auth/switch-org" method="post" style={{ margin: 0 }} onSubmit={() => setSwitching(o.id)}>
                <input type="hidden" name="orgId" value={o.id} />
                <button type="submit" disabled={!!switching} style={{ ...item, paddingLeft: 26, color: switching && switching !== o.id ? "#aaa" : "#1a1a1a" }}>
                  {switching === o.id ? `Switching to ${o.name}…` : o.name}
                </button>
              </form>
            ),
          )}
          {!shown.length && <div style={{ ...item, color: "#888", cursor: "default" }}>No matches</div>}
        </div>
        <hr style={{ border: 0, borderTop: "1px solid #eee", margin: "4px 0" }} />
        <a href="/api/auth/logout" style={item}>Sign out</a>
      </div>
    </details>
  );
}
