import type { ReportModule } from "./types";
import { arAging } from "./ar-aging";
import { definition as bidTiming } from "./bid-timing/definition";
import { definition as financialSummary } from "./financial-summary/definition";
import { definition as provincialForecast } from "./provincial-forecast/definition";
import { definition as wipByStage } from "./wip-by-stage/definition";

/**
 * Report catalog: one entry per folder under src/lib/reports/<report-id>/ (docs/report-standard.md §2).
 * Only "live" reports can be assigned to customers; "draft" reports appear only in the admin console;
 * "retired" reports are hidden and their assignments stop working.
 */
export const REPORTS: readonly ReportModule<any>[] = [arAging, bidTiming, financialSummary, provincialForecast, wipByStage];

export const getReport = (id: string): ReportModule<any> | undefined => REPORTS.find((r) => r.id === id);

export type { ReportModule, ReportStatus } from "./types";
