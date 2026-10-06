import { describe, expect, it } from "vitest";
import type { ResumeBank } from "@/lib/resume/contracts";
import {
  bulletRelevance,
  entryRelevance,
  jobTerms,
  selectForJob,
  tokenize,
} from "@/lib/resume/select";
import type { ExperienceEntry, ResumeSettings } from "@/types/resume";
import { defaultResumeSettings } from "@/types/resume";
import { makeJob } from "./helpers/jobs";

function makeEntry(id: string, overrides: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    id,
    kind: "work",
    title: `Title ${id}`,
    organization: `Org ${id}`,
    location: "Toronto, ON",
    startDate: "May 2025",
    endDate: "Aug 2025",
    technologies: [],
    facts: [],
    bullets: [],
    pinned: false,
    order: 0,
    updatedAt: "2026-09-06T14:00:00.000Z",
    ...overrides,
  };
}

function makeSettings(overrides: Partial<ResumeSettings> = {}): ResumeSettings {
  return {
    ...defaultResumeSettings,
    skillGroups: [{ id: "lang", name: "Languages", items: ["Java", "TypeScript", "Python"] }],
    ...overrides,
  };
}

function makeBank(entries: ExperienceEntry[], settings = makeSettings()): ResumeBank {
  return { entries, settings };
}

describe("tokenize", () => {
  it("lowercases and drops short words and stopwords", () => {
    expect(tokenize("The quick Brown fox a b")).toEqual(["quick", "brown", "fox"]);
  });

  it("keeps technology tokens with punctuation", () => {
    expect(tokenize("C++ and C# with Node.js")).toEqual(["c++", "c#", "node.js"]);
  });

  it("drops sentence-final periods", () => {
    expect(tokenize("We shipped React.")).toEqual(["shipped", "react"]);
  });
});

describe("jobTerms", () => {
  it("reads every text field of the job", () => {
    const terms = jobTerms(
      makeJob("1", {
        title: "Backend Developer",
        summary: "Build pipelines",
        responsibilities: "Maintain services",
        qualifications: "Knows Django",
        targetedPrograms: ["Software Engineering"],
        rawText: "kafka streaming",
      }),
    );
    expect(terms.has("backend")).toBe(true);
    expect(terms.has("pipelines")).toBe(true);
    expect(terms.has("services")).toBe(true);
    expect(terms.has("django")).toBe(true);
    expect(terms.has("engineering")).toBe(true);
    expect(terms.has("kafka")).toBe(true);
  });

  it("expands abbreviations to their full names", () => {
    const terms = jobTerms(makeJob("1", { rawText: "we run k8s and use ts on gcp" }));
    expect(terms.has("kubernetes")).toBe(true);
    expect(terms.has("typescript")).toBe(true);
    expect(terms.has("google cloud")).toBe(true);
    expect(terms.has("google")).toBe(true);
  });

  it("expands full names back to their abbreviations", () => {
    const terms = jobTerms(
      makeJob("1", {
        rawText: "kubernetes, javascript, postgresql, machine learning, amazon web services",
      }),
    );
    expect(terms.has("k8s")).toBe(true);
    expect(terms.has("js")).toBe(true);
    expect(terms.has("postgres")).toBe(true);
    expect(terms.has("ml")).toBe(true);
    expect(terms.has("aws")).toBe(true);
  });

  it("links node, react and go to their aliases", () => {
    const terms = jobTerms(makeJob("1", { rawText: "node, react and golang" }));
    expect(terms.has("node.js")).toBe(true);
    expect(terms.has("react.js")).toBe(true);
    expect(terms.has("go")).toBe(true);
  });

  it("does not invent unrelated terms", () => {
    const terms = jobTerms(makeJob("1", { title: "Analyst", rawText: "spreadsheets" }));
    expect(terms.has("kubernetes")).toBe(false);
    expect(terms.has("typescript")).toBe(false);
  });
});

describe("bulletRelevance", () => {
  const terms = jobTerms(makeJob("1", { rawText: "react typescript dashboards" }));

  it("weights tags above technologies above words", () => {
    const bare = makeEntry("w0");
    const withTech = makeEntry("w1", { technologies: ["React"] });
    const tagged = bulletRelevance(
      { id: "b1", text: "unrelated prose", tags: ["react"], pinned: false },
      bare,
      terms,
    );
    const teched = bulletRelevance(
      { id: "b2", text: "Shipped with React", tags: [], pinned: false },
      withTech,
      terms,
    );
    const worded = bulletRelevance(
      { id: "b3", text: "Built dashboards", tags: [], pinned: false },
      bare,
      terms,
    );
    expect(tagged).toBe(3);
    expect(teched).toBe(3);
    expect(worded).toBe(1);
  });

  it("credits a technology named by a tag on top of the tag itself", () => {
    const entry = makeEntry("w1", { technologies: ["React"] });
    const bullet = { id: "b1", text: "unrelated prose", tags: ["react"], pinned: false };
    expect(bulletRelevance(bullet, entry, terms)).toBe(5);
  });

  it("counts a repeated word once", () => {
    const bullet = {
      id: "b1",
      text: "dashboards dashboards dashboards",
      tags: [],
      pinned: false,
    };
    expect(bulletRelevance(bullet, makeEntry("w1"), terms)).toBe(1);
  });

  it("is zero with no overlap", () => {
    const bullet = { id: "b1", text: "Wrote poetry", tags: ["prose"], pinned: false };
    expect(bulletRelevance(bullet, makeEntry("w1"), terms)).toBe(0);
  });
});

describe("entryRelevance", () => {
  const terms = jobTerms(makeJob("1", { rawText: "react dashboards" }));

  it("adds technology and heading matches to the top bullet scores", () => {
    const entry = makeEntry("w1", {
      title: "React Developer",
      technologies: ["React"],
      bullets: [
        { id: "b1", text: "Built dashboards", tags: [], pinned: false },
        { id: "b2", text: "Built dashboards", tags: [], pinned: false },
        { id: "b3", text: "Built dashboards", tags: [], pinned: false },
      ],
    });
    expect(entryRelevance(entry, terms, { maxBulletsPerEntry: 2 })).toBe(5);
    expect(entryRelevance(entry, terms, { maxBulletsPerEntry: 3 })).toBe(6);
  });

  it("is zero when nothing overlaps", () => {
    const entry = makeEntry("w1", {
      title: "Barista",
      organization: "Cafe",
      bullets: [{ id: "b1", text: "Poured coffee", tags: [], pinned: false }],
    });
    expect(entryRelevance(entry, terms, { maxBulletsPerEntry: 4 })).toBe(0);
  });
});

describe("selectForJob", () => {
  const job = makeJob("1", {
    title: "Frontend Developer",
    rawText: "We build React dashboards in TypeScript.",
  });

  const relevant = makeEntry("w1", {
    title: "Frontend Intern",
    technologies: ["React", "TypeScript"],
    bullets: [
      { id: "w1-b1", text: "Wrote internal docs", tags: [], pinned: false },
      { id: "w1-b2", text: "Built React dashboards", tags: ["react"], pinned: false },
      { id: "w1-b3", text: "Shipped TypeScript components", tags: ["typescript"], pinned: false },
    ],
  });
  const unrelated = makeEntry("w2", {
    title: "Barista",
    organization: "Cafe",
    bullets: [{ id: "w2-b1", text: "Poured coffee", tags: [], pinned: false }],
  });
  const alsoUnrelated = makeEntry("w3", {
    title: "Lifeguard",
    organization: "Pool",
    bullets: [{ id: "w3-b1", text: "Watched swimmers", tags: [], pinned: false }],
  });
  const lessRelevant = makeEntry("w4", {
    title: "Support Analyst",
    bullets: [{ id: "w4-b1", text: "Wrote TypeScript scripts", tags: [], pinned: false }],
  });

  it("orders entries by relevance and caps the section", () => {
    const bank = makeBank(
      [unrelated, lessRelevant, relevant],
      makeSettings({ maxEntriesPerSection: 2 }),
    );
    const selection = selectForJob({ job, bank });
    expect(selection.entries.map((choice) => choice.experienceId)).toEqual(["w1", "w4"]);
  });

  it("drops zero-relevance entries only after the section has one", () => {
    const bank = makeBank([unrelated, alsoUnrelated]);
    const selection = selectForJob({ job, bank });
    expect(selection.entries.map((choice) => choice.experienceId)).toEqual(["w2"]);
  });

  it("keeps pinned entries first even when irrelevant", () => {
    const bank = makeBank(
      [relevant, { ...alsoUnrelated, pinned: true }],
      makeSettings({ maxEntriesPerSection: 2 }),
    );
    const selection = selectForJob({ job, bank });
    expect(selection.entries.map((choice) => choice.experienceId)).toEqual(["w3", "w1"]);
  });

  it("picks the most relevant bullets and respects the bullet cap", () => {
    const bank = makeBank([relevant], makeSettings({ maxBulletsPerEntry: 2 }));
    const selection = selectForJob({ job, bank });
    expect(selection.entries[0]?.bullets.map((bullet) => bullet.bulletId)).toEqual([
      "w1-b2",
      "w1-b3",
    ]);
    expect(selection.entries[0]?.bullets[0]).toEqual({
      bulletId: "w1-b2",
      text: "Built React dashboards",
      rewritten: false,
    });
  });

  it("keeps pinned bullets ahead of more relevant ones", () => {
    const pinnedBullets = makeEntry("w1", {
      ...relevant,
      bullets: [
        { id: "w1-b1", text: "Wrote internal docs", tags: [], pinned: true },
        { id: "w1-b2", text: "Built React dashboards", tags: ["react"], pinned: false },
      ],
    });
    const bank = makeBank([pinnedBullets], makeSettings({ maxBulletsPerEntry: 1 }));
    const selection = selectForJob({ job, bank });
    expect(selection.entries[0]?.bullets.map((bullet) => bullet.bulletId)).toEqual(["w1-b1"]);
  });

  it("orders sections by the configured section order", () => {
    const project = makeEntry("p1", { kind: "project", title: "React playground" });
    const school = makeEntry("s1", { kind: "education", title: "Waterloo" });
    const bank = makeBank([relevant, project, school]);
    const selection = selectForJob({ job, bank });
    expect(selection.entries.map((choice) => choice.experienceId)).toEqual(["s1", "w1", "p1"]);
  });

  it("keeps every skill item but puts matches first", () => {
    const bank = makeBank([relevant]);
    const selection = selectForJob({ job, bank });
    expect(selection.skills).toEqual([
      { groupId: "lang", items: ["TypeScript", "Java", "Python"] },
    ]);
  });

  it("explains the match", () => {
    const selection = selectForJob({ job, bank: makeBank([relevant]) });
    expect(selection.rationale.startsWith("Local match on: ")).toBe(true);
    expect(selection.rationale).toContain("react");
    expect(selection.rationale.split(", ").length).toBeLessThanOrEqual(12);
  });

  it("falls back to a bank-order rationale with no overlap", () => {
    const selection = selectForJob({ job, bank: makeBank([unrelated]) });
    expect(selection.rationale).toBe("No overlapping terms; using pinned entries and bank order.");
  });

  it("is deterministic", () => {
    const bank = makeBank([unrelated, relevant, alsoUnrelated]);
    expect(selectForJob({ job, bank })).toEqual(selectForJob({ job, bank }));
  });
});
