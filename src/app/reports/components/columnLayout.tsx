"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@/lib/reports/types";

/**
 * Per-viewer table layout for any report table: column order (drag headers), hidden columns, and Fit mode.
 * Saved in this browser only (localStorage, per report + view); a convenience, never required to render.
 * The Excel export always uses the report's standard column order (docs/report-standard.md §6).
 */
export type Layout = { order: string[]; hidden: string[]; fit: boolean };
const EMPTY_LAYOUT: Layout = { order: [], hidden: [], fit: false };

function read(key: string): Layout {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (v && Array.isArray(v.order) && Array.isArray(v.hidden)) return { order: v.order, hidden: v.hidden, fit: !!v.fit };
  } catch { /* storage blocked or corrupt: use defaults */ }
  return EMPTY_LAYOUT;
}
function write(key: string, l: Layout) {
  try { window.localStorage.setItem(key, JSON.stringify(l)); } catch { /* ignore */ }
}

/** Apply a saved order to the current columns: known keys in saved order, new columns appended in default order. */
export function orderColumns(columns: ColumnDef[], order: string[]): ColumnDef[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const out = order.map((k) => byKey.get(k)).filter((c): c is ColumnDef => !!c);
  for (const c of columns) if (!order.includes(c.key)) out.push(c);
  return out;
}

export function moveKey(keys: string[], from: string, to: string): string[] {
  if (from === to) return keys;
  const next = keys.filter((k) => k !== from);
  const i = next.indexOf(to);
  const fromIdx = keys.indexOf(from), toIdx = keys.indexOf(to);
  next.splice(fromIdx < toIdx ? i + 1 : i, 0, from); // dropping right of the start inserts after the target
  return next;
}

export function useColumnLayout(storageKey: string, columns: ColumnDef[]) {
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT);
  const loaded = useRef(false);
  useEffect(() => { setLayout(read(storageKey)); loaded.current = true; }, [storageKey]);
  const update = (f: (l: Layout) => Layout) => setLayout((l) => { const n = f(l); if (loaded.current) write(storageKey, n); return n; });

  const ordered = orderColumns(columns, layout.order);
  const visible = ordered.filter((c) => !layout.hidden.includes(c.key));
  const [dragging, setDragging] = useState<string | null>(null);

  /** Props for a draggable <th>: drag a header onto another to move it there. */
  const dragProps = (key: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragging(key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); },
    onDragOver: (e: React.DragEvent) => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const from = dragging ?? e.dataTransfer.getData("text/plain");
      setDragging(null);
      if (from && from !== key) update((l) => ({ ...l, order: moveKey(ordered.map((c) => c.key), from, key) }));
    },
    onDragEnd: () => setDragging(null),
    style: { cursor: "grab", opacity: dragging === key ? 0.4 : 1 } as React.CSSProperties,
  });

  return {
    ordered, visible, fit: layout.fit, dragProps,
    toggle: (key: string) => update((l) => {
      const hidden = l.hidden.includes(key) ? l.hidden.filter((k) => k !== key) : [...l.hidden, key];
      return hidden.length >= columns.length ? l : { ...l, hidden }; // keep at least one column
    }),
    setFit: (fit: boolean) => update((l) => ({ ...l, fit })),
    reset: () => update(() => EMPTY_LAYOUT),
    customized: layout.order.length > 0 || layout.hidden.length > 0,
  };
}

const linkBtn: React.CSSProperties = { border: 0, background: "none", color: "#1f4fd1", cursor: "pointer", padding: 0, font: "inherit" };

/** Toolbar above a table: Columns menu (show/hide, reset), Fit to screen toggle, plus any extra controls. */
export function ColumnControls({ layout, children }: { layout: ReturnType<typeof useColumnLayout>; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const hiddenCount = layout.ordered.length - layout.visible.length;
  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", alignItems: "center", fontSize: 13, marginBottom: 6, flexWrap: "wrap" }}>
      <span style={{ color: "#98a2b3", marginRight: "auto" }}>Drag a column header to move it.</span>
      {children}
      <label style={{ display: "inline-flex", gap: 5, alignItems: "center", cursor: "pointer", color: "#344054" }} title="Shrink columns so the whole table fits the screen width">
        <input type="checkbox" checked={layout.fit} onChange={(e) => layout.setFit(e.target.checked)} /> Fit to screen
      </label>
      <div ref={box} style={{ position: "relative" }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ ...linkBtn, fontWeight: 600 }}>
          Columns{hiddenCount ? ` (${hiddenCount} hidden)` : ""} ▾
        </button>
        {open && (
          <div role="dialog" aria-label="Choose columns" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, background: "#fff", border: "1px solid #d0d5dd", borderRadius: 10, boxShadow: "0 8px 24px rgba(16,24,40,.12)", padding: 10, minWidth: 220, maxHeight: 360, overflowY: "auto" }}>
            {layout.ordered.map((c) => (
              <label key={c.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 2px", cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={layout.visible.includes(c)} onChange={() => layout.toggle(c.key)} /> {c.header}
              </label>
            ))}
            <div style={{ borderTop: "1px solid #f2f4f7", marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <button type="button" style={linkBtn} onClick={() => layout.reset()} disabled={!layout.customized}>Reset to default</button>
              <button type="button" style={linkBtn} onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Scroll box shared by report tables: as tall as the screen allows, so the header row stays pinned (sticky)
 * and the horizontal scrollbar is always visible at the bottom of the screen, not at the end of the table.
 */
export const scrollBox: React.CSSProperties = {
  overflow: "auto", maxHeight: "calc(100vh - 96px)", border: "1px solid #e4e7ec", borderRadius: 10, background: "#fff",
};

export const thBase: React.CSSProperties = {
  padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "#475467", textTransform: "uppercase", letterSpacing: 0.3,
  borderBottom: "1px solid #e4e7ec", background: "#f9fafb", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2,
};

/** Fit mode: fixed layout at 100% width, smaller type, headers may wrap; long text truncates with a tooltip. */
export const fitTable = (fit: boolean): React.CSSProperties =>
  fit ? { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, tableLayout: "fixed" } : { width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14 };

export const fitTh = (fit: boolean): React.CSSProperties => (fit ? { whiteSpace: "normal", padding: "6px 5px", fontSize: 11, letterSpacing: 0, verticalAlign: "bottom" } : {});
export const fitTd = (fit: boolean): React.CSSProperties => (fit ? { padding: "6px 5px", maxWidth: "none" } : {});

/** Relative widths for Fit mode (text columns get more room than numbers). */
export const fitWidth = (c: ColumnDef) => (c.type === "text" || c.type === "link" ? 2 : c.type === "flag" ? 1 : c.type === "money" ? 1.3 : 1);

/** Sticky footer cells (totals stay visible at the bottom of the scroll box). */
export const stickyFoot: React.CSSProperties = { position: "sticky", bottom: 0, background: "#f2f4f7", zIndex: 1, borderTop: "2px solid #d0d5dd" };
