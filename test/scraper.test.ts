import { describe, expect, it } from "vitest";
import {
  blockText,
  composeLocation,
  documentKindOf,
  parseArrangement,
  parseDateToIso,
  parseDocumentRequirements,
  parseDurationMonths,
  parseOpenings,
  splitList,
} from "@/lib/waterlooworks/parse";
import {
  findResultsRow,
  firstResultsRowId,
  getResultsPageNumber,
  scrapeCurrentJob,
  scrapeResultsPage,
} from "@/lib/waterlooworks/scraper";
import {
  fixtureHtml,
  parseFixture,
  parseHtml,
  withoutClassesAndIds,
} from "./fixtures/waterlooworks/load";

function localParts(iso: string): { year: number; month: number; day: number; hours: number } {
  const date = new Date(iso);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hours: date.getHours(),
  };
}

describe("text parsers", () => {
  it("parses work term duration, taking the shortest option", () => {
    expect(parseDurationMonths("4 month work term")).toBe(4);
    expect(parseDurationMonths("8 months")).toBe(8);
    expect(parseDurationMonths("4 or 8 month work term")).toBe(4);
    expect(parseDurationMonths("12 months (May 2026 - April 2027)")).toBe(12);
    expect(parseDurationMonths("")).toBeUndefined();
    expect(parseDurationMonths("Not specified")).toBeUndefined();
  });

  it("parses the work arrangement, preferring hybrid over remote", () => {
    expect(parseArrangement("Fully Remote")).toBe("remote");
    expect(parseArrangement("Hybrid (2 days remote)")).toBe("hybrid");
    expect(parseArrangement("On-site")).toBe("in-person");
    expect(parseArrangement("In Person")).toBe("in-person");
    expect(parseArrangement("Unstated")).toBeUndefined();
  });

  it("parses the deadline formats WaterlooWorks uses", () => {
    expect(localParts(parseDateToIso("September 12, 2026 11:59 PM") ?? "")).toEqual({
      year: 2026,
      month: 9,
      day: 12,
      hours: 23,
    });
    expect(localParts(parseDateToIso("Sep 3, 2026") ?? "")).toEqual({
      year: 2026,
      month: 9,
      day: 3,
      hours: 0,
    });
    expect(localParts(parseDateToIso("2026-09-20") ?? "")).toEqual({
      year: 2026,
      month: 9,
      day: 20,
      hours: 0,
    });
    expect(localParts(parseDateToIso("12 October 2026 12:00 AM") ?? "")).toEqual({
      year: 2026,
      month: 10,
      day: 12,
      hours: 0,
    });
    expect(parseDateToIso("no deadline given")).toBeUndefined();
  });

  it("classifies required application documents", () => {
    const requirements = parseDocumentRequirements([
      "Résumé",
      "Cover Letter",
      "Grade Report",
      "Portfolio Link",
    ]);
    expect(requirements).toEqual({
      resume: true,
      coverLetter: true,
      gradeReport: true,
      otherDocuments: ["Portfolio Link"],
    });
    expect(documentKindOf("Resume - B Zhou.pdf")).toBe("resume");
    expect(documentKindOf("Unofficial Transcript")).toBe("gradeReport");
    expect(documentKindOf("Writing Sample")).toBe("other");
  });

  it("splits lists and composes locations", () => {
    expect(splitList("Résumé; Cover Letter; Grade Report")).toEqual([
      "Résumé",
      "Cover Letter",
      "Grade Report",
    ]);
    expect(composeLocation(["New York", undefined, "United States"])).toBe(
      "New York, United States",
    );
    expect(parseOpenings("3 openings")).toBe(3);
  });

  it("keeps block structure when flattening DOM text", () => {
    const document = parseHtml("<div><p>one</p><ul><li>two</li><li>three</li></ul></div>");
    expect(blockText(document.body).split("\n")).toEqual(["one", "two", "three"]);
  });
});

describe("scrapeResultsPage", () => {
  it("reads every row of page one as a validated JobStub", () => {
    const stubs = scrapeResultsPage(parseFixture("results-page-1"));
    expect(stubs).toHaveLength(4);
    const first = stubs[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe("384922");
    expect(first?.title).toBe("Software Engineer Intern");
    expect(first?.company).toBe("Datadog");
    expect(first?.location).toBe("New York, New York, United States");
    expect(first?.openings).toBe(3);
    expect(localParts(first?.deadline ?? "")).toEqual({
      year: 2026,
      month: 9,
      day: 12,
      hours: 23,
    });
    expect(stubs.map((stub) => stub.id)).toEqual(["384922", "384930", "385001", "385044"]);
  });

  it("reads the real WaterlooWorks data viewer table", () => {
    const page = parseFixture("results-real-page-1");
    const stubs = scrapeResultsPage(page);
    expect(stubs.map((stub) => stub.id)).toEqual([
      "486053",
      "486044",
      "486039",
      "486035",
      "485969",
    ]);
    const first = stubs[0];
    expect(first?.title).toBe("Software Developer");
    expect(first?.company).toBe("Bolt Technologies Inc");
    expect(first?.location).toBe("Toronto");
    expect(first?.openings).toBe(1);
    expect(localParts(first?.deadline ?? "")).toMatchObject({ year: 2026, month: 9, day: 17 });
    expect(firstResultsRowId(page)).toBe("486053");
    expect(getResultsPageNumber(page)).toBe(1);
    expect(findResultsRow("486039", page)?.textContent).toContain("Agfa HealthCare");
  });

  it("reads page two and reports a different first row", () => {
    const page1 = parseFixture("results-page-1");
    const page2 = parseFixture("results-page-2");
    expect(scrapeResultsPage(page2)).toHaveLength(3);
    expect(firstResultsRowId(page1)).toBe("384922");
    expect(firstResultsRowId(page2)).toBe("385110");
    expect(getResultsPageNumber(page1)).toBe(1);
    expect(getResultsPageNumber(page2)).toBe(2);
  });

  it("finds the row for a job id", () => {
    const page = parseFixture("results-page-1");
    const row = findResultsRow("385001", page);
    expect(row?.textContent).toContain("Cohere");
    expect(findResultsRow("999999", page)).toBeUndefined();
  });

  it("returns nothing when there is no results table", () => {
    expect(scrapeResultsPage(parseFixture("posting-full"))).toEqual([]);
  });
});

describe("scrapeCurrentJob", () => {
  it("parses a complete posting", () => {
    const job = scrapeCurrentJob(parseFixture("posting-full"));
    expect(job.id).toBe("384922");
    expect(job.title).toBe("Software Engineer Intern");
    expect(job.company).toBe("Datadog");
    expect(job.city).toBe("New York");
    expect(job.region).toBe("New York");
    expect(job.country).toBe("United States");
    expect(job.location).toBe("New York, New York, United States");
    expect(job.arrangement).toBe("hybrid");
    expect(job.durationMonths).toBe(4);
    expect(job.openings).toBe(3);
    expect(job.compensation).toContain("$52.00 USD per hour");
    expect(job.summary).toContain("ingestion pipeline");
    expect(job.responsibilities).toContain("Go and Rust");
    expect(job.qualifications).toContain("distributed systems");
    expect(job.targetedPrograms).toEqual([
      "Bachelor of Computer Science",
      "Bachelor of Software Engineering",
      "Bachelor of Computer Engineering",
    ]);
    expect(job.application.resume).toBe(true);
    expect(job.application.coverLetter).toBe(true);
    expect(job.application.gradeReport).toBe(true);
    expect(job.application.otherDocuments).toEqual(["Portfolio Link"]);
    expect(job.application.hasPrescreenQuestions).toBe(true);
    expect(localParts(job.application.deadline ?? "")).toEqual({
      year: 2026,
      month: 9,
      day: 12,
      hours: 23,
    });
    expect(job.rawText).toContain("Observability Platform");
    expect(job.status).toBe("new");
    expect(job.detailScrapedAt).toBeTruthy();
  });

  it("parses the posting overlay WaterlooWorks opens over the results", () => {
    const job = scrapeCurrentJob(parseFixture("posting-overlay"));
    expect(job.id).toBe("486053");
    expect(job.title).toBe("Software Developer");
    expect(job.company).toBe("Bolt Technologies Inc");
    expect(job.city).toBe("Toronto");
    expect(job.region).toBe("Ontario");
    expect(job.country).toBe("Canada");
    expect(job.arrangement).toBe("hybrid");
    expect(job.durationMonths).toBe(8);
    expect(job.openings).toBe(1);
    expect(job.compensation).toContain("$30.00 CAD");
    expect(job.summary).toContain("ingestion pipeline");
    expect(job.responsibilities).toContain("TypeScript and Go");
    expect(job.qualifications).toContain("distributed systems");
    expect(job.targetedPrograms).toEqual([
      "Theme - Computing: Software Development",
      "Theme - Computing: Data Science",
    ]);
    expect(job.application).toMatchObject({
      resume: true,
      gradeReport: true,
      coverLetter: true,
      otherDocuments: ["University of Waterloo Co-op Work History"],
    });
    expect(job.deadline).toBeUndefined();
  });

  it("leaves missing sections undefined instead of inventing them", () => {
    const job = scrapeCurrentJob(parseFixture("posting-missing-sections"));
    expect(job.id).toBe("385044");
    expect(job.title).toBe("Infrastructure Engineering Student");
    expect(job.company).toBe("Stripe");
    expect(job.city).toBe("Seattle");
    expect(job.region).toBeUndefined();
    expect(job.country).toBe("United States");
    expect(job.location).toBe("Seattle, United States");
    expect(job.arrangement).toBe("remote");
    expect(job.durationMonths).toBe(8);
    expect(job.summary).toContain("internal developer platform");
    expect(job.responsibilities).toBeUndefined();
    expect(job.qualifications).toBeUndefined();
    expect(job.compensation).toBeUndefined();
    expect(job.targetedPrograms).toEqual([]);
    expect(job.application.resume).toBe(true);
    expect(job.application.coverLetter).toBe(false);
    expect(job.application.gradeReport).toBe(false);
    expect(job.application.hasPrescreenQuestions).toBe(false);
  });

  it("still parses when every class and id changes but the labels stay", () => {
    const stripped = parseHtml(withoutClassesAndIds(fixtureHtml("posting-full")));
    const job = scrapeCurrentJob(stripped);
    expect(job.id).toBe("384922");
    expect(job.company).toBe("Datadog");
    expect(job.durationMonths).toBe(4);
    expect(job.summary).toContain("ingestion pipeline");
    expect(job.application.coverLetter).toBe(true);
  });

  it("throws a ScrapeError when there is no posting id", () => {
    expect(() =>
      scrapeCurrentJob(parseHtml("<html><body><p>Job Summary</p></body></html>")),
    ).toThrow(/posting id/);
  });
});
