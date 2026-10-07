import type { FetchLike } from "@/lib/ai/openrouter";
import { classifyJobCategories, type JobCategory } from "@/lib/ranking/categories";
import { payTextForJob } from "@/lib/ranking/prefilter";
import { classifyJobTerms, type JobTerm } from "@/lib/ranking/terms";
import {
  discoverPublicBoards,
  fetchPublicBoardJobs,
  type PublicBoardProvider,
} from "@/lib/sources/boards";
import { feedEntries, type PublicJobFeed, publicJobFeeds } from "@/lib/sources/publicFeeds";
import type { Job } from "@/types/job";
import { displayCompanyName } from "./companyNames";
import { payFromHtml, payFromText } from "./pay";
import { classifyEmploymentRequirements } from "./requirements";

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

export async function enrichPay(
  listings: Listing[],
  fetchImpl: FetchLike,
  concurrency = 8,
  now: Date = new Date(),
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - payLookbackDays * 86_400_000).toISOString();
  const failures = new Map<string, { count: number; sample: string }>();
  const recordFailure = (reason: string, listing: Listing): void => {
    const current = failures.get(reason);
    failures.set(reason, {
      count: (current?.count ?? 0) + 1,
      sample: current?.sample ?? `${listing.company}: ${listing.title}`,
    });
  };
  const queue = listings.filter(
    (listing) =>
      !listing.pay &&
      (new URL(listing.url).hostname.endsWith(".myworkdayjobs.com") ||
        (listing.postedAt !== undefined && listing.postedAt >= cutoff)),
  );
  const worker = async (): Promise<void> => {
    for (let listing = queue.shift(); listing; listing = queue.shift()) {
      try {
        const response = await fetchImpl(listing.url, {
          headers: { Accept: "text/html,application/xhtml+xml" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          recordFailure(`HTTP ${response.status}`, listing);
          continue;
        }
        const pay = payFromHtml(await response.text());
        if (pay) listing.pay = pay;
      } catch (cause) {
        recordFailure(cause instanceof Error ? cause.message : String(cause), listing);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return [...failures].map(
    ([reason, { count, sample }]) =>
      `salary page ${reason} for ${count} listing${count === 1 ? "" : "s"} (e.g. ${sample})`,
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

  if (source.kind === "feed") {
    const feed = publicJobFeeds.find((candidate) => candidate.id === source.id);
    if (!feed) throw new Error(`Unknown feed: ${sourceId}`);
    for (const job of await fetchFeedJobs(feed, fetchImpl, failures)) {
      const listing = toListing(job);
      if (listing) listings.set(listing.id, listing);
    }
    const found = [...listings.values()];
    failures.push(...(await enrichPay(found, fetchImpl)));
    return { listings: found, failures };
  }

  const seeds: Job[] = [];
  for (const feed of publicJobFeeds)
    seeds.push(...(await fetchFeedJobs(feed, fetchImpl, failures)));
  const queue = discoverPublicBoards(seeds).filter((board) => board.provider === source.id);
  const worker = async (): Promise<void> => {
    for (let board = queue.shift(); board; board = queue.shift()) {
      try {
        for (const job of await fetchPublicBoardJobs(board, fetchImpl)) {
          const listing = toListing(job);
          if (listing) listings.set(listing.id, listing);
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
  failures.push(...(await enrichPay(found, fetchImpl)));
  return { listings: found, failures };
}
