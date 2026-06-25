import { describe, it, expect, vi, beforeEach } from "vitest";
import { placeDetails, DETAILS_FIELD_MASK } from "./places-client";

const FAKE_API_KEY = "test-api-key-details";
const FAKE_PLACE_ID = "ChIJtest_details_456";

const MOCK_PLACE_WITH_HOURS = {
  id: FAKE_PLACE_ID,
  displayName: { text: "台北101", languageCode: "zh-TW" },
  formattedAddress: "台灣台北市信義區信義路五段7號",
  location: { latitude: 25.0339, longitude: 121.5645 },
  regularOpeningHours: {
    periods: [
      {
        open: { day: 0, hour: 9, minute: 0 },
        close: { day: 0, hour: 22, minute: 0 },
      },
      {
        open: { day: 1, hour: 9, minute: 0 },
        close: { day: 1, hour: 22, minute: 0 },
      },
    ],
    weekdayDescriptions: ["Monday: 9:00 AM – 10:00 PM"],
  },
  utcOffsetMinutes: 480,
  priceLevel: "PRICE_LEVEL_MODERATE",
  rating: 4.5,
  types: ["tourist_attraction", "point_of_interest"],
};

const MOCK_PLACE_WITHOUT_HOURS = {
  id: FAKE_PLACE_ID,
  displayName: { text: "某私人景點", languageCode: "zh-TW" },
  formattedAddress: "台灣某地",
  location: { latitude: 24.0, longitude: 120.0 },
  // regularOpeningHours is intentionally absent
  utcOffsetMinutes: 480,
  priceLevel: null,
  rating: 3.8,
  types: ["tourist_attraction"],
};

describe("placeDetails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends GET request to places.googleapis.com/v1 (not legacy /maps/api/place/)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url.toString()).toContain("places.googleapis.com/v1");
    expect(url.toString()).not.toContain("/maps/api/place/");
  });

  it("includes the placeId in the URL path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    const [url] = fetchSpy.mock.calls[0];
    expect(url.toString()).toContain(FAKE_PLACE_ID);
  });

  it("sends X-Goog-FieldMask including regularOpeningHours", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toBeDefined();
    expect(headers["X-Goog-FieldMask"]).toContain("regularOpeningHours");
  });

  it("sends X-Goog-FieldMask including utcOffsetMinutes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toContain("utcOffsetMinutes");
  });

  it("DETAILS_FIELD_MASK constant includes regularOpeningHours and utcOffsetMinutes", () => {
    expect(DETAILS_FIELD_MASK).toContain("regularOpeningHours");
    expect(DETAILS_FIELD_MASK).toContain("utcOffsetMinutes");
  });

  it("sends X-Goog-Api-Key header with the provided api key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe(FAKE_API_KEY);
  });

  it("maps result with hoursUnknown = false when regularOpeningHours is present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    const result = await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(result.hoursUnknown).toBe(false);
  });

  it("maps result with openingHours periods when regularOpeningHours is present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    const result = await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(result.openingHours).not.toBeNull();
    expect(Array.isArray(result.openingHours)).toBe(true);
    expect(result.openingHours).toHaveLength(2);
  });

  it("sets hoursUnknown = true when regularOpeningHours is absent (never defaults to always-open)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITHOUT_HOURS,
    } as Response);

    const result = await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(result.hoursUnknown).toBe(true);
  });

  it("sets openingHours = null when regularOpeningHours is absent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITHOUT_HOURS,
    } as Response);

    const result = await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(result.openingHours).toBeNull();
  });

  it("carries utcOffsetMinutes through from the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    const result = await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(result.utcOffsetMinutes).toBe(480);
  });

  it("carries utcOffsetMinutes through even when hours are absent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITHOUT_HOURS,
    } as Response);

    const result = await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(result.utcOffsetMinutes).toBe(480);
  });

  it("maps placeId, displayName, formattedAddress, lat, lng from the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    const result = await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(result.placeId).toBe(FAKE_PLACE_ID);
    expect(result.displayName).toBe("台北101");
    expect(result.formattedAddress).toBe("台灣台北市信義區信義路五段7號");
    expect(result.lat).toBeCloseTo(25.0339);
    expect(result.lng).toBeCloseTo(121.5645);
  });

  it("maps types array from the response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACE_WITH_HOURS,
    } as Response);

    const result = await placeDetails(FAKE_PLACE_ID, FAKE_API_KEY);

    expect(result.types).toEqual(["tourist_attraction", "point_of_interest"]);
  });

  it("throws when Google API returns an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "REQUEST_DENIED",
    } as unknown as Response);

    await expect(placeDetails(FAKE_PLACE_ID, FAKE_API_KEY)).rejects.toThrow(
      "403"
    );
  });
});
