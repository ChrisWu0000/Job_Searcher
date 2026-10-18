import { describe, expect, it } from "vitest";
import { buildJobRows, filterJobRows, isNewSince } from "@/components/jobs/jobRows";
import { emptyJobFilters } from "@/stores/ui";
import { defaultProfile } from "@/types/preferences";
import { makeJob } from "./helpers/jobs";

const scrapedEarlier = makeJob("old", { firstSeenAt: "2026-09-06T00:00:00.000Z" });
const scrapedNow = makeJob("fresh", { firstSeenAt: "2026-09-07T04:00:00.000Z" });
const skipped = makeJob("skipped", { firstSeenAt: "2026-09-07T04:00:00.000Z" });
const skipVerdict = {
  id: "skipped:v1",
  jobId: "skipped",
  profileVersion: "v1",
  score: 10,
  likelihood: 5,
  verdict: "skip" as const,
  hardViolations: [],
  softNotes: [],
  strengths: [],
  gaps: [],
  summary: "not a fit",
  model: "test",
  usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
  prompt: "",
  rawResponse: "",
  scoredAt: "2026-09-07T04:10:00.000Z",
};
const undated = makeJob("undated");

describe("job rows", () => {
  it("classifies hardware roles and keeps the category filter available", () => {
    const hardware = makeJob("old", {
      title: "Embedded Software Engineer",
      compensation: "$80 CAD/hour",
    });
    const good = makeJob("good", { title: "Backend Developer", compensation: "$60 CAD/hour" });
    const oldScore = { ...skipVerdict, jobId: "old", score: 95, verdict: "apply" as const };
    const rows = buildJobRows([hardware, good], [oldScore], undefined, defaultProfile);
    expect(rows[0]?.categories).toContain("hardware-engineering");
    expect(rows[0]).toMatchObject({ score: { score: 95 } });
    expect(filterJobRows(rows, emptyJobFilters).map((row) => row.job.id)).toEqual(["old", "good"]);
    expect(
      filterJobRows(rows, { ...emptyJobFilters, categories: ["hardware-engineering"] }).map(
        (row) => row.job.id,
      ),
    ).toEqual(["old"]);
  });

  it("shows saved interests in the Interested view even when ranking would hide them", () => {
    const interested = makeJob("skipped", { status: "interested" });
    const autoFiltered = makeJob("hardware", {
      status: "interested",
      title: "Embedded Software Engineer",
    });
    const rows = buildJobRows(
      [interested, autoFiltered, scrapedEarlier],
      [skipVerdict],
      undefined,
      defaultProfile,
    );
    const filters = { ...emptyJobFilters, statuses: ["interested" as const] };
    expect(filterJobRows(rows, filters).map((row) => row.job.id)).toEqual(["skipped", "hardware"]);
    expect(
      filterJobRows(rows, { ...filters, search: "Embedded" }).map((row) => row.job.id),
    ).toEqual(["hardware"]);
    expect(filterJobRows(rows, { ...filters, verdicts: ["apply"] })).toEqual([]);
  });

  it("rechecks current requirements when the pay floor changes", () => {
    const job = makeJob("pay", { title: "Software Engineer", compensation: "$55 CAD/hour" });
    expect(buildJobRows([job], [], undefined, defaultProfile)[0]?.autoFilterReason).toContain(
      "below",
    );
    expect(
      buildJobRows([job], [], undefined, { ...defaultProfile, payFloors: { CAD: 50 } })[0]
        ?.autoFilterReason,
    ).toBeUndefined();
  });

  it("releases a previous automatic rejection when the posting now qualifies", () => {
    const job = makeJob("skipped", { title: "Software Engineer", compensation: "$60 CAD/hour" });
    const rows = buildJobRows(
      [job],
      [{ ...skipVerdict, model: "prefilter" }],
      undefined,
      defaultProfile,
    );
    expect(rows[0]?.score).toBeUndefined();
    expect(rows[0]?.verdict).toBeUndefined();
    expect(filterJobRows(rows, emptyJobFilters)).toHaveLength(1);
  });

  it("marks jobs first seen during the latest sync as new", () => {
    const rows = buildJobRows(
      [scrapedEarlier, scrapedNow, undated],
      [],
      "2026-09-07T03:30:00.000Z",
    );
    expect(rows.map((row) => [row.job.id, row.isNew])).toEqual([
      ["old", false],
      ["fresh", true],
      ["undated", false],
    ]);
    expect(isNewSince(scrapedNow, undefined)).toBe(false);
  });

  it("hides skip verdicts unless asked, or unless the verdict filter names them", () => {
    const rows = buildJobRows([scrapedEarlier, skipped], [skipVerdict], "2026-09-07T03:30:00.000Z");
    expect(filterJobRows(rows, emptyJobFilters).map((row) => row.job.id)).toEqual(["old"]);
    expect(
      filterJobRows(rows, { ...emptyJobFilters, showSkipVerdicts: true }).map((row) => row.job.id),
    ).toEqual(["old", "skipped"]);
    expect(
      filterJobRows(rows, { ...emptyJobFilters, verdicts: ["skip"] }).map((row) => row.job.id),
    ).toEqual(["skipped"]);
  });

  it("treats a job the user skipped as a skip verdict", () => {
    const liked = { ...skipVerdict, id: "old:v1", jobId: "old", verdict: "apply" as const };
    const manuallySkipped = { ...scrapedEarlier, status: "skipped" as const };
    const rows = buildJobRows([manuallySkipped, scrapedNow], [liked]);
    expect(rows[0]?.verdict).toBe("skip");
    expect(rows[0]?.score?.verdict).toBe("apply");
    expect(rows[1]?.verdict).toBeUndefined();
    expect(filterJobRows(rows, emptyJobFilters).map((row) => row.job.id)).toEqual(["fresh"]);
    expect(
      filterJobRows(rows, { ...emptyJobFilters, verdicts: ["skip"] }).map((row) => row.job.id),
    ).toEqual(["old"]);
    expect(
      filterJobRows(rows, { ...emptyJobFilters, verdicts: ["apply"] }).map((row) => row.job.id),
    ).toEqual([]);
  });

  it("can narrow the table to new jobs only", () => {
    const rows = buildJobRows([scrapedEarlier, scrapedNow], [], "2026-09-07T03:30:00.000Z");
    expect(
      filterJobRows(rows, { ...emptyJobFilters, onlyNew: true }).map((row) => row.job.id),
    ).toEqual(["fresh"]);
  });

  it("matches selected job categories across all source text", () => {
    const rows = buildJobRows(
      [
        makeJob("security", { title: "Security Analyst" }),
        makeJob("payments", {
          title: "Backend Engineer",
          company: "PayCo",
          summary: "Build our payment processing platform.",
        }),
        makeJob("other", { title: "Marketing Intern" }),
      ],
      [],
    );
    expect(
      filterJobRows(rows, { ...emptyJobFilters, categories: ["cyber-security", "fintech"] }).map(
        (row) => row.job.id,
      ),
    ).toEqual(["security", "payments"]);
  });

  it.each([
    ["Software Engineer Intern", "software-engineering"],
    ["Data Scientist", "data-science"],
    ["Cyber Security Analyst", "cyber-security"],
    ["Hardware Engineer", "hardware-engineering"],
    ["Fintech Platform Engineer", "fintech"],
    ["Summer Software Engineering Intern", "summer"],
  ] as const)("recognizes %s as %s", (title, category) => {
    const rows = buildJobRows([makeJob("classified", { title })], []);
    expect(rows[0]?.categories).toContain(category);
  });
});
