"use client";

import { alignOf } from "@/lib/reports/format";
import type { ColumnDef, Row } from "@/lib/reports/types";
import { CellContent, tdStyle } from "./Cell";
import { ColumnControls, fitTable, fitTd, fitTh, fitWidth, scrollBox, stickyFoot, thBase, useColumnLayout } from "./columnLayout";

/**
 * Detail view: one row per record. Sorting is server-side (header links); column order, visibility and Fit mode
 * are per-viewer (columnLayout). The header row and totals row stay pinned while scrolling.
 */
export default function DetailTable({ storageKey, columns, rows, totals, sort, sortHref }: {
  storageKey: string;
  columns: ColumnDef[];
  rows: Row[];
  totals: Row;
  sort: { key: string; dir: "asc" | "desc" } | null;
  sortHref: Record<string, string>;
}) {
  const layout = useColumnLayout(storageKey, columns);
  const cols = layout.visible;
  const fit = layout.fit;
  const arrow = (k: string) => (sort?.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  const totalWeight = cols.reduce((s, c) => s + fitWidth(c), 0);
  // First column stays visible while scrolling sideways (not needed in Fit mode, where nothing scrolls sideways).
  const pinLeft = (i: number, bg: string): React.CSSProperties => (!fit && i === 0 ? { position: "sticky", left: 0, background: bg, zIndex: 1, boxShadow: "1px 0 0 #e4e7ec" } : {});

  return (
    <>
      <ColumnControls layout={layout} />
      <div style={scrollBox}>
        <table style={fitTable(fit)}>
          {fit && <colgroup>{cols.map((c) => <col key={c.key} style={{ width: `${(fitWidth(c) / totalWeight) * 100}%` }} />)}</colgroup>}
          <thead>
            <tr>{cols.map((c, i) => {
              const drag = layout.dragProps(c.key);
              return (
                <th key={c.key} {...drag} title={c.description} style={{ ...thBase, ...fitTh(fit), textAlign: alignOf(c), ...drag.style, ...pinLeft(i, "#f9fafb"), ...(i === 0 && !fit ? { zIndex: 3 } : {}) }}>
                  <a href={sortHref[c.key]} draggable={false} style={{ color: "inherit", textDecoration: "none" }}>{c.header}{arrow(c.key)}</a>
                </th>
              );
            })}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={String(row.id ?? ri)}>
                {cols.map((c, i) => <td key={c.key} style={{ ...tdStyle(c), ...fitTd(fit), ...pinLeft(i, "#fff") }}><CellContent col={c} row={row} /></td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              {cols.map((c, i) => (
                <td key={c.key} style={{ ...tdStyle(c), ...fitTd(fit), ...stickyFoot, ...pinLeft(i, "#f2f4f7"), ...(i === 0 && !fit ? { zIndex: 3 } : {}) }}>
                  {i === 0 && totals[c.key] == null ? "Total" : <CellContent col={c} row={totals} />}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
