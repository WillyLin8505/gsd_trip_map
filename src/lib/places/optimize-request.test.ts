import { describe, it, expect } from "vitest";
import { buildOptimizeBody } from "./optimize-request";

describe("buildOptimizeBody", () => {
  it("includes only placeIds when nothing else set", () => {
    expect(buildOptimizeBody({ placeIds: ["a"] })).toEqual({ placeIds: ["a"] });
  });
  it("includes numDays when a positive number", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], numDays: 3 })).toEqual({
      placeIds: ["a"], numDays: 3,
    });
  });
  it("omits numDays when null/0/undefined", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], numDays: 0 })).toEqual({ placeIds: ["a"] });
    expect(buildOptimizeBody({ placeIds: ["a"], numDays: null })).toEqual({ placeIds: ["a"] });
  });
  it("includes travelDate when a non-empty string", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], travelDate: "2026-07-01" })).toEqual({
      placeIds: ["a"], travelDate: "2026-07-01",
    });
  });
  it("omits travelDate when empty/null", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], travelDate: "" })).toEqual({ placeIds: ["a"] });
  });
  it("includes durationOverrides only when non-empty", () => {
    expect(buildOptimizeBody({ placeIds: ["a"], durationOverrides: {} })).toEqual({ placeIds: ["a"] });
    expect(buildOptimizeBody({ placeIds: ["a"], durationOverrides: { a: 90 } })).toEqual({
      placeIds: ["a"], durationOverrides: { a: 90 },
    });
  });
});
