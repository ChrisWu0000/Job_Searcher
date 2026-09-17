import type { ExperienceEntry } from "@/types/resume";
import type { GroundingCheck } from "./contracts";

const numberPattern =
  /(?<![A-Za-z0-9.])\$?\d[\d,]*(?:\.\d+)?(?:%|[kKmMbB]|[xX]|\+)?(?![A-Za-z0-9])/g;
const wordPattern = /[A-Za-z0-9][A-Za-z0-9.+#/_-]*/g;
const sentenceEnders = new Set([".", "!", "?"]);
const numberLikePattern = /^\d[\d.,]*[A-Za-z]?$/;
const digitPattern = /\d/;
const uppercasePattern = /[A-Z]/;

export function sourceTextsOf(entry: ExperienceEntry): string[] {
  return [
    ...entry.bullets.map((bullet) => bullet.text),
    ...entry.facts,
    ...entry.technologies,
    entry.title,
    entry.organization ?? "",
  ].filter((text) => text.trim() !== "");
}

function normalizeNumber(token: string): string {
  return token.replace(/,/g, "").replace(/^\$/, "").toLowerCase();
}

export function numberTokens(text: string): string[] {
  const matches = text.match(numberPattern) ?? [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const match of matches) {
    const normalized = normalizeNumber(match);
    if (normalized === "" || seen.has(normalized)) continue;
    seen.add(normalized);
    tokens.push(match.replace(/,/g, ""));
  }
  return tokens;
}

function trimWordEdges(word: string): string {
  return word.replace(/^[.\-/_]+/, "").replace(/[.\-/_]+$/, "");
}

function dottedLooksTechnical(word: string): boolean {
  const segments = word.split(".");
  if (segments.some((segment) => segment === "")) return false;
  const last = segments[segments.length - 1];
  return last !== undefined && last.length >= 2;
}

function isProperCandidate(word: string, atSentenceStart: boolean): boolean {
  if (word.length < 2) return false;
  if (numberLikePattern.test(word)) return false;
  if (word.includes("+") || word.includes("#") || word.includes("/")) return true;
  if (word.includes("-") || word.includes("_")) return true;
  if (word.includes(".")) return dottedLooksTechnical(word);
  if (digitPattern.test(word)) return true;
  if (uppercasePattern.test(word.slice(1))) return true;
  return !atSentenceStart && uppercasePattern.test(word.slice(0, 1));
}

function precedingVisible(text: string, index: number): string | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const character = text[cursor];
    if (character === undefined) return undefined;
    if (character.trim() === "") continue;
    return character;
  }
  return undefined;
}

export function properTokens(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const match of text.matchAll(wordPattern)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const word = trimWordEdges(raw);
    if (word === "") continue;
    const previous = precedingVisible(text, index);
    const atSentenceStart = previous === undefined || sentenceEnders.has(previous);
    if (!isProperCandidate(word, atSentenceStart)) continue;
    const lowered = word.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    tokens.push(lowered);
  }
  return tokens;
}

function singular(token: string): string {
  return token.endsWith("s") ? token.slice(0, -1) : token;
}

function offenderList(label: string, offenders: string[]): string | undefined {
  if (offenders.length === 0) return undefined;
  return `introduces ${label} ${offenders.join(", ")}`;
}

export function checkGrounding(candidate: string, entry: ExperienceEntry): GroundingCheck {
  const joined = sourceTextsOf(entry).join("\n");
  const sourceNumbers = new Set(numberTokens(joined).map(normalizeNumber));
  const sourceTerms = new Set(properTokens(joined));
  for (const term of [...sourceTerms]) sourceTerms.add(singular(term));

  const missingNumbers = numberTokens(candidate).filter(
    (token) => !sourceNumbers.has(normalizeNumber(token)),
  );
  const missingTerms = properTokens(candidate).filter(
    (token) => !sourceTerms.has(token) && !sourceTerms.has(singular(token)),
  );

  const reasons = [
    offenderList("number", missingNumbers),
    offenderList("term", missingTerms),
  ].filter((reason): reason is string => reason !== undefined);

  if (reasons.length === 0) return { ok: true };
  return { ok: false, reason: reasons.join("; ") };
}
