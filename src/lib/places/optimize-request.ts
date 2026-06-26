/** Build the POST /api/optimize body, omitting optional fields that aren't set. */
export function buildOptimizeBody(args: {
  placeIds: string[];
  numDays?: number | null;
  travelDate?: string | null;
  durationOverrides?: Record<string, number>;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { placeIds: args.placeIds };
  if (typeof args.numDays === "number" && args.numDays >= 1) body.numDays = args.numDays;
  if (args.travelDate) body.travelDate = args.travelDate;
  if (args.durationOverrides && Object.keys(args.durationOverrides).length > 0) {
    body.durationOverrides = args.durationOverrides;
  }
  return body;
}
