import type { Job } from "@/types/job";

export const jobTerms = ["winter-2027", "summer-2027", "later"] as const;

export type JobTerm = (typeof jobTerms)[number];

export const jobTermLabels: Record<JobTerm, string> = {
  "winter-2027": "Winter 2027",
  "summer-2027": "Summer 2027",
  later: "Later terms",
};

const termPatterns: Record<JobTerm, RegExp> = {
  "winter-2027":
    /\b(?:winter|spring|january)(?:\s*\/\s*(?:winter|spring|summer))?\b[\s,/-]*(?:term\s*)?(?:of\s*)?(?:20|')27\b/i,
  "summer-2027": /\b(?:summer|may|june|july)\b[\s,/-]*(?:term\s*)?(?:of\s*)?(?:20|')27\b/i,
  later:
    /\b(?:fall|autumn|september|october|november|december)\b[\s,/-]*(?:term\s*)?(?:of\s*)?(?:20|')27\b|\b(?:winter|spring|summer|fall|autumn|january|february|march|april|may|june|july|august|september|october|november|december)\b[\s,/-]*(?:term\s*)?(?:of\s*)?(?:20|')(?:2[89]|3\d)\b/i,
};

const internshipTitle = /\b(?:intern(?:ship)?s?|co[ -]?op|cooperative education)\b/i;
const eightMonthTerm = /\b8[\s-]*months?\b/i;
const fourToEightMonthTerm = /\b4\s*[-–]\s*8\s*months?\b/i;
const otherTermPattern =
  /\b(?:winter|spring|summer|fall|autumn|january|february|march|april|may|june|july|august|september|october|november|december)\b[\s,/-]*(?:term\s*)?(?:of\s*)?(?:20|')2[0-6]\b|\b(?:spring|february|march|april)\b[\s,/-]*(?:term\s*)?(?:of\s*)?(?:20|')27\b/i;

export function isInternshipTitle(title: string): boolean {
  return (
    internshipTitle.test(title) &&
    (!eightMonthTerm.test(title) || fourToEightMonthTerm.test(title))
  );
}

export function classifyJobTerms(job: Job): JobTerm[] {
  if (!isInternshipTitle(job.title)) return [];

  const titleMatches = jobTerms.filter((term) => termPatterns[term].test(job.title));
  if (titleMatches.length > 0) return titleMatches;

  const explicit = (job.terms ?? []).join("\n");
  const sources = explicit.length > 0 ? [explicit] : [job.workTerm ?? ""];
  const matches = jobTerms.filter((term) =>
    sources.some((source) => termPatterns[term].test(source)),
  );
  if (matches.length > 0 || explicit.length > 0) return matches;
  const text = [job.summary, job.rawText].filter(Boolean).join("\n");
  const dated = jobTerms.filter((term) => termPatterns[term].test(text));
  if (dated.length > 0) return dated;
  if (!internshipTitle.test(job.title) || otherTermPattern.test(`${job.title}\n${text}`)) return [];
  return ["winter-2027", "summer-2027"];
}
