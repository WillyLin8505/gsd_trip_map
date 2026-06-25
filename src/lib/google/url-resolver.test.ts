/**
 * Tests for resolveMapsUrl()
 *
 * Uses an injectable mock fetch so redirect-follow behavior is testable
 * without making real network requests. All assertions against request
 * bodies and URLs ensure we use the New Places API, never the legacy
 * /maps/api/place/ host.
 */
import { describe, it, expect } from "vitest";
import { resolveMapsUrl } from "./url-resolver";

const FAKE_API_KEY = "test-api-key-12345";

// A real-shaped Text Search response for coordinate-restricted lookups
const MOCK_TEXT_SEARCH_RESPONSE = {
  places: [
    {
      id: "ChIJresolved123",
      displayName: { text: "台北101", languageCode: "zh-TW" },
      formattedAddress: "台灣台北市信義區信義路五段7號",
      location: { latitude: 25.0339, longitude: 121.5645 },
    },
  ],
};

const MOCK_EMPTY_SEARCH_RESPONSE = {
  places: [],
};

// ---------------------------------------------------------------------------
// Test: full URL with /@lat,lng — resolve via coordinate-restricted Text Search
// ---------------------------------------------------------------------------
describe("resolveMapsUrl - full URL with coordinate pattern", () => {
  it("extracts /@lat,lng from a full Maps URL and issues a circle locationRestriction Text Search", async () => {
    const capturedRequests: Array<{ url: string; options?: RequestInit }> = [];

    const mockFetch = async (
      url: string | URL | Request,
      options?: RequestInit
    ): Promise<Response> => {
      const urlStr = url.toString();
      capturedRequests.push({ url: urlStr, options });

      // The full URL is not a redirect target — it returns itself.
      // The Places API call returns a place.
      if (urlStr.includes("places.googleapis.com")) {
        return {
          ok: true,
          json: async () => MOCK_TEXT_SEARCH_RESPONSE,
        } as Response;
      }

      // Should not be called for a full URL that is already expanded
      throw new Error(`Unexpected fetch call: ${urlStr}`);
    };

    const fullUrl =
      "https://www.google.com/maps/@25.0339,121.5645,17z/data=!3m1";
    const result = await resolveMapsUrl(fullUrl, FAKE_API_KEY, mockFetch);

    expect(result).not.toBeNull();
    expect(result!.placeId).toBe("ChIJresolved123");
    expect(result!.displayName).toBe("台北101");
    expect(result!.lat).toBeCloseTo(25.0339);
    expect(result!.lng).toBeCloseTo(121.5645);

    // Assert the Places API call included a circle locationRestriction
    const placesCall = capturedRequests.find((r) =>
      r.url.includes("places.googleapis.com")
    );
    expect(placesCall).toBeDefined();
    const body = JSON.parse(placesCall!.options?.body as string);
    expect(body.locationRestriction).toBeDefined();
    expect(body.locationRestriction.circle).toBeDefined();
    expect(body.locationRestriction.circle.radius).toBe(100);
    expect(body.locationRestriction.circle.center.latitude).toBeCloseTo(25.0339);
    expect(body.locationRestriction.circle.center.longitude).toBeCloseTo(121.5645);
  });

  it("does not call any legacy /maps/api/place/ host", async () => {
    const capturedUrls: string[] = [];

    const mockFetch = async (
      url: string | URL | Request,
      _options?: RequestInit
    ): Promise<Response> => {
      capturedUrls.push(url.toString());
      return {
        ok: true,
        json: async () => MOCK_TEXT_SEARCH_RESPONSE,
      } as Response;
    };

    const fullUrl = "https://www.google.com/maps/@25.0339,121.5645,17z";
    await resolveMapsUrl(fullUrl, FAKE_API_KEY, mockFetch);

    for (const url of capturedUrls) {
      expect(url).not.toContain("/maps/api/place/");
    }
  });
});

// ---------------------------------------------------------------------------
// Test: short maps.app.goo.gl URL — follow redirect then extract coordinates
// ---------------------------------------------------------------------------
describe("resolveMapsUrl - short maps.app.goo.gl URL", () => {
  it("follows the HTTP redirect (HEAD) to get the expanded URL then resolves coordinates", async () => {
    const capturedRequests: Array<{ url: string; options?: RequestInit }> = [];
    const expandedUrl =
      "https://www.google.com/maps/@25.0339,121.5645,17z/data=!3m1";

    const mockFetch = async (
      url: string | URL | Request,
      options?: RequestInit
    ): Promise<Response> => {
      const urlStr = url.toString();
      capturedRequests.push({ url: urlStr, options });

      if (urlStr.includes("maps.app.goo.gl")) {
        // Simulate a redirect response — fetch 'follow' resolves to expandedUrl
        // We simulate this by returning a response whose url is the expanded URL
        return {
          ok: true,
          url: expandedUrl,
          json: async () => ({}),
          text: async () => "",
        } as unknown as Response;
      }

      if (urlStr.includes("places.googleapis.com")) {
        return {
          ok: true,
          json: async () => MOCK_TEXT_SEARCH_RESPONSE,
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${urlStr}`);
    };

    const shortUrl = "https://maps.app.goo.gl/abc123";
    const result = await resolveMapsUrl(shortUrl, FAKE_API_KEY, mockFetch);

    expect(result).not.toBeNull();
    expect(result!.placeId).toBe("ChIJresolved123");

    // First call should be to the short URL
    expect(capturedRequests[0].url).toContain("maps.app.goo.gl");
    // Second call should be to the Places API
    const placesCall = capturedRequests.find((r) =>
      r.url.includes("places.googleapis.com")
    );
    expect(placesCall).toBeDefined();
  });

  it("falls back to GET when HEAD redirect yields no usable URL", async () => {
    const capturedMethods: string[] = [];
    const expandedUrl =
      "https://www.google.com/maps/@25.0478,121.5319,17z/data=!3m1";

    const mockFetch = async (
      url: string | URL | Request,
      options?: RequestInit
    ): Promise<Response> => {
      const urlStr = url.toString();
      const method = options?.method ?? "GET";

      if (urlStr.includes("maps.app.goo.gl")) {
        capturedMethods.push(method);
        if (method === "HEAD") {
          // HEAD returns no usable redirect info (url same as input)
          return {
            ok: true,
            url: urlStr, // same as input — not usable
            json: async () => ({}),
            text: async () => "",
          } as unknown as Response;
        }
        // GET returns the expanded URL
        return {
          ok: true,
          url: expandedUrl,
          json: async () => ({}),
          text: async () => "",
        } as unknown as Response;
      }

      if (urlStr.includes("places.googleapis.com")) {
        return {
          ok: true,
          json: async () => MOCK_TEXT_SEARCH_RESPONSE,
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${urlStr}`);
    };

    const shortUrl = "https://maps.app.goo.gl/xyz789";
    const result = await resolveMapsUrl(shortUrl, FAKE_API_KEY, mockFetch);

    expect(result).not.toBeNull();
    // HEAD was tried first, then GET
    expect(capturedMethods).toContain("HEAD");
    expect(capturedMethods).toContain("GET");
  });
});

// ---------------------------------------------------------------------------
// Test: URL with no extractable coordinates — returns null
// ---------------------------------------------------------------------------
describe("resolveMapsUrl - no coordinate pattern in URL", () => {
  it("returns null when no /@lat,lng pattern is in the expanded URL", async () => {
    const mockFetch = async (
      url: string | URL | Request,
      _options?: RequestInit
    ): Promise<Response> => {
      const urlStr = url.toString();
      if (urlStr.includes("maps.app.goo.gl") || urlStr.includes("google.com/maps")) {
        return {
          ok: true,
          url: "https://www.google.com/maps/place/SomePlaceWithoutCoords",
          json: async () => ({}),
          text: async () => "",
        } as unknown as Response;
      }
      // Should not reach Places API
      throw new Error(`Unexpected fetch call: ${urlStr}`);
    };

    const noCoordUrl = "https://maps.app.goo.gl/nocoord";
    const result = await resolveMapsUrl(noCoordUrl, FAKE_API_KEY, mockFetch);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test: Text Search response — empty places array returns null
// ---------------------------------------------------------------------------
describe("resolveMapsUrl - empty Places API response", () => {
  it("returns null when Places API returns no results for the coordinates", async () => {
    const mockFetch = async (
      url: string | URL | Request,
      _options?: RequestInit
    ): Promise<Response> => {
      const urlStr = url.toString();
      if (urlStr.includes("places.googleapis.com")) {
        return {
          ok: true,
          json: async () => MOCK_EMPTY_SEARCH_RESPONSE,
        } as Response;
      }
      // Full URL — no redirect needed
      return {
        ok: true,
        url: urlStr,
        json: async () => ({}),
        text: async () => "",
      } as unknown as Response;
    };

    const fullUrl = "https://www.google.com/maps/@25.0339,121.5645,17z";
    const result = await resolveMapsUrl(fullUrl, FAKE_API_KEY, mockFetch);

    expect(result).toBeNull();
  });
});
