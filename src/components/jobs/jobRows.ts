import { classifyJobCategories, type JobCategory } from "@/lib/ranking/categories";
import { prefilterJob } from "@/lib/ranking/prefilter";
import { classifyJobTerms, type JobTerm } from "@/lib/ranking/terms";
import { hoursUntil } from "@/lib/time";
import type { JobFilters } from "@/stores/ui";
import type { Job } from "@/types/job";
import type { Profile } from "@/types/preferences";
import type { JobScore, ScoreVerdict } from "@/types/scoring";

export interface JobRow {
  job: Job;
  score?: JobScore;
  verdict?: ScoreVerdict;
  isNew: boolean;
  categories: JobCategory[];
  terms: JobTerm[];
  autoFilterReason?: string;
}

export function effectiveVerdict(
  job: Job,
  score: JobScore | undefined,
  autoFilterReason?: string,
): ScoreVerdict | undefined {
  if (job.status === "skipped" || autoFilterReason) return "skip";
  return score?.model === "prefilter" ? undefined : score?.verdict;
}

export function isNewSince(job: Job, newSince: string | undefined): boolean {
  if (newSince === undefined || job.firstSeenAt === undefined) return false;
  return job.firstSeenAt >= newSince;
}

export function buildJobRows(
  jobs: Job[],
  scores: JobScore[],
  newSince?: string,
  profile?: Profile,
): JobRow[] {
  const byJobId = new Map<string, JobScore>();
  for (const score of scores) byJobId.set(score.jobId, score);
  return jobs.map((job) => {
    const storedScore = byJobId.get(job.id);
    const prefilter = profile ? prefilterJob(job, profile) : undefined;
    const score =
      storedScore?.model === "prefilter" && !prefilter?.excluded ? undefined : storedScore;
    const autoFilterReason = prefilter?.excluded ? prefilter.reason : undefined;
    const isNew = isNewSince(job, newSince);
    const categories = classifyJobCategories(job);
    const verdict = effectiveVerdict(job, score, autoFilterReason);
    return {
      job,
      ...(score ? { score } : {}),
      ...(verdict ? { verdict } : {}),
      isNew,
      categories,
      terms: classifyJobTerms(job),
      ...(autoFilterReason ? { autoFilterReason } : {}),
    };
  });
}

function searchableText(row: JobRow): string {
  const { job } = row;
  return [
    job.id,
    job.company,
    job.title,
    job.location,
    job.source,
    job.url,
    job.city,
    job.region,
    job.country,
    job.compensation,
    job.summary,
    job.notes,
    ...(job.targetedPrograms ?? []),
    row.score?.summary,
    row.autoFilterReason,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();
}

export function jobDeadline(job: Job): string | undefined {
  return job.application.deadline ?? job.deadline;
}

export function filterJobRows(
  rows: JobRow[],
  filters: JobFilters,
  now: Date = new Date(),
): JobRow[] {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    const { job, score, verdict } = row;
    if (filters.onlyAutoFiltered && !row.autoFilterReason) return false;
    if (needle.length > 0 && !searchableText(row).includes(needle)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(job.status)) return false;
    if (
      filters.categories.length > 0 &&
      !filters.categories.some((category) => row.categories.includes(category))
    )
      return false;
    if (filters.terms.length > 0 && !filters.terms.some((term) => row.terms.includes(term))) {
      return false;
    }
    if (filters.onlyNew && !row.isNew) return false;
    if (filters.verdicts.length > 0) {
      if (!verdict || !filters.verdicts.includes(verdict)) return false;
    } else if (
      !filters.showSkipVerdicts &&
      !filters.onlyAutoFiltered &&
      !(job.status === "interested" && filters.statuses.includes("interested")) &&
      verdict === "skip"
    ) {
      return false;
    }
    if (filters.countries.length > 0) {
      if (!job.country || !filters.countries.includes(job.country)) return false;
    }
    if (filters.arrangements.length > 0) {
      if (!job.arrangement || !filters.arrangements.includes(job.arrangement)) return false;
    }
    if (filters.durationMonths !== undefined && job.durationMonths !== filters.durationMonths) {
      return false;
    }
    if (filters.minScore !== undefined && (score?.score ?? -1) < filters.minScore) return false;
    if (filters.minLikelihood !== undefined && (score?.likelihood ?? -1) < filters.minLikelihood) {
      return false;
    }
    if (filters.onlyUnscored && score !== undefined) return false;
    if (filters.deadlineWithinHours !== undefined) {
      const deadline = jobDeadline(job);
      if (!deadline) return false;
      const hours = hoursUntil(deadline, now);
      if (hours === undefined || hours < 0 || hours > filters.deadlineWithinHours) return false;
    }
    return true;
  });
}

export function distinctCountries(rows: JobRow[]): string[] {
  const countries = new Set<string>();
  for (const row of rows) {
    if (row.job.country) countries.add(row.job.country);
  }
  return [...countries].sort();
}
