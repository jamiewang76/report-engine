import { db } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { dataStatus, type DataStatus } from "@/lib/orgs";
import { dateInTimeZone } from "./format";
import { describeFilters, parseFilters } from "./filters";
import type { FilterOption, GroupingOption, ReportModule, ReportResult, ResolvedFilters } from "./types";

/** Org time zone fallback when the user's token has no `timezone` claim. */
export const DEFAULT_TIME_ZONE = "America/Los_Angeles";
const STALE_MS = 36 * 3600_000;

export type RunOutcome =
  | { state: "preparing"; sync: DataStatus } // nothing synced yet for this org: show "Preparing your data…"
  | {
      state: "ready";
      result: ReportResult;
      options: Record<string, FilterOption[]>;
      filters: ResolvedFilters;
      grouping: GroupingOption;
      today: string;
      sync: DataStatus;
    };

export function pickGrouping(report: ReportModule, requested: string | null | undefined): GroupingOption {
  return report.groupings.find((g) => g.id === requested) ?? report.groupings.find((g) => g.default) ?? report.groupings[0];
}

export function syncWarning(sync: DataStatus, now: Date): string | null {
  if (sync.lastError) return "The last data refresh failed, so this report may be out of date. Try Refresh, or contact your MeasureSquare account manager if it keeps failing.";
  if (sync.lastRefreshedAt && now.getTime() - Date.parse(sync.lastRefreshedAt) > STALE_MS) return "This data is more than 36 hours old. Click Refresh to update it.";
  return null;
}

async function companyAndReporter(s: Session) {
  const [{ data: org }, { data: user }] = await Promise.all([
    db().from("organizations").select("name").eq("org_id", s.orgId).maybeSingle(),
    s.name ? Promise.resolve({ data: null }) : db().from("org_users").select("name").eq("org_id", s.orgId).eq("user_id", s.userId).maybeSingle(),
  ]);
  return {
    company: (org?.name as string | undefined) ?? s.orgName ?? s.orgId,
    reporter: s.name ?? (user?.name as string | undefined) ?? s.email ?? "Unknown user",
  };
}

/**
 * Load (cache only, this org only) → build (pure) → add the header block. The same ReportResult feeds the web view,
 * the JSON API and the Excel export, so they always agree. Access must already have been checked by the caller.
 */
export async function runReport(opts: {
  report: ReportModule;
  session: Session;
  config: Record<string, unknown>;
  params: URLSearchParams | Record<string, string | string[] | undefined>;
  now?: Date;
}): Promise<RunOutcome> {
  const { report, session: s, config, params } = opts;
  if (!report.load || !report.build) throw new Error(`Report ${report.id} is not built`);
  const now = opts.now ?? new Date();
  const timeZone = s.timeZone ?? DEFAULT_TIME_ZONE;
  const today = dateInTimeZone(now, timeZone);

  const sync = await dataStatus(s.orgId);
  if (!sync.lastRefreshedAt) return { state: "preparing", sync };

  const filters = parseFilters(report.filters, params, today);
  const groupParam = params instanceof URLSearchParams ? params.get("group") : (params.group as string | undefined);
  const grouping = pickGrouping(report, groupParam);
  const [data, who] = await Promise.all([report.load(s.orgId, filters), companyAndReporter(s)]);
  const body = report.build({ data, filters, config, asOf: filters.asOf ?? today, grouping });
  const options = report.filterOptions?.(data) ?? {};

  return {
    state: "ready",
    today,
    filters,
    grouping,
    options,
    sync,
    result: {
      ...body,
      header: {
        title: report.name,
        description: report.description,
        company: who.company,
        reporter: who.reporter,
        reportDate: today,
        filters: describeFilters(report.filters, filters, options),
        dataAsOf: sync.lastRefreshedAt,
        syncWarning: syncWarning(sync, now),
        timeZone,
      },
    },
  };
}
