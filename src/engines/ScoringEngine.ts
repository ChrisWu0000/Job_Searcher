import type { CostEstimate, ModelPricing, OpenRouterUsage } from "@/lib/ai/contracts";
import { estimateScoringCost, usageToCost } from "@/lib/ai/cost";
import {
  type ChatCompletionResult,
  type ChatMessage,
  chatCompletion,
  resolveModelPricing,
} from "@/lib/ai/openrouter";
import { buildRepairMessages, buildScoringMessages } from "@/lib/ai/prompts";
import {
  normalizeVerdict,
  parseVerdict,
  type ScoringVerdict,
  scoringVerdictJsonSchema,
  scoringVerdictSchemaName,
} from "@/lib/ai/schemas";
import {
  getJobs,
  getProfile,
  latestScoreForJob,
  listJobs,
  listLatestScores,
  upsertScore,
} from "@/lib/db/repo";
import { prefilterJob } from "@/lib/ranking/prefilter";
import { getApiKey } from "@/lib/storage/apiKey";
import { nowIso } from "@/lib/time";
import type { Job } from "@/types/job";
import type { Profile } from "@/types/preferences";
import type { EngineName, RunKind } from "@/types/run";
import type { JobScore } from "@/types/scoring";
import type { ScoringEngineOptions, ScoringProgress } from "./contracts";
import { BaseEngine, EngineStoppedError } from "./Engine";

export const defaultScoringConcurrency = 6;
export const defaultPerJobTimeoutMs = 60_000;
export const prefilterModelName = "prefilter";
export const missingApiKeyMessage =
  "No OpenRouter API key is set. Add one on the Settings page before scoring.";

async function runWithConcurrency<TItem>(
  items: TItem[],
  limit: number,
  worker: (item: TItem) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  let abortCause: unknown;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length && abortCause === undefined) {
      const item = items[cursor];
      cursor += 1;
      if (item === undefined) continue;
      try {
        await worker(item);
      } catch (cause) {
        abortCause = cause;
      }
    }
  });
  await Promise.all(runners);
  if (abortCause !== undefined) throw abortCause;
}

function emptyProgress(): ScoringProgress {
  return {
    total: 0,
    done: 0,
    skippedByPrefilter: 0,
    cached: 0,
    failed: 0,
    costUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    currentJobIds: [],
  };
}

export async function jobsNeedingScore(): Promise<Job[]> {
  const [jobs, scores, profile] = await Promise.all([listJobs(), listLatestScores(), getProfile()]);
  const scored = new Map(scores.map((score) => [score.jobId, score]));
  return jobs.filter((job) => {
    if (job.status === "skipped") return false;
    const score = scored.get(job.id);
    return !score || (score.model === prefilterModelName && !prefilterJob(job, profile).excluded);
  });
}

export interface ScoringRunPlan {
  jobs: Job[];
  estimate: CostEstimate;
  pricing?: ModelPricing;
}

export async function planScoringRun(options: ScoringEngineOptions = {}): Promise<ScoringRunPlan> {
  const profile = await getProfile();
  const jobs = options.jobIds ? await getJobs(options.jobIds) : await jobsNeedingScore();
  const eligible = jobs.filter(
    (job) => !prefilterJob(job, profile).excluded && job.status !== "skipped",
  );
  const apiKey = eligible.length > 0 ? await getApiKey() : undefined;
  const pricing = apiKey
    ? await resolveModelPricing(
        apiKey,
        profile.model,
        options.fetchImpl ? { fetchImpl: options.fetchImpl } : {},
      )
    : undefined;
  const estimate = estimateScoringCost(eligible, profile, pricing);
  return { jobs, estimate, ...(pricing ? { pricing } : {}) };
}

interface VerdictOutcome {
  verdict: ScoringVerdict;
  usage: OpenRouterUsage;
  messages: ChatMessage[];
  rawResponse: string;
  repaired: boolean;
}

export class ScoringEngine extends BaseEngine<ScoringProgress> {
  readonly engine: EngineName = "score";
  readonly runKind: RunKind = "score";

  private readonly options: ScoringEngineOptions;
  private counters: ScoringProgress = emptyProgress();
  private inFlight = new AbortController();

  constructor(options: ScoringEngineOptions = {}) {
    super();
    this.options = options;
  }

  get counts(): ScoringProgress {
    return { ...this.counters, currentJobIds: [...this.counters.currentJobIds] };
  }

  override stop(): void {
    super.stop();
    this.inFlight.abort();
  }

  protected override runSummary(): Record<string, unknown> {
    return {
      total: this.counters.total,
      done: this.counters.done,
      cached: this.counters.cached,
      skippedByPrefilter: this.counters.skippedByPrefilter,
      failed: this.counters.failed,
      costUsd: this.counters.costUsd,
      promptTokens: this.counters.promptTokens,
      completionTokens: this.counters.completionTokens,
    };
  }

  protected async execute(): Promise<void> {
    this.counters = emptyProgress();
    this.inFlight = new AbortController();
    const profile = await getProfile();
    const apiKey = await getApiKey();

    const jobs = this.options.jobIds
      ? await getJobs(this.options.jobIds)
      : await jobsNeedingScore();
    this.counters.total = jobs.length;
    this.publish();
    if (jobs.length === 0) {
      await this.log("info", "no jobs need scoring");
      return;
    }

    const needsModel = jobs.some(
      (job) => job.status !== "skipped" && !prefilterJob(job, profile).excluded,
    );
    if (needsModel && apiKey === undefined) throw new Error(missingApiKeyMessage);
    const pricing =
      needsModel && apiKey
        ? await resolveModelPricing(
            apiKey,
            profile.model,
            this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {},
          )
        : undefined;
    await this.log("info", `scoring ${jobs.length} job(s) with ${profile.model}`, {
      profileVersion: profile.version,
      pricingKnown: pricing !== undefined,
    });

    await runWithConcurrency(
      jobs,
      this.options.concurrency ?? defaultScoringConcurrency,
      async (job) => {
        await this.assertRunning();
        await this.scoreJob(job, profile, apiKey, pricing);
        await this.assertRunning();
      },
    );
  }

  private publish(): void {
    this.emitProgress(this.counts);
  }

  private markActive(jobId: string): void {
    this.counters.currentJobIds = [...this.counters.currentJobIds, jobId];
    this.publish();
  }

  private clearActive(jobId: string): void {
    this.counters.currentJobIds = this.counters.currentJobIds.filter((id) => id !== jobId);
    this.publish();
  }

  private async scoreJob(
    job: Job,
    profile: Profile,
    apiKey: string | undefined,
    pricing: ModelPricing | undefined,
  ): Promise<void> {
    this.markActive(job.id);
    try {
      if (job.status === "skipped") {
        this.counters.cached += 1;
        this.counters.done += 1;
        return;
      }

      const prefilter = prefilterJob(job, profile);
      if (prefilter.excluded) {
        const score = this.prefilterScore(job, profile, prefilter.hardViolations, prefilter.reason);
        await upsertScore(score);
        this.counters.skippedByPrefilter += 1;
        this.counters.done += 1;
        this.counters.lastScore = score;
        await this.log("info", `prefiltered ${job.id}`, {
          jobId: job.id,
          hardViolations: prefilter.hardViolations,
          reason: prefilter.reason,
        });
        return;
      }

      const cached = await latestScoreForJob(job.id);
      if (cached && cached.model !== prefilterModelName) {
        this.counters.cached += 1;
        this.counters.done += 1;
        return;
      }
      if (apiKey === undefined) throw new Error(missingApiKeyMessage);
      const outcome = await this.requestVerdict(job, profile, apiKey);
      const verdict = normalizeVerdict(outcome.verdict, profile);
      const costUsd =
        outcome.usage.costUsd > 0 || pricing === undefined
          ? outcome.usage.costUsd
          : usageToCost(outcome.usage, pricing);
      const score: JobScore = {
        id: `${job.id}:${profile.version}`,
        jobId: job.id,
        profileVersion: profile.version,
        score: verdict.score,
        likelihood: verdict.likelihood,
        verdict: verdict.verdict,
        hardViolations: verdict.hardViolations,
        softNotes: verdict.softNotes,
        strengths: verdict.strengths,
        gaps: verdict.gaps,
        summary: verdict.summary,
        model: profile.model,
        usage: {
          promptTokens: outcome.usage.promptTokens,
          completionTokens: outcome.usage.completionTokens,
          costUsd,
        },
        prompt: JSON.stringify(outcome.messages),
        rawResponse: outcome.rawResponse,
        scoredAt: nowIso(),
      };
      await upsertScore(score);

      this.counters.done += 1;
      this.counters.costUsd += costUsd;
      this.counters.promptTokens += outcome.usage.promptTokens;
      this.counters.completionTokens += outcome.usage.completionTokens;
      this.counters.lastScore = score;
      await this.log("info", `scored ${job.id}`, {
        jobId: job.id,
        verdict: score.verdict,
        score: score.score,
        likelihood: score.likelihood,
        costUsd,
        repaired: outcome.repaired,
      });
    } catch (cause) {
      if (cause instanceof EngineStoppedError) throw cause;
      this.throwIfStopped();
      this.counters.failed += 1;
      this.counters.done += 1;
      const message = cause instanceof Error ? cause.message : String(cause);
      await this.log("error", `scoring failed for ${job.id}: ${message}`, { jobId: job.id });
    } finally {
      this.clearActive(job.id);
    }
  }

  private prefilterScore(
    job: Job,
    profile: Profile,
    hardViolations: string[],
    reason: string | undefined,
  ): JobScore {
    return {
      id: `${job.id}:${profile.version}`,
      jobId: job.id,
      profileVersion: profile.version,
      score: 0,
      likelihood: 0,
      verdict: "skip",
      hardViolations,
      softNotes: [],
      strengths: [],
      gaps: [],
      summary: reason ?? "Excluded before scoring by the prefilter.",
      model: prefilterModelName,
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      prompt: "",
      rawResponse: "",
      scoredAt: nowIso(),
    };
  }

  private async callModel(
    messages: ChatMessage[],
    profile: Profile,
    apiKey: string,
  ): Promise<ChatCompletionResult> {
    return chatCompletion({
      apiKey,
      model: profile.model,
      messages,
      jsonSchema: { name: scoringVerdictSchemaName, schema: scoringVerdictJsonSchema },
      reasoningEffort: profile.reasoningEffort,
      timeoutMs: this.options.perJobTimeoutMs ?? defaultPerJobTimeoutMs,
      signal: this.inFlight.signal,
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
    });
  }

  private async requestVerdict(
    job: Job,
    profile: Profile,
    apiKey: string,
  ): Promise<VerdictOutcome> {
    const messages = buildScoringMessages(job, profile);
    const first = await this.callModel(messages, profile, apiKey);
    const parsed = parseVerdict(first.content);
    if (parsed.ok) {
      return {
        verdict: parsed.verdict,
        usage: first.usage,
        messages,
        rawResponse: first.content,
        repaired: false,
      };
    }

    await this.log("warn", `invalid verdict json for ${job.id}, retrying once`, {
      jobId: job.id,
      error: parsed.error,
    });

    const repairMessages = buildRepairMessages(
      { messages, invalidOutput: first.content },
      parsed.error,
    );
    const second = await this.callModel(repairMessages, profile, apiKey);
    const repaired = parseVerdict(second.content);
    if (!repaired.ok) {
      throw new Error(`model returned invalid verdict JSON twice: ${repaired.error}`);
    }
    return {
      verdict: repaired.verdict,
      usage: {
        promptTokens: first.usage.promptTokens + second.usage.promptTokens,
        completionTokens: first.usage.completionTokens + second.usage.completionTokens,
        costUsd: first.usage.costUsd + second.usage.costUsd,
      },
      messages: repairMessages,
      rawResponse: second.content,
      repaired: true,
    };
  }
}
