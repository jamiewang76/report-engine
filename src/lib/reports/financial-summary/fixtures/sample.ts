import { describeFilters, parseFilters } from "../../filters";
import type { ReportResult } from "../../types";
import { build, filterOptions, type FsConfig } from "../build";
import { definition } from "../definition";
import { AS_OF, DATA, TZ } from "./data";

/** A complete Monthly Financial Summary ReportResult from anonymized fixtures (tests, sample .xlsx, page preview). */
export function sampleFinancialSummary(query: Record<string, string | string[]> = { year: "2026" }, config: FsConfig = {}): ReportResult {
  const ctx = { fiscalYearStartMonth: config.fiscalYearStartMonth ?? 1 };
  const filters = parseFilters(definition.filters, query, AS_OF, ctx);
  const body = build({ data: DATA, filters, config, asOf: AS_OF, grouping: definition.groupings[0], timeZone: TZ });
  return {
    ...body,
    header: {
      title: definition.name,
      description: definition.description,
      company: "Sample Flooring Co.",
      reporter: "Pat Example",
      reportDate: AS_OF,
      filters: [...describeFilters(definition.filters, filters, filterOptions(DATA, config), ctx), definition.headerNote!],
      dataAsOf: "2026-11-25T17:17:00Z",
      syncWarning: null,
      timeZone: TZ,
    },
  };
}
