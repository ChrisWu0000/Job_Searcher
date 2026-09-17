import { getJobs, upsertJobStubs, upsertJobs } from "@/lib/db/repo";
import { isTransportFailure } from "@/lib/messaging/client";
import { sleep } from "@/lib/time";
import type { Job, PageKind, ResultRow } from "@/types/job";
import type { EngineName, RunKind } from "@/types/run";
import type { SyncEngineOptions, SyncProgress } from "./contracts";
import { BaseEngine } from "./Engine";
import {
  createWwClient,
  loginRequiredMessage,
  resultsPageRequiredMessage,
  tabUnavailableMessage,
  traceWwClient,
  type WwClient,
} from "./wwClient";

export type SyncEngineDependencies = SyncEngineOptions & { client?: WwClient };

const defaultPostingDelayMs = 1500;
const consecutiveFailureThreshold = 3;
const navigationAttemptsPerPause = 3;
const directPageSize = 100;
const defaultDirectConcurrency = 8;
const defaultDirectDelayMs = 25;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function hasUsableDetails(job: Job): boolean {
  if (job.detailScrapedAt === undefined) return false;
  if (job.fields !== undefined && Object.keys(job.fields).length > 0) return true;
  const text = job.rawText.trim();
  return text.length > 0 && !text.startsWith("{");
}

export class SyncEngine extends BaseEngine<SyncProgress> {
  readonly engine: EngineName = "sync";
  readonly runKind: RunKind = "sync";

  private readonly client: WwClient;
  private readonly forceRefresh: boolean;
  private readonly postingDelayMs: number;
  private readonly maxPages: number | undefined;
  private readonly directConcurrency: number;
  private readonly directDelayMs: number;
  private readonly stubIds = new Set<string>();
  private pagesScraped = 0;
  private current: SyncProgress = {
    phase: "navigating",
    page: 0,
    stubsFound: 0,
    postingsTotal: 0,
    postingsDone: 0,
    postingsSkipped: 0,
    postingsFailed: 0,
  };

  constructor(options: SyncEngineDependencies = {}) {
    super();
    this.client = traceWwClient(options.client ?? createWwClient(), (level, message) =>
      this.log(level, message),
    );
    this.forceRefresh = options.forceRefresh ?? false;
    this.postingDelayMs = options.postingDelayMs ?? defaultPostingDelayMs;
    this.maxPages = options.maxPages;
    this.directConcurrency = Math.max(1, options.directConcurrency ?? defaultDirectConcurrency);
    this.directDelayMs = options.directDelayMs ?? defaultDirectDelayMs;
  }

  protected override runSummary(): Record<string, unknown> {
    return {
      pagesScraped: this.pagesScraped,
      stubsFound: this.current.stubsFound,
      postingsTotal: this.current.postingsTotal,
      postingsDone: this.current.postingsDone,
      postingsSkipped: this.current.postingsSkipped,
      postingsFailed: this.current.postingsFailed,
      forceRefresh: this.forceRefresh,
    };
  }

  protected async execute(): Promise<void> {
    try {
      await this.openResultsPage();
      if (!(await this.syncDirectly())) await this.scrapeAllResultPages();
      this.update({ phase: "done", currentJobId: undefined, currentJobTitle: undefined });
      await this.log("info", "sync finished", this.runSummary());
    } catch (cause) {
      if (isTransportFailure(cause) && cause instanceof Error) {
        throw new Error(`${tabUnavailableMessage} (${cause.message})`);
      }
      throw cause;
    }
  }

  private update(patch: Partial<SyncProgress>): void {
    this.current = { ...this.current, ...patch };
    this.emitProgress({ ...this.current });
  }

  private async pauseUntilLoggedIn(kind: PageKind): Promise<PageKind> {
    if (kind !== "login") return kind;
    await this.log("warn", loginRequiredMessage);
    this.update({ phase: "navigating" });
    this.pause();
    await this.assertRunning();
    const { kind: next } = await this.client.getPageKind();
    if (next === "login") throw new Error(loginRequiredMessage);
    return next;
  }

  private async pauseForResultsPage(): Promise<void> {
    await this.log("warn", resultsPageRequiredMessage);
    this.update({ phase: "navigating" });
    this.pause();
    await this.assertRunning();
  }

  private async tryNavigateToResults(kind: PageKind): Promise<boolean> {
    this.update({ phase: "navigating" });
    await this.log("info", `navigating to the results page from a ${kind} page`);
    try {
      await this.client.navigateToResults();
      return true;
    } catch (cause) {
      await this.log("warn", `could not reach the results: ${errorMessage(cause)}`);
      return false;
    }
  }

  private async openResultsPage(): Promise<void> {
    await this.assertRunning();
    await this.client.ensureTab();
    let paused = false;
    let attempts = 0;
    while (true) {
      await this.assertRunning();
      const current = await this.client.getPageKind();
      const kind = await this.pauseUntilLoggedIn(current.kind);
      if (kind === "results") return;
      if (attempts < navigationAttemptsPerPause) {
        attempts += 1;
        await this.tryNavigateToResults(kind);
        continue;
      }
      if (paused) throw new Error(resultsPageRequiredMessage);
      await this.pauseForResultsPage();
      paused = true;
      attempts = 0;
    }
  }

  private async fetchAllRows(): Promise<ResultRow[] | undefined> {
    const first = await this.client.fetchResults(1, directPageSize);
    if (!first.available) return undefined;
    const rows = [...first.rows];
    let page = 1;
    this.pagesScraped = page;
    this.update({ phase: "results", page, stubsFound: rows.length });
    while (rows.length < first.totalResults && first.rows.length > 0) {
      if (this.maxPages !== undefined && page >= this.maxPages) break;
      await this.assertRunning();
      page += 1;
      const next = await this.client.fetchResults(page, directPageSize);
      if (!next.available || next.rows.length === 0) break;
      rows.push(...next.rows);
      this.pagesScraped = page;
      this.update({ phase: "results", page, stubsFound: rows.length });
    }
    return rows;
  }

  private async syncDirectly(): Promise<boolean> {
    let rows: ResultRow[] | undefined;
    try {
      rows = await this.fetchAllRows();
    } catch (cause) {
      if (isTransportFailure(cause)) throw cause;
      await this.log(
        "warn",
        `direct fetch failed, falling back to clicking: ${errorMessage(cause)}`,
      );
      return false;
    }
    if (rows === undefined) {
      await this.log(
        "info",
        "direct fetch is not available on this page, clicking through instead",
      );
      return false;
    }
    await upsertJobStubs(rows);
    for (const row of rows) this.stubIds.add(row.id);
    await this.log("info", `${rows.length} postings listed through direct fetch`, {
      pages: this.pagesScraped,
    });

    const { ids, titles } = await this.selectPostings(rows.map((row) => row.id));
    this.update({
      phase: "postings",
      postingsTotal: ids.length,
      postingsSkipped: rows.length - ids.length,
    });
    await this.log("info", `${ids.length} postings to fetch`, {
      skipped: rows.length - ids.length,
    });
    await this.fetchPostings(ids, titles);
    this.update({ currentJobId: undefined, currentJobTitle: undefined });
    return true;
  }

  private async fetchPostings(ids: string[], titles: Map<string, string>): Promise<void> {
    const queue = [...ids];
    let failure: unknown;
    const worker = async (): Promise<void> => {
      while (queue.length > 0 && failure === undefined) {
        await this.assertRunning();
        const jobId = queue.shift();
        if (jobId === undefined) return;
        this.update({ phase: "postings", currentJobId: jobId, currentJobTitle: titles.get(jobId) });
        try {
          const job = await this.client.fetchPosting(jobId);
          await upsertJobs([job]);
          this.update({ postingsDone: this.current.postingsDone + 1 });
        } catch (cause) {
          if (isTransportFailure(cause)) {
            failure = cause;
            return;
          }
          this.update({ postingsFailed: this.current.postingsFailed + 1 });
          await this.log("warn", `posting ${jobId} failed: ${errorMessage(cause)}`, { jobId });
        }
        if (this.directDelayMs > 0) await sleep(this.directDelayMs);
      }
    };
    const workers = Array.from({ length: Math.min(this.directConcurrency, ids.length) }, () =>
      worker(),
    );
    await Promise.all(workers);
    if (failure !== undefined) throw failure;
  }

  private async scrapeAllResultPages(): Promise<void> {
    let page = 1;
    while (true) {
      await this.assertRunning();
      const { stubs } = await this.client.scrapeResultsPage();
      await upsertJobStubs(stubs);
      for (const stub of stubs) this.stubIds.add(stub.id);
      this.pagesScraped = page;
      this.update({ phase: "results", page, stubsFound: this.stubIds.size });
      await this.log("info", `results page ${page} scraped`, {
        stubs: stubs.length,
        total: this.stubIds.size,
      });
      await this.scrapePostingsOnPage(
        page,
        stubs.map((stub) => stub.id),
      );

      if (this.maxPages !== undefined && page >= this.maxPages) break;
      await this.assertRunning();
      const hadNextPage = await this.client.nextResultsPage();
      if (!hadNextPage) break;
      page += 1;
    }
  }

  private async selectPostings(
    ids: string[],
  ): Promise<{ ids: string[]; titles: Map<string, string> }> {
    const stored = await getJobs(ids);
    const byId = new Map<string, Job>(stored.map((job) => [job.id, job]));
    const titles = new Map<string, string>(stored.map((job) => [job.id, job.title]));
    const pending = ids.filter((id) => {
      if (this.forceRefresh) return true;
      const stored = byId.get(id);
      return stored === undefined || !hasUsableDetails(stored);
    });
    return { ids: pending, titles };
  }

  private async scrapePostingsOnPage(page: number, pageIds: string[]): Promise<void> {
    const { ids, titles } = await this.selectPostings(pageIds);
    this.update({
      phase: "postings",
      postingsTotal: this.current.postingsTotal + ids.length,
      postingsSkipped: this.current.postingsSkipped + (pageIds.length - ids.length),
    });
    await this.log("info", `${ids.length} postings to open on page ${page}`, {
      skipped: pageIds.length - ids.length,
    });
    if (ids.length === 0) return;

    let consecutiveFailures = 0;
    for (const [index, jobId] of ids.entries()) {
      await this.assertRunning();
      if (index > 0) {
        await sleep(this.postingDelayMs);
        await this.assertRunning();
      }
      this.update({
        phase: "postings",
        currentJobId: jobId,
        currentJobTitle: titles.get(jobId),
      });
      try {
        await this.scrapePosting(jobId);
        consecutiveFailures = 0;
        this.update({ postingsDone: this.current.postingsDone + 1 });
      } catch (cause) {
        if (isTransportFailure(cause)) throw cause;
        consecutiveFailures += 1;
        this.update({ postingsFailed: this.current.postingsFailed + 1 });
        await this.log("warn", `posting ${jobId} failed: ${errorMessage(cause)}`, { jobId });
        if (consecutiveFailures >= consecutiveFailureThreshold) {
          consecutiveFailures = 0;
          const { kind } = await this.client.getPageKind();
          const resumed = await this.pauseUntilLoggedIn(kind);
          if (resumed === kind) {
            await this.log("warn", `three postings in a row failed on a ${kind} page, continuing`);
          }
        }
      }
    }
    this.update({ currentJobId: undefined, currentJobTitle: undefined });
  }

  private async scrapePosting(jobId: string): Promise<void> {
    await this.client.openJob(jobId);
    const job = await this.client.scrapeCurrentJob();
    await upsertJobs([job]);
    await this.client.navigateToResults();
  }
}
