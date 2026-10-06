import { downloadJson, downloadText, timestampedFileName } from "@/components/shared/download";
import { type JobTerm, jobTermLabels } from "@/lib/ranking/terms";
import type { Job } from "@/types/job";
import type { JobScore, ScoreVerdict } from "@/types/scoring";
import { type JobRow, jobDeadline } from "./jobRows";

export type ExportFormat = "csv" | "json";

type CsvValue = string | number | boolean | undefined;

interface CsvSource {
  job: Job;
  score: JobScore | undefined;
  verdict: ScoreVerdict | undefined;
  terms: JobTerm[];
}

const csvColumns: { header: string; value: (source: CsvSource) => CsvValue }[] = [
  { header: "id", value: ({ job }) => job.id },
  { header: "company", value: ({ job }) => job.company },
  { header: "title", value: ({ job }) => job.title },
  { header: "status", value: ({ job }) => job.status },
  { header: "score", value: ({ score }) => score?.score },
  { header: "likelihood", value: ({ score }) => score?.likelihood },
  { header: "verdict", value: ({ verdict }) => verdict },
  { header: "score summary", value: ({ score }) => score?.summary },
  { header: "location", value: ({ job }) => job.location },
  { header: "city", value: ({ job }) => job.city },
  { header: "region", value: ({ job }) => job.region },
  { header: "country", value: ({ job }) => job.country },
  { header: "arrangement", value: ({ job }) => job.arrangement },
  { header: "duration months", value: ({ job }) => job.durationMonths },
  { header: "work term", value: ({ job }) => job.workTerm },
  { header: "term", value: ({ terms }) => terms.map((term) => jobTermLabels[term]).join("; ") },
  { header: "job type", value: ({ job }) => job.jobType },
  { header: "level", value: ({ job }) => job.level },
  { header: "division", value: ({ job }) => job.division },
  { header: "openings", value: ({ job }) => job.openings },
  { header: "applications", value: ({ job }) => job.applicationCount },
  { header: "deadline", value: ({ job }) => jobDeadline(job) },
  { header: "compensation", value: ({ job }) => job.compensation },
  { header: "targeted programs", value: ({ job }) => job.targetedPrograms?.join("; ") },
  { header: "tags", value: ({ job }) => job.tags?.join("; ") },
  { header: "first seen", value: ({ job }) => job.firstSeenAt },
  { header: "notes", value: ({ job }) => job.notes },
  { header: "summary", value: ({ job }) => job.summary },
  { header: "responsibilities", value: ({ job }) => job.responsibilities },
  { header: "qualifications", value: ({ job }) => job.qualifications },
];

export function csvCell(value: CsvValue): string {
  if (value === undefined) return "";
  const text = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function jobsToCsv(rows: JobRow[]): string {
  const lines = [csvColumns.map((column) => csvCell(column.header)).join(",")];
  for (const row of rows) {
    const source: CsvSource = {
      job: row.job,
      score: row.score,
      verdict: row.verdict,
      terms: row.terms,
    };
    lines.push(csvColumns.map((column) => csvCell(column.value(source))).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function jobsToJson(rows: JobRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      ...row.job,
      ...(row.verdict ? { verdict: row.verdict } : {}),
      ...(row.score ? { scoreDetails: row.score } : {}),
    })),
    null,
    2,
  );
}

export type RawJob = Omit<Job, "status" | "score" | "notes" | "firstSeenAt">;

/** Drops the fields JobScope adds on top of the original posting. */
export function toRawJob(job: Job): RawJob {
  const { status: _status, score: _score, notes: _notes, firstSeenAt: _firstSeenAt, ...raw } = job;
  return raw;
}

export function rawJobsToJson(jobs: Job[]): string {
  return JSON.stringify(jobs.map(toRawJob), null, 2);
}

export function exportRawJobs(jobs: Job[]): void {
  downloadJson(timestampedFileName("raw-jobs"), rawJobsToJson(jobs));
}

export function exportJobs(rows: JobRow[], format: ExportFormat, prefix = "jobs"): void {
  if (format === "csv") {
    downloadText(timestampedFileName(prefix, "csv"), jobsToCsv(rows), "text/csv");
    return;
  }
  downloadJson(timestampedFileName(prefix, "json"), jobsToJson(rows));
}
