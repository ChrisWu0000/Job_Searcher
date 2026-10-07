import { classifyJobCategories } from "@/lib/ranking/categories";
import { classifyJobTerms } from "@/lib/ranking/terms";
import { nowIso, postedAtIso } from "@/lib/time";
import type { Job } from "@/types/job";

export interface PublicJobFeed {
  id: string;
  label: string;
  url: string;
  parse(payload: unknown): unknown[];
}

const githubRaw = "https://raw.githubusercontent.com";

export const publicJobFeeds: PublicJobFeed[] = [
  {
    id: "simplify",
    label: "SimplifyJobs Summer 2027",
    url: `${githubRaw}/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json`,
    parse: asArray,
  },
  {
    id: "zshah101",
    label: "zshah101 internships",
    url: `${githubRaw}/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships/main/data/jobs.json`,
    parse: asObjectValues,
  },
  {
    id: "aprameyak",
    label: "aprameyak tech jobs",
    url: `${githubRaw}/aprameyak/2027-tech-jobs/main/listings.json`,
    parse: asArray,
  },
];

function asArray(payload: unknown): unknown[] {
  if (!Array.isArray(payload)) throw new Error("expected a JSON array");
  return payload;
}

function asObjectValues(payload: unknown): unknown[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("expected a keyed JSON object");
  }
  return Object.values(payload);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function fieldText(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === "string") &&
      value.length > 0
    ) {
      return value.join("; ");
    }
  }
  return undefined;
}

export function canonicalJobUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|source|ref|gh_src)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function termValues(record: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const key of ["terms", "term", "season", "seasons"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") found.push(value.trim());
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim() !== "") found.push(entry.trim());
      }
    }
  }
  return found;
}

function isActive(record: Record<string, unknown>): boolean {
  return record.active !== false && record.is_open !== false && record.is_visible !== false;
}

export function normalizeFeedEntry(value: unknown, feed: PublicJobFeed): Job | undefined {
  const record = object(value);
  if (!record || !isActive(record)) return undefined;

  const title = fieldText(record, "title", "role");
  const company = fieldText(record, "company_name", "company", "employer");
  const urlValue = fieldText(record, "url", "absolute_url", "jobUrl", "hostedUrl");
  const url = urlValue ? canonicalJobUrl(urlValue) : undefined;
  if (!title || !company || !url) return undefined;

  const category = fieldText(record, "category", "type");
  const termList = termValues(record);
  const postedAt = postedAtIso(
    record.date_posted ?? record.datePosted ?? record.posted_at ?? record.postedAt ?? record.date,
  );
  const description = fieldText(record, "descriptionPlain", "description", "content", "summary");
  const sponsorship = fieldText(record, "sponsorship");
  const location = fieldText(record, "locations", "location") ?? "Not specified";
  const scrapedAt = nowIso();
  const tags = category ? [category] : undefined;
  const job: Job = {
    id: `url:${url}`,
    company,
    title,
    location,
    source: feed.id,
    url,
    scrapedAt,
    firstSeenAt: scrapedAt,
    ...(tags ? { tags } : {}),
    ...(termList.length > 0 ? { terms: termList } : {}),
    ...(postedAt ? { postedAt } : {}),
    ...(description ? { summary: description } : {}),
    ...(sponsorship ? { fields: { sponsorship } } : {}),
    rawText: description ?? `${title} at ${company}`,
    application: {
      resume: false,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    status: "new",
  };
  return job;
}

export function feedEntries(
  payload: unknown,
  feed: PublicJobFeed,
): {
  jobs: Job[];
  skipped: number;
} {
  const entries = feed.parse(payload);
  const jobs = new Map<string, Job>();
  let skipped = 0;
  for (const entry of entries) {
    const job = normalizeFeedEntry(entry, feed);
    if (!job || classifyJobCategories(job).length === 0) {
      skipped += 1;
      continue;
    }
    if (job.terms && classifyJobTerms(job).length === 0) {
      skipped += 1;
      continue;
    }
    const existing = jobs.get(job.id);
    if (existing) {
      existing.source = [...new Set([existing.source, job.source].filter(Boolean))].join(", ");
    } else {
      jobs.set(job.id, job);
    }
  }
  return { jobs: [...jobs.values()], skipped };
}
