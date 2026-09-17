import type {
  BulletChoice,
  EntryChoice,
  ExperienceBullet,
  ExperienceEntry,
  ExperienceKind,
  LatexSnippets,
  ResumeSelection,
  ResumeSettings,
  TailoredResume,
} from "@/types/resume";
import { experienceKindLabels } from "@/types/resume";
import type { RenderResumeInput, ResumeBank } from "./contracts";

const latexEscapes: Record<string, string> = {
  "\\": String.raw`\textbackslash{}`,
  "&": String.raw`\&`,
  "%": String.raw`\%`,
  $: String.raw`\$`,
  "#": String.raw`\#`,
  _: String.raw`\_`,
  "{": String.raw`\{`,
  "}": String.raw`\}`,
  "~": String.raw`\textasciitilde{}`,
  "^": String.raw`\textasciicircum{}`,
};

const escapablePattern = /[\\&%$#_{}~^]/g;
const placeholderPattern = /<<(\w+)>>/g;
const protocolPattern = /^[a-z][a-z0-9+.-]*:\/\//i;
const slugSeparatorPattern = /[^a-z0-9]+/g;
const slugTrimPattern = /^-+|-+$/g;

const maxFileNameSlugLength = 40;

export function escapeLatex(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/—/g, "---")
    .replace(/–/g, "--")
    .replace(escapablePattern, (character) => latexEscapes[character] ?? character);
}

export function renderSnippet(snippet: string, values: Record<string, string>): string {
  return snippet.replace(placeholderPattern, (_match, key: string) => values[key] ?? "");
}

export function formatDates(entry: ExperienceEntry): string {
  const start = (entry.startDate ?? "").trim();
  const end = (entry.endDate ?? "").trim();
  if (start !== "" && end !== "") return `${escapeLatex(start)} -- ${escapeLatex(end)}`;
  if (start !== "") return escapeLatex(start);
  if (end !== "") return escapeLatex(end);
  return "";
}

function formatLink(link: string | undefined): string {
  const url = (link ?? "").trim();
  if (url === "") return "";
  const display = escapeLatex(url.replace(protocolPattern, ""));
  return String.raw`\href{${url}}{\underline{${display}}}`;
}

function orderedBullets(bullets: ExperienceBullet[]): ExperienceBullet[] {
  return [
    ...bullets.filter((bullet) => bullet.pinned),
    ...bullets.filter((bullet) => !bullet.pinned),
  ];
}

function renderBullets(
  entry: ExperienceEntry,
  choices: BulletChoice[],
  snippets: LatexSnippets,
): string {
  const known = new Set(entry.bullets.map((bullet) => bullet.id));
  return choices
    .filter((choice) => known.has(choice.bulletId))
    .map((choice) => renderSnippet(snippets.bullet, { text: escapeLatex(choice.text) }))
    .join("\n");
}

function renderEntry(entry: ExperienceEntry, choice: EntryChoice, snippets: LatexSnippets): string {
  const snippet = entry.kind === "project" ? snippets.project : snippets.entry;
  return renderSnippet(snippet, {
    title: escapeLatex(entry.title),
    organization: escapeLatex(entry.organization ?? ""),
    location: escapeLatex(entry.location ?? ""),
    dates: formatDates(entry),
    technologies: entry.technologies.map(escapeLatex).join(", "),
    link: formatLink(entry.link),
    bullets: renderBullets(entry, choice.bullets, snippets),
  });
}

function sectionTitle(settings: ResumeSettings, kind: ExperienceKind): string {
  const title = settings.sectionTitles[kind];
  return title === undefined || title === "" ? experienceKindLabels[kind] : title;
}

function renderSkills(settings: ResumeSettings, selection: ResumeSelection): string {
  const chosen = new Map(selection.skills.map((choice) => [choice.groupId, choice.items]));
  const groups = settings.skillGroups
    .map((group) => ({ group, items: chosen.get(group.id) ?? [] }))
    .filter(({ items }) => items.length > 0);
  if (groups.length === 0) return "";
  const rendered = groups
    .map(({ group, items }) =>
      renderSnippet(settings.snippets.skillGroup, {
        name: escapeLatex(group.name),
        items: items.map(escapeLatex).join(", "),
      }),
    )
    .join("\n");
  return renderSnippet(settings.snippets.skills, {
    title: escapeLatex(settings.skillsTitle),
    groups: rendered,
  });
}

export function renderResume(input: RenderResumeInput): string {
  const { bank, selection } = input;
  const { settings } = bank;
  const byId = new Map(bank.entries.map((entry) => [entry.id, entry]));
  const sections: string[] = [];
  for (const kind of settings.sectionOrder) {
    const rendered = selection.entries
      .map((choice) => ({ choice, entry: byId.get(choice.experienceId) }))
      .filter(
        (pair): pair is { choice: EntryChoice; entry: ExperienceEntry } =>
          pair.entry !== undefined && pair.entry.kind === kind,
      )
      .map(({ choice, entry }) => renderEntry(entry, choice, settings.snippets));
    if (rendered.length === 0) continue;
    sections.push(
      renderSnippet(settings.snippets.section, {
        title: escapeLatex(sectionTitle(settings, kind)),
        entries: rendered.join("\n"),
      }),
    );
  }
  const skills = renderSkills(settings, selection);
  if (skills !== "") sections.push(skills);
  return renderSnippet(settings.snippets.document, { body: sections.join("\n") });
}

export function masterSelection(bank: ResumeBank): ResumeSelection {
  const limit = bank.settings.maxBulletsPerEntry;
  return {
    entries: bank.entries.map((entry) => ({
      experienceId: entry.id,
      bullets: orderedBullets(entry.bullets)
        .slice(0, limit)
        .map((bullet) => ({ bulletId: bullet.id, text: bullet.text, rewritten: false })),
    })),
    skills: bank.settings.skillGroups.map((group) => ({
      groupId: group.id,
      items: [...group.items],
    })),
    rationale: "Every entry in the bank.",
  };
}

export function latexOf(resume: TailoredResume): string {
  return resume.editedLatex ?? resume.latex;
}

export function resumeFileName(resume: TailoredResume, extension = "tex"): string {
  const slug = resume.company
    .toLowerCase()
    .replace(slugSeparatorPattern, "-")
    .replace(slugTrimPattern, "")
    .slice(0, maxFileNameSlugLength)
    .replace(slugTrimPattern, "");
  const company = slug === "" ? "company" : slug;
  return `resume-${company}-${resume.jobId}.${extension}`;
}
