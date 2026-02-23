import { describe, expect, it } from "vitest";
import { truncateResponse } from "../src/truncate.js";

describe("truncateResponse", () => {
  it("returns short strings unchanged", () => {
    expect(truncateResponse("hello")).toBe("hello");
  });

  it("stringifies objects", () => {
    expect(truncateResponse({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it("truncates strings exceeding the token limit", () => {
    const long = "x".repeat(100_001);
    const result = truncateResponse(long, 100);
    expect(result).toContain("--- TRUNCATED ---");
    expect(result.length).toBeLessThan(long.length);
  });

  it("includes estimated token count in truncation message", () => {
    const long = "y".repeat(8000);
    const result = truncateResponse(long, 1000); // 1000 tokens = 4000 chars
    expect(result).toContain("TRUNCATED");
    expect(result).toContain("2,000"); // ~8000/4 = 2000 tokens
    expect(result).toContain("limit: 1,000");
  });

  it("does not truncate at exact limit", () => {
    const exact = "z".repeat(400); // 100 tokens * 4 chars
    const result = truncateResponse(exact, 100);
    expect(result).not.toContain("TRUNCATED");
  });

  it("passes through strings as-is", () => {
    expect(truncateResponse("already a string")).toBe("already a string");
  });
});
