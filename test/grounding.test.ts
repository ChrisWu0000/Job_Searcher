import { describe, expect, it } from "vitest";
import { checkGrounding, numberTokens, properTokens, sourceTextsOf } from "@/lib/resume/grounding";
import type { ExperienceEntry } from "@/types/resume";

function makeEntry(overrides: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    id: "datadog",
    kind: "work",
    title: "Backend Engineering Intern",
    organization: "Datadog",
    technologies: ["Go", "PostgreSQL", "Kubernetes"],
    facts: ["Team of 6 engineers", "Pipeline handled 2M events per day"],
    bullets: [
      {
        id: "dd-1",
        text: "Built Go services for the ingestion pipeline handling 2M events per day.",
        tags: ["backend"],
        pinned: true,
      },
      {
        id: "dd-2",
        text: "Tuned PostgreSQL queries and cut p95 latency by 40%.",
        tags: ["database"],
        pinned: false,
      },
    ],
    pinned: false,
    order: 0,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sourceTextsOf", () => {
  it("collects bullets, facts, technologies, title and organization", () => {
    const texts = sourceTextsOf(makeEntry());
    expect(texts).toContain("Tuned PostgreSQL queries and cut p95 latency by 40%.");
    expect(texts).toContain("Team of 6 engineers");
    expect(texts).toContain("Kubernetes");
    expect(texts).toContain("Backend Engineering Intern");
    expect(texts).toContain("Datadog");
  });

  it("drops an absent organization instead of emitting an empty string", () => {
    const texts = sourceTextsOf(makeEntry({ organization: undefined }));
    expect(texts).not.toContain("");
  });
});

describe("numberTokens", () => {
  it("keeps suffixes and decimals and normalizes thousands separators", () => {
    expect(
      numberTokens("Cut spend 40% from $1.2M across 1,000 runs in 2025, a 3x win at 10k rps"),
    ).toEqual(["40%", "$1.2M", "1000", "2025", "3x", "10k"]);
  });

  it("ignores digits that are part of a word", () => {
    expect(numberTokens("Stored objects in S3 behind p95 budgets")).toEqual([]);
  });

  it("dedupes on the normalized form", () => {
    expect(numberTokens("$1,200 became 1200 later")).toEqual(["$1200"]);
  });
});

describe("properTokens", () => {
  it("finds technologies, camel case and mid-sentence proper nouns", () => {
    const tokens = properTokens("Shipped Node.js and C++ work on CI/CD for gRPC at Datadog.");
    expect(tokens).toEqual(["node.js", "c++", "ci/cd", "grpc", "datadog"]);
  });

  it("does not treat a sentence-opening capital as a proper noun", () => {
    expect(properTokens("Built dashboards. Improved latency.")).toEqual([]);
  });

  it("treats hyphenated and digit-bearing words as proper tokens", () => {
    expect(properTokens("Ran end-to-end checks against S3")).toEqual(["end-to-end", "s3"]);
  });
});

describe("checkGrounding", () => {
  const entry = makeEntry();

  it("accepts a faithful rephrase that only reorders existing facts", () => {
    expect(checkGrounding("Cut p95 latency 40% by tuning PostgreSQL queries.", entry)).toEqual({
      ok: true,
    });
  });

  it("tolerates a plural of a term that appears singular in the entry", () => {
    expect(checkGrounding("Ran Go services on Kubernetes clusters.", entry)).toEqual({ ok: true });
  });

  it("rejects an invented metric", () => {
    const result = checkGrounding("Cut p95 latency by 60%.", entry);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("introduces number 60%");
  });

  it("rejects an invented technology", () => {
    const result = checkGrounding("Tuned queries behind a Redis cache.", entry);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("introduces term redis");
  });

  it("lists every offender it found", () => {
    const result = checkGrounding(
      "Cut latency by 60% and 3x throughput using Redis and Kafka.",
      entry,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("introduces number 60%, 3x; introduces term redis, kafka");
  });
});
