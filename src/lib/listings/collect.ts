import type { FetchLike } from "@/lib/ai/openrouter";
import { classifyJobCategories, type JobCategory } from "@/lib/ranking/categories";
import { classifyJobTerms, type JobTerm } from "@/lib/ranking/terms";
import {
  discoverPublicBoards,
  fetchPublicBoardJobs,
  type PublicBoardProvider,
} from "@/lib/sources/boards";
import { feedEntries, type PublicJobFeed, publicJobFeeds } from "@/lib/sources/publicFeeds";
import type { Job } from "@/types/job";

export interface Listing {
  id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  categories: JobCategory[];
  terms: JobTerm[];
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
  return {
    id: job.id,
    company: job.company,
    title: job.title,
    location: job.location,
    url: job.url,
    categories,
    terms,
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
    return { listings: [...listings.values()], failures };
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
  return { listings: [...listings.values()], failures };
}
