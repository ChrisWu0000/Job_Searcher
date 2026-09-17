import type { ResumeBank } from "@/lib/resume/contracts";
import type { Job } from "@/types/job";
import type { Profile } from "@/types/preferences";
import type { CostEstimate, ModelPricing, OpenRouterUsage } from "./contracts";
import {
  buildBankPrompt,
  buildSystemPrompt,
  buildTailoringSystemPrompt,
  buildUserPrompt,
  charactersPerToken,
} from "./prompts";

export const assumedCompletionTokensPerJob = 400;

export function estimateTokens(text: string): number {
  if (text === "") return 0;
  return Math.ceil(text.length / charactersPerToken);
}

export function usageToCost(
  usage: Pick<OpenRouterUsage, "promptTokens" | "completionTokens">,
  pricing: ModelPricing,
): number {
  const prompt = (usage.promptTokens / 1_000_000) * pricing.promptUsdPerMillion;
  const completion = (usage.completionTokens / 1_000_000) * pricing.completionUsdPerMillion;
  return prompt + completion;
}

export function estimateScoringCost(
  jobs: Job[],
  profile: Profile,
  pricing?: ModelPricing,
): CostEstimate {
  const systemTokens = estimateTokens(buildSystemPrompt(profile));
  const estimatedPromptTokens = jobs.reduce(
    (total, job) => total + systemTokens + estimateTokens(buildUserPrompt(job)),
    0,
  );
  const estimatedCompletionTokens = jobs.length * assumedCompletionTokensPerJob;
  if (!pricing) {
    return {
      jobCount: jobs.length,
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedCostUsd: 0,
      pricingKnown: false,
    };
  }
  return {
    jobCount: jobs.length,
    estimatedPromptTokens,
    estimatedCompletionTokens,
    estimatedCostUsd: usageToCost(
      { promptTokens: estimatedPromptTokens, completionTokens: estimatedCompletionTokens },
      pricing,
    ),
    pricingKnown: true,
  };
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$0.00";
  const magnitude = Math.abs(amount);
  const decimals = magnitude > 0 && magnitude < 0.01 ? 4 : 2;
  return `$${amount.toFixed(decimals)}`;
}

export const assumedTailoringCompletionTokensPerJob = 900;

export function estimateTailoringCost(
  jobs: Job[],
  bank: ResumeBank,
  pricing?: ModelPricing,
): CostEstimate {
  const fixedTokens =
    estimateTokens(buildTailoringSystemPrompt(bank)) + estimateTokens(buildBankPrompt(bank));
  const estimatedPromptTokens = jobs.reduce(
    (total, job) => total + fixedTokens + estimateTokens(buildUserPrompt(job)),
    0,
  );
  const estimatedCompletionTokens = jobs.length * assumedTailoringCompletionTokensPerJob;
  if (!pricing) {
    return {
      jobCount: jobs.length,
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedCostUsd: 0,
      pricingKnown: false,
    };
  }
  return {
    jobCount: jobs.length,
    estimatedPromptTokens,
    estimatedCompletionTokens,
    estimatedCostUsd: usageToCost(
      { promptTokens: estimatedPromptTokens, completionTokens: estimatedCompletionTokens },
      pricing,
    ),
    pricingKnown: true,
  };
}
