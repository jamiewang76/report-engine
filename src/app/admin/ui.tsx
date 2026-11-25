import type { ConfigSchema, ScalarField } from "@/lib/reports/schema";

export const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" }) + " PT" : "—";
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium" }) : "—";

export const card: React.CSSProperties = { background: "#fff", border: "1px solid #e5e5e5", borderRadius: 10, padding: 16 };
export const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
export const th: React.CSSProperties = { textAlign: "left", fontWeight: 600, color: "#555", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3, padding: "8px 10px", borderBottom: "1px solid #e5e5e5", whiteSpace: "nowrap" };
export const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" };
export const muted: React.CSSProperties = { color: "#777", fontSize: 13 };
export const input: React.CSSProperties = { font: "inherit", fontSize: 13, padding: "5px 8px", border: "1px solid #ddd", borderRadius: 6 };
export const button = (primary = false): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
  border: `1px solid ${primary ? "#1f4fd1" : "#ccc"}`, background: primary ? "#1f4fd1" : "#fff", color: primary ? "#fff" : "#1a1a1a",
});

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "amber" | "red" | "blue" }) {
  const c = { gray: ["#f2f2f3", "#555"], green: ["#ecfdf3", "#067647"], amber: ["#fffaeb", "#b54708"], red: ["#fef3f2", "#b42318"], blue: ["#eef4ff", "#1f4fd1"] }[tone];
  return <span style={{ background: c[0], color: c[1], borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

export const statusTone = (s: string) => (s === "live" ? "green" : s === "draft" ? "amber" : "gray") as "green" | "amber" | "gray";

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  const bad = !!error;
  return (
    <div style={{ background: bad ? "#fef3f2" : "#ecfdf3", border: `1px solid ${bad ? "#fecdca" : "#abefc6"}`, color: bad ? "#b42318" : "#067647", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 14 }}>
      {error ?? ok}
    </div>
  );
}

function ScalarInput({ f, name, value }: { f: ScalarField; name: string; value: unknown }) {
  switch (f.type) {
    case "boolean":
      return <input type="checkbox" name={name} defaultChecked={value === undefined ? f.default : Boolean(value)} />;
    case "number":
      return <input type="number" step="any" name={name} defaultValue={value == null ? "" : String(value)} style={{ ...input, width: 160 }} />;
    case "string":
      return <input type="text" name={name} defaultValue={value == null ? "" : String(value)} style={{ ...input, width: "100%" }} />;
    case "stringList":
      return (
        <textarea name={name} rows={3} defaultValue={Array.isArray(value) ? value.join("\n") : ""} placeholder="One per line" style={{ ...input, width: "100%", resize: "vertical" }} />
      );
  }
}

/** Form fields generated from a report's configSchema (names match configFromForm). */
export function ConfigFields({ schema, value }: { schema: ConfigSchema; value: Record<string, unknown> }) {
  const entries = Object.entries(schema);
  if (!entries.length) return <div style={muted}>This report has no settings.</div>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {entries.map(([key, f]) => (
        <div key={key}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{f.label}</div>
          {f.type === "records" ? (
            <div style={{ display: "grid", gap: 8 }}>
              {[...((value[key] as Record<string, unknown>[] | undefined) ?? []), {}].map((row, i) => (
                <fieldset key={i} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10, margin: 0, display: "grid", gap: 8, gridTemplateColumns: `repeat(${Object.keys(f.fields).length}, minmax(0, 1fr))` }}>
                  {Object.entries(f.fields).map(([sk, sf]) => (
                    <label key={sk} style={{ fontSize: 12, color: "#555", display: "grid", gap: 4 }}>
                      {sf.label}
                      <ScalarInput f={sf} name={`cfg.${key}.${i}.${sk}`} value={row[sk]} />
                    </label>
                  ))}
                </fieldset>
              ))}
              <div style={muted}>Leave the last row empty unless adding one. Clear every field in a row to remove it.</div>
            </div>
          ) : (
            <ScalarInput f={f} name={`cfg.${key}`} value={value[key]} />
          )}
          {f.help && <div style={{ ...muted, marginTop: 4 }}>{f.help}</div>}
        </div>
      ))}
    </div>
  );
}

export function AdminNav({ active }: { active: "orgs" | "reports" | "activity" }) {
  const l = (on: boolean): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 8, textDecoration: "none", fontSize: 14, color: on ? "#1f4fd1" : "#444", background: on ? "#eef4ff" : "transparent", fontWeight: on ? 600 : 400 });
  return (
    <nav style={{ display: "flex", gap: 6, marginBottom: 20 }}>
      <a href="/admin" style={l(active === "orgs")}>Organizations</a>
      <a href="/admin/reports" style={l(active === "reports")}>Reports</a>
      <a href="/admin/activity" style={l(active === "activity")}>Activity log</a>
    </nav>
  );
}
