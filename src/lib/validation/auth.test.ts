import { describe, it, expect } from "vitest";
import { credentialsSchema } from "./auth";

describe("credentialsSchema", () => {
  it("accepts a valid email + password", () => {
    const result = credentialsSchema.safeParse({
      email: "user@example.com",
      password: "hunter2pass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = credentialsSchema.safeParse({
      email: "not-an-email",
      password: "hunter2pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = credentialsSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing password", () => {
    const result = credentialsSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace from email", () => {
    const result = credentialsSchema.safeParse({
      email: "  user@example.com  ",
      password: "hunter2pass",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });
});
