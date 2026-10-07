import type { Job } from "@/types/job";

const usCitizenshipRequiredPatterns = [
  /\b(?:U\.?S\.?|United States)\s+citizenship\s+(?:is\s+)?required\b/i,
  /\b(?:require(?:s|d)?|must be|only)\s+(?:a\s+)?(?:U\.?S\.?|United States)\s+citizen(?:ship)?\b/i,
  /\b(?:U\.?S\.?|United States)\s+citizens?\s+only\b/i,
];

const noSponsorshipPatterns = [
  /\bdoes not offer (?:visa )?sponsorship\b/i,
  /\bdoesn't offer (?:visa )?sponsorship\b/i,
  /\bdoes not provide (?:visa |employment |immigration )?sponsorship\b/i,
  /\bdo not offer (?:visa )?sponsorship\b/i,
  /\bdo not provide (?:visa |employment |immigration )?sponsorship\b/i,
  /\b(?:unable|not able) to (?:offer|provide) (?:visa )?sponsorship\b/i,
  /\bwill not sponsor\b/i,
  /\bwill not offer (?:visa )?sponsorship\b/i,
  /\bdoes not sponsor\b/i,
  /\bdo not sponsor\b/i,
  /\bunable to sponsor\b/i,
  /\bsponsorship is not (?:available|offered|provided)\b/i,
  /\b(?:visa|employment|immigration) sponsorship is not (?:available|offered|provided)\b/i,
  /\bsponsorship will not be (?:available|offered|provided)\b/i,
  /\bno (?:visa |employment |immigration )?sponsorship (?:is )?(?:available|offered|provided)\b/i,
  /\bwithout (?:the need for )?(?:visa )?sponsorship(?: now or in the future)?\b/i,
  /\bwithout requiring (?:visa )?sponsorship(?: now or in the future)?\b/i,
];

export interface EmploymentRequirements {
  requiresUSCitizenship: boolean;
  noSponsorship: boolean;
}

export function classifyEmploymentRequirementText(text: string): EmploymentRequirements {
  return {
    requiresUSCitizenship: usCitizenshipRequiredPatterns.some((pattern) => pattern.test(text)),
    noSponsorship: noSponsorshipPatterns.some((pattern) => pattern.test(text)),
  };
}

export function classifyEmploymentRequirements(job: Job): EmploymentRequirements {
  const text = [
    job.title,
    job.summary,
    job.responsibilities,
    job.qualifications,
    job.rawText,
    ...(job.tags ?? []),
    ...Object.values(job.fields ?? {}),
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  return classifyEmploymentRequirementText(text);
}
