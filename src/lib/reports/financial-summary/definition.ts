import { draftDefinition } from "../draft";

export const definition = draftDefinition({
  id: "financial-summary",
  name: "Financial Summary",
  description: "Invoiced revenue and tax by month, with committed cost from POs and WOs.",
  requestedBy: ["M&P Flooring"],
  configSchema: {},
  limitations: [
    { id: "payments", message: "Payments received will appear once payment data is available." },
    { id: "cogs", message: "COGS currently shows committed cost from POs and WOs (\"committed cost, not COGS\")." },
  ],
});
