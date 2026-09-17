import { truncateToTokens } from "@/lib/ai/prompts";
import type { Job } from "@/types/job";
import type {
  BulletChoice,
  EntryChoice,
  ExperienceBullet,
  ExperienceEntry,
  ResumeSelection,
  SkillChoice,
} from "@/types/resume";
import type { TailoringInput } from "./contracts";

export interface RelevanceOptions {
  maxBulletsPerEntry: number;
}

const rawTextTokenBudget = 3000;
const maxRationaleTerms = 12;
const minTokenLength = 2;
const tagWeight = 3;
const technologyWeight = 2;
const wordWeight = 1;

const tokenPattern = /[a-z0-9][a-z0-9+#.]*/g;
const trailingDotPattern = /\.+$/;
const separatorPattern = /[\s_\-/]+/g;

const stopwords = new Set([
  "about",
  "across",
  "after",
  "all",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "during",
  "each",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "might",
  "more",
  "most",
  "must",
  "no",
  "not",
  "of",
  "on",
  "or",
  "other",
  "our",
  "out",
  "over",
  "per",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "up",
  "us",
  "use",
  "used",
  "using",
  "very",
  "via",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "will",
  "with",
  "within",
  "would",
  "you",
  "your",
]);

const techSynonyms: [string, string][] = [
  ["k8s", "kubernetes"],
  ["js", "javascript"],
  ["ts", "typescript"],
  ["postgres", "postgresql"],
  ["ml", "machine learning"],
  ["react.js", "react"],
  ["node", "node.js"],
  ["golang", "go"],
  ["aws", "amazon web services"],
  ["gcp", "google cloud"],
];

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(tokenPattern) ?? [];
  const tokens: string[] = [];
  for (const match of matches) {
    const token = match.replace(trailingDotPattern, "");
    if (token.length < minTokenLength) continue;
    if (stopwords.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(separatorPattern, " ").trim();
}

function addPhrase(terms: Set<string>, phrase: string): void {
  terms.add(phrase);
  for (const token of tokenize(phrase)) terms.add(token);
}

export function jobTerms(job: Job): Set<string> {
  const parts = [
    job.title,
    job.summary ?? "",
    job.responsibilities ?? "",
    job.qualifications ?? "",
    (job.targetedPrograms ?? []).join(" "),
    truncateToTokens(job.rawText, rawTextTokenBudget),
  ];
  const terms = new Set<string>();
  for (const part of parts) {
    for (const token of tokenize(part)) terms.add(token);
  }
  const haystack = normalizePhrase(parts.join(" "));
  const present = (phrase: string): boolean =>
    phrase.includes(" ") ? haystack.includes(phrase) : terms.has(phrase);
  const hits = techSynonyms.filter(([left, right]) => present(left) || present(right));
  for (const [left, right] of hits) {
    addPhrase(terms, left);
    addPhrase(terms, right);
  }
  return terms;
}

function matchedTerms(terms: Set<string>, value: string): string[] {
  const phrase = normalizePhrase(value);
  if (phrase !== "" && terms.has(phrase)) return [phrase];
  return [...new Set(tokenize(value))].filter((token) => terms.has(token));
}

function matchesTerms(terms: Set<string>, value: string): boolean {
  return matchedTerms(terms, value).length > 0;
}

function mentionsTechnology(bullet: ExperienceBullet, technology: string): boolean {
  const needle = normalizePhrase(technology);
  if (needle === "") return false;
  if (normalizePhrase(bullet.text).includes(needle)) return true;
  return bullet.tags.some((tag) => normalizePhrase(tag).includes(needle));
}

export function bulletRelevance(
  bullet: ExperienceBullet,
  entry: ExperienceEntry,
  terms: Set<string>,
): number {
  let score = 0;
  for (const tag of bullet.tags) {
    if (matchesTerms(terms, tag)) score += tagWeight;
  }
  for (const technology of entry.technologies) {
    if (!matchesTerms(terms, technology)) continue;
    if (mentionsTechnology(bullet, technology)) score += technologyWeight;
  }
  for (const token of new Set(tokenize(bullet.text))) {
    if (terms.has(token)) score += wordWeight;
  }
  return score;
}

export function entryRelevance(
  entry: ExperienceEntry,
  terms: Set<string>,
  options: RelevanceOptions,
): number {
  const bulletScores = entry.bullets
    .map((bullet) => bulletRelevance(bullet, entry, terms))
    .sort((left, right) => right - left)
    .slice(0, options.maxBulletsPerEntry);
  let score = bulletScores.reduce((total, value) => total + value, 0);
  for (const technology of entry.technologies) {
    if (matchesTerms(terms, technology)) score += technologyWeight;
  }
  for (const token of new Set(tokenize(`${entry.title} ${entry.organization ?? ""}`))) {
    if (terms.has(token)) score += wordWeight;
  }
  return score;
}

interface Ranked<Item> {
  item: Item;
  index: number;
  score: number;
  pinned: boolean;
}

function rank<Item>(
  items: Item[],
  pinnedOf: (item: Item) => boolean,
  scoreOf: (item: Item) => number,
): Ranked<Item>[] {
  const ranked = items.map((item, index) => ({
    item,
    index,
    score: scoreOf(item),
    pinned: pinnedOf(item),
  }));
  return [
    ...ranked.filter((candidate) => candidate.pinned),
    ...ranked
      .filter((candidate) => !candidate.pinned)
      .sort((left, right) => right.score - left.score || left.index - right.index),
  ];
}

function selectBullets(
  entry: ExperienceEntry,
  terms: Set<string>,
  options: RelevanceOptions,
): BulletChoice[] {
  return rank(
    entry.bullets,
    (bullet) => bullet.pinned,
    (bullet) => bulletRelevance(bullet, entry, terms),
  )
    .slice(0, options.maxBulletsPerEntry)
    .map(({ item }) => ({ bulletId: item.id, text: item.text, rewritten: false }));
}

function selectSkills(input: TailoringInput, terms: Set<string>): SkillChoice[] {
  return input.bank.settings.skillGroups.map((group) => ({
    groupId: group.id,
    items: [
      ...group.items.filter((item) => matchesTerms(terms, item)),
      ...group.items.filter((item) => !matchesTerms(terms, item)),
    ],
  }));
}

function countMatches(counts: Map<string, number>, terms: Set<string>, values: string[]): void {
  for (const value of values) {
    for (const term of matchedTerms(terms, value)) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
}

function buildRationale(counts: Map<string, number>): string {
  if (counts.size === 0) return "No overlapping terms; using pinned entries and bank order.";
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))
    .slice(0, maxRationaleTerms)
    .map(([term]) => term);
  return `Local match on: ${top.join(", ")}`;
}

export function selectForJob(input: TailoringInput): ResumeSelection {
  const { bank } = input;
  const { settings } = bank;
  const terms = jobTerms(input.job);
  const options: RelevanceOptions = { maxBulletsPerEntry: settings.maxBulletsPerEntry };
  const entries: EntryChoice[] = [];
  const counts = new Map<string, number>();
  for (const kind of settings.sectionOrder) {
    const ranked = rank(
      bank.entries.filter((entry) => entry.kind === kind),
      (entry) => entry.pinned,
      (entry) => entryRelevance(entry, terms, options),
    );
    let taken = 0;
    for (const candidate of ranked) {
      if (taken >= settings.maxEntriesPerSection) break;
      if (!candidate.pinned && candidate.score === 0 && taken > 0) continue;
      const entry = candidate.item;
      const bullets = selectBullets(entry, terms, options);
      entries.push({ experienceId: entry.id, bullets });
      taken += 1;
      countMatches(counts, terms, [entry.title, entry.organization ?? ""]);
      countMatches(counts, terms, entry.technologies);
      const byId = new Map(entry.bullets.map((bullet) => [bullet.id, bullet]));
      for (const choice of bullets) {
        const bullet = byId.get(choice.bulletId);
        if (bullet === undefined) continue;
        countMatches(counts, terms, bullet.tags);
        countMatches(counts, terms, [bullet.text]);
      }
    }
  }
  return { entries, skills: selectSkills(input, terms), rationale: buildRationale(counts) };
}
