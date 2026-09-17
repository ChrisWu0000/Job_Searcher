import { describe, expect, it } from "vitest";
import {
  assumedTailoringCompletionTokensPerJob,
  estimateTailoringCost,
  estimateTokens,
} from "@/lib/ai/cost";
import {
  buildBankPrompt,
  buildTailoringMessages,
  buildTailoringRepairMessages,
  buildTailoringSystemPrompt,
  buildUserPrompt,
} from "@/lib/ai/prompts";
import type { ResumeBank } from "@/lib/resume/contracts";
import type { Job } from "@/types/job";
import { defaultResumeSettings, type ExperienceEntry } from "@/types/resume";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "384922",
    company: "Datadog",
    title: "Backend Engineer Intern",
    location: "Toronto, ON",
    country: "Canada",
    summary: "Work on the ingestion pipeline in Go.",
    application: {
      resume: true,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    rawText: "Go, PostgreSQL and Kubernetes on the ingestion pipeline.",
    scrapedAt: "2026-09-06T14:02:00.000Z",
    status: "new",
    ...overrides,
  };
}

const entries: ExperienceEntry[] = [
  {
    id: "datadog",
    kind: "work",
    title: "Backend Engineering Intern",
    organization: "Datadog",
    startDate: "May 2025",
    endDate: "Aug 2025",
    technologies: ["Go", "PostgreSQL"],
    facts: ["Team of 6 engineers"],
    bullets: [
      {
        id: "dd-1",
        text: "Built Go services for the ingestion pipeline.",
        tags: ["backend", "go"],
        pinned: true,
      },
      {
        id: "dd-2",
        text: "Tuned PostgreSQL queries and cut p95 latency by 40%.",
        tags: ["database"],
        pinned: false,
      },
    ],
    pinned: true,
    order: 0,
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "waterloo",
    kind: "education",
    title: "BASc Computer Engineering",
    organization: "University of Waterloo",
    startDate: "Sep 2024",
    technologies: [],
    facts: [],
    bullets: [
      {
        id: "uw-1",
        text: "Coursework in distributed systems.",
        tags: ["coursework"],
        pinned: false,
      },
    ],
    pinned: false,
    order: 1,
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

function makeBank(tailoringInstructions = ""): ResumeBank {
  return {
    entries,
    settings: {
      ...defaultResumeSettings,
      maxBulletsPerEntry: 2,
      maxEntriesPerSection: 3,
      skillGroups: [
        { id: "languages", name: "Languages", items: ["Go", "TypeScript"] },
        { id: "tools", name: "Tools", items: ["Docker"] },
      ],
      tailoringInstructions,
    },
  };
}

describe("buildTailoringSystemPrompt", () => {
  it("states the caps, the section kinds and the pinned ids", () => {
    const prompt = buildTailoringSystemPrompt(makeBank());
    expect(prompt).toContain("at most 2 bullet(s) per entry");
    expect(prompt).toContain("at most 3 entr(y/ies) per section");
    expect(prompt).toContain("education, work, project, leadership, award");
    expect(prompt).toContain("Pinned entries that must always appear: datadog.");
    expect(prompt).toContain("Pinned bullets that must always appear: datadog/dd-1.");
  });

  it("forbids fabrication and offers the null escape hatch", () => {
    const prompt = buildTailoringSystemPrompt(makeBank());
    expect(prompt).toContain("Never invent an entry");
    expect(prompt).toContain('"text": null');
    expect(prompt).toContain("Never add an item to a group");
    expect(prompt).toContain("entries, skills, rationale");
  });

  it("appends the candidate's own instructions only when there are some", () => {
    expect(buildTailoringSystemPrompt(makeBank())).not.toContain(
      "## Extra instructions from the candidate",
    );
    const prompt = buildTailoringSystemPrompt(makeBank("  Keep the Waterloo entry first.  "));
    expect(prompt).toContain("## Extra instructions from the candidate");
    expect(prompt).toContain("Keep the Waterloo entry first.");
  });
});

describe("buildBankPrompt", () => {
  it("lists every entry id, bullet id and skill group id", () => {
    const prompt = buildBankPrompt(makeBank());
    expect(prompt).toContain(
      "### [datadog] Backend Engineering Intern — Datadog (work, May 2025 - Aug 2025) pinned",
    );
    expect(prompt).toContain("technologies: Go, PostgreSQL");
    expect(prompt).toContain("facts:");
    expect(prompt).toContain("- Team of 6 engineers");
    expect(prompt).toContain(
      "- [dd-1] (tags: backend, go) pinned Built Go services for the ingestion pipeline.",
    );
    expect(prompt).toContain(
      "- [dd-2] (tags: database) Tuned PostgreSQL queries and cut p95 latency by 40%.",
    );
    expect(prompt).toContain(
      "### [waterloo] BASc Computer Engineering — University of Waterloo (education, Sep 2024 - present)",
    );
    expect(prompt).toContain("- [uw-1] (tags: coursework) Coursework in distributed systems.");
    expect(prompt).toContain("## Skill groups");
    expect(prompt).toContain("[languages] Languages: Go, TypeScript");
    expect(prompt).toContain("[tools] Tools: Docker");
  });

  it("prints sections in the configured order", () => {
    const prompt = buildBankPrompt(makeBank());
    expect(prompt.indexOf("## education")).toBeLessThan(prompt.indexOf("## work"));
  });
});

describe("buildTailoringMessages", () => {
  it("puts the system prompt first and the posting plus the bank in the user turn", () => {
    const bank = makeBank();
    const job = makeJob();
    const messages = buildTailoringMessages({ job, bank });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toBe(buildTailoringSystemPrompt(bank));
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toContain(buildUserPrompt(job));
    expect(messages[1]?.content).toContain(buildBankPrompt(bank));
    expect(messages[1]?.content.trimEnd().endsWith("No prose, no markdown fences.")).toBe(true);
  });
});

describe("buildTailoringRepairMessages", () => {
  it("replays the turns, the invalid output and the required keys", () => {
    const bank = makeBank();
    const messages = buildTailoringMessages({ job: makeJob(), bank });
    const repair = buildTailoringRepairMessages(
      { messages, invalidOutput: "{ nope }" },
      "entries: Required",
    );
    expect(repair).toHaveLength(4);
    expect(repair[2]).toEqual({ role: "assistant", content: "{ nope }" });
    expect(repair[3]?.content).toContain("entries: Required");
    expect(repair[3]?.content).toContain("entries, skills, rationale");
    expect(repair[3]?.content).toContain("text is a string or null");
  });
});

describe("estimateTailoringCost", () => {
  it("counts the system and bank prompts once per job", () => {
    const bank = makeBank();
    const jobs = [makeJob(), makeJob({ id: "999" })];
    const estimate = estimateTailoringCost(jobs, bank);
    const fixed =
      estimateTokens(buildTailoringSystemPrompt(bank)) + estimateTokens(buildBankPrompt(bank));
    const expected = jobs.reduce(
      (total, job) => total + fixed + estimateTokens(buildUserPrompt(job)),
      0,
    );
    expect(estimate.jobCount).toBe(2);
    expect(estimate.estimatedPromptTokens).toBe(expected);
    expect(estimate.estimatedCompletionTokens).toBe(2 * assumedTailoringCompletionTokensPerJob);
    expect(estimate.pricingKnown).toBe(false);
    expect(estimate.estimatedCostUsd).toBe(0);
  });

  it("prices the run when pricing is known", () => {
    const estimate = estimateTailoringCost([makeJob()], makeBank(), {
      modelId: "z-ai/glm-5.3-flash",
      promptUsdPerMillion: 0.075,
      completionUsdPerMillion: 0.25,
      fetchedAt: "2026-09-06T00:00:00.000Z",
    });
    expect(estimate.pricingKnown).toBe(true);
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
  });
});
