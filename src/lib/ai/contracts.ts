import type { PayBasis } from "@/lib/ranking/pay";
import type { Job, Profile } from "@/types";

export interface ModelPricing {
  modelId: string;
  promptUsdPerMillion: number;
  completionUsdPerMillion: number;
  contextLength?: number;
  fetchedAt: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  modelId: string;
}

export interface CostEstimate {
  jobCount: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostUsd: number;
  pricingKnown: boolean;
}

export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface ParsedHourlyPay {
  amount: number;
  currency: string;
  basis: PayBasis;
  original: string;
}

export interface PrefilterResult {
  excluded: boolean;
  hardViolations: string[];
  reason?: string;
  parsedHourlyPay?: ParsedHourlyPay;
}

export interface ScoringInput {
  job: Job;
  profile: Profile;
}
