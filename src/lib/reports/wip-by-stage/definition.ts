import { draftDefinition } from "../draft";

export const definition = draftDefinition({
  id: "wip-by-stage",
  name: "WIP by Stage",
  description: "Work in progress, defined by a list of stages.",
  requestedBy: ["Design Floors"],
  configSchema: {
    wipStages: { type: "stringList", label: "Stages counted as WIP" },
  },
});
