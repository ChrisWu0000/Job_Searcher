import type { FetchLike } from "@/lib/ai/openrouter";
import type { ApplyState, Job, JobScore, Question, TailoredResume, TailoringSource } from "@/types";

export interface SyncEngineOptions {
  forceRefresh?: boolean;
  postingDelayMs?: number;
  maxPages?: number;
  directConcurrency?: number;
  directDelayMs?: number;
}

export type SyncPhase = "navigating" | "results" | "postings" | "done";

export interface SyncProgress {
  phase: SyncPhase;
  page: number;
  stubsFound: number;
  postingsTotal: number;
  postingsDone: number;
  postingsSkipped: number;
  postingsFailed: number;
  currentJobId?: string;
  currentJobTitle?: string;
}

export interface ScoringEngineOptions {
  jobIds?: string[];
  concurrency?: number;
  perJobTimeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface ScoringProgress {
  total: number;
  done: number;
  skippedByPrefilter: number;
  cached: number;
  failed: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  currentJobIds: string[];
  lastScore?: JobScore;
}

export interface ResumeEngineOptions {
  jobIds: string[];
  source: TailoringSource;
  concurrency?: number;
  perJobTimeoutMs?: number;
  fetchImpl?: FetchLike;
}

export interface ResumeProgress {
  total: number;
  done: number;
  failed: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  currentJobIds: string[];
  lastResume?: TailoredResume;
}

export type ApplyStep =
  | "idle"
  | "opening"
  | "reading-requirements"
  | "selecting-package"
  | "selecting-documents"
  | "paused-for-questions"
  | "review"
  | "paused-before-submit"
  | "submitting"
  | "done"
  | "failed";

export type ApplyWaitReason = "questions" | "submit";

export interface ApplyEngineOptions {
  jobIds: string[];
  stopOnFailure?: boolean;
}

export interface ApplyProgress {
  queue: string[];
  currentIndex: number;
  currentJobId?: string;
  currentJob?: Job;
  step: ApplyStep;
  applyState?: ApplyState;
  questions: Question[];
  waitingFor?: ApplyWaitReason;
  done: number;
  failed: number;
  skipped: number;
}

export interface ApplyCheckpoint {
  queueIds: string[];
  currentIndex: number;
  currentStep: ApplyStep;
  answers: Record<string, string>;
  stopOnFailure: boolean;
  savedAt: string;
}

export const applyCheckpointKey = "apply:checkpoint";

export interface ApplyControls {
  submitAnswers(answers: Record<string, string>): Promise<void>;
  confirmSubmit(): Promise<void>;
  skipCurrent(): Promise<void>;
  retryCurrent(): Promise<void>;
}
