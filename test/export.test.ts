import { describe, expect, it } from "vitest";
import { csvCell, jobsToCsv, jobsToJson, rawJobsToJson } from "@/components/jobs/export";
import { buildJobRows } from "@/components/jobs/jobRows";
import type { JobScore } from "@/types/scoring";
import { makeJob } from "./helpers/fakeWw";

const score: JobScore = {
  id: "1:v1",
  jobId: "1",
  profileVersion: "v1",
  score: 82,
  likelihood: 60,
  verdict: "apply",
  hardViolations: [],
  softNotes: [],
  strengths: [],
  gaps: [],
  summary: 'Strong match, "backend" focus',
  model: "test",
  usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
  prompt: "",
  rawResponse: "",
  scoredAt: "2026-09-07T04:10:00.000Z",
};

describe("job export", () => {
  it("quotes csv cells that carry commas, quotes or line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", now')).toBe('"say ""hi"", now"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(true)).toBe("true");
  });

  it("writes one header row and one line per job with its score", () => {
    const rows = buildJobRows(
      [makeJob("1", { title: "Dev, Backend", company: "Acme" }), makeJob("2")],
      [score],
    );
    const csv = jobsToCsv(rows);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]?.startsWith("id,company,title,status,score,likelihood,verdict")).toBe(true);
    expect(lines[1]?.startsWith('1,Acme,"Dev, Backend",new,82,60,apply,')).toBe(true);
    expect(lines[2]?.startsWith("2,")).toBe(true);
    expect(lines[2]).toContain(",,,,");
  });

  it("exports json with the full job and its score details", () => {
    const rows = buildJobRows([makeJob("1")], [score]);
    const parsed = JSON.parse(jobsToJson(rows)) as { id: string; scoreDetails?: JobScore }[];
    expect(parsed[0]?.id).toBe("1");
    expect(parsed[0]?.scoreDetails?.verdict).toBe("apply");
  });

  it("dumps raw jobs without the extension's own status, score, or notes", () => {
    const job = { ...makeJob("1"), status: "applied" as const, score: 82, notes: "call back" };
    const parsed = JSON.parse(rawJobsToJson([job])) as Record<string, unknown>[];
    const { status: _s, score: _c, notes: _n, firstSeenAt: _f, ...posting } = job;
    expect(parsed).toEqual([JSON.parse(JSON.stringify(posting))]);
    for (const key of ["status", "score", "notes", "firstSeenAt", "scoreDetails"]) {
      expect(parsed[0]).not.toHaveProperty(key);
    }
    expect(parsed[0]).toHaveProperty("title", job.title);
  });
});
