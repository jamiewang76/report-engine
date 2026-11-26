import { alignOf, EMPTY, formatDate, formatDateTime, formatValue } from "@/lib/reports/format";
import { DATE_PRESETS, filtersToQuery, hasActiveFilters } from "@/lib/reports/filters";
import { sortRows } from "@/lib/reports/grouping";
import type { ColumnDef, FilterOption, GroupingOption, MatrixResult, ReportDefinition, ReportResult, ResolvedFilters } from "@/lib/reports/types";
import { CellContent, tdStyle } from "./Cell";
import { scrollBox, stickyFoot, thBase } from "./columnLayout";
import DetailTable from "./DetailTable";
import GroupedTable from "./GroupedTable";
import MultiSelect from "./MultiSelect";

/**
 * The standard report page body (docs/report-standard.md §1), identical for every report:
 * Header · Controls · Summary · Main view · Detail view · Notes, plus partial-data banner and empty state.
 * Pure presentational server component: everything comes in via props (also used to render previews from fixtures).
 */

export type ViewState = {
  sort: { key: string; dir: "asc" | "desc" } | null;
  tab: "main" | "detail";
  page: number;
};

const DETAIL_PAGE_SIZE = 500;
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e4e7ec", borderRadius: 12, padding: 16 };
const muted: React.CSSProperties = { color: "#667085", fontSize: 13 };
const h2: React.CSSProperties = { fontSize: 16, margin: "28px 0 10px" };
const btn = (primary = false): React.CSSProperties => ({
  padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", textDecoration: "none", display: "inline-block",
  border: `1px solid ${primary ? "#1f4fd1" : "#d0d5dd"}`, background: primary ? "#1f4fd1" : "#fff", color: primary ? "#fff" : "#1a1a1a",
});

export default function ReportView({ def, result: r, options, filters, grouping, today, view, refresh, expandedGroups }: {
  def: ReportDefinition;
  result: ReportResult;
  options: Record<string, FilterOption[]>;
  filters: ResolvedFilters;
  grouping: GroupingOption;
  today: string;
  view: ViewState;
  refresh: React.ReactNode; // RefreshButton on the live page; static placeholder in previews
  expandedGroups?: string[]; // group keys open on first render (previews)
}) {
  const base = `/reports/${def.id}`;
  const filterQuery = filtersToQuery(def.filters, filters, today);
  const href = (over: Record<string, string | null>) => {
    const q = new URLSearchParams(filterQuery);
    if (grouping.id !== def.groupings.find((g) => g.default)?.id) q.set("group", grouping.id);
    if (view.sort) { q.set("sort", view.sort.key); q.set("dir", view.sort.dir); }
    if (view.tab === "detail") q.set("tab", "detail");
    for (const [k, v] of Object.entries(over)) { if (v == null) q.delete(k); else q.set(k, v); }
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const sortLink = (key: string, defaultDir: "asc" | "desc") => {
    const dir = view.sort?.key === key ? (view.sort.dir === "asc" ? "desc" : "asc") : defaultDir;
    return href({ sort: key, dir, page: null });
  };
  const excelHref = (() => {
    const q = new URLSearchParams(filterQuery);
    if (grouping.id !== def.groupings.find((g) => g.default)?.id) q.set("group", grouping.id);
    q.set("format", "xlsx");
    return `/api/reports/${def.id}?${q.toString()}`;
  })();
  const active = hasActiveFilters(def.filters, filters, today);
  const empty = r.rowCount === 0;
  const noun = r.rowCount === 1 ? def.rowNoun.one : def.rowNoun.many;
  const hasSummary = !!r.kpis?.length;
  const hasDetail = !!r.detail;

  return (
    <div style={{ minWidth: 0, maxWidth: "100%" }}>
      {/* 1. Header */}
      <section style={{ ...card, display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 24, margin: 0 }}>{r.header.title}</h1>
            <div style={{ color: "#475467", marginTop: 2 }}>{r.header.description}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13, color: "#475467", lineHeight: 1.6 }}>
            <div><strong style={{ color: "#1a1a1a" }}>{r.header.company}</strong></div>
            <div>Reporter: {r.header.reporter}</div>
            <div>Report date: {formatDate(r.header.reportDate)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "#475467", borderTop: "1px solid #f2f4f7", paddingTop: 8, marginTop: 4 }}>
          <span>Data as of <strong style={{ color: "#1a1a1a" }}>{r.header.dataAsOf ? formatDateTime(r.header.dataAsOf, r.header.timeZone) : "not yet synced"}</strong></span>
          {refresh}
          <span style={{ marginLeft: "auto" }}>Filters: {r.header.filters.join(" · ")}</span>
        </div>
      </section>

      {r.header.syncWarning && (
        <div role="alert" style={{ marginTop: 12, background: "#fef3f2", border: "1px solid #fecdca", color: "#b42318", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>{r.header.syncWarning}</div>
      )}
      {r.limitations.length > 0 && (
        <div style={{ marginTop: 12, background: "#fffaeb", border: "1px solid #fedf89", color: "#93370d", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>
          {r.limitations.map((l) => <div key={l.id}>{l.message}</div>)}
        </div>
      )}

      {/* 2. Controls */}
      <form method="get" action={base} style={{ ...card, marginTop: 12, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        {def.filters.map((f) => {
          if (f.kind === "asOf") {
            return (
              <label key={f.key} style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span style={{ color: "#475467" }}>{f.label}</span>
                <input type="date" name={f.key} defaultValue={filters.asOf ?? today} style={{ font: "inherit", fontSize: 13, padding: "5px 8px", border: "1px solid #d0d5dd", borderRadius: 8 }} />
              </label>
            );
          }
          if (f.kind === "dateRange") {
            const v = filters.ranges[f.key];
            return (
              <div key={f.key} style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span style={{ color: "#475467" }}>{f.label}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <select name={f.key} defaultValue={v.preset} style={{ font: "inherit", fontSize: 13, padding: "5px 8px", border: "1px solid #d0d5dd", borderRadius: 8 }}>
                    {DATE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <input type="date" name={`${f.key}From`} defaultValue={v.from} aria-label="From" style={{ font: "inherit", fontSize: 13, padding: "5px 6px", border: "1px solid #d0d5dd", borderRadius: 8 }} />
                  <input type="date" name={`${f.key}To`} defaultValue={v.to} aria-label="To" style={{ font: "inherit", fontSize: 13, padding: "5px 6px", border: "1px solid #d0d5dd", borderRadius: 8 }} />
                </div>
              </div>
            );
          }
          return <MultiSelect key={f.key} name={f.key} label={f.label} allLabel={f.allLabel} options={options[f.key] ?? []} selected={filters.multi[f.key] ?? []} searchable={f.searchable} />;
        })}
        {grouping.id !== def.groupings.find((g) => g.default)?.id && <input type="hidden" name="group" value={grouping.id} />}
        <button type="submit" style={btn(true)}>Apply</button>
        {active && <a href={base} style={{ ...btn(), border: 0, color: "#1f4fd1", padding: "6px 4px" }}>Clear filters</a>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          {def.groupings.length > 1 && (
            <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span style={{ color: "#475467" }}>Group</span>
              <div style={{ display: "inline-flex", border: "1px solid #d0d5dd", borderRadius: 8, overflow: "hidden" }}>
                {def.groupings.map((g) => (
                  <a key={g.id} href={href({ group: g.default ? null : g.id, sort: null, dir: null, page: null })} aria-current={g.id === grouping.id}
                    style={{ padding: "6px 12px", fontSize: 13, textDecoration: "none", background: g.id === grouping.id ? "#eef4ff" : "#fff", color: g.id === grouping.id ? "#1f4fd1" : "#344054", fontWeight: g.id === grouping.id ? 600 : 400 }}>
                    {g.label}
                  </a>
                ))}
              </div>
            </div>
          )}
          <a href={excelHref} style={btn()}>Download Excel</a>
        </div>
      </form>

      {empty ? (
        <div style={{ ...card, marginTop: 12, padding: 32, textAlign: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>No records match these filters.</div>
          <div style={{ ...muted, marginTop: 6 }}>{r.header.filters.join(" · ")}</div>
          {active && <a href={base} style={{ display: "inline-block", marginTop: 10, color: "#1f4fd1" }}>Clear filters</a>}
        </div>
      ) : (
        <>
          {/* 3. Summary */}
          {hasSummary && (
            <section style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))`, gap: 12, marginTop: 12 }}>
              {r.kpis!.map((k) => {
                const f = formatValue(k.type, k.value, { emptyText: EMPTY });
                return (
                  <div key={k.key} style={card} title={k.description}>
                    <div style={muted}>{k.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums", color: f.negative ? "#b42318" : "#101828" }}>{f.text}</div>
                  </div>
                );
              })}
            </section>
          )}

          {/* 4/5. Main view + Detail (tabs) */}
          {hasDetail && (
            <nav style={{ display: "flex", gap: 4, marginTop: 20, borderBottom: "1px solid #e4e7ec" }}>
              {(["main", "detail"] as const).map((t) => (
                <a key={t} href={href({ tab: t === "detail" ? "detail" : null, sort: null, dir: null, page: null })}
                  style={{ padding: "8px 14px", fontSize: 14, textDecoration: "none", color: view.tab === t ? "#1f4fd1" : "#475467", borderBottom: `2px solid ${view.tab === t ? "#1f4fd1" : "transparent"}`, fontWeight: view.tab === t ? 600 : 400, marginBottom: -1 }}>
                  {t === "main" ? (r.main.kind === "grouped" ? `${grouping.label.replace(/^By /, "By ")}` : "Summary table") : `Detail (${r.rowCount.toLocaleString()} ${noun})`}
                </a>
              ))}
            </nav>
          )}
          <section style={{ marginTop: 12 }}>
            {view.tab === "detail" && r.detail ? (
              <DetailSection r={r} def={def} view={view} sortLink={sortLink} pageHref={(p) => href({ page: p > 1 ? String(p) : null })} />
            ) : r.main.kind === "grouped" ? (
              <GroupedTable
                main={r.main}
                storageKey={`report-layout:${def.id}:main:${grouping.id}`}
                sort={view.sort && r.main.columns.some((c) => c.key === view.sort!.key) ? view.sort : null}
                sortHref={Object.fromEntries(r.main.columns.map((c) => [c.key, sortLink(c.key, "desc")]))}
                defaultExpanded={expandedGroups}
              />
            ) : (
              <MatrixTable m={r.main} />
            )}
            <div style={{ ...muted, marginTop: 8 }}>{r.rowCount.toLocaleString()} {noun}</div>
          </section>
        </>
      )}

      {/* 6. Notes & definitions */}
      <section>
        <h2 style={h2}>Notes &amp; definitions</h2>
        <div style={{ ...card, fontSize: 14, color: "#344054", display: "grid", gap: 6 }}>
          {r.notes.map((n) => <div key={n}>{n}</div>)}
          {r.limitations.map((l) => <div key={l.id}><strong>Limitation:</strong> {l.message}</div>)}
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: "pointer", color: "#1f4fd1" }}>Column definitions</summary>
            <dl style={{ display: "grid", gridTemplateColumns: "minmax(140px, max-content) 1fr", gap: "4px 16px", margin: "10px 0 0" }}>
              {[...(r.kpis ?? []).map((k) => [k.label, k.description] as const), ...uniqueCols(r).map((c) => [c.header, c.description ?? ""] as const)].map(([a, b]) => (
                <div key={a} style={{ display: "contents" }}><dt style={{ fontWeight: 600 }}>{a}</dt><dd style={{ margin: 0 }}>{b}</dd></div>
              ))}
            </dl>
          </details>
          <div style={{ ...muted, marginTop: 4 }}>Report version {r.meta.version}</div>
        </div>
      </section>
    </div>
  );
}

function uniqueCols(r: ReportResult): ColumnDef[] {
  const m = new Map<string, ColumnDef>();
  if (r.main.kind === "grouped") { m.set(r.main.leafColumn.key, r.main.leafColumn); r.main.columns.forEach((c) => m.set(c.key, c)); }
  r.detail?.columns.forEach((c) => m.set(c.key, c));
  return [...m.values()];
}

const th = thBase;

function DetailSection({ r, def, view, sortLink, pageHref }: { r: ReportResult; def: ReportDefinition; view: ViewState; sortLink: (k: string, d: "asc" | "desc") => string; pageHref: (p: number) => string }) {
  const d = r.detail!;
  const valid = view.sort && d.columns.some((c) => c.key === view.sort!.key) ? view.sort : null;
  const rows = valid ? sortRows(d.rows, valid) : d.rows;
  const pages = Math.max(1, Math.ceil(rows.length / DETAIL_PAGE_SIZE));
  const page = Math.min(Math.max(1, view.page), pages);
  const slice = rows.slice((page - 1) * DETAIL_PAGE_SIZE, page * DETAIL_PAGE_SIZE);
  return (
    <>
      <DetailTable
        storageKey={`report-layout:${def.id}:detail`}
        columns={d.columns}
        rows={slice}
        totals={d.totals}
        sort={valid}
        sortHref={Object.fromEntries(d.columns.map((c) => [c.key, sortLink(c.key, c.type === "text" || c.type === "link" ? "asc" : "desc")]))}
      />
      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8, fontSize: 13 }}>
          {page > 1 && <a href={pageHref(page - 1)} style={btn()}>← Previous</a>}
          <span style={{ alignSelf: "center", color: "#667085" }}>Page {page} of {pages} (Excel includes all rows)</span>
          {page < pages && <a href={pageHref(page + 1)} style={btn()}>Next →</a>}
        </div>
      )}
    </>
  );
}

function MatrixTable({ m }: { m: MatrixResult }) {
  const valueCol: ColumnDef = { key: "v", header: "", type: m.valueType };
  const cell = (v: number | null) => <CellContent col={valueCol} row={{ v }} empty={EMPTY} />;
  return (
    <div style={scrollBox}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>{m.rowLabel}</th>
            {m.columnKeys.map((c) => <th key={c.key} style={{ ...th, textAlign: "right" }}>{c.label}</th>)}
            <th style={{ ...th, textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {m.rows.map((row) => (
            <tr key={row.key}>
              <td style={tdStyle({ key: "l", header: "", type: "text" })}>{row.label}</td>
              {m.columnKeys.map((c) => <td key={c.key} style={tdStyle(valueCol)}>{cell(row.cells[c.key])}</td>)}
              <td style={{ ...tdStyle(valueCol), fontWeight: 600 }}>{cell(row.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: "#f2f4f7" }}>
            <td style={{ padding: "9px 10px", ...stickyFoot }}>Total</td>
            {m.columnKeys.map((c) => <td key={c.key} style={{ ...tdStyle(valueCol), ...stickyFoot }}>{cell(m.columnTotals[c.key])}</td>)}
            <td style={{ ...tdStyle(valueCol), ...stickyFoot }}>{cell(m.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
