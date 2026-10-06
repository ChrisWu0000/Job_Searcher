import type { Job } from "@/types/job";

export const jobTerms = ["winter-2027", "summer-2027"] as const;

export type JobTerm = (typeof jobTerms)[number];

export const jobTermLabels: Record<JobTerm, string> = {
  "winter-2027": "Winter 2027",
  "summer-2027": "Summer 2027",
};

const termPatterns: Record<JobTerm, RegExp> = {
  "winter-2027": /\b(?:winter|january)\b[\s,/-]*(?:term\s*)?(?:of\s*)?(?:20|')27\b/i,
  "summer-2027": /\b(?:summer|may|june|july)\b[\s,/-]*(?:term\s*)?(?:of\s*)?(?:20|')27\b/i,
};

export function classifyJobTerms(job: Job): JobTerm[] {
  const explicit = (job.terms ?? []).join("\n");
  const sources = explicit.length > 0 ? [explicit] : [job.title, job.workTerm ?? ""];
  const matches = jobTerms.filter((term) =>
    sources.some((source) => termPatterns[term].test(source)),
  );
  if (matches.length > 0 || explicit.length > 0) return matches;
  const text = [job.summary, job.rawText].filter(Boolean).join("\n");
  return jobTerms.filter((term) => termPatterns[term].test(text));
}
