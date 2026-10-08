import type { FetchLike } from "@/lib/ai/openrouter";
import { classifyJobCategories, type JobCategory } from "@/lib/ranking/categories";
import { payTextForJob } from "@/lib/ranking/prefilter";
import { classifyJobTerms, type JobTerm } from "@/lib/ranking/terms";
import {
  discoverPublicBoards,
  fetchPublicBoardJobs,
  type PublicBoardProvider,
} from "@/lib/sources/boards";
import { fetchInternListJobs, internListFeed } from "@/lib/sources/internList";
import { feedEntries, type PublicJobFeed, publicJobFeeds } from "@/lib/sources/publicFeeds";
import type { Job } from "@/types/job";
import { displayCompanyName } from "./companyNames";
import { payFromHtml, payFromText, textFromHtml } from "./pay";
import { classifyEmploymentRequirements, classifyEmploymentRequirementText } from "./requirements";

export interface Listing {
  id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  categories: JobCategory[];
  terms: JobTerm[];
  requiresUSCitizenship?: boolean;
  noSponsorship?: boolean;
  pay?: string;
  postedAt?: string;
}

export interface ListingSource {
  id: string;
  label: string;
  kind: "feed" | "board";
}

const providers: { id: PublicBoardProvider; label: string }[] = [
  { id: "ashby", label: "Ashby boards" },
  { id: "greenhouse", label: "Greenhouse boards" },
  { id: "lever", label: "Lever boards" },
  { id: "smartrecruiters", label: "SmartRecruiters boards" },
  { id: "workable", label: "Workable boards" },
  { id: "pinpoint", label: "Pinpoint boards" },
  { id: "gem", label: "Gem boards" },
  { id: "workday", label: "Workday boards" },
];

export const listingSources: ListingSource[] = [
  ...publicJobFeeds.map((feed) => ({ id: feed.id, label: feed.label, kind: "feed" as const })),
  { id: internListFeed.id, label: internListFeed.label, kind: "feed" as const },
  ...providers.map((provider) => ({ ...provider, kind: "board" as const })),
];

export function toListing(job: Job): Listing | undefined {
  if (!job.url) return undefined;
  const categories = classifyJobCategories(job);
  const terms = classifyJobTerms(job);
  if (categories.length === 0 || terms.length === 0) return undefined;
  const pay = job.compensation?.trim() || payFromText(payTextForJob(job));
  const requirements = classifyEmploymentRequirements(job);
  return {
    id: job.id,
    company: displayCompanyName(job.company),
    title: job.title,
    location: job.location,
    url: job.url,
    categories,
    terms,
    ...(requirements.requiresUSCitizenship ? { requiresUSCitizenship: true } : {}),
    ...(requirements.noSponsorship ? { noSponsorship: true } : {}),
    ...(pay ? { pay } : {}),
    ...(job.postedAt ? { postedAt: job.postedAt } : {}),
  };
}

async function fetchFeedJobs(
  feed: PublicJobFeed,
  fetchImpl: FetchLike,
  failures: string[],
): Promise<Job[]> {
  try {
    const response = await fetchImpl(feed.url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return feedEntries(await response.json(), feed).jobs;
  } catch (cause) {
    failures.push(`${feed.label}: ${cause instanceof Error ? cause.message : String(cause)}`);
    return [];
  }
}

const payLookbackDays = 14;

function hasDescription(job: Job): boolean {
  if (job.detailScrapedAt) return true;
  const detailText = [
    job.responsibilities,
    job.qualifications,
    ...Object.entries(job.fields ?? {})
      .filter(([key]) => /description|responsibilit|qualifications?/i.test(key))
      .map(([, value]) => value),
  ];
  if (detailText.some((value) => typeof value === "string" && value.trim().length > 0)) return true;
  return false;
}

function needsEligibilityDescription(job: Job, listing: Listing): boolean {
  return !hasDescription(job) && !(listing.requiresUSCitizenship && listing.noSponsorship);
}

export async function enrichListingDetails(
  listings: Listing[],
  fetchImpl: FetchLike,
  eligibilityDescriptionUrls: ReadonlySet<string> = new Set(),
  concurrency = 8,
  now: Date = new Date(),
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - payLookbackDays * 86_400_000).toISOString();
  const failures = new Map<
    string,
    { purpose: "salary" | "eligibility"; reason: string; count: number; sample: string }
  >();
  const recordFailure = (
    purpose: "salary" | "eligibility",
    reason: string,
    listing: Listing,
  ): void => {
    const key = `${purpose} ${reason}`;
    const current = failures.get(key);
    failures.set(key, {
      purpose,
      reason,
      count: (current?.count ?? 0) + 1,
      sample: current?.sample ?? `${listing.company}: ${listing.title}`,
    });
  };
  const needsPay = (listing: Listing): boolean =>
    !listing.pay &&
    (new URL(listing.url).hostname.endsWith(".myworkdayjobs.com") ||
      (listing.postedAt !== undefined && listing.postedAt >= cutoff));
  const queue = listings.filter(
    (listing) => eligibilityDescriptionUrls.has(listing.url) || needsPay(listing),
  );
  const worker = async (): Promise<void> => {
    for (let listing = queue.shift(); listing; listing = queue.shift()) {
      const checksEligibility = eligibilityDescriptionUrls.has(listing.url);
      const checksPay = needsPay(listing);
      try {
        const response = await fetchImpl(listing.url, {
          headers: { Accept: "text/html,application/xhtml+xml" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          if (checksPay) recordFailure("salary", `HTTP ${response.status}`, listing);
          if (checksEligibility) recordFailure("eligibility", `HTTP ${response.status}`, listing);
          continue;
        }
        const html = await response.text();
        if (checksPay) {
          const pay = payFromHtml(html);
          if (pay) listing.pay = pay;
        }
        if (checksEligibility) {
          const requirements = classifyEmploymentRequirementText(textFromHtml(html));
          if (requirements.requiresUSCitizenship) listing.requiresUSCitizenship = true;
          if (requirements.noSponsorship) listing.noSponsorship = true;
        }
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        if (checksPay) recordFailure("salary", reason, listing);
        if (checksEligibility) recordFailure("eligibility", reason, listing);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return [...failures].map(
    ([, { purpose, reason, count, sample }]) =>
      `${purpose} page ${reason} for ${count} listing${count === 1 ? "" : "s"} (e.g. ${sample})`,
  );
}

export interface ScrapeResult {
  listings: Listing[];
  failures: string[];
}

export async function scrapeSource(
  sourceId: string,
  fetchImpl: FetchLike,
  boardConcurrency = 8,
): Promise<ScrapeResult> {
  const source = listingSources.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  const failures: string[] = [];
  const listings = new Map<string, Listing>();

  if (source.id === internListFeed.id) {
    try {
      for (const job of await fetchInternListJobs(fetchImpl)) {
        const listing = toListing(job);
        if (listing) listings.set(listing.id, listing);
      }
    } catch (cause) {
      failures.push(`${source.label}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return { listings: [...listings.values()], failures };
  }

  if (source.kind === "feed") {
    const feed = publicJobFeeds.find((candidate) => candidate.id === source.id);
    if (!feed) throw new Error(`Unknown feed: ${sourceId}`);
    const eligibilityDescriptionUrls = new Set<string>();
    for (const job of await fetchFeedJobs(feed, fetchImpl, failures)) {
      const listing = toListing(job);
      if (listing) {
        if (needsEligibilityDescription(job, listing)) eligibilityDescriptionUrls.add(listing.url);
        listings.set(listing.id, listing);
      }
    }
    const found = [...listings.values()];
    failures.push(...(await enrichListingDetails(found, fetchImpl, eligibilityDescriptionUrls)));
    return { listings: found, failures };
  }

  const seeds: Job[] = [];
  for (const feed of publicJobFeeds)
    seeds.push(...(await fetchFeedJobs(feed, fetchImpl, failures)));
  const queue = discoverPublicBoards(seeds).filter((board) => board.provider === source.id);
  const eligibilityDescriptionUrls = new Set<string>();
  const worker = async (): Promise<void> => {
    for (let board = queue.shift(); board; board = queue.shift()) {
      try {
        for (const job of await fetchPublicBoardJobs(board, fetchImpl)) {
          const listing = toListing(job);
          if (listing) {
            if (needsEligibilityDescription(job, listing))
              eligibilityDescriptionUrls.add(listing.url);
            listings.set(listing.id, listing);
          }
        }
      } catch (cause) {
        failures.push(
          `${board.provider} ${board.label}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, boardConcurrency) }, () => worker()));
  const found = [...listings.values()];
  failures.push(...(await enrichListingDetails(found, fetchImpl, eligibilityDescriptionUrls)));
  return { listings: found, failures };
}
