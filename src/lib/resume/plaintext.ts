import type { ExperienceEntry, ExperienceKind, ResumeSettings } from "@/types/resume";
import { experienceKindLabels, experienceKinds } from "@/types/resume";
import type { ResumeBank } from "./contracts";

function sectionTitle(settings: ResumeSettings, kind: ExperienceKind): string {
  const title = settings.sectionTitles[kind];
  return title === undefined || title === "" ? experienceKindLabels[kind] : title;
}

function plainDates(entry: ExperienceEntry): string {
  const start = (entry.startDate ?? "").trim();
  const end = (entry.endDate ?? "").trim();
  if (start !== "" && end !== "") return `${start} - ${end}`;
  return start !== "" ? start : end;
}

function headingLine(entry: ExperienceEntry): string {
  return [entry.title, entry.organization ?? "", entry.location ?? "", plainDates(entry)]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" | ");
}

function entryLines(entry: ExperienceEntry): string[] {
  const lines = [headingLine(entry)];
  if (entry.technologies.length > 0) lines.push(`Technologies: ${entry.technologies.join(", ")}`);
  for (const bullet of entry.bullets) lines.push(`- ${bullet.text}`);
  if (entry.facts.length > 0) {
    lines.push("Facts:");
    for (const fact of entry.facts) lines.push(`- ${fact}`);
  }
  if (entry.link !== undefined && entry.link.trim() !== "")
    lines.push(`Link: ${entry.link.trim()}`);
  return lines;
}

function sectionKinds(settings: ResumeSettings): ExperienceKind[] {
  const ordered = settings.sectionOrder.filter(
    (kind, index) => settings.sectionOrder.indexOf(kind) === index,
  );
  return [...ordered, ...experienceKinds.filter((kind) => !ordered.includes(kind))];
}

export function bankToPlainText(bank: ResumeBank): string {
  const blocks: string[] = [];
  for (const kind of sectionKinds(bank.settings)) {
    const entries = bank.entries.filter((entry) => entry.kind === kind);
    if (entries.length === 0) continue;
    const body = entries.map((entry) => entryLines(entry).join("\n")).join("\n\n");
    blocks.push(`${sectionTitle(bank.settings, kind)}\n${body}`);
  }
  const groups = bank.settings.skillGroups.filter((group) => group.items.length > 0);
  if (groups.length > 0) {
    const body = groups.map((group) => `${group.name}: ${group.items.join(", ")}`).join("\n");
    blocks.push(`${bank.settings.skillsTitle}\n${body}`);
  }
  return blocks.join("\n\n");
}
