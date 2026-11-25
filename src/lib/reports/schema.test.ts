import { describe, expect, it } from "vitest";
import { REPORTS, getReport } from "./registry";
import { configFromForm, defaultConfig, validateConfig } from "./schema";

const arAging = getReport("ar-aging")!;
const forecast = getReport("provincial-forecast")!;

describe("config schemas", () => {
  it("every catalog report has a valid default config and a unique id", () => {
    expect(new Set(REPORTS.map((r) => r.id)).size).toBe(REPORTS.length);
    for (const r of REPORTS) expect(validateConfig(r.configSchema, {}).ok).toBe(true);
  });

  it("ar-aging: defaults, types, min, unknown keys", () => {
    expect(defaultConfig(arAging.configSchema)).toEqual({ priorityThreshold: null, includeDeposits: true });
    expect(validateConfig(arAging.configSchema, { priorityThreshold: -1 }).ok).toBe(false);
    expect(validateConfig(arAging.configSchema, { includeDeposits: "no" }).ok).toBe(false);
    expect(validateConfig(arAging.configSchema, { priorityTreshold: 10 }).ok).toBe(false); // typo rejected
  });

  it("records: validates nested rows", () => {
    const ok = validateConfig(forecast.configSchema, { pipelines: [{ pipeline: "Commercial", awaitingPoStages: ["Won - awaiting PO"], forecastableStages: ["Proposal", " Proposal "] }] });
    expect(ok).toEqual({ ok: true, value: { pipelines: [{ pipeline: "Commercial", awaitingPoStages: ["Won - awaiting PO"], forecastableStages: ["Proposal"] }], productTypeTags: [] } });
    expect(validateConfig(forecast.configSchema, { pipelines: [{ awaitingPoStages: [] }] }).ok).toBe(false); // pipeline name required
  });

  it("parses the generated admin form", () => {
    const f = new FormData();
    f.set("cfg.priorityThreshold", "$12,500");
    // includeDeposits checkbox absent => false
    expect(configFromForm(arAging.configSchema, f)).toEqual({ priorityThreshold: 12500, includeDeposits: false });

    const g = new FormData();
    g.set("cfg.pipelines.0.pipeline", "Residential");
    g.set("cfg.pipelines.0.awaitingPoStages", "Awaiting PO\nSigned");
    g.set("cfg.pipelines.0.forecastableStages", "Bid, Proposal");
    g.set("cfg.pipelines.1.pipeline", ""); // blank trailing row dropped
    g.set("cfg.pipelines.1.awaitingPoStages", "");
    g.set("cfg.productTypeTags", "Tile\nStone");
    const v = validateConfig(forecast.configSchema, configFromForm(forecast.configSchema, g));
    expect(v).toEqual({ ok: true, value: { pipelines: [{ pipeline: "Residential", awaitingPoStages: ["Awaiting PO", "Signed"], forecastableStages: ["Bid", "Proposal"] }], productTypeTags: ["Tile", "Stone"] } });
  });
});
