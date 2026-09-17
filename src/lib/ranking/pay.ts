export type PayBasis = "hour" | "week" | "month" | "year";

export interface ParsedPay {
  amount: number;
  currency: string;
  basis: PayBasis;
  original: string;
}

export const unknownCurrency = "UNKNOWN";
export const hoursPerWeek = 40;
export const weeksPerYear = 52;
export const hoursPerYear = hoursPerWeek * weeksPerYear;
export const hoursPerMonth = hoursPerYear / 12;
export const maxPlausibleHourlyPay = 5000;

const currencyToken = String.raw`C\$|CA\$|US\$|CAD|CDN|USD|\$`;
const currencyCode = "CAD|CDN|USD";
const amountToken = String.raw`\d[\d,]*(?:\.\d+)?[kK]?`;
const rangeSeparator = String.raw`\s*(?:-|–|—|to)\s*`;
const basisToken =
  "hourly|hours|hour|hrs|hr|weekly|weeks|week|wk|monthly|months|month|mo|yearly|years|year|yr|annum|annually|annual";

const amountFirstPattern = new RegExp(
  String.raw`((?:${currencyToken})(?:\s*\$)?)?\s*(${amountToken})` +
    String.raw`(?:\s*(?:${currencyCode})?${rangeSeparator}(?:${currencyToken})?\s*\$?\s*(${amountToken}))?` +
    String.raw`\s*(${currencyCode})?` +
    String.raw`\s*(?:/|per\s+|an\s+|a\s+|each\s+)?\s*(${basisToken})\b`,
  "gi",
);

const basisFirstPattern = new RegExp(
  String.raw`\b(hourly|weekly|monthly|yearly|annual|annually)\s+` +
    String.raw`(?:rate|pay|wage|salary|compensation|remuneration|earnings)\b` +
    String.raw`[\s:=-]*(?:of|is|at)?[\s:=-]*` +
    String.raw`((?:${currencyToken})(?:\s*\$)?)?\s*(${amountToken})` +
    String.raw`(?:${rangeSeparator}(?:${currencyToken})?\s*(${amountToken}))?` +
    String.raw`\s*(${currencyCode})?`,
  "gi",
);

function normalizeCurrency(token: string | undefined): string | undefined {
  if (token === undefined) return undefined;
  const cleaned = token.replace(/\s+/g, "").toUpperCase();
  if (cleaned === "C$" || cleaned === "CA$" || cleaned === "CAD" || cleaned === "CDN") return "CAD";
  if (cleaned === "US$" || cleaned === "USD" || cleaned === "USD$") return "USD";
  if (cleaned === "CAD$" || cleaned === "CDN$") return "CAD";
  return undefined;
}

function normalizeBasis(token: string): PayBasis | undefined {
  const word = token.toLowerCase();
  if (["hourly", "hours", "hour", "hrs", "hr"].includes(word)) return "hour";
  if (["weekly", "weeks", "week", "wk"].includes(word)) return "week";
  if (["monthly", "months", "month", "mo"].includes(word)) return "month";
  if (["yearly", "years", "year", "yr", "annum", "annually", "annual"].includes(word))
    return "year";
  return undefined;
}

function toNumber(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const value = Number(token.replace(/,/g, "").replace(/k$/i, "")) * (/k$/i.test(token) ? 1000 : 1);
  return Number.isFinite(value) ? value : undefined;
}

export function toHourly(amount: number, basis: PayBasis): number {
  if (basis === "hour") return amount;
  if (basis === "week") return amount / hoursPerWeek;
  if (basis === "month") return amount / hoursPerMonth;
  return amount / hoursPerYear;
}

interface PayCandidate extends ParsedPay {
  index: number;
}

function buildCandidate(
  index: number,
  original: string,
  currencyPrefix: string | undefined,
  low: string | undefined,
  high: string | undefined,
  currencySuffix: string | undefined,
  basisWord: string,
): PayCandidate | undefined {
  const basis = normalizeBasis(basisWord);
  if (basis === undefined) return undefined;
  const lowAmount = toNumber(
    low && high && /k$/i.test(high) && (toNumber(low) ?? 1000) < 1000 && !/k$/i.test(low)
      ? `${low}k`
      : low,
  );
  if (lowAmount === undefined) return undefined;
  const highAmount = toNumber(high);
  const minimum = highAmount === undefined ? lowAmount : Math.min(lowAmount, highAmount);
  const hourly = toHourly(minimum, basis);
  if (hourly < 0 || hourly > maxPlausibleHourlyPay) return undefined;
  const currency =
    normalizeCurrency(currencySuffix) ?? normalizeCurrency(currencyPrefix) ?? unknownCurrency;
  return {
    index,
    amount: Math.floor(hourly * 100) / 100,
    currency,
    basis,
    original: original.trim(),
  };
}

function hasCurrencyMarker(prefix: string | undefined, suffix: string | undefined): boolean {
  return (prefix ?? "").trim() !== "" || (suffix ?? "").trim() !== "";
}

function collectAmountFirst(text: string): PayCandidate[] {
  const candidates: PayCandidate[] = [];
  amountFirstPattern.lastIndex = 0;
  for (const match of text.matchAll(amountFirstPattern)) {
    const [original, prefix, low, high, suffix, basisWord] = match;
    if (basisWord === undefined || low === undefined) continue;
    if (
      !hasCurrencyMarker(prefix, suffix) &&
      !/\/|\bper\s+(?:hour|hr|week|month|year)\b/i.test(original)
    )
      continue;
    const candidate = buildCandidate(
      match.index ?? 0,
      original,
      prefix,
      low,
      high,
      suffix,
      basisWord,
    );
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function collectBasisFirst(text: string): PayCandidate[] {
  const candidates: PayCandidate[] = [];
  basisFirstPattern.lastIndex = 0;
  for (const match of text.matchAll(basisFirstPattern)) {
    const [original, basisWord, prefix, low, high, suffix] = match;
    if (basisWord === undefined || low === undefined) continue;
    const candidate = buildCandidate(
      match.index ?? 0,
      original,
      prefix,
      low,
      high,
      suffix,
      basisWord,
    );
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

export function parseHourlyPay(text: string): ParsedPay | undefined {
  if (text.trim() === "") return undefined;
  const candidates = [...collectAmountFirst(text), ...collectBasisFirst(text)]
    .filter(
      (candidate) =>
        !/\b(?:up to|maximum|housing|relocation|bonus|stipend|average)(?:\s+(?:allowance|of|is))?[\s:=-]*$/i.test(
          text.slice(Math.max(0, candidate.index - 60), candidate.index),
        ),
    )
    .sort((left, right) => left.index - right.index);
  const best = candidates.reduce<PayCandidate | undefined>(
    (lowest, candidate) =>
      !lowest || (candidate.currency === lowest.currency && candidate.amount < lowest.amount)
        ? candidate
        : lowest,
    undefined,
  );
  if (!best) return undefined;
  return {
    amount: best.amount,
    currency: best.currency,
    basis: best.basis,
    original: best.original,
  };
}

export function inferCurrencyFromCountry(country: string | undefined): string | undefined {
  if (country === undefined) return undefined;
  const text = country.toLowerCase();
  if (/\bcanada\b|\bcanadian\b/.test(text)) return "CAD";
  if (/\bunited states\b|\bu\.?s\.?a\.?\b|\busa\b|\bus\b|\bamerica\b/.test(text)) return "USD";
  return undefined;
}
