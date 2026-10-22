import type { FetchLike } from "@/lib/ai/openrouter";
import { classifyJobCategories, type JobCategory } from "@/lib/ranking/categories";
import { payTextForJob } from "@/lib/ranking/prefilter";
import { classifyJobTerms, isInternshipTitle, type JobTerm } from "@/lib/ranking/terms";
import {
  discoverPublicBoards,
  fetchPublicBoardJobs,
  type PublicBoard,
  type PublicBoardProvider,
  publicBoardFromJobUrl,
} from "@/lib/sources/boards";
import { companyCareerSites, fetchCareerPage } from "@/lib/sources/companyCareers";
import { fetchInternListJobs, internListFeed } from "@/lib/sources/internList";
import { feedEntries, type PublicJobFeed, publicJobFeeds } from "@/lib/sources/publicFeeds";
import { nowIso } from "@/lib/time";
import type { Job } from "@/types/job";
import { displayCompanyName } from "./companyNames";
import { payFromHtml, payFromText, textFromHtml } from "./pay";
import { checkPosting, type PostingCache } from "./postings";
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
  kind: "feed" | "board" | "career-sites";
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
  { id: "company-careers", label: "Company career pages", kind: "career-sites" as const },
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
const boardProviderIds = new Set<string>(providers.map((provider) => provider.id));

function readFromBoardApi(job: Job): boolean {
  return boardProviderIds.has(job.source ?? "") && job.detailScrapedAt !== undefined;
}

export function withPostingText(job: Job, text: string, now: string = nowIso()): Job {
  const summary = [text, job.summary].filter(Boolean).join("\n");
  return { ...job, summary, rawText: summary, detailScrapedAt: now };
}

export interface PostingVerification {
  listings: Listing[];
  openedIds: Set<string>;
  closed: number;
  failures: string[];
}

export async function verifyJobPostings(
  jobs: Job[],
  fetchImpl: FetchLike,
  concurrency = 12,
  cache?: PostingCache,
): Promise<PostingVerification> {
  const results: (Listing | undefined)[] = [];
  const openedIds = new Set<string>();
  const failures = new Map<string, { count: number; sample: string }>();
  let closed = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      const initial = job ? toListing(job) : undefined;
      if (!job?.url || !initial) continue;
      if (readFromBoardApi(job)) {
        results[index] = initial;
        continue;
      }
      const check = await checkPosting(job.url, fetchImpl, cache);
      openedIds.add(initial.id);
      if (check.status === "closed") {
        closed++;
        continue;
      }
      if (check.status === "unavailable") {
        const current = failures.get(check.reason);
        failures.set(check.reason, {
          count: (current?.count ?? 0) + 1,
          sample: current?.sample ?? `${initial.company}: ${initial.title}`,
        });
        results[index] = initial;
        continue;
      }
      const listing = toListing(withPostingText(job, check.text));
      if (!listing) continue;
      if (!listing.pay && check.pay) listing.pay = check.pay;
      results[index] = listing;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return {
    listings: results.filter((listing): listing is Listing => listing !== undefined),
    openedIds,
    closed,
    failures: [...failures].map(
      ([reason, { count, sample }]) =>
        `could not open posting (${reason}) for ${count} listing${count === 1 ? "" : "s"} (e.g. ${sample})`,
    ),
  };
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
  closed: number;
}

async function verifiedResult(
  jobs: Iterable<Job>,
  fetchImpl: FetchLike,
  failures: string[],
  postingCache?: PostingCache,
): Promise<ScrapeResult> {
  const verification = await verifyJobPostings([...jobs], fetchImpl, 12, postingCache);
  failures.push(...verification.failures);
  const unread = verification.listings.filter((listing) => !verification.openedIds.has(listing.id));
  failures.push(...(await enrichListingDetails(unread, fetchImpl)));
  return { listings: verification.listings, failures, closed: verification.closed };
}

export async function scrapeSource(
  sourceId: string,
  fetchImpl: FetchLike,
  boardConcurrency = 8,
  postingCache?: PostingCache,
): Promise<ScrapeResult> {
  const source = listingSources.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  const failures: string[] = [];
  const jobs = new Map<string, Job>();
  const addJob = (job: Job): void => {
    const existing = jobs.get(job.id);
    if (!existing || (!existing.detailScrapedAt && job.detailScrapedAt)) jobs.set(job.id, job);
  };

  if (source.id === internListFeed.id) {
    try {
      for (const job of await fetchInternListJobs(fetchImpl)) addJob(job);
    } catch (cause) {
      failures.push(`${source.label}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return verifiedResult(jobs.values(), fetchImpl, failures, postingCache);
  }

  if (source.kind === "feed") {
    const feed = publicJobFeeds.find((candidate) => candidate.id === source.id);
    if (!feed) throw new Error(`Unknown feed: ${sourceId}`);
    for (const job of await fetchFeedJobs(feed, fetchImpl, failures)) addJob(job);
    return verifiedResult(jobs.values(), fetchImpl, failures, postingCache);
  }

  if (source.kind === "career-sites") {
    const siteQueue = [...companyCareerSites];
    const boards = new Map<string, PublicBoard>();
    const addInternship = (job: Job): void => {
      if (isInternshipTitle(job.title)) addJob(job);
    };
    const siteWorker = async (): Promise<void> => {
      for (let site = siteQueue.shift(); site; site = siteQueue.shift()) {
        try {
          const discovery = await fetchCareerPage(site, fetchImpl);
          failures.push(
            ...discovery.failures.map((failure) => `${site.company} career page: ${failure}`),
          );
          for (const job of discovery.jobs) addInternship(job);
          for (const board of discovery.boards) boards.set(board.id, board);
        } catch (cause) {
          failures.push(
            `${site.company} career page: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, boardConcurrency) }, () => siteWorker()));

    const boardQueue = [...boards.values()];
    const boardWorker = async (): Promise<void> => {
      for (let board = boardQueue.shift(); board; board = boardQueue.shift()) {
        try {
          for (const job of await fetchPublicBoardJobs(board, fetchImpl)) addInternship(job);
        } catch (cause) {
          failures.push(
            `${board.provider} ${board.label}: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, boardConcurrency) }, () => boardWorker()));
    return verifiedResult(jobs.values(), fetchImpl, failures, postingCache);
  }

  const seeds: Job[] = [];
  for (const feed of publicJobFeeds)
    seeds.push(...(await fetchFeedJobs(feed, fetchImpl, failures)));
  const careerBoards = companyCareerSites
    .map((site) => publicBoardFromJobUrl(site.url))
    .filter(
      (board): board is NonNullable<typeof board> =>
        board !== undefined && board.provider === source.id,
    );
  const queue = [
    ...new Map(
      [...discoverPublicBoards(seeds), ...careerBoards]
        .filter((board) => board.provider === source.id)
        .map((board) => [board.id, board]),
    ).values(),
  ];
  const worker = async (): Promise<void> => {
    for (let board = queue.shift(); board; board = queue.shift()) {
      try {
        for (const job of await fetchPublicBoardJobs(board, fetchImpl)) addJob(job);
      } catch (cause) {
        failures.push(
          `${board.provider} ${board.label}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, boardConcurrency) }, () => worker()));
  return verifiedResult(jobs.values(), fetchImpl, failures, postingCache);
}
