import { describe, expect, it } from "vitest";
import { postedAtIso } from "@/lib/time";

describe("postedAtIso", () => {
  const now = new Date("2026-10-06T12:00:00.000Z");

  it("reads unix seconds and milliseconds", () => {
    expect(postedAtIso(1770591742)).toBe("2026-02-08T23:02:22.000Z");
    expect(postedAtIso(1770591742000)).toBe("2026-02-08T23:02:22.000Z");
  });

  it("reads ISO strings and relative text", () => {
    expect(postedAtIso("2026-09-01T10:00:00Z")).toBe("2026-09-01T10:00:00.000Z");
    expect(postedAtIso("Posted 3 Days Ago", now)).toBe("2026-10-03T12:00:00.000Z");
    expect(postedAtIso("Posted Today", now)).toBe(now.toISOString());
  });

  it("rejects junk", () => {
    expect(postedAtIso("soon")).toBeUndefined();
    expect(postedAtIso(undefined)).toBeUndefined();
  });
});
