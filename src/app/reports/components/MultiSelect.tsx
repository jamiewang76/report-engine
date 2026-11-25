"use client";

import { useState } from "react";
import type { FilterOption } from "@/lib/reports/types";

/** Multi-select filter as checkboxes inside a dropdown, with an optional search box. Submits with the filter form. */
export default function MultiSelect({ name, label, allLabel, options, selected, searchable }: {
  name: string; label: string; allLabel: string; options: FilterOption[]; selected: string[]; searchable?: boolean;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(selected));
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const summary = !picked.size ? allLabel : picked.size === 1 ? options.find((o) => picked.has(o.value))?.label ?? "1 selected" : `${picked.size} selected`;
  const flip = (v: string) => setPicked((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });

  return (
    <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <span style={{ color: "#475467" }}>{label}</span>
      <details style={{ position: "relative" }}>
        <summary style={{ listStyle: "none", cursor: "pointer", border: "1px solid #d0d5dd", borderRadius: 8, padding: "6px 10px", background: "#fff", minWidth: 170, maxWidth: 240, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {summary} <span style={{ color: "#98a2b3" }}>▾</span>
        </summary>
        <div style={{ position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, width: 280, background: "#fff", border: "1px solid #e4e7ec", borderRadius: 10, boxShadow: "0 8px 24px rgba(16,24,40,0.12)", padding: 8 }}>
          {searchable && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #d0d5dd", borderRadius: 6, font: "inherit", fontSize: 13, marginBottom: 6 }} />
          )}
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {shown.map((o) => (
              <label key={o.value} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 4px", cursor: "pointer" }}>
                <input type="checkbox" checked={picked.has(o.value)} onChange={() => flip(o.value)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
              </label>
            ))}
            {!shown.length && <div style={{ color: "#98a2b3", padding: 4 }}>No matches</div>}
          </div>
          {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} style={{ marginTop: 6, border: 0, background: "none", color: "#1f4fd1", cursor: "pointer", padding: 0, fontSize: 13 }}>Clear selection</button>}
        </div>
      </details>
      {/* Hidden inputs carry the selection in the GET form (filters live in the URL). Unchecked = all. */}
      {[...picked].map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </div>
  );
}
