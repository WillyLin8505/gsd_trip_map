import { describe, it, expect, vi, beforeEach } from "vitest";
import { textSearch, ESSENTIALS_FIELD_MASK } from "./places-client";

const FAKE_API_KEY = "test-api-key-12345";

const MOCK_PLACES_RESPONSE = {
  places: [
    {
      id: "ChIJtest123",
      displayName: { text: "台北101", languageCode: "zh-TW" },
      formattedAddress: "台灣台北市信義區信義路五段7號",
      location: { latitude: 25.0339, longitude: 121.5645 },
    },
  ],
};

const MOCK_EMPTY_RESPONSE = {
  places: [],
};

const MOCK_NO_PLACES_KEY_RESPONSE = {};

describe("textSearch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends request to places.googleapis.com/v1 (not legacy /maps/api/place/)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACES_RESPONSE,
    } as Response);

    await textSearch("台北101", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url.toString()).toContain("places.googleapis.com/v1");
    expect(url.toString()).not.toContain("/maps/api/place/");
  });

  it("sends X-Goog-FieldMask header with exactly the Essentials field set", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACES_RESPONSE,
    } as Response);

    await textSearch("台北101", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toBe(ESSENTIALS_FIELD_MASK);
    expect(ESSENTIALS_FIELD_MASK).toContain("id");
    expect(ESSENTIALS_FIELD_MASK).toContain("displayName");
    expect(ESSENTIALS_FIELD_MASK).toContain("formattedAddress");
    expect(ESSENTIALS_FIELD_MASK).toContain("location");
  });

  it("includes languageCode zh-TW in the request body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACES_RESPONSE,
    } as Response);

    await textSearch("台北101", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.languageCode).toBe("zh-TW");
  });

  it("includes locationBias in the request body (city-based or explicit)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACES_RESPONSE,
    } as Response);

    await textSearch("台北101", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.locationBias).toBeDefined();
  });

  it("sends explicit locationBias when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACES_RESPONSE,
    } as Response);

    const explicitBias = {
      circle: {
        center: { latitude: 25.0339, longitude: 121.5645 },
        radius: 50000,
      },
    };

    await textSearch("台北101", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
      locationBias: explicitBias,
    });

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.locationBias).toEqual(explicitBias);
  });

  it("maps response from places[0] (new API), NOT from results[] (legacy)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACES_RESPONSE,
    } as Response);

    const result = await textSearch("台北101", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    expect(result).not.toBeNull();
    expect(result!.placeId).toBe("ChIJtest123");
    expect(result!.displayName).toBe("台北101");
    expect(result!.formattedAddress).toBe("台灣台北市信義區信義路五段7號");
    expect(result!.lat).toBeCloseTo(25.0339);
    expect(result!.lng).toBeCloseTo(121.5645);
  });

  it("returns null when places array is empty (NOT_FOUND)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_EMPTY_RESPONSE,
    } as Response);

    const result = await textSearch("不存在的地方XYZ999", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    expect(result).toBeNull();
  });

  it("returns null when response has no places key (NOT_FOUND)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_NO_PLACES_KEY_RESPONSE,
    } as Response);

    const result = await textSearch("不存在的地方XYZ999", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    expect(result).toBeNull();
  });

  it("sends X-Goog-Api-Key header with the provided api key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACES_RESPONSE,
    } as Response);

    await textSearch("台北101", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe(FAKE_API_KEY);
  });

  it("sends textQuery in the request body matching the input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => MOCK_PLACES_RESPONSE,
    } as Response);

    await textSearch("台北101", {
      city: "台北市",
      apiKey: FAKE_API_KEY,
    });

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.textQuery).toBe("台北101");
  });
});
