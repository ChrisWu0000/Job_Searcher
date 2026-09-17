import type { WorkArrangement } from "@/types";
import { documentPatterns, textPatterns } from "./selectors";

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "div",
  "dd",
  "dl",
  "dt",
  "fieldset",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const SKIPPED_TAGS = new Set(["script", "style", "noscript", "template"]);

export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

export function collapseBlankLines(value: string): string {
  return value
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;

export function isDocumentNode(root: ParentNode): root is Document {
  return (root as Node).nodeType === DOCUMENT_NODE;
}

export function bodyOf(root: ParentNode): ParentNode {
  if (!isDocumentNode(root)) return root;
  return root.body ?? root.documentElement ?? root;
}

export function blockText(node: Node | null | undefined): string {
  if (!node) return "";
  const parts: string[] = [];
  const visit = (current: Node): void => {
    if (current.nodeType === TEXT_NODE) {
      parts.push(current.nodeValue ?? "");
      return;
    }
    if (current.nodeType === DOCUMENT_NODE || current.nodeType === DOCUMENT_FRAGMENT_NODE) {
      for (const child of Array.from(current.childNodes)) visit(child);
      return;
    }
    if (current.nodeType !== ELEMENT_NODE) return;
    const element = current as Element;
    const tag = element.tagName.toLowerCase();
    if (SKIPPED_TAGS.has(tag)) return;
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) parts.push("\n");
    for (const child of Array.from(element.childNodes)) visit(child);
    if (isBlock) parts.push("\n");
  };
  visit(node);
  return collapseBlankLines(parts.join(""));
}

export function flatText(node: Node | null | undefined): string {
  return normalizeWhitespace(blockText(node).replace(/\n/g, " "));
}

export function splitList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[\n;•·|]|,(?=\s)/)
    .map((item) => normalizeWhitespace(item).replace(/^[-–—*]\s*/, ""))
    .filter((item) => item.length > 0);
}

export function parseInteger(value: string | null | undefined): number | undefined {
  const match = /-?\d+/.exec(value ?? "");
  if (!match) return undefined;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseOpenings(value: string | null | undefined): number | undefined {
  const parsed = parseInteger(value);
  if (parsed === undefined || parsed < 0) return undefined;
  return parsed;
}

const MAX_PLAUSIBLE_DURATION_MONTHS = 24;

export function parseDurationMonths(value: string | null | undefined): number | undefined {
  const text = normalizeWhitespace(value);
  if (text.length === 0) return undefined;
  const candidates = Array.from(text.matchAll(/\d+/g))
    .map((match) => Number.parseInt(match[0], 10))
    .filter((count) => count >= 1 && count <= MAX_PLAUSIBLE_DURATION_MONTHS);
  if (candidates.length === 0) return undefined;
  return Math.min(...candidates);
}

export function parseArrangement(value: string | null | undefined): WorkArrangement | undefined {
  const text = normalizeWhitespace(value);
  if (text.length === 0) return undefined;
  if (textPatterns.hybrid.test(text)) return "hybrid";
  if (textPatterns.remote.test(text)) return "remote";
  if (textPatterns.inPerson.test(text)) return "in-person";
  return undefined;
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthIndexFromName(name: string): number | undefined {
  const lowered = name.toLowerCase().replace(/\./g, "");
  const index = MONTH_NAMES.findIndex((month) => month.startsWith(lowered.slice(0, 3)));
  return index >= 0 ? index : undefined;
}

function timeOfDay(text: string): { hours: number; minutes: number } {
  const match = /(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i.exec(text);
  if (!match) return { hours: 0, minutes: 0 };
  const rawHours = Number.parseInt(match[1] ?? "0", 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const meridiem = (match[3] ?? "").toLowerCase().replace(/\./g, "");
  if (meridiem === "pm") return { hours: rawHours === 12 ? 12 : rawHours + 12, minutes };
  if (meridiem === "am") return { hours: rawHours === 12 ? 0 : rawHours, minutes };
  return { hours: rawHours, minutes };
}

function toIso(year: number, monthIndex: number, day: number, text: string): string | undefined {
  const { hours, minutes } = timeOfDay(text);
  const date = new Date(year, monthIndex, day, hours, minutes, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function parseDateToIso(value: string | null | undefined): string | undefined {
  const text = normalizeWhitespace(value);
  if (text.length === 0) return undefined;

  const isoMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1] ?? "", 10);
    const month = Number.parseInt(isoMatch[2] ?? "", 10) - 1;
    const day = Number.parseInt(isoMatch[3] ?? "", 10);
    return toIso(year, month, day, text.slice(isoMatch.index + isoMatch[0].length));
  }

  const monthFirst = /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(text);
  if (monthFirst) {
    const monthIndex = monthIndexFromName(monthFirst[1] ?? "");
    const day = Number.parseInt(monthFirst[2] ?? "", 10);
    const year = Number.parseInt(monthFirst[3] ?? "", 10);
    if (monthIndex !== undefined) {
      return toIso(year, monthIndex, day, text.slice(monthFirst.index + monthFirst[0].length));
    }
  }

  const dayFirst = /(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(text);
  if (dayFirst) {
    const monthIndex = monthIndexFromName(dayFirst[2] ?? "");
    const day = Number.parseInt(dayFirst[1] ?? "", 10);
    const year = Number.parseInt(dayFirst[3] ?? "", 10);
    if (monthIndex !== undefined) {
      return toIso(year, monthIndex, day, text.slice(dayFirst.index + dayFirst[0].length));
    }
  }

  return undefined;
}

export interface DocumentRequirements {
  resume: boolean;
  coverLetter: boolean;
  gradeReport: boolean;
  otherDocuments: string[];
}

export function parseDocumentRequirements(entries: string[]): DocumentRequirements {
  const requirements: DocumentRequirements = {
    resume: false,
    coverLetter: false,
    gradeReport: false,
    otherDocuments: [],
  };
  for (const entry of entries) {
    const name = normalizeWhitespace(entry);
    if (name.length === 0) continue;
    if (documentPatterns.coverLetter.test(name)) {
      requirements.coverLetter = true;
      continue;
    }
    if (documentPatterns.gradeReport.test(name)) {
      requirements.gradeReport = true;
      continue;
    }
    if (documentPatterns.resume.test(name)) {
      requirements.resume = true;
      continue;
    }
    requirements.otherDocuments.push(name);
  }
  return requirements;
}

export function documentKindOf(label: string): "resume" | "coverLetter" | "gradeReport" | "other" {
  if (documentPatterns.coverLetter.test(label)) return "coverLetter";
  if (documentPatterns.gradeReport.test(label)) return "gradeReport";
  if (documentPatterns.resume.test(label)) return "resume";
  return "other";
}

export function composeLocation(parts: (string | undefined)[]): string {
  return parts
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0)
    .join(", ");
}

export function hasPrescreenSignal(text: string): boolean {
  return textPatterns.prescreenPresent.test(text);
}

export function looksLikeConfirmation(text: string): boolean {
  return textPatterns.confirmationText.test(text);
}

export function extractPostingId(value: string | null | undefined): string | undefined {
  const text = value ?? "";
  const keyed = /(?:postingId|posting_id|ck_jobid|jobId)\D{0,3}(\d{3,})/i.exec(text);
  if (keyed?.[1]) return keyed[1];
  const bare = /\b(\d{5,})\b/.exec(text);
  return bare?.[1];
}

export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}
