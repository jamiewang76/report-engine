import type { ReportModule } from "../types";
import { build, filterOptions, type FsData } from "./build";
import { load } from "./data";
import { definition } from "./definition";

export const financialSummary: ReportModule<FsData> = {
  ...definition,
  load,
  filterOptions,
  build: build as ReportModule<FsData>["build"],
};
