import { describe, expect, it } from "vitest";
import { classifyJobTerms } from "@/lib/ranking/terms";
import { feedEntries, publicJobFeeds } from "@/lib/sources/publicFeeds";
import { makeJob } from "./helpers/jobs";

describe("classifyJobTerms", () => {
  it("uses explicit feed terms", () => {
    expect(
      classifyJobTerms(makeJob("j", { title: "Intern", terms: ["Summer 2027", "Winter 2027"] })),
    ).toEqual(["winter-2027", "summer-2027"]);
    expect(classifyJobTerms(makeJob("j", { title: "Intern", terms: ["Summer 2026"] }))).toEqual([]);
  });

  it("falls back to the title and description", () => {
    expect(classifyJobTerms(makeJob("j", { title: "Software Intern - Winter 2027" }))).toEqual([
      "winter-2027",
    ]);
    expect(classifyJobTerms(makeJob("j", { title: "Software Intern - Spring 2027" }))).toEqual([
      "winter-2027",
    ]);
    expect(classifyJobTerms(makeJob("j", { title: "Software Intern - Summer 2027" }))).toEqual([
      "summer-2027",
    ]);
    expect(
      classifyJobTerms(makeJob("j", { title: "Software Intern - Winter/Summer 2027" })),
    ).toEqual(["winter-2027", "summer-2027"]);
    expect(
      classifyJobTerms(makeJob("j", { title: "Intern", summary: "Starts May 2027." })),
    ).toEqual(["summer-2027"]);
  });

  it("prioritizes seasons named in the title over conflicting feed terms", () => {
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Intern - Spring 2027", terms: ["Summer 2027"] }),
      ),
    ).toEqual(["winter-2027"]);
  });

  it("does not treat dates as terms", () => {
    expect(
      classifyJobTerms(makeJob("j", { title: "Engineer", summary: "Apply by May 27." })),
    ).toEqual([]);
  });

  it.each([
    "2027 Summer Software Engineer Intern",
    "Summer Intern - Software Engineering",
    "Software Engineer Intern - SUMMER",
  ])("assigns summer-only title %s to summer despite conflicting metadata", (title) => {
    for (const overrides of [
      {},
      { terms: ["Winter 2027"] },
      { workTerm: "Winter 2027" },
      { summary: "Starts Winter 2027." },
    ]) {
      expect(classifyJobTerms(makeJob("j", { ...overrides, title }))).toEqual(["summer-2027"]);
    }
  });

  it.each(["Spring/Summer Intern", "Winter/Summer Intern"])(
    "preserves both terms for mixed-season title %s",
    (title) => {
      expect(classifyJobTerms(makeJob("j", { title }))).toEqual(["winter-2027", "summer-2027"]);
    },
  );

  it("preserves later-year terms for summer titles", () => {
    expect(
      classifyJobTerms(makeJob("j", { title: "Software Engineer Intern - Summer 2028" })),
    ).toEqual(["later"]);
  });

  it("excludes full-time roles even when they mention an internship term", () => {
    expect(
      classifyJobTerms(makeJob("j", { title: "Software Engineer", terms: ["Summer 2027"] })),
    ).toEqual([]);
    expect(
      classifyJobTerms(
        makeJob("j", {
          title: "Software Engineer",
          summary: "Starts May 2027. Prior internship required.",
        }),
      ),
    ).toEqual([]);
  });

  it("excludes eight-month internships unless the title says four to eight months", () => {
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Engineer Intern - 8 months - Summer 2027" }),
      ),
    ).toEqual([]);
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Engineer Intern - 4-8months - Summer 2027" }),
      ),
    ).toEqual(["summer-2027"]);
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Engineer Intern - 4–8 months - Winter 2027" }),
      ),
    ).toEqual(["winter-2027"]);
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
    expect(classifyJobTerms(makeJob("j", { title: "Intern", terms: ["Summer 2028"] }))).toEqual([
      "later",
    ]);
  });

  it("skips internships for other terms", () => {
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Engineer Intern", summary: "Fall 2026 term." }),
      ),
    ).toEqual([]);
  });

  it.each([
    ["The internship runs May - Aug 2027.", ["summer-2027"]],
    ["Dates: 28th June 2027 - 17th September 2027", ["summer-2027"]],
    ["Work term: May 4 to August 28, 2027", ["summer-2027"]],
    ["Duration: January 4 – April 30, 2027", ["winter-2027"]],
    ["This co-op runs Jan. 2027 through Apr. 2027.", ["winter-2027"]],
    ["Placement: Sept 2027 - Dec 2027", ["later"]],
    ["Start date: June 1, 2027", ["summer-2027"]],
    ["Available positions: Summer and Fall 2027", ["summer-2027", "later"]],
    ["Join our 2027 summer program.", ["summer-2027"]],
  ] as const)("reads the term from the description: %s", (summary, expected) => {
    expect(classifyJobTerms(makeJob("j", { title: "Software Engineer Co-op", summary }))).toEqual(
      expected,
    );
  });

  it("uses the start of a date range rather than the end", () => {
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Engineering Intern", summary: "February - May 2027" }),
      ),
    ).toEqual([]);
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Engineering Intern", summary: "May - September 2027" }),
      ),
    ).toEqual(["summer-2027"]);
  });

  it("ignores graduation, deadline, and interview dates", () => {
    expect(
      classifyJobTerms(
        makeJob("j", {
          title: "Software Engineer Intern",
          summary: [
            "This is a 12-week internship from May to August 2027.",
            "Candidates must be graduating in December 2027 or later.",
            "Applications close November 30, 2026; interviews in January 2027.",
          ].join("\n"),
        }),
      ),
    ).toEqual(["summer-2027"]);
    expect(
      classifyJobTerms(
        makeJob("j", {
          title: "Software Engineer Intern",
          summary: "Open to students with an expected graduation date of May 2028.",
        }),
      ),
    ).toEqual(["winter-2027", "summer-2027"]);
  });

  it.each([
    [
      "Applicants should be available for an 8-month co-op period from January 2027 to end of August 2027.",
      ["winter-2027"],
    ],
    [
      "Must be available for the full program dates: 21st June – 27th August 2027.\nMust be graduating with an undergraduate or master's degree in a technical subject (e.g. Computer Science, Information Technology) between December 2027 and July 2028",
      ["summer-2027"],
    ],
    [
      "Programme starts: June 2027. You are due to complete your degree on or before summer 2028.",
      ["summer-2027"],
    ],
    [
      "A 12-week internship starting in May 2027 and ending August 2027 in the Toronto office.",
      ["summer-2027"],
    ],
    [
      "Available to work 20 hours/week during spring/fall semesters or 40 hours/week during summer.",
      ["winter-2027", "summer-2027"],
    ],
    ["Benefits shown are current *As of July 2026.", ["winter-2027", "summer-2027"]],
    [
      "Dates : 10 week program, starting June 7th 2027 - August 13th, 2027.\nRising juniors, or students expected to be ready for full time employment between December 2027 - June 2028",
      ["summer-2027"],
    ],
    [
      "2027 Internship Program Dates: May/June–August/September 2027. Final dates will be based on student schedules.",
      ["summer-2027"],
    ],
    [
      "University - 2027 Summer Games, Systems Engineer Intern\nScheduled to obtain a Bachelor's degree in a Technology field by Summer 2028 or Summer 2029",
      ["summer-2027"],
    ],
    [
      "Grad Intern – Machine Learning Engineer (Summer 2027)\nMust be available to commit to future full-time employment by July 2028, if offered",
      ["summer-2027"],
    ],
    [
      "This internship spans ten weeks from June through August 2027. Currently pursuing an MBA with an expectation that your degree will be obtained by August 2028 or earlier",
      ["summer-2027"],
    ],
    [
      "We are offering Spring, Summer, and Fall 2027 research internships.",
      ["winter-2027", "summer-2027", "later"],
    ],
  ] as const)("reads real posting wording: %s", (summary, expected) => {
    expect(
      classifyJobTerms(makeJob("j", { title: "Software Engineering Co-op", summary })),
    ).toEqual(expected);
  });

  it("does not treat off-cycle internships as summer roles", () => {
    expect(
      classifyJobTerms(
        makeJob("j", {
          title: "Off Cycle Internship Programme 2027",
          summary: "More in-depth exposure compared to our summer internships.",
        }),
      ),
    ).toEqual(["winter-2027", "summer-2027"]);
  });

  it("drops postings whose dates are for a past term", () => {
    expect(
      classifyJobTerms(
        makeJob("j", {
          title: "Data & Analytics Intern",
          summary:
            "This 12-week Internship Program (May 18-Aug 7, 2026) is a gateway to full-time roles. Expected graduation date of May 2027.",
        }),
      ),
    ).toEqual([]);
  });

  it("prefers dates in the posting over listed feed terms", () => {
    expect(
      classifyJobTerms(
        makeJob("j", {
          title: "Software Engineer Co-op",
          terms: ["Winter 2027"],
          summary: "This co-op runs May - Aug 2027.",
        }),
      ),
    ).toEqual(["summer-2027"]);
  });

  it("uses season keywords when the posting has no year", () => {
    expect(
      classifyJobTerms(
        makeJob("j", {
          title: "Software Engineer Intern",
          summary: "Join us for a 12-week summer internship in London.",
        }),
      ),
    ).toEqual(["summer-2027"]);
    expect(
      classifyJobTerms(
        makeJob("j", { title: "Software Co-op", summary: "Work term: May - August." }),
      ),
    ).toEqual(["summer-2027"]);
    expect(classifyJobTerms(makeJob("j", { title: "Fall Co-op - Firmware" }))).toEqual(["later"]);
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
