import type { CostEstimate, ModelPricing, OpenRouterUsage } from "@/lib/ai/contracts";
import { estimateTailoringCost, usageToCost } from "@/lib/ai/cost";
import {
  type ChatCompletionResult,
  type ChatMessage,
  chatCompletion,
  resolveModelPricing,
} from "@/lib/ai/openrouter";
import { buildTailoringMessages, buildTailoringRepairMessages } from "@/lib/ai/prompts";
import {
  normalizeTailoring,
  parseTailoring,
  type TailoringOutput,
  tailoringJsonSchema,
  tailoringSchemaName,
} from "@/lib/ai/schemas";
import { getJobs, getProfile, loadResumeBank, saveTailoredResume } from "@/lib/db/repo";
import type { ResumeBank, TailoringResult } from "@/lib/resume/contracts";
import { renderResume } from "@/lib/resume/latex";
import { selectForJob } from "@/lib/resume/select";
import { bankVersion } from "@/lib/resume/version";
import { getApiKey } from "@/lib/storage/apiKey";
import { nowIso } from "@/lib/time";
import type { Job } from "@/types/job";
import type { Profile } from "@/types/preferences";
import type { TailoredResume } from "@/types/resume";
import type { EngineName, RunKind } from "@/types/run";
import type { ResumeEngineOptions, ResumeProgress } from "./contracts";
import { BaseEngine, EngineStoppedError } from "./Engine";
import { missingApiKeyMessage } from "./ScoringEngine";

export const emptyBankMessage =
  "The experience bank is empty. Add at least one entry on the Resume page before tailoring.";
export const defaultTailoringConcurrency = 3;
export const defaultTailoringTimeoutMs = 90_000;
export const localModelName = "local";

const zeroUsage = { promptTokens: 0, completionTokens: 0, costUsd: 0 };

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

function emptyProgress(): ResumeProgress {
  return {
    total: 0,
    done: 0,
    failed: 0,
    costUsd: 0,
    promptTokens: 0,
    completionTokens: 0,
    currentJobIds: [],
  };
}

export function tailoredResumeId(jobId: string, createdAt: string): string {
  return `${jobId}:${createdAt}`;
}

export interface ResumeRunPlan {
  jobs: Job[];
  estimate: CostEstimate;
  pricing?: ModelPricing;
}

export async function planTailoringRun(
  options: Pick<ResumeEngineOptions, "jobIds" | "fetchImpl">,
): Promise<ResumeRunPlan> {
  const [profile, bank, jobs, apiKey] = await Promise.all([
    getProfile(),
    loadResumeBank(),
    getJobs(options.jobIds),
    getApiKey(),
  ]);
  const pricing = apiKey
    ? await resolveModelPricing(
        apiKey,
        profile.model,
        options.fetchImpl ? { fetchImpl: options.fetchImpl } : {},
      )
    : undefined;
  const estimate = estimateTailoringCost(jobs, bank, pricing);
  return { jobs, estimate, ...(pricing ? { pricing } : {}) };
}

export async function tailorLocally(job: Job, bank: ResumeBank): Promise<TailoredResume> {
  const selection = selectForJob({ job, bank });
  const latex = renderResume({ bank, selection });
  const createdAt = nowIso();
  return {
    id: tailoredResumeId(job.id, createdAt),
    jobId: job.id,
    company: job.company,
    title: job.title,
    bankVersion: bankVersion(bank.entries, bank.settings),
    source: "local",
    model: localModelName,
    usage: { ...zeroUsage },
    selection,
    latex,
    groundingNotes: [],
    prompt: "",
    rawResponse: "",
    createdAt,
    updatedAt: createdAt,
  };
}

interface TailoringOutcome {
  output: TailoringOutput;
  usage: OpenRouterUsage;
  messages: ChatMessage[];
  rawResponse: string;
  repaired: boolean;
}

export class ResumeEngine extends BaseEngine<ResumeProgress> {
  readonly engine: EngineName = "resume";
  readonly runKind: RunKind = "resume";

  private readonly options: ResumeEngineOptions;
  private counters: ResumeProgress = emptyProgress();
  private inFlight = new AbortController();

  constructor(options: ResumeEngineOptions) {
    super();
    this.options = options;
  }

  get counts(): ResumeProgress {
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
      failed: this.counters.failed,
      costUsd: this.counters.costUsd,
      promptTokens: this.counters.promptTokens,
      completionTokens: this.counters.completionTokens,
      source: this.options.source,
    };
  }

  protected async execute(): Promise<void> {
    this.counters = emptyProgress();
    this.inFlight = new AbortController();

    const bank = await loadResumeBank();
    if (bank.entries.length === 0) throw new Error(emptyBankMessage);

    const jobs = await getJobs(this.options.jobIds);
    this.counters.total = jobs.length;
    this.publish();
    if (jobs.length === 0) {
      await this.log("info", "no jobs to tailor");
      return;
    }

    if (this.options.source === "local") {
      await this.log("info", `tailoring ${jobs.length} job(s) locally`);
      await runWithConcurrency(
        jobs,
        this.options.concurrency ?? defaultTailoringConcurrency,
        async (job) => {
          await this.assertRunning();
          await this.tailorJob(job, bank, undefined, undefined, undefined);
          await this.assertRunning();
        },
      );
      return;
    }

    const apiKey = await getApiKey();
    if (apiKey === undefined) throw new Error(missingApiKeyMessage);
    const profile = await getProfile();
    const pricing = await resolveModelPricing(
      apiKey,
      profile.model,
      this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {},
    );
    await this.log("info", `tailoring ${jobs.length} job(s) with ${profile.model}`, {
      bankEntries: bank.entries.length,
      pricingKnown: pricing !== undefined,
    });

    await runWithConcurrency(
      jobs,
      this.options.concurrency ?? defaultTailoringConcurrency,
      async (job) => {
        await this.assertRunning();
        await this.tailorJob(job, bank, profile, apiKey, pricing);
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

  private async tailorJob(
    job: Job,
    bank: ResumeBank,
    profile: Profile | undefined,
    apiKey: string | undefined,
    pricing: ModelPricing | undefined,
  ): Promise<void> {
    this.markActive(job.id);
    try {
      const resume =
        profile === undefined || apiKey === undefined
          ? await tailorLocally(job, bank)
          : await this.tailorWithModel(job, bank, profile, apiKey, pricing);
      await saveTailoredResume(resume);

      this.counters.done += 1;
      this.counters.costUsd += resume.usage.costUsd;
      this.counters.promptTokens += resume.usage.promptTokens;
      this.counters.completionTokens += resume.usage.completionTokens;
      this.counters.lastResume = resume;
      await this.log("info", `tailored ${job.id} (${resume.source})`, {
        jobId: job.id,
        entries: resume.selection.entries.length,
        groundingNotes: resume.groundingNotes.length,
        costUsd: resume.usage.costUsd,
      });
    } catch (cause) {
      if (cause instanceof EngineStoppedError) throw cause;
      this.throwIfStopped();
      this.counters.failed += 1;
      this.counters.done += 1;
      const message = cause instanceof Error ? cause.message : String(cause);
      await this.log("error", `tailoring failed for ${job.id}: ${message}`, { jobId: job.id });
    } finally {
      this.clearActive(job.id);
    }
  }

  private async tailorWithModel(
    job: Job,
    bank: ResumeBank,
    profile: Profile,
    apiKey: string,
    pricing: ModelPricing | undefined,
  ): Promise<TailoredResume> {
    const outcome = await this.requestTailoring(job, bank, profile, apiKey);
    const result: TailoringResult = normalizeTailoring(outcome.output, bank);
    const latex = renderResume({ bank, selection: result.selection });
    const costUsd =
      outcome.usage.costUsd > 0 || pricing === undefined
        ? outcome.usage.costUsd
        : usageToCost(outcome.usage, pricing);
    const createdAt = nowIso();
    return {
      id: tailoredResumeId(job.id, createdAt),
      jobId: job.id,
      company: job.company,
      title: job.title,
      bankVersion: bankVersion(bank.entries, bank.settings),
      source: "model",
      model: profile.model,
      usage: {
        promptTokens: outcome.usage.promptTokens,
        completionTokens: outcome.usage.completionTokens,
        costUsd,
      },
      selection: result.selection,
      latex,
      groundingNotes: result.groundingNotes,
      prompt: JSON.stringify(outcome.messages),
      rawResponse: outcome.rawResponse,
      createdAt,
      updatedAt: createdAt,
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
      jsonSchema: { name: tailoringSchemaName, schema: tailoringJsonSchema },
      reasoningEffort: profile.reasoningEffort,
      timeoutMs: this.options.perJobTimeoutMs ?? defaultTailoringTimeoutMs,
      signal: this.inFlight.signal,
      ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
    });
  }

  private async requestTailoring(
    job: Job,
    bank: ResumeBank,
    profile: Profile,
    apiKey: string,
  ): Promise<TailoringOutcome> {
    const messages = buildTailoringMessages({ job, bank });
    const first = await this.callModel(messages, profile, apiKey);
    const parsed = parseTailoring(first.content);
    if (parsed.ok) {
      return {
        output: parsed.output,
        usage: first.usage,
        messages,
        rawResponse: first.content,
        repaired: false,
      };
    }

    await this.log("warn", `invalid tailoring json for ${job.id}, retrying once`, {
      jobId: job.id,
      error: parsed.error,
    });

    const repairMessages = buildTailoringRepairMessages(
      { messages, invalidOutput: first.content },
      parsed.error,
    );
    const second = await this.callModel(repairMessages, profile, apiKey);
    const repaired = parseTailoring(second.content);
    if (!repaired.ok) {
      throw new Error(`model returned invalid tailoring JSON twice: ${repaired.error}`);
    }
    return {
      output: repaired.output,
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
