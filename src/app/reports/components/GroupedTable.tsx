"use client";

import { useState } from "react";
import { alignOf } from "@/lib/reports/format";
import type { GroupedResult, GroupNode } from "@/lib/reports/types";
import { CellContent, EMPTY_CELL, tdStyle } from "./Cell";
import { ColumnControls, fitTable, fitTd, fitTh, fitWidth, scrollBox, stickyFoot, thBase, useColumnLayout } from "./columnLayout";

/**
 * Main view (grouped table): collapsible groups with subtotal rows, record rows inside, grand total at the bottom.
 * Column headers link to a server-side sort (sortHref), so sorting works without client state.
 */
export default function GroupedTable({ main, storageKey, sortHref, sort, defaultExpanded = [] }: {
  main: GroupedResult;
  storageKey: string;
  sortHref: Record<string, string>;
  sort: { key: string; dir: "asc" | "desc" } | null;
  defaultExpanded?: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set(defaultExpanded));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allKeys = (gs: GroupNode[], p = ""): string[] => gs.flatMap((g) => [`${p}${g.key}`, ...allKeys(g.children, `${p}${g.key}/`)]);
  const layout = useColumnLayout(storageKey, main.columns);
  const cols = layout.visible;
  const fit = layout.fit;
  const th = thBase;
  const totalWeight = 2.5 + cols.reduce((s, c) => s + fitWidth(c), 0);
  // The group/record label column is fixed first and stays visible while scrolling sideways.
  const pin = (bg: string, z = 1): React.CSSProperties => (fit ? {} : { position: "sticky", left: 0, background: bg, zIndex: z, boxShadow: "1px 0 0 #e4e7ec" });
  const arrow = (k: string) => (sort?.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  const renderGroup = (g: GroupNode, path: string): React.ReactNode[] => {
    const key = `${path}${g.key}`;
    const isOpen = open.has(key);
    const out: React.ReactNode[] = [
      <tr key={`g:${key}`} style={{ background: g.level === 0 ? "#f9fafb" : "#fcfcfd", fontWeight: 600 }}>
        <td style={{ padding: "8px 10px", borderBottom: "1px solid #eaecf0", paddingLeft: 10 + g.level * 18, ...pin(g.level === 0 ? "#f9fafb" : "#fcfcfd"), ...(fit ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}) }}>
          <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} style={{ border: 0, background: "none", cursor: "pointer", font: "inherit", padding: 0, color: "#1a1a1a", display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span style={{ display: "inline-block", width: 12, color: "#667085" }}>{isOpen ? "▾" : "▸"}</span>
            {g.href ? <a href={g.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#1a1a1a" }}>{g.label}</a> : g.label}
            <span style={{ color: "#667085", fontWeight: 400, fontSize: 12 }}>({g.count})</span>
          </button>
        </td>
        {cols.map((c) => <td key={c.key} style={{ ...tdStyle(c), ...fitTd(fit), borderBottom: "1px solid #eaecf0" }}><CellContent col={c} row={g.subtotal} empty={EMPTY_CELL} /></td>)}
      </tr>,
    ];
    if (isOpen) {
      for (const child of g.children) out.push(...renderGroup(child, `${key}/`));
      for (const r of g.rows) {
        out.push(
          <tr key={`r:${key}:${String(r.id ?? r[main.leafColumn.key])}`}>
            <td style={{ ...tdStyle(main.leafColumn), ...fitTd(fit), paddingLeft: 40 + g.level * 18, ...pin("#fff") }}><CellContent col={main.leafColumn} row={r} /></td>
            {cols.map((c) => <td key={c.key} style={{ ...tdStyle(c), ...fitTd(fit) }}><CellContent col={c} row={r} empty={EMPTY_CELL} /></td>)}
          </tr>,
        );
      }
    }
    return out;
  };

  return (
    <div>
      <ColumnControls layout={layout}>
        <button type="button" onClick={() => setOpen(new Set(allKeys(main.groups)))} style={{ border: 0, background: "none", color: "#1f4fd1", cursor: "pointer", padding: 0, font: "inherit" }}>Expand all</button>
        <button type="button" onClick={() => setOpen(new Set())} style={{ border: 0, background: "none", color: "#1f4fd1", cursor: "pointer", padding: 0, font: "inherit" }}>Collapse all</button>
      </ColumnControls>
      <div style={scrollBox}>
        <table style={fitTable(fit)}>
          {fit && <colgroup><col style={{ width: `${(2.5 / totalWeight) * 100}%` }} />{cols.map((c) => <col key={c.key} style={{ width: `${(fitWidth(c) / totalWeight) * 100}%` }} />)}</colgroup>}
          <thead>
            <tr>
              <th style={{ ...th, ...fitTh(fit), textAlign: "left", ...pin("#f9fafb", 3), position: "sticky", top: 0 }}>{main.levelLabels.join(" / ")} / {main.leafColumn.header}</th>
              {cols.map((c) => {
                const drag = layout.dragProps(c.key);
                return (
                  <th key={c.key} {...drag} style={{ ...th, ...fitTh(fit), textAlign: alignOf(c), ...drag.style }} title={c.description}>
                    {sortHref[c.key] ? <a href={sortHref[c.key]} draggable={false} style={{ color: "inherit", textDecoration: "none" }}>{c.header}{arrow(c.key)}</a> : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{main.groups.flatMap((g) => renderGroup(g, ""))}</tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td style={{ padding: "9px 10px", ...stickyFoot, ...pin("#f2f4f7", 3), position: "sticky", bottom: 0 }}>Grand Total</td>
              {cols.map((c) => <td key={c.key} style={{ ...tdStyle(c), ...fitTd(fit), ...stickyFoot }}><CellContent col={c} row={main.grandTotal} empty={EMPTY_CELL} /></td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
