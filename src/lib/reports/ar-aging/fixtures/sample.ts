import { describeFilters, parseFilters } from "../../filters";
import type { ReportResult } from "../../types";
import { build, filterOptions } from "../build";
import { definition } from "../definition";
import { AS_OF, DATA } from "./invoices";

/** A complete A/R Aging ReportResult from anonymized fixtures (for tests, the sample .xlsx and the page preview). */
export function sampleArAging(query: Record<string, string | string[]> = {}, groupingId = "customer"): ReportResult {
  const filters = parseFilters(definition.filters, query, AS_OF);
  const grouping = definition.groupings.find((g) => g.id === groupingId)!;
  const body = build({ data: DATA, filters, config: { priorityThreshold: 25000, includeDeposits: true }, asOf: filters.asOf!, grouping, timeZone: "America/Los_Angeles" });
  return {
    ...body,
    header: {
      title: definition.name,
      description: definition.description,
      company: "Sample Flooring Co.",
      reporter: "Pat Example",
      reportDate: AS_OF,
      filters: describeFilters(definition.filters, filters, filterOptions(DATA)),
      dataAsOf: "2026-11-25T17:17:00Z",
      syncWarning: null,
      timeZone: "America/Los_Angeles",
    },
  };
}
