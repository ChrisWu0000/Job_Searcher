import { stableObjectHash } from "@/lib/hash";
import type { ExperienceEntry, ResumeSettings } from "@/types/resume";

export function resumeSettingsVersion(settings: ResumeSettings): string {
  return stableObjectHash({
    snippets: settings.snippets,
    sectionOrder: settings.sectionOrder,
    sectionTitles: settings.sectionTitles,
    skillsTitle: settings.skillsTitle,
    skillGroups: settings.skillGroups,
    maxBulletsPerEntry: settings.maxBulletsPerEntry,
    maxEntriesPerSection: settings.maxEntriesPerSection,
    tailoringInstructions: settings.tailoringInstructions,
  });
}

export function withResumeSettingsVersion(settings: ResumeSettings): ResumeSettings {
  return { ...settings, version: resumeSettingsVersion(settings) };
}

export function bankVersion(entries: ExperienceEntry[], settings: ResumeSettings): string {
  const sorted = [...entries]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map(({ updatedAt: _updatedAt, ...entry }) => entry);
  return stableObjectHash({ entries: sorted, settings: resumeSettingsVersion(settings) });
}
