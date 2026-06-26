import { describe, it, expect } from "vitest";
import { resolveRequestSchema } from "./resolve";

describe("resolveRequestSchema", () => {
  it("accepts inputs without a city (city optional)", () => {
    const r = resolveRequestSchema.safeParse({ inputs: ["清水寺"] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.city).toBeUndefined();
  });

  it("accepts inputs with a city", () => {
    const r = resolveRequestSchema.safeParse({ inputs: ["清水寺"], city: "京都" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.city).toBe("京都");
  });

  it("trims a provided city", () => {
    const r = resolveRequestSchema.safeParse({ inputs: ["x"], city: "  京都  " });
    expect(r.success && r.data.city).toBe("京都");
  });

  it("rejects an empty inputs array", () => {
    expect(resolveRequestSchema.safeParse({ inputs: [] }).success).toBe(false);
  });
});
