import { describe, it, expect } from "vitest";
import { optimizeRequestSchema } from "./optimize";

describe("optimizeRequestSchema — durationOverrides (INPUT-05)", () => {
  it("accepts a request without overrides", () => {
    const r = optimizeRequestSchema.safeParse({ placeIds: ["ChIJa"] });
    expect(r.success).toBe(true);
  });

  it("accepts valid per-place duration overrides", () => {
    const r = optimizeRequestSchema.safeParse({
      placeIds: ["ChIJa", "ChIJb"],
      durationOverrides: { ChIJa: 90, ChIJb: 120 },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.durationOverrides?.ChIJa).toBe(90);
  });

  it("rejects an override below the 15-minute floor", () => {
    const r = optimizeRequestSchema.safeParse({
      placeIds: ["ChIJa"],
      durationOverrides: { ChIJa: 5 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an override above the 12-hour ceiling", () => {
    const r = optimizeRequestSchema.safeParse({
      placeIds: ["ChIJa"],
      durationOverrides: { ChIJa: 9999 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer override", () => {
    const r = optimizeRequestSchema.safeParse({
      placeIds: ["ChIJa"],
      durationOverrides: { ChIJa: 30.5 },
    });
    expect(r.success).toBe(false);
  });
});
