import { describe, it, expect } from "vitest";
import { wouldExceed, subjectFor, DAILY_LOOKUP_LIMIT } from "./check";

describe("wouldExceed", () => {
  it("allows usage up to the limit", () => {
    expect(wouldExceed(49, 1, DAILY_LOOKUP_LIMIT)).toBe(false);
  });

  it("blocks the request that would cross the limit", () => {
    expect(wouldExceed(50, 1, DAILY_LOOKUP_LIMIT)).toBe(true);
  });

  it("blocks a single oversized request from zero", () => {
    expect(wouldExceed(0, 60, DAILY_LOOKUP_LIMIT)).toBe(true);
  });
});

describe("subjectFor", () => {
  it("prefers the user id when logged in", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4" });
    expect(subjectFor("abc", h)).toBe("user:abc");
  });

  it("falls back to the first x-forwarded-for IP for anonymous users", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    expect(subjectFor(null, h)).toBe("ip:9.9.9.9");
  });

  it("uses x-real-ip when x-forwarded-for is absent", () => {
    const h = new Headers({ "x-real-ip": "5.6.7.8" });
    expect(subjectFor(null, h)).toBe("ip:5.6.7.8");
  });

  it("returns ip:unknown when no client IP header is present", () => {
    expect(subjectFor(null, new Headers())).toBe("ip:unknown");
  });
});
