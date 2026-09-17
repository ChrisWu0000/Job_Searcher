import { appendEvent, createRun, finishRun } from "@/lib/db/repo";
import { nowIso } from "@/lib/time";
import type { EngineName, LogLevel, RunKind, RunStatus } from "@/types/run";
import { EventBus } from "./EventBus";

export type EngineState = "idle" | "running" | "paused" | "stopped" | "failed";

export interface LogEvent {
  at: string;
  level: LogLevel;
  engine: EngineName;
  message: string;
  data?: unknown;
  runId?: number;
}

export interface Engine<TProgress> {
  readonly state: EngineState;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  on(
    event: "progress" | "log" | "state",
    handler: (payload: TProgress | LogEvent | EngineState) => void,
  ): () => void;
}

export interface ObservableEngine<TProgress> extends Engine<TProgress> {
  readonly progress: TProgress | undefined;
  readonly lastError: Error | undefined;
  readonly runId: number | undefined;
  onProgress(handler: (progress: TProgress) => void): () => void;
  onLog(handler: (event: LogEvent) => void): () => void;
  onState(handler: (state: EngineState) => void): () => void;
  dispose(): void;
}

export type EngineEventMap<TProgress> = {
  progress: TProgress;
  log: LogEvent;
  state: EngineState;
};

export class EngineStoppedError extends Error {
  constructor(engine: EngineName) {
    super(`${engine} engine stopped`);
    this.name = "EngineStoppedError";
  }
}

export abstract class BaseEngine<TProgress> implements ObservableEngine<TProgress> {
  abstract readonly engine: EngineName;
  abstract readonly runKind: RunKind;

  protected readonly bus = new EventBus<EngineEventMap<TProgress>>();
  private engineState: EngineState = "idle";
  private stopRequested = false;
  private pauseGate: Promise<void> | undefined;
  private releasePauseGate: (() => void) | undefined;
  private activeRunId: number | undefined;
  private failure: Error | undefined;
  private lastProgress: TProgress | undefined;

  get state(): EngineState {
    return this.engineState;
  }

  get runId(): number | undefined {
    return this.activeRunId;
  }

  get lastError(): Error | undefined {
    return this.failure;
  }

  get progress(): TProgress | undefined {
    return this.lastProgress;
  }

  protected abstract execute(): Promise<void>;

  protected runSummary(): Record<string, unknown> {
    return {};
  }

  async start(): Promise<void> {
    if (this.engineState === "running" || this.engineState === "paused") return;

    this.stopRequested = false;
    this.failure = undefined;
    this.pauseGate = undefined;
    this.releasePauseGate = undefined;
    this.activeRunId = await createRun(this.runKind);
    this.setState("running");
    await this.log("info", `${this.engine} run started`);

    try {
      await this.execute();
      await this.completeRun("done");
      this.setState("stopped");
    } catch (cause) {
      if (cause instanceof EngineStoppedError) {
        await this.log("warn", `${this.engine} run stopped`);
        await this.completeRun("stopped");
        this.setState("stopped");
        return;
      }
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.failure = error;
      await this.log("error", `${this.engine} run failed: ${error.message}`, {
        stack: error.stack,
      });
      await this.completeRun("failed", { error: error.message });
      this.setState("failed");
    }
  }

  pause(): void {
    if (this.engineState !== "running") return;
    this.pauseGate = new Promise<void>((resolve) => {
      this.releasePauseGate = resolve;
    });
    this.setState("paused");
  }

  resume(): void {
    if (this.engineState !== "paused") return;
    this.releasePauseGate?.();
    this.releasePauseGate = undefined;
    this.pauseGate = undefined;
    this.setState("running");
  }

  stop(): void {
    if (this.engineState === "idle") return;
    this.stopRequested = true;
    this.releasePauseGate?.();
    this.releasePauseGate = undefined;
    this.pauseGate = undefined;
  }

  on(
    event: "progress" | "log" | "state",
    handler: (payload: TProgress | LogEvent | EngineState) => void,
  ): () => void {
    return this.bus.on(event, handler);
  }

  onProgress(handler: (progress: TProgress) => void): () => void {
    return this.bus.on("progress", handler);
  }

  onLog(handler: (event: LogEvent) => void): () => void {
    return this.bus.on("log", handler);
  }

  onState(handler: (state: EngineState) => void): () => void {
    return this.bus.on("state", handler);
  }

  dispose(): void {
    this.bus.clear();
  }

  protected emitProgress(progress: TProgress): void {
    this.lastProgress = progress;
    this.bus.emit("progress", progress);
  }

  protected throwIfStopped(): void {
    if (this.stopRequested) throw new EngineStoppedError(this.engine);
  }

  protected async waitIfPaused(): Promise<void> {
    while (this.pauseGate) {
      await this.pauseGate;
    }
  }

  protected async assertRunning(): Promise<void> {
    this.throwIfStopped();
    await this.waitIfPaused();
    this.throwIfStopped();
  }

  protected async log(level: LogLevel, message: string, data?: unknown): Promise<void> {
    const event: LogEvent = {
      at: nowIso(),
      level,
      engine: this.engine,
      message,
      ...(data === undefined ? {} : { data }),
      ...(this.activeRunId === undefined ? {} : { runId: this.activeRunId }),
    };
    this.bus.emit("log", event);
    await appendEvent({
      at: event.at,
      level: event.level,
      engine: event.engine,
      message: event.message,
      ...(data === undefined ? {} : { data }),
      ...(this.activeRunId === undefined ? {} : { runId: this.activeRunId }),
    });
  }

  private async completeRun(status: RunStatus, extra?: Record<string, unknown>): Promise<void> {
    if (this.activeRunId === undefined) return;
    await finishRun(this.activeRunId, status, { ...this.runSummary(), ...(extra ?? {}) });
  }

  private setState(next: EngineState): void {
    if (this.engineState === next) return;
    this.engineState = next;
    this.bus.emit("state", next);
  }
}
