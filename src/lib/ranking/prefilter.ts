import type { ParsedHourlyPay, PrefilterResult } from "@/lib/ai/contracts";
import type { Job } from "@/types/job";
import type { Profile } from "@/types/preferences";
import { inferCurrencyFromCountry, parseHourlyPay, unknownCurrency } from "./pay";
import { relevanceViolation } from "./relevance";

export const payConstraintIds: Record<string, string> = { CAD: "ca-pay", USD: "us-pay" };

export function payConstraintIdForCurrency(currency: string, profile: Profile): string {
  const expected = payConstraintIds[currency];
  if (expected === undefined) return `${currency.toLowerCase()}-pay`;
  const declared = profile.constraints.find((constraint) => constraint.id === expected);
  return declared?.id ?? expected;
}

export function payTextForJob(job: Job): string {
  return [job.compensation, job.summary, job.responsibilities, job.qualifications, job.rawText]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join("\n");
}

export function jobLocationText(job: Job): string {
  return [job.country, job.region, job.location].filter((part) => part !== undefined).join(", ");
}

export function currencyFromJobLocation(job: Job): string | undefined {
  return inferCurrencyFromCountry(jobLocationText(job));
}

export function parsedPayForJob(job: Job): ParsedHourlyPay | undefined {
  const text = job.compensation?.trim() || payTextForJob(job);
  if (
    /\b(?:university|waterloo|co-?op)\b[^.!?\n]{0,80}\b(?:norms?|averages?|guidelines?|pay scales?)\b/i.test(
      text,
    )
  )
    return undefined;
  const parsed = parseHourlyPay(text);
  if (!parsed) return undefined;
  return {
    ...parsed,
    currency:
      parsed.currency !== unknownCurrency
        ? parsed.currency
        : (currencyFromJobLocation(job) ?? unknownCurrency),
  };
}

function notExcluded(parsedHourlyPay?: ParsedHourlyPay): PrefilterResult {
  return {
    excluded: false,
    hardViolations: [],
    ...(parsedHourlyPay ? { parsedHourlyPay } : {}),
  };
}

export function prefilterJob(job: Job, profile: Profile): PrefilterResult {
  const role = relevanceViolation(job, profile);
  if (role) return { excluded: true, hardViolations: [role.id], reason: role.reason };
  const compensation = job.compensation?.trim() ?? "";
  const text = compensation || payTextForJob(job);
  const parsed = parsedPayForJob(job);
  const explicitCurrency =
    parsed && parsed.currency !== unknownCurrency ? parsed.currency : undefined;
  const locationCurrency = currencyFromJobLocation(job);
  const currency = explicitCurrency ?? locationCurrency;
  const parsedHourlyPay: ParsedHourlyPay | undefined = parsed
    ? {
        amount: parsed.amount,
        currency: currency ?? unknownCurrency,
        basis: parsed.basis,
        original: parsed.original,
      }
    : undefined;

  if ((!parsed || currency === undefined) && profile.unknownPay === "reject") {
    const vague =
      /\b(?:university|waterloo|co-?op)\b[^.!?\n]{0,100}\b(?:norms?|averages?|guidelines?|rates?|standards?)\b|\b(?:competitive|negotiable|commensurate|to be (?:discussed|determined)|based on (?:experience|work terms?))\b/i.test(
        text,
      );
    return {
      excluded: true,
      hardViolations: [currency ? payConstraintIdForCurrency(currency, profile) : "pay-disclosure"],
      reason: parsed
        ? "Pay currency is unclear, so the hourly minimum cannot be verified."
        : vague
          ? "Pay is vague or based on university norms; no explicit minimum hourly pay can be verified."
          : "No explicit minimum pay with a usable rate and currency could be parsed; unknown pay is set to reject.",
      ...(parsedHourlyPay ? { parsedHourlyPay } : {}),
    };
  }
  if (currency === undefined) return notExcluded(parsedHourlyPay);

  const floor = profile.payFloors[currency];
  if (floor === undefined) return notExcluded(parsedHourlyPay);
  const constraintId = payConstraintIdForCurrency(currency, profile);

  if (parsed) {
    if (parsed.amount >= floor) return notExcluded(parsedHourlyPay);
    return {
      excluded: true,
      hardViolations: [constraintId],
      reason: `Pay works out to ${parsed.amount} ${currency} per hour (from "${parsed.original}"), below the ${currency} floor of ${floor} per hour.`,
      ...(parsedHourlyPay ? { parsedHourlyPay } : {}),
    };
  }

  return notExcluded(parsedHourlyPay);
}
