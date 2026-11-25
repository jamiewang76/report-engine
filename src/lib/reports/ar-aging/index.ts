import type { ReportModule } from "../types";
import { build, filterOptions, type ArData } from "./build";
import { load } from "./data";
import { definition } from "./definition";

export const arAging: ReportModule<ArData> = {
  ...definition,
  load,
  filterOptions,
  build: build as ReportModule<ArData>["build"],
};
