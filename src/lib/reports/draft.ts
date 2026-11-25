import type { ReportDefinition } from "./types";

/**
 * Metadata-only definition for a report that is not built yet (status "draft": visible in the admin console only,
 * never assignable). Its per-org configSchema is captured now so Super Admins can see what it will need.
 * When the report is built, replace this with a full definition.ts + build.ts + data.ts per the standard.
 */
export const draftDefinition = (d: Pick<ReportDefinition, "id" | "name" | "description" | "requestedBy" | "configSchema"> & Partial<ReportDefinition>): ReportDefinition => ({
  status: "draft",
  version: "0.0.0",
  dataSources: { tables: [] },
  columns: [],
  filters: [],
  views: { main: { kind: "grouped", leafKey: "", columns: [], defaultSort: { key: "", dir: "asc" } } },
  groupings: [],
  notes: [],
  limitations: [],
  overrides: [],
  rowNoun: { one: "row", many: "rows" },
  ...d,
});
