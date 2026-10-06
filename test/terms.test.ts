import { describe, expect, it } from "vitest";
import { classifyJobTerms } from "@/lib/ranking/terms";
import { feedEntries, publicJobFeeds } from "@/lib/sources/publicFeeds";
import { makeJob } from "./helpers/jobs";

describe("classifyJobTerms", () => {
  it("uses explicit feed terms", () => {
    expect(classifyJobTerms(makeJob("j", { terms: ["Summer 2027", "Winter 2027"] }))).toEqual([
      "winter-2027",
      "summer-2027",
    ]);
    expect(classifyJobTerms(makeJob("j", { terms: ["Summer 2026"] }))).toEqual([]);
  });

  it("falls back to the title and description", () => {
    expect(classifyJobTerms(makeJob("j", { title: "Software Intern - Winter 2027" }))).toEqual([
      "winter-2027",
    ]);
    expect(
      classifyJobTerms(makeJob("j", { title: "Intern", summary: "Starts May 2027." })),
    ).toEqual(["summer-2027"]);
  });

  it("does not treat dates as terms", () => {
    expect(
      classifyJobTerms(makeJob("j", { title: "Engineer", summary: "Apply by May 27." })),
    ).toEqual([]);
  });

  it("puts internships with no start date in both terms", () => {
    expect(classifyJobTerms(makeJob("j", { title: "Software Engineer Intern" }))).toEqual([
      "winter-2027",
      "summer-2027",
    ]);
  });

  it("uses the start date from the description", () => {
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Engineer Intern", summary: "Starts May 2027." }),
      ),
    ).toEqual(["summer-2027"]);
  });

  it("keeps later terms in their own section", () => {
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Engineer Intern", summary: "Starts Fall 2027." }),
      ),
    ).toEqual(["later"]);
    expect(classifyJobTerms(makeJob("j", { terms: ["Summer 2028"] }))).toEqual(["later"]);
  });

  it("skips internships for other terms", () => {
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Engineer Intern", summary: "Fall 2026 term." }),
      ),
    ).toEqual([]);
  });
});

describe("feed terms", () => {
  it("keeps 2027 listings and skips other seasons", () => {
    const feed = publicJobFeeds[0];
    if (!feed) throw new Error("missing feed");
    const entry = (title: string, terms: string[]) => ({
      title,
      company_name: "Acme",
      url: `https://example.com/${title}`,
      category: "Software",
      terms,
      active: true,
    });
    const { jobs } = feedEntries(
      [
        entry("Software Engineer Intern A", ["Winter 2027"]),
        entry("Software Engineer Intern B", ["Summer 2026"]),
      ],
      feed,
    );
    expect(jobs.map((job) => job.title)).toEqual(["Software Engineer Intern A"]);
    expect(jobs[0]?.terms).toEqual(["Winter 2027"]);
  });
});
