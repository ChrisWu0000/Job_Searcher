import { describe, expect, it } from "vitest";
import { toListing } from "@/lib/listings/collect";
import { classifyEmploymentRequirements } from "@/lib/listings/requirements";
import type { Job } from "@/types/job";

function job(text: string): Job {
  return {
    id: "requirements-test",
    company: "Example",
    title: "Software Engineer Intern",
    location: "Remote",
    source: "test",
    url: "https://example.com/intern",
    scrapedAt: "2026-10-01T00:00:00.000Z",
    firstSeenAt: "2026-10-01T00:00:00.000Z",
    rawText: text,
    application: {
      resume: false,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    status: "new",
  };
}

describe("employment requirement indicators", () => {
  it.each([
    "U.S. citizenship is required.",
    "Must be a US citizen.",
    "United States citizens only.",
  ])("recognizes an explicit citizenship requirement: %s", (text) => {
    expect(classifyEmploymentRequirements(job(text)).requiresUSCitizenship).toBe(true);
  });

  it.each([
    "We do not offer visa sponsorship.",
    "Sponsorship is not available.",
    "Candidates must be authorized to work without sponsorship.",
  ])("recognizes an explicit no-sponsorship statement: %s", (text) => {
    expect(classifyEmploymentRequirements(job(text)).noSponsorship).toBe(true);
  });

  it("does not infer citizenship from clearance or U.S.-person language", () => {
    expect(
      classifyEmploymentRequirements(
        job("Must be a U.S. person and eligible for a security clearance."),
      ).requiresUSCitizenship,
    ).toBe(false);
  });

  it("does not flag offers of sponsorship or non-restrictive authorization language", () => {
    const result = classifyEmploymentRequirements(
      job("We offer visa sponsorship. Applicants must be authorized to work in the U.S."),
    );
    expect(result.noSponsorship).toBe(false);
    expect(result.requiresUSCitizenship).toBe(false);
  });

  it("recognizes Simplify-style sponsorship statuses in source fields", () => {
    const sourceJob = {
      ...job("Internship opportunity."),
      fields: { sponsorship: "Does Not Offer Sponsorship" },
    };
    expect(classifyEmploymentRequirements(sourceJob).noSponsorship).toBe(true);
  });

  it("carries detected requirements into the generated listing", () => {
    const listing = toListing({
      ...job("Must be a U.S. citizen. We do not offer visa sponsorship."),
      title: "Software Engineer Intern Summer 2027",
    });
    expect(listing).toMatchObject({
      requiresUSCitizenship: true,
      noSponsorship: true,
    });
  });
});
