import { describe, it, expect } from "vitest";
import { saveItinerarySchema, updateItinerarySchema } from "./itinerary";

const validPayload = {
  title: "東京三日遊",
  totalDays: 3,
  city: "東京",
  days: [
    {
      dayNumber: 1,
      visits: [
        {
          placeId: "ChIJabc",
          orderIndex: 0,
          scheduledStart: "09:00",
          scheduledEnd: "11:00",
          travelFromPrev: 0,
        },
      ],
    },
  ],
};

describe("saveItinerarySchema", () => {
  it("accepts a well-formed itinerary payload", () => {
    expect(saveItinerarySchema.safeParse(validPayload).success).toBe(true);
  });

  it("rejects an empty title", () => {
    const r = saveItinerarySchema.safeParse({ ...validPayload, title: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects zero days", () => {
    const r = saveItinerarySchema.safeParse({ ...validPayload, days: [] });
    expect(r.success).toBe(false);
  });

  it("rejects totalDays below 1", () => {
    const r = saveItinerarySchema.safeParse({ ...validPayload, totalDays: 0 });
    expect(r.success).toBe(false);
  });

  it("allows null scheduled times (unscheduled visit)", () => {
    const r = saveItinerarySchema.safeParse({
      ...validPayload,
      days: [
        {
          dayNumber: 1,
          visits: [{ placeId: "ChIJabc", orderIndex: 0, scheduledStart: null, scheduledEnd: null }],
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("updateItinerarySchema", () => {
  it("accepts an isPublic boolean", () => {
    expect(updateItinerarySchema.safeParse({ isPublic: true }).success).toBe(true);
  });

  it("rejects a non-boolean isPublic", () => {
    expect(updateItinerarySchema.safeParse({ isPublic: "yes" }).success).toBe(false);
  });
});
