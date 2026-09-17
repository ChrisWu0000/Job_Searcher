import { describe, expect, it } from "vitest";
import { hashQuestion, stableHash, stableObjectHash, stableStringify } from "@/lib/hash";
import { profileVersion } from "@/lib/ranking/profile";
import { formatRelative, hoursUntil } from "@/lib/time";
import { cn } from "@/lib/utils";
import { defaultProfile } from "@/types/preferences";

describe("cn", () => {
  it("merges conflicting tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy class values", () => {
    expect(cn("flex", false && "hidden", undefined)).toBe("flex");
  });
});

describe("stable hashing", () => {
  it("is deterministic and sensitive to small edits", () => {
    expect(stableHash("hello")).toBe(stableHash("hello"));
    expect(stableHash("hello")).not.toBe(stableHash("hellp"));
    expect(stableHash("")).toHaveLength(16);
  });

  it("ignores key order when stringifying objects", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableObjectHash({ b: 1, a: 2 })).toBe(stableObjectHash({ a: 2, b: 1 }));
  });

  it("normalizes question text before hashing", () => {
    expect(hashQuestion("Are you eligible?")).toBe(hashQuestion("  ARE YOU   eligible? "));
  });
});

describe("profileVersion", () => {
  it("changes when a scoring input changes and not when the version field does", () => {
    const base = profileVersion(defaultProfile);
    expect(profileVersion({ ...defaultProfile, version: "anything" })).toBe(base);
    expect(profileVersion({ ...defaultProfile, model: "openai/gpt-5" })).not.toBe(base);
    expect(profileVersion({ ...defaultProfile, payFloors: { CAD: 65, USD: 50 } })).not.toBe(base);
  });

  it("does not depend on constraint ordering", () => {
    const reversed = { ...defaultProfile, constraints: [...defaultProfile.constraints].reverse() };
    expect(profileVersion(reversed)).toBe(profileVersion(defaultProfile));
  });
});

describe("time helpers", () => {
  const anchor = new Date("2026-09-06T12:00:00.000Z");

  it("formats past and future timestamps relative to an anchor", () => {
    expect(formatRelative("2026-09-06T09:00:00.000Z", anchor)).toBe("3 hours ago");
    expect(formatRelative("2026-09-07T12:00:00.000Z", anchor)).toBe("tomorrow");
    expect(formatRelative("not a date", anchor)).toBe("unknown");
  });

  it("counts the hours left before a deadline", () => {
    expect(hoursUntil("2026-09-07T12:00:00.000Z", anchor)).toBe(24);
    expect(hoursUntil("nope", anchor)).toBeUndefined();
  });
});
