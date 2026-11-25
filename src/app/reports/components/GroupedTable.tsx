"use client";

import { useState } from "react";
import { alignOf } from "@/lib/reports/format";
import type { GroupedResult, GroupNode } from "@/lib/reports/types";
import { CellContent, EMPTY_CELL, tdStyle } from "./Cell";

/**
 * Main view (grouped table): collapsible groups with subtotal rows, record rows inside, grand total at the bottom.
 * Column headers link to a server-side sort (sortHref), so sorting works without client state.
 */
export default function GroupedTable({ main, sortHref, sort, defaultExpanded = [] }: {
  main: GroupedResult;
  sortHref: Record<string, string>;
  sort: { key: string; dir: "asc" | "desc" } | null;
  defaultExpanded?: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(defaultExpanded));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allKeys = (gs: GroupNode[], p = ""): string[] => gs.flatMap((g) => [`${p}${g.key}`, ...allKeys(g.children, `${p}${g.key}/`)]);
  const cols = main.columns;
  const th: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "#475467", textTransform: "uppercase", letterSpacing: 0.3, borderBottom: "1px solid #e4e7ec", background: "#f9fafb", whiteSpace: "nowrap", position: "sticky", top: 0 };
  const arrow = (k: string) => (sort?.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  const renderGroup = (g: GroupNode, path: string): React.ReactNode[] => {
    const key = `${path}${g.key}`;
    const isOpen = open.has(key);
    const out: React.ReactNode[] = [
      <tr key={`g:${key}`} style={{ background: g.level === 0 ? "#f9fafb" : "#fcfcfd", fontWeight: 600 }}>
        <td style={{ padding: "8px 10px", borderBottom: "1px solid #eaecf0", paddingLeft: 10 + g.level * 18 }}>
          <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} style={{ border: 0, background: "none", cursor: "pointer", font: "inherit", padding: 0, color: "#1a1a1a", display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span style={{ display: "inline-block", width: 12, color: "#667085" }}>{isOpen ? "▾" : "▸"}</span>
            {g.href ? <a href={g.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#1a1a1a" }}>{g.label}</a> : g.label}
            <span style={{ color: "#667085", fontWeight: 400, fontSize: 12 }}>({g.count})</span>
          </button>
        </td>
        {cols.map((c) => <td key={c.key} style={{ ...tdStyle(c), borderBottom: "1px solid #eaecf0" }}><CellContent col={c} row={g.subtotal} empty={EMPTY_CELL} /></td>)}
      </tr>,
    ];
    if (isOpen) {
      for (const child of g.children) out.push(...renderGroup(child, `${key}/`));
      for (const r of g.rows) {
        out.push(
          <tr key={`r:${key}:${String(r.id ?? r[main.leafColumn.key])}`}>
            <td style={{ ...tdStyle(main.leafColumn), paddingLeft: 40 + g.level * 18 }}><CellContent col={main.leafColumn} row={r} /></td>
            {cols.map((c) => <td key={c.key} style={tdStyle(c)}><CellContent col={c} row={r} empty={EMPTY_CELL} /></td>)}
          </tr>,
        );
      }
    }
    return out;
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", fontSize: 13, marginBottom: 6 }}>
        <button type="button" onClick={() => setOpen(new Set(allKeys(main.groups)))} style={{ border: 0, background: "none", color: "#1f4fd1", cursor: "pointer", padding: 0 }}>Expand all</button>
        <button type="button" onClick={() => setOpen(new Set())} style={{ border: 0, background: "none", color: "#1f4fd1", cursor: "pointer", padding: 0 }}>Collapse all</button>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid #e4e7ec", borderRadius: 10, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>{main.levelLabels.join(" / ")} / {main.leafColumn.header}</th>
              {cols.map((c) => (
                <th key={c.key} style={{ ...th, textAlign: alignOf(c) }} title={c.description}>
                  {sortHref[c.key] ? <a href={sortHref[c.key]} style={{ color: "inherit", textDecoration: "none" }}>{c.header}{arrow(c.key)}</a> : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{main.groups.flatMap((g) => renderGroup(g, ""))}</tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: "#f2f4f7" }}>
              <td style={{ padding: "9px 10px", borderTop: "2px solid #d0d5dd" }}>Grand Total</td>
              {cols.map((c) => <td key={c.key} style={{ ...tdStyle(c), borderTop: "2px solid #d0d5dd" }}><CellContent col={c} row={main.grandTotal} empty={EMPTY_CELL} /></td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
