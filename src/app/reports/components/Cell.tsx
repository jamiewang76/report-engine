import { alignOf, EMPTY, formatCell } from "@/lib/reports/format";
import type { ColumnDef, Row, Tone } from "@/lib/reports/types";

const TONES: Record<Tone, [string, string]> = {
  red: ["#fef3f2", "#b42318"], amber: ["#fffaeb", "#b54708"], green: ["#ecfdf3", "#067647"], gray: ["#f2f4f7", "#475467"], blue: ["#eef4ff", "#1f4fd1"],
};

export const tdStyle = (c: ColumnDef): React.CSSProperties => ({
  padding: "7px 10px", borderBottom: "1px solid #f0f0f0", textAlign: alignOf(c), whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums", maxWidth: c.type === "text" || c.type === "link" ? 260 : undefined,
  overflow: "hidden", textOverflow: "ellipsis",
});

/** One formatted cell: money/percent/dates per column type, negatives red, flags as pills, links open the CRM. */
export function CellContent({ col, row, empty = "" }: { col: ColumnDef; row: Row; empty?: string }) {
  const v = row[col.key];
  const f = formatCell(col, v, empty);
  if (f.empty) return <span style={{ color: "#98a2b3" }}>{f.text}</span>;
  if (col.type === "flag") {
    const tone = col.flags?.find((x) => x.value === v)?.tone ?? "gray";
    return <span style={{ background: TONES[tone][0], color: TONES[tone][1], borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 600 }}>{f.text}</span>;
  }
  if (col.type === "link") {
    const href = col.hrefKey ? (row[col.hrefKey] as string | null | undefined) : null;
    return href ? <a href={href} target="_blank" rel="noopener noreferrer" title={`${f.text} (opens MeasureSquare CRM)`} style={{ color: "#1f4fd1" }}>{f.text}</a> : <span title={f.text}>{f.text}</span>;
  }
  return <span title={col.type === "text" ? f.text : undefined} style={f.negative ? { color: "#b42318" } : undefined}>{f.text}</span>;
}

export const EMPTY_CELL = EMPTY;
