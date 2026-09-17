import { describe, expect, it } from "vitest";
import type { ResumeBank } from "@/lib/resume/contracts";
import {
  escapeLatex,
  formatDates,
  latexOf,
  masterSelection,
  renderResume,
  renderSnippet,
  resumeFileName,
} from "@/lib/resume/latex";
import { bankToPlainText } from "@/lib/resume/plaintext";
import type {
  ExperienceEntry,
  ResumeSelection,
  ResumeSettings,
  TailoredResume,
} from "@/types/resume";
import { defaultResumeSettings } from "@/types/resume";

function makeEntry(id: string, overrides: Partial<ExperienceEntry> = {}): ExperienceEntry {
  return {
    id,
    kind: "work",
    title: `Title ${id}`,
    organization: `Org ${id}`,
    location: "Toronto, ON",
    startDate: "May 2025",
    endDate: "Aug 2025",
    technologies: ["TypeScript", "React"],
    facts: [`fact for ${id}`],
    bullets: [
      { id: `${id}-b1`, text: `first bullet for ${id}`, tags: ["react"], pinned: false },
      { id: `${id}-b2`, text: `second bullet for ${id}`, tags: [], pinned: false },
    ],
    pinned: false,
    order: 0,
    updatedAt: "2026-09-06T14:00:00.000Z",
    ...overrides,
  };
}

function makeSettings(overrides: Partial<ResumeSettings> = {}): ResumeSettings {
  return {
    ...defaultResumeSettings,
    skillGroups: [
      { id: "lang", name: "Languages", items: ["TypeScript", "Python"] },
      { id: "tools", name: "Tools", items: ["Docker"] },
    ],
    ...overrides,
  };
}

function makeBank(entries: ExperienceEntry[], settings = makeSettings()): ResumeBank {
  return { entries, settings };
}

function makeResume(overrides: Partial<TailoredResume> = {}): TailoredResume {
  return {
    id: "r1",
    jobId: "12345",
    company: "Acme Corp.",
    title: "Software Engineer",
    bankVersion: "v1",
    source: "local",
    model: "",
    usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
    selection: { entries: [], skills: [], rationale: "" },
    latex: "original",
    groundingNotes: [],
    prompt: "",
    rawResponse: "",
    createdAt: "2026-09-06T14:00:00.000Z",
    updatedAt: "2026-09-06T14:00:00.000Z",
    ...overrides,
  };
}

describe("escapeLatex", () => {
  it("escapes every special character", () => {
    expect(escapeLatex("\\")).toBe(String.raw`\textbackslash{}`);
    expect(escapeLatex("&")).toBe(String.raw`\&`);
    expect(escapeLatex("%")).toBe(String.raw`\%`);
    expect(escapeLatex("$")).toBe(String.raw`\$`);
    expect(escapeLatex("#")).toBe(String.raw`\#`);
    expect(escapeLatex("_")).toBe(String.raw`\_`);
    expect(escapeLatex("{")).toBe(String.raw`\{`);
    expect(escapeLatex("}")).toBe(String.raw`\}`);
    expect(escapeLatex("~")).toBe(String.raw`\textasciitilde{}`);
    expect(escapeLatex("^")).toBe(String.raw`\textasciicircum{}`);
  });

  it("does not double escape the braces it introduces", () => {
    expect(escapeLatex("a~b")).toBe(String.raw`a\textasciitilde{}b`);
  });

  it("normalizes fancy quotes and dashes", () => {
    expect(escapeLatex("\u201cquoted\u201d")).toBe('"quoted"');
    expect(escapeLatex("it\u2019s")).toBe("it's");
    expect(escapeLatex("2024\u20132025")).toBe("2024--2025");
    expect(escapeLatex("a\u2014b")).toBe("a---b");
  });

  it("escapes a whole phrase", () => {
    expect(escapeLatex("R&D grew 50% on $1M")).toBe(String.raw`R\&D grew 50\% on \$1M`);
  });
});

describe("renderSnippet", () => {
  it("replaces known placeholders and blanks unknown ones", () => {
    expect(renderSnippet("<<a>>-<<b>>-<<c>>", { a: "1", b: "2" })).toBe("1-2-");
  });

  it("does not escape the values it inserts", () => {
    expect(renderSnippet("<<text>>", { text: String.raw`\&` })).toBe(String.raw`\&`);
  });

  it("treats dollar signs in values literally", () => {
    expect(renderSnippet("<<text>>", { text: "$&" })).toBe("$&");
  });
});

describe("formatDates", () => {
  it("joins a start and an end", () => {
    expect(formatDates(makeEntry("e1"))).toBe("May 2025 -- Aug 2025");
  });

  it("keeps the start alone when there is no end", () => {
    const entry = makeEntry("e1");
    delete entry.endDate;
    expect(formatDates(entry)).toBe("May 2025");
  });

  it("is empty when there are no dates", () => {
    const entry = makeEntry("e1");
    delete entry.startDate;
    delete entry.endDate;
    expect(formatDates(entry)).toBe("");
  });
});

describe("renderResume", () => {
  const work = makeEntry("w1", { kind: "work" });
  const project = makeEntry("p1", {
    kind: "project",
    link: "https://github.com/me/thing",
    bullets: [
      { id: "p1-b1", text: "Built R&D tooling", tags: [], pinned: false },
      { id: "p1-b2", text: "Shipped it", tags: [], pinned: false },
    ],
  });
  const school = makeEntry("s1", { kind: "education" });
  const bank = makeBank([work, project, school]);
  const selection: ResumeSelection = {
    entries: [
      { experienceId: "w1", bullets: [{ bulletId: "w1-b1", text: "Did work", rewritten: false }] },
      {
        experienceId: "p1",
        bullets: [{ bulletId: "p1-b1", text: "Built R&D tooling", rewritten: false }],
      },
      { experienceId: "s1", bullets: [] },
    ],
    skills: [{ groupId: "lang", items: ["TypeScript"] }],
    rationale: "",
  };

  it("produces a full document with sections in the configured order", () => {
    const latex = renderResume({ bank, selection });
    expect(latex).toContain(String.raw`\begin{document}`);
    expect(latex).toContain(String.raw`\end{document}`);
    const education = latex.indexOf(String.raw`\section{Education}`);
    const experience = latex.indexOf(String.raw`\section{Experience}`);
    const projects = latex.indexOf(String.raw`\section{Projects}`);
    expect(education).toBeGreaterThan(-1);
    expect(education).toBeLessThan(experience);
    expect(experience).toBeLessThan(projects);
  });

  it("skips sections with no selected entries", () => {
    const latex = renderResume({ bank, selection });
    expect(latex).not.toContain(String.raw`\section{Leadership}`);
    expect(latex).not.toContain(String.raw`\section{Awards}`);
  });

  it("uses the project snippet for projects and the entry snippet for work", () => {
    const latex = renderResume({ bank, selection });
    expect(latex).toContain(String.raw`\resumeProjectHeading`);
    expect(latex).toContain(String.raw`\resumeSubheading`);
    expect(latex).toContain(String.raw`\emph{TypeScript, React}`);
  });

  it("escapes bullet text", () => {
    const latex = renderResume({ bank, selection });
    expect(latex).toContain(String.raw`\resumeItem{Built R\&D tooling}`);
  });

  it("uses a custom section title when configured", () => {
    const settings = makeSettings({
      sectionTitles: { ...defaultResumeSettings.sectionTitles, work: "Work Experience" },
    });
    const latex = renderResume({ bank: makeBank([work], settings), selection });
    expect(latex).toContain(String.raw`\section{Work Experience}`);
  });

  it("appends the skills section after every other section", () => {
    const latex = renderResume({ bank, selection });
    const projects = latex.indexOf(String.raw`\section{Projects}`);
    const skills = latex.indexOf(String.raw`\section{Technical Skills}`);
    expect(skills).toBeGreaterThan(projects);
    expect(latex).toContain(String.raw`\textbf{Languages}{: TypeScript}`);
    expect(latex).not.toContain(String.raw`\textbf{Tools}`);
  });

  it("omits the skills section when nothing is selected", () => {
    const latex = renderResume({ bank, selection: { ...selection, skills: [] } });
    expect(latex).not.toContain(String.raw`\section{Technical Skills}`);
  });

  it("ignores unknown experience and bullet ids", () => {
    const latex = renderResume({
      bank,
      selection: {
        entries: [
          { experienceId: "missing", bullets: [] },
          {
            experienceId: "w1",
            bullets: [
              { bulletId: "nope", text: "ghost bullet", rewritten: false },
              { bulletId: "w1-b2", text: "real bullet", rewritten: false },
            ],
          },
        ],
        skills: [{ groupId: "unknown", items: ["Nope"] }],
        rationale: "",
      },
    });
    expect(latex).not.toContain("ghost bullet");
    expect(latex).toContain("real bullet");
    expect(latex).not.toContain(String.raw`\section{Technical Skills}`);
  });

  it("renders a link without its protocol", () => {
    const settings = makeSettings({
      snippets: { ...defaultResumeSettings.snippets, project: "<<link>>" },
    });
    const latex = renderResume({ bank: makeBank([project], settings), selection });
    expect(latex).toContain(String.raw`\href{https://github.com/me/thing}`);
    expect(latex).toContain(String.raw`\underline{github.com/me/thing}`);
  });
});

describe("masterSelection", () => {
  it("includes every entry and caps bullets with pinned ones first", () => {
    const entry = makeEntry("w1", {
      bullets: [
        { id: "b1", text: "one", tags: [], pinned: false },
        { id: "b2", text: "two", tags: [], pinned: true },
        { id: "b3", text: "three", tags: [], pinned: false },
      ],
    });
    const bank = makeBank([entry, makeEntry("w2")], makeSettings({ maxBulletsPerEntry: 2 }));
    const selection = masterSelection(bank);
    expect(selection.entries.map((choice) => choice.experienceId)).toEqual(["w1", "w2"]);
    expect(selection.entries[0]?.bullets.map((bullet) => bullet.bulletId)).toEqual(["b2", "b1"]);
    expect(selection.entries[0]?.bullets[0]).toEqual({
      bulletId: "b2",
      text: "two",
      rewritten: false,
    });
    expect(selection.skills).toEqual([
      { groupId: "lang", items: ["TypeScript", "Python"] },
      { groupId: "tools", items: ["Docker"] },
    ]);
    expect(selection.rationale).toBe("Every entry in the bank.");
  });

  it("ignores the entries-per-section cap", () => {
    const entries = ["a", "b", "c", "d", "e"].map((id) => makeEntry(id));
    const bank = makeBank(entries, makeSettings({ maxEntriesPerSection: 1 }));
    expect(masterSelection(bank).entries).toHaveLength(5);
  });
});

describe("latexOf", () => {
  it("prefers the edited latex", () => {
    expect(latexOf(makeResume())).toBe("original");
    expect(latexOf(makeResume({ editedLatex: "edited" }))).toBe("edited");
  });
});

describe("resumeFileName", () => {
  it("slugs the company and appends the job id", () => {
    expect(resumeFileName(makeResume())).toBe("resume-acme-corp-12345.tex");
  });

  it("takes an extension", () => {
    expect(resumeFileName(makeResume(), "pdf")).toBe("resume-acme-corp-12345.pdf");
  });

  it("trims separators and caps the slug length", () => {
    const resume = makeResume({ company: `  ${"Very Long Company Name ".repeat(4)}  ` });
    const name = resumeFileName(resume);
    const slug = name.slice("resume-".length, name.indexOf("-12345."));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.startsWith("-")).toBe(false);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back when the company has no usable characters", () => {
    expect(resumeFileName(makeResume({ company: "!!!" }))).toBe("resume-company-12345.tex");
  });
});

describe("bankToPlainText", () => {
  it("includes every entry, bullet and fact", () => {
    const bank = makeBank([
      makeEntry("w1", { kind: "work", facts: ["grew usage 3x", "team of 5"] }),
      makeEntry("p1", { kind: "project", title: "Side Project" }),
    ]);
    const text = bankToPlainText(bank);
    expect(text).toContain("Experience");
    expect(text).toContain("Projects");
    expect(text).toContain("Title w1 | Org w1 | Toronto, ON | May 2025 - Aug 2025");
    expect(text).toContain("Technologies: TypeScript, React");
    expect(text).toContain("- first bullet for w1");
    expect(text).toContain("- second bullet for w1");
    expect(text).toContain("Facts:");
    expect(text).toContain("- grew usage 3x");
    expect(text).toContain("- team of 5");
    expect(text).toContain("- first bullet for p1");
    expect(text).toContain("Technical Skills");
    expect(text).toContain("Languages: TypeScript, Python");
    expect(text).toContain("Tools: Docker");
  });

  it("skips empty sections and empty parts", () => {
    const entry = makeEntry("w1", { technologies: [], facts: [] });
    delete entry.organization;
    delete entry.location;
    const text = bankToPlainText(makeBank([entry], makeSettings({ skillGroups: [] })));
    expect(text).toContain("Title w1 | May 2025 - Aug 2025");
    expect(text).not.toContain("Technologies:");
    expect(text).not.toContain("Facts:");
    expect(text).not.toContain("Projects");
    expect(text).not.toContain("Technical Skills");
  });
});
