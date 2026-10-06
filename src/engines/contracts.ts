import type { FetchLike } from "@/lib/ai/openrouter";
import type { JobScore, TailoredResume, TailoringSource } from "@/types";

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
