import { draftDefinition } from "../draft";

export const definition = draftDefinition({
  id: "provincial-forecast",
  name: "Sales Forecast",
  description: "Pipeline awaiting PO (incl. probability-weighted) and forecast by expected invoice month, split by product type.",
  requestedBy: ["Provincial Tiles"],
  configSchema: {
    pipelines: {
      type: "records",
      label: "Pipelines",
      help: "One row per pipeline.",
      fields: {
        pipeline: { type: "string", label: "Pipeline name" },
        awaitingPoStages: { type: "stringList", label: "\"Awaiting PO\" stages" },
        forecastableStages: { type: "stringList", label: "Forecastable stages" },
      },
    },
    productTypeTags: { type: "stringList", label: "Product-type tags", help: "Job labels used to split the forecast by product type." },
  },
});
