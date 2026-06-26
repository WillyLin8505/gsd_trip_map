import { describe, it, expect } from "vitest";
import { buildInferCityPrompt, parseInferredCity } from "./infer-city";

describe("buildInferCityPrompt", () => {
  it("includes every input place name", () => {
    const p = buildInferCityPrompt(["清水寺", "金閣寺"]);
    expect(p).toContain("清水寺");
    expect(p).toContain("金閣寺");
  });
  it("instructs replying NONE when unknown", () => {
    expect(buildInferCityPrompt(["x"])).toContain("NONE");
  });
});

describe("parseInferredCity", () => {
  it("returns the trimmed city name", () => {
    expect(parseInferredCity(" 京都 ")).toBe("京都");
  });
  it("takes only the first line", () => {
    expect(parseInferredCity("京都\n(Kyoto)")).toBe("京都");
  });
  it("strips surrounding quotes", () => {
    expect(parseInferredCity('"京都"')).toBe("京都");
  });
  it("returns null for NONE (any case)", () => {
    expect(parseInferredCity("none")).toBeNull();
    expect(parseInferredCity("NONE")).toBeNull();
  });
  it("returns null for empty reply", () => {
    expect(parseInferredCity("   ")).toBeNull();
  });
});
