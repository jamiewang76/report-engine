import { draftDefinition } from "../draft";

export const definition = draftDefinition({
  id: "bid-timing",
  name: "Bid Timing",
  description: "Job created vs bid due vs takeoff completed vs proposal submitted.",
  requestedBy: ["Select Interiors"],
  configSchema: {
    takeoffCompletedField: { type: "string", label: "Custom field: takeoff completed", optional: true, help: "Job custom field holding the takeoff-completed date." },
    proposalSubmittedField: { type: "string", label: "Custom field: proposal submitted", optional: true, help: "Job custom field holding the proposal-submitted date." },
  },
  overrides: [
    { section: "§1 Summary", reason: "Tracking list; the estimator table carries the totals (standard §11)." },
    { section: "§1 Detail view", reason: "The main table is already one row per job (standard §11)." },
  ],
});
