import {
  appendApplicationLog,
  getApplication,
  getJob,
  putSavedAnswer,
  saveApplication,
  setApplicationStatus,
  setJobStatus,
  upsertJobs,
} from "@/lib/db/repo";
import { isTransportFailure } from "@/lib/messaging/client";
import { nowIso } from "@/lib/time";
import type { Application, ApplyState, Job, Question } from "@/types";
import type { EngineName, RunKind } from "@/types/run";
import {
  type ApplyCheckpoint,
  type ApplyControls,
  type ApplyEngineOptions,
  type ApplyProgress,
  type ApplyStep,
  type ApplyWaitReason,
  applyCheckpointKey,
} from "./contracts";
import { BaseEngine, EngineStoppedError } from "./Engine";
import { createWwClient, tabUnavailableMessage, traceWwClient, type WwClient } from "./wwClient";

export type ApplyEngineDependencies = ApplyEngineOptions & { client?: WwClient };

export type ApplyResumeAction = "answers" | "submit" | "skip" | "retry";

class SkipCurrentSignal extends Error {
  constructor() {
    super("current application skipped");
    this.name = "SkipCurrentSignal";
  }
}

class RetryCurrentSignal extends Error {
  constructor() {
    super("current application restarted");
    this.name = "RetryCurrentSignal";
  }
}

function errorMessage(cause: unknown): string {
  if (isTransportFailure(cause) && cause instanceof Error) {
    return `${tabUnavailableMessage} (${cause.message})`;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

export function toApplyCheckpoint(value: unknown): ApplyCheckpoint | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<ApplyCheckpoint>;
  if (!Array.isArray(candidate.queueIds)) return undefined;
  if (!candidate.queueIds.every((entry) => typeof entry === "string")) return undefined;
  if (typeof candidate.currentIndex !== "number") return undefined;
  if (typeof candidate.currentStep !== "string") return undefined;
  if (!isStringRecord(candidate.answers)) return undefined;
  return {
    queueIds: [...candidate.queueIds],
    currentIndex: candidate.currentIndex,
    currentStep: candidate.currentStep as ApplyStep,
    answers: { ...candidate.answers },
    stopOnFailure: candidate.stopOnFailure === true,
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : nowIso(),
  };
}

export class ApplyEngine extends BaseEngine<ApplyProgress> implements ApplyControls {
  readonly engine: EngineName = "apply";
  readonly runKind: RunKind = "apply";

  private readonly client: WwClient;
  private readonly queue: string[];
  private readonly stopOnFailure: boolean;
  private currentIndex = 0;
  private step: ApplyStep = "idle";
  private answers: Record<string, string> = {};
  private questions: Question[] = [];
  private applyState: ApplyState | undefined;
  private currentJob: Job | undefined;
  private waitingFor: ApplyWaitReason | undefined;
  private gate:
    | { resolve: (action: ApplyResumeAction) => void; reject: (cause: Error) => void }
    | undefined;
  private skipRequested = false;
  private retryRequested = false;
  private doneCount = 0;
  private failedCount = 0;
  private skippedCount = 0;

  constructor(options: ApplyEngineDependencies) {
    super();
    this.client = traceWwClient(options.client ?? createWwClient(), (level, message) =>
      this.log(level, message),
    );
    this.queue = [...options.jobIds];
    this.stopOnFailure = options.stopOnFailure ?? false;
  }

  static async fromCheckpoint(client?: WwClient): Promise<ApplyEngine | undefined> {
    const resolved = client ?? createWwClient();
    const checkpoint = toApplyCheckpoint(await resolved.getCheckpoint(applyCheckpointKey));
    if (!checkpoint) return undefined;
    if (checkpoint.currentIndex >= checkpoint.queueIds.length) return undefined;
    const engine = new ApplyEngine({
      jobIds: checkpoint.queueIds,
      stopOnFailure: checkpoint.stopOnFailure,
      client: resolved,
    });
    engine.currentIndex = checkpoint.currentIndex;
    engine.answers = { ...checkpoint.answers };
    return engine;
  }

  get currentStep(): ApplyStep {
    return this.step;
  }

  get waitReason(): ApplyWaitReason | undefined {
    return this.waitingFor;
  }

  protected override runSummary(): Record<string, unknown> {
    return {
      queued: this.queue.length,
      done: this.doneCount,
      failed: this.failedCount,
      skipped: this.skippedCount,
      stopOnFailure: this.stopOnFailure,
    };
  }

  override stop(): void {
    const pending = this.gate;
    this.gate = undefined;
    this.waitingFor = undefined;
    super.stop();
    pending?.reject(new EngineStoppedError(this.engine));
  }

  async submitAnswers(answers: Record<string, string>): Promise<void> {
    this.answers = { ...this.answers, ...answers };
    for (const [key, answer] of Object.entries(answers)) {
      const question = this.questions.find((entry) => entry.id === key);
      await putSavedAnswer(question?.text ?? key, answer);
    }
    const jobId = this.currentJobId();
    if (jobId !== undefined) {
      const application = await getApplication(jobId);
      if (application) {
        await saveApplication({
          ...application,
          answers: { ...application.answers, ...answers },
        });
      }
      await this.recordStep(
        jobId,
        "answers-recorded",
        true,
        `${Object.keys(answers).length} answers recorded; type them into the WaterlooWorks tab, WW++ never answers for you`,
      );
    }
    await this.saveCheckpoint();
    if (this.waitingFor === "questions") this.releaseGate("answers");
  }

  async confirmSubmit(): Promise<void> {
    if (this.waitingFor !== "submit") {
      await this.log("warn", "confirmSubmit ignored because the engine is not waiting to submit");
      return;
    }
    this.releaseGate("submit");
  }

  async skipCurrent(): Promise<void> {
    this.skipRequested = true;
    if (!this.releaseGate("skip")) {
      await this.log("info", "skip requested and will apply at the next step boundary");
    }
  }

  async retryCurrent(): Promise<void> {
    this.retryRequested = true;
    if (!this.releaseGate("retry")) {
      await this.log("info", "retry requested and will apply at the next step boundary");
    }
  }

  protected async execute(): Promise<void> {
    await this.saveCheckpoint();
    while (this.currentIndex < this.queue.length) {
      const jobId = this.queue[this.currentIndex];
      if (jobId === undefined) break;
      await this.assertRunning();
      this.resetJobState();
      try {
        await this.processJob(jobId);
        this.doneCount += 1;
      } catch (cause) {
        if (cause instanceof EngineStoppedError) throw cause;
        if (cause instanceof RetryCurrentSignal) {
          await this.log("info", `restarting ${jobId} from the opening step`);
          continue;
        }
        if (cause instanceof SkipCurrentSignal) {
          await this.cancelApplication(jobId);
          this.skippedCount += 1;
        } else {
          await this.failApplication(jobId, cause);
          this.failedCount += 1;
          if (isTransportFailure(cause)) {
            await this.saveCheckpoint();
            throw new Error(tabUnavailableMessage);
          }
          if (this.stopOnFailure) {
            await this.saveCheckpoint();
            throw new Error(`apply queue stopped after ${jobId} failed: ${errorMessage(cause)}`);
          }
        }
      }
      this.currentIndex += 1;
      await this.saveCheckpoint();
      this.emitApplyProgress();
    }
    await this.client.clearCheckpoint(applyCheckpointKey);
    await this.log("info", "apply queue finished", this.runSummary());
  }

  private resetJobState(): void {
    this.skipRequested = false;
    this.retryRequested = false;
    this.waitingFor = undefined;
    this.questions = [];
    this.applyState = undefined;
    this.currentJob = undefined;
  }

  private currentJobId(): string | undefined {
    return this.queue[this.currentIndex];
  }

  private async processJob(jobId: string): Promise<void> {
    await this.beginApplication(jobId);

    await this.enterStep("opening");
    await this.client.ensureTab();
    await this.client.openJob(jobId);

    await this.enterStep("reading-requirements");
    const job = await this.client.scrapeCurrentJob();
    await upsertJobs([job]);
    this.currentJob = job;
    await this.client.startApplication(jobId);
    this.applyState = await this.client.getApplyState();
    await this.recordStep(
      jobId,
      "reading-requirements",
      true,
      `${this.applyState.documents.length} document slots and ${this.applyState.questions.length} prescreen questions`,
    );

    await this.enterStep("selecting-package");
    await this.choosePackage(jobId);

    await this.enterStep("selecting-documents");
    await this.chooseDocuments(jobId);

    this.questions = this.applyState?.questions ?? [];
    if (this.questions.length > 0) await this.pauseForQuestions(jobId);

    await this.enterStep("review");
    await this.recordStep(jobId, "review", true, this.reviewSummary());

    await this.pauseBeforeSubmit(jobId);

    await this.enterStep("submitting");
    const result = await this.client.submit();
    if (!result.submitted) throw new Error("WaterlooWorks did not confirm the submission");

    this.step = "done";
    this.emitApplyProgress();
    await this.completeApplication(jobId, result.confirmationText);
  }

  private async beginApplication(jobId: string): Promise<void> {
    const existing = await getApplication(jobId);
    const application: Application = {
      jobId,
      status: "in-progress",
      ...(existing?.packageId === undefined ? {} : { packageId: existing.packageId }),
      answers: existing?.answers ?? {},
      log: existing?.log ?? [],
    };
    await saveApplication(application);
    this.answers = { ...application.answers };
    const job = await getJob(jobId);
    if (job && job.status !== "queued") await setJobStatus(jobId, "queued");
    await this.recordStep(jobId, "queued", true, `starting the application for ${jobId}`);
  }

  private async choosePackage(jobId: string): Promise<void> {
    const state = this.applyState;
    if (!state) return;
    if (state.packages.length === 0 || state.selectedPackageId !== undefined) return;
    const chosen = state.packages[0];
    if (!chosen) return;
    await this.client.selectPackage(chosen.id);
    this.applyState = await this.client.getApplyState();
    const application = await getApplication(jobId);
    if (application) await saveApplication({ ...application, packageId: chosen.id });
    await this.recordStep(jobId, "selecting-package", true, `package ${chosen.name}`);
  }

  private async chooseDocuments(jobId: string): Promise<void> {
    const state = this.applyState;
    if (!state) return;
    const chosen: string[] = [];
    for (const slot of state.documents) {
      if (!slot.required || slot.selectedId !== undefined) continue;
      const option = slot.options[0];
      if (!option) {
        await this.recordStep(
          jobId,
          "selecting-documents",
          false,
          `no document available for ${slot.kind}`,
        );
        continue;
      }
      await this.client.selectDocument(slot.kind, option.id);
      chosen.push(`${slot.kind}: ${option.name}`);
    }
    if (chosen.length === 0) return;
    this.applyState = await this.client.getApplyState();
    await this.recordStep(jobId, "selecting-documents", true, chosen.join(", "));
  }

  private reviewSummary(): string {
    const state = this.applyState;
    if (!state) return "nothing to review";
    const selectedPackage = state.packages.find((entry) => entry.id === state.selectedPackageId);
    const documents = state.documents
      .map((slot) => {
        const option = slot.options.find((entry) => entry.id === slot.selectedId);
        return `${slot.kind}: ${option?.name ?? "none"}`;
      })
      .join(", ");
    return `package ${selectedPackage?.name ?? "none"}; ${documents || "no documents"}`;
  }

  private async pauseForQuestions(jobId: string): Promise<void> {
    this.waitingFor = "questions";
    await this.enterStep("paused-for-questions");
    await setApplicationStatus(jobId, "paused");
    await this.recordStep(
      jobId,
      "paused-for-questions",
      true,
      `${this.questions.length} prescreen questions are waiting for your answers in the WaterlooWorks tab`,
    );
    const action = await this.waitForAction();
    this.waitingFor = undefined;
    this.throwOnInterruptingAction(action);
    await setApplicationStatus(jobId, "in-progress");
    this.applyState = await this.client.getApplyState();
  }

  private async pauseBeforeSubmit(jobId: string): Promise<void> {
    this.waitingFor = "submit";
    await this.enterStep("paused-before-submit");
    await setApplicationStatus(jobId, "paused");
    await this.recordStep(jobId, "paused-before-submit", true, this.reviewSummary());
    const action = await this.waitForAction();
    this.waitingFor = undefined;
    this.throwOnInterruptingAction(action);
    await setApplicationStatus(jobId, "in-progress");
  }

  private throwOnInterruptingAction(action: ApplyResumeAction): void {
    if (action === "skip") throw new SkipCurrentSignal();
    if (action === "retry") throw new RetryCurrentSignal();
  }

  private waitForAction(): Promise<ApplyResumeAction> {
    return new Promise<ApplyResumeAction>((resolve, reject) => {
      this.gate = { resolve, reject };
    });
  }

  private releaseGate(action: ApplyResumeAction): boolean {
    const pending = this.gate;
    if (!pending) return false;
    this.gate = undefined;
    pending.resolve(action);
    return true;
  }

  private async completeApplication(jobId: string, confirmationText?: string): Promise<void> {
    const application = await getApplication(jobId);
    if (application) {
      await saveApplication({
        ...application,
        status: "submitted",
        answers: { ...application.answers, ...this.answers },
        submittedAt: nowIso(),
      });
    }
    await setJobStatus(jobId, "applied");
    await this.recordStep(jobId, "done", true, confirmationText ?? "submitted");
  }

  private async cancelApplication(jobId: string): Promise<void> {
    await setApplicationStatus(jobId, "cancelled");
    await setJobStatus(jobId, "interested");
    this.step = "idle";
    await this.recordStep(jobId, "skipped", true, "skipped from the dashboard");
    this.emitApplyProgress();
  }

  private async failApplication(jobId: string, cause: unknown): Promise<void> {
    const detail = errorMessage(cause);
    this.step = "failed";
    this.waitingFor = undefined;
    await setApplicationStatus(jobId, "failed");
    await setJobStatus(jobId, "error");
    await this.recordStep(jobId, "failed", false, detail);
    await this.log("error", `application for ${jobId} failed: ${detail}`, { jobId });
    this.emitApplyProgress();
  }

  private async enterStep(step: ApplyStep): Promise<void> {
    await this.assertRunning();
    this.throwIfInterrupted();
    this.step = step;
    this.emitApplyProgress();
    await this.saveCheckpoint();
  }

  private throwIfInterrupted(): void {
    if (this.skipRequested) {
      this.skipRequested = false;
      throw new SkipCurrentSignal();
    }
    if (this.retryRequested) {
      this.retryRequested = false;
      throw new RetryCurrentSignal();
    }
  }

  private async recordStep(
    jobId: string,
    step: string,
    ok: boolean,
    detail?: string,
  ): Promise<void> {
    await appendApplicationLog(jobId, {
      at: nowIso(),
      step,
      ok,
      ...(detail === undefined ? {} : { detail }),
    });
    await this.log(ok ? "info" : "warn", `${jobId} ${step}${detail ? `: ${detail}` : ""}`, {
      jobId,
      step,
    });
  }

  private async saveCheckpoint(): Promise<void> {
    const checkpoint: ApplyCheckpoint = {
      queueIds: [...this.queue],
      currentIndex: this.currentIndex,
      currentStep: this.step,
      answers: { ...this.answers },
      stopOnFailure: this.stopOnFailure,
      savedAt: nowIso(),
    };
    await this.client.setCheckpoint(applyCheckpointKey, checkpoint);
  }

  private emitApplyProgress(): void {
    this.emitProgress({
      queue: [...this.queue],
      currentIndex: this.currentIndex,
      currentJobId: this.currentJobId(),
      currentJob: this.currentJob,
      step: this.step,
      applyState: this.applyState,
      questions: [...this.questions],
      waitingFor: this.waitingFor,
      done: this.doneCount,
      failed: this.failedCount,
      skipped: this.skippedCount,
    });
  }
}
