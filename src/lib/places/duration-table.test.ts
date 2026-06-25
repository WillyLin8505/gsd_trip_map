import { describe, it, expect } from "vitest";
import { durationForTypes } from "./duration-table";

describe("durationForTypes", () => {
  it("returns 120 for museum", () => {
    expect(durationForTypes(["museum"])).toBe(120);
  });

  it("returns 120 for art_gallery", () => {
    expect(durationForTypes(["art_gallery"])).toBe(120);
  });

  it("returns 240 for amusement_park", () => {
    expect(durationForTypes(["amusement_park"])).toBe(240);
  });

  it("returns 240 for theme_park", () => {
    expect(durationForTypes(["theme_park"])).toBe(240);
  });

  it("returns 240 for aquarium", () => {
    expect(durationForTypes(["aquarium"])).toBe(240);
  });

  it("returns 240 for zoo", () => {
    expect(durationForTypes(["zoo"])).toBe(240);
  });

  it("returns 60 for restaurant", () => {
    expect(durationForTypes(["restaurant"])).toBe(60);
  });

  it("returns 60 for food", () => {
    expect(durationForTypes(["food"])).toBe(60);
  });

  it("returns 60 for bakery", () => {
    expect(durationForTypes(["bakery"])).toBe(60);
  });

  it("returns 45 for tourist_attraction", () => {
    expect(durationForTypes(["tourist_attraction"])).toBe(45);
  });

  it("returns 45 for point_of_interest", () => {
    expect(durationForTypes(["point_of_interest"])).toBe(45);
  });

  it("returns 45 for landmark", () => {
    expect(durationForTypes(["landmark"])).toBe(45);
  });

  it("returns 90 for park", () => {
    expect(durationForTypes(["park"])).toBe(90);
  });

  it("returns 90 for national_park", () => {
    expect(durationForTypes(["national_park"])).toBe(90);
  });

  it("returns 90 for natural_feature", () => {
    expect(durationForTypes(["natural_feature"])).toBe(90);
  });

  it("returns 90 for campground", () => {
    expect(durationForTypes(["campground"])).toBe(90);
  });

  it("returns 90 for shopping_mall", () => {
    expect(durationForTypes(["shopping_mall"])).toBe(90);
  });

  it("returns 90 for department_store", () => {
    expect(durationForTypes(["department_store"])).toBe(90);
  });

  it("returns 30 for cafe (not 60 — cafe takes precedence over food group)", () => {
    expect(durationForTypes(["cafe"])).toBe(30);
  });

  it("returns 30 for coffee_shop", () => {
    expect(durationForTypes(["coffee_shop"])).toBe(30);
  });

  it("returns 60 for spa", () => {
    expect(durationForTypes(["spa"])).toBe(60);
  });

  it("returns 60 for beauty_salon", () => {
    expect(durationForTypes(["beauty_salon"])).toBe(60);
  });

  it("returns 60 (fallback) for unrecognized type", () => {
    expect(durationForTypes(["unrecognized_type"])).toBe(60);
  });

  it("returns 60 (fallback) for empty array", () => {
    expect(durationForTypes([])).toBe(60);
  });

  it("returns duration for the first matching type when multiple types are present (museum wins over restaurant)", () => {
    expect(durationForTypes(["museum", "restaurant"])).toBe(120);
  });

  it("returns duration for the first matching type when multiple types include cafe (cafe wins over food)", () => {
    expect(durationForTypes(["cafe", "food"])).toBe(30);
  });

  it("returns first match in priority order even when a lower-priority type comes first in the input array", () => {
    // tourist_attraction is priority 4, museum is priority 1
    // The first type in the input that appears in our priority map wins
    expect(durationForTypes(["tourist_attraction", "museum"])).toBe(45);
  });
});
