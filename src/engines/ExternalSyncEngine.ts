import type { FetchLike } from "@/lib/ai/openrouter";
import { upsertJobs } from "@/lib/db/repo";
import { classifyJobCategories } from "@/lib/ranking/categories";
import { discoverPublicBoards, fetchPublicBoardJobs } from "@/lib/sources/boards";
import { feedEntries, type PublicJobFeed, publicJobFeeds } from "@/lib/sources/publicFeeds";
import type { Job } from "@/types/job";
import type { EngineName, RunKind } from "@/types/run";
import { BaseEngine } from "./Engine";

export interface ExternalSyncProgress {
  sourcesTotal: number;
  sourcesDone: number;
  jobsImported: number;
  jobsSkipped: number;
  sourcesFailed: number;
  currentSource?: string;
}

export interface ExternalSyncOptions {
  fetchImpl?: FetchLike;
  feeds?: PublicJobFeed[];
  boardConcurrency?: number;
}

const defaultBoardConcurrency = 8;

export class ExternalSyncEngine extends BaseEngine<ExternalSyncProgress> {
  readonly engine: EngineName = "sync";
  readonly runKind: RunKind = "sync";

  private readonly fetchImpl: FetchLike;
  private readonly feeds: PublicJobFeed[];
  private readonly boardConcurrency: number;
  private current: ExternalSyncProgress;

  constructor(options: ExternalSyncOptions = {}) {
    super();
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.feeds = options.feeds ?? publicJobFeeds;
    this.boardConcurrency = Math.max(1, options.boardConcurrency ?? defaultBoardConcurrency);
    this.current = {
      sourcesTotal: this.feeds.length,
      sourcesDone: 0,
      jobsImported: 0,
      jobsSkipped: 0,
      sourcesFailed: 0,
    };
  }

  protected override runSummary(): Record<string, unknown> {
    return { ...this.current };
  }

  protected async execute(): Promise<void> {
    const imported = new Map<string, Job>();
    this.emitProgress({ ...this.current });

    for (const feed of this.feeds) {
      await this.assertRunning();
      this.update({ currentSource: feed.label });
      try {
        const response = await this.fetchImpl(feed.url, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
        const { jobs, skipped } = feedEntries(await response.json(), feed);
        this.current.jobsSkipped += skipped;
        for (const job of jobs) {
          const existing = imported.get(job.id);
          if (existing) {
            existing.source = [...new Set([existing.source, job.source].filter(Boolean))].join(
              ", ",
            );
          } else {
            imported.set(job.id, job);
          }
        }
      } catch (cause) {
        this.current.sourcesFailed += 1;
        const message = cause instanceof Error ? cause.message : String(cause);
        await this.log("warn", `${feed.label} failed: ${message}`, { source: feed.id });
      } finally {
        this.current.sourcesDone += 1;
        this.emitProgress({ ...this.current });
      }
    }

    const boards = discoverPublicBoards(imported.values());
    this.current.sourcesTotal += boards.length;
    this.emitProgress({ ...this.current });
    const queue = [...boards];
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        await this.assertRunning();
        const board = queue.shift();
        if (!board) return;
        this.update({ currentSource: `${board.provider}: ${board.label}` });
        try {
          const found = await fetchPublicBoardJobs(board, this.fetchImpl);
          const selected = found.filter((job) => classifyJobCategories(job).length > 0);
          this.current.jobsSkipped += found.length - selected.length;
          for (const job of selected) {
            const existing = imported.get(job.id);
            if (existing) {
              const sources = [existing.source, job.source].filter(
                (source): source is string => source !== undefined,
              );
              imported.set(job.id, {
                ...existing,
                ...job,
                source: [...new Set(sources)].join(", "),
                summary: job.summary ?? existing.summary,
                rawText: job.summary ?? existing.rawText,
              });
            } else {
              imported.set(job.id, job);
            }
          }
        } catch (cause) {
          this.current.sourcesFailed += 1;
          const message = cause instanceof Error ? cause.message : String(cause);
          await this.log("warn", `${board.provider} board ${board.label} failed: ${message}`, {
            boardId: board.id,
          });
        } finally {
          this.current.sourcesDone += 1;
          this.emitProgress({ ...this.current });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(this.boardConcurrency, queue.length) }, () => worker()),
    );

    await this.assertRunning();
    this.current.jobsImported = await upsertJobs([...imported.values()]);
    this.update({ currentSource: undefined });
    await this.log("info", `source sync imported ${this.current.jobsImported} jobs`, {
      sourcesFailed: this.current.sourcesFailed,
      jobsSkipped: this.current.jobsSkipped,
    });
  }

  private update(patch: Partial<ExternalSyncProgress>): void {
    this.current = { ...this.current, ...patch };
    this.emitProgress({ ...this.current });
  }
}
