import type { Job } from "@/types/job";

export const jobTerms = ["winter-2027", "summer-2027", "later"] as const;

export type JobTerm = (typeof jobTerms)[number];

export const jobTermLabels: Record<JobTerm, string> = {
  "winter-2027": "Winter 2027",
  "summer-2027": "Summer 2027",
  later: "Later terms",
};

type TermMatch = JobTerm | "other";

interface TermEvidence {
  terms: Set<JobTerm>;
  other: boolean;
  keywords: Set<JobTerm>;
}

const month =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const season = "winter|spring|summer|fall|autumn";
const ordinal = "\\d{1,2}(?:st|nd|rd|th)?";
const yearOf = (name: string): string => `(?:\\b20(?<${name}>\\d{2})|['’](?<${name}s>\\d{2}))\\b`;
const dateSpec = (name: string): string =>
  `(?:\\b${ordinal}\\s+(?:of\\s+)?)?\\b(?<${name}>${month})\\b\\.?(?:\\s*/\\s*(?:${month})\\b\\.?)?(?:\\s+${ordinal}\\b)?(?:,?\\s*${yearOf(`${name}y`)})?`;
const seasonList = `\\b(?<seasons>(?:${season})\\b(?:\\s*(?:[,/&+]\\s*)?(?:\\b(?:and|or)\\b\\s*|&\\s*)?(?:${season})\\b)*)`;
const seasonWord = new RegExp(season, "gi");

const rangePattern = new RegExp(
  `${dateSpec("a")}\\s*(?:[-–—]+|\\bto\\b|\\bthrough\\b|\\bthru\\b|\\buntil\\b|\\btill\\b)\\s*(?:(?:the\\s+)?(?:end|middle|beginning|start)\\s+of\\s+)?(?:(?:early|mid|late)[\\s-]+)?${dateSpec("b")}`,
  "gi",
);
const startDatePattern = new RegExp(
  `\\b(?:start(?:s|ing)?|begin(?:s|ning)?|commenc(?:e|es|ing))\\b(?:\\s+dates?)?\\s*(?:[:–-]|\\bon\\b|\\bin\\b|\\bis\\b|\\bof\\b|\\bfrom\\b)?\\s*(?:(?:early|mid|late)[\\s-]+)?${dateSpec("a")}`,
  "gi",
);
const monthYearPattern = new RegExp(
  `\\b(?<a>${month})\\b\\.?[\\s,/-]*(?:of\\s+)?${yearOf("ay")}`,
  "gi",
);
const seasonYearPattern = new RegExp(
  `${seasonList}[\\s,/-]*(?:(?:co-?op|work|internship|academic)\\s+)?(?:(?:term|semester|session|quarter)\\s*)?(?:of\\s+)?${yearOf("y")}`,
  "gi",
);
const yearSeasonPattern = new RegExp(`${yearOf("y")}[\\s/-]*${seasonList}`, "gi");
const seasonKeywordPatterns = [
  new RegExp(
    `${seasonList}[\\s-]+(?:co-?ops?|intern(?:ship)?s?|work\\s+terms?|placements?|program(?:me)?s?|cohorts?)\\b`,
    "gi",
  ),
  new RegExp(
    `\\b(?:intern(?:ship)?s?|co-?ops?|placements?|work\\s+terms?)\\b[^.\\n]{0,30}?\\b(?:this|next|during|over|for|in)\\s+(?:the\\s+)?(?:upcoming\\s+)?(?<seasons>${season})\\b`,
    "gi",
  ),
  new RegExp(`\\b\\d{1,2}[\\s-]*weeks?\\s+(?:paid\\s+)?(?<seasons>${season})\\b`, "gi"),
];
const ignoredClause =
  /graduat|class of|convocation|\b(?:obtain|earn|receiv|complet|finish)\w*\s+(?:(?:a|an|the|your|their)\s+)?(?:\S+\s+){0,2}(?:degree|diploma|studies|education)|degree completion|\b(?:degree|diploma|employment)\b.*\b(?:by|before|between)\s+(?:the\s+)?(?:end\s+of\s+)?$/i;
const ignoredBefore =
  /deadline|apply (?:by|before)|applications? (?:are |will )?(?:close|due|open|accepted|reviewed)|closing date|posting end|date posted|posted on|as of|updated|interview|copyright|©|all rights reserved|return(?:ing)? to (?:school|university|college|campus|studies|classes)|remain(?:ing)? in school|continu(?:e|ing) (?:your |their )?(?:studies|education)|compared (?:to|with)|unlike|rather than|instead of/i;
const ignoredAfter = /graduat|\bgrads?\b|class\b|convocation/i;
const endMarker =
  /\b(?:to|until|till|through|thru|ending(?:\s+in)?|ends?(?:\s+(?:in|on))?|finish(?:es|ing)?(?:\s+in)?|conclud\w*(?:\s+in)?)\s+(?:(?:the\s+)?(?:end|middle|mid)\s+of\s+)?(?:(?:early|mid|late)[\s-]+)?$/i;
const offCycle = /\boff[\s-]?cycle\b/i;

function monthIndex(name: string): number {
  return [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(name.slice(0, 3).toLowerCase());
}

function seasonMonth(name: string): number {
  const key = name.toLowerCase();
  if (key === "summer") return 5;
  if (key === "fall" || key === "autumn") return 8;
  return 0;
}

function termForStart(monthNumber: number, year: number): TermMatch | undefined {
  if (monthNumber < 0 || year < 2020 || year > 2039) return undefined;
  if (year >= 2028) return "later";
  if (year === 2027) {
    if (monthNumber === 0) return "winter-2027";
    if (monthNumber >= 4 && monthNumber <= 6) return "summer-2027";
    if (monthNumber >= 7) return "later";
    return "other";
  }
  return year === 2026 && monthNumber === 11 ? "winter-2027" : "other";
}

function termForUndatedStart(monthNumber: number): JobTerm | undefined {
  if (monthNumber === 0) return "winter-2027";
  if (monthNumber >= 4 && monthNumber <= 6) return "summer-2027";
  if (monthNumber >= 8) return "later";
  return undefined;
}

function yearFrom(groups: Record<string, string | undefined>, name: string): number | undefined {
  const digits = groups[name] ?? groups[`${name}s`];
  return digits ? 2000 + Number(digits) : undefined;
}

function clauses(text: string): string[] {
  return text.split(/\n+|(?<=[a-z0-9)\]]{2}[.!?;])\s+(?=[A-Z(])|\s+[•·▪●]\s*/);
}

function* relevantMatches(
  clause: string,
  pattern: RegExp,
  skipEndDates = false,
): Generator<RegExpMatchArray> {
  for (const match of clause.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = clause.slice(0, start);
    if (ignoredClause.test(before)) continue;
    if (ignoredBefore.test(before.slice(-40))) continue;
    if (ignoredAfter.test(clause.slice(end, end + 20))) continue;
    if (skipEndDates && endMarker.test(before.slice(-40))) continue;
    yield match;
  }
}

function termEvidence(text: string): TermEvidence {
  const evidence: TermEvidence = { terms: new Set(), other: false, keywords: new Set() };
  const add = (term: TermMatch | undefined): void => {
    if (term === "other") evidence.other = true;
    else if (term) evidence.terms.add(term);
  };
  const addKeyword = (term: JobTerm | undefined): void => {
    if (term) evidence.keywords.add(term);
  };

  for (const original of clauses(text)) {
    let clause = original;
    for (const match of relevantMatches(clause, rangePattern)) {
      const groups = match.groups ?? {};
      const startMonth = monthIndex(groups.a ?? "");
      const endMonth = monthIndex(groups.b ?? "");
      const endYear = yearFrom(groups, "by");
      const startYear =
        yearFrom(groups, "ay") ??
        (endYear !== undefined && startMonth > endMonth ? endYear - 1 : endYear);
      if (startYear === undefined) addKeyword(termForUndatedStart(startMonth));
      else add(termForStart(startMonth, startYear));
    }
    clause = clause.replace(rangePattern, (range) => " ".repeat(range.length));

    for (const match of relevantMatches(clause, startDatePattern)) {
      const groups = match.groups ?? {};
      const year = yearFrom(groups, "ay");
      const startMonth = monthIndex(groups.a ?? "");
      if (year === undefined) addKeyword(termForUndatedStart(startMonth));
      else add(termForStart(startMonth, year));
    }
    for (const match of relevantMatches(clause, monthYearPattern, true)) {
      const groups = match.groups ?? {};
      const year = yearFrom(groups, "ay");
      const term = year === undefined ? undefined : termForStart(monthIndex(groups.a ?? ""), year);
      if (term !== "other") add(term);
    }
    for (const pattern of [seasonYearPattern, yearSeasonPattern]) {
      for (const match of relevantMatches(clause, pattern, true)) {
        const groups = match.groups ?? {};
        const year = yearFrom(groups, "y");
        if (year === undefined) continue;
        for (const name of (groups.seasons ?? "").match(seasonWord) ?? []) {
          add(termForStart(seasonMonth(name), year));
        }
      }
    }
    for (const pattern of seasonKeywordPatterns) {
      for (const match of relevantMatches(clause, pattern)) {
        for (const name of (match.groups?.seasons ?? "").match(seasonWord) ?? []) {
          addKeyword(termForUndatedStart(seasonMonth(name)));
        }
      }
    }
  }
  return evidence;
}

function orderedTerms(terms: Set<JobTerm>): JobTerm[] {
  return jobTerms.filter((term) => terms.has(term));
}

const internshipTitle = /\b(?:intern(?:ship)?s?|co[ -]?op|cooperative education)\b/i;
const eightMonthTerm = /\b8[\s-]*months?\b/i;
const fourToEightMonthTerm = /\b4\s*[-–]\s*8\s*months?\b/i;

export function isInternshipTitle(title: string): boolean {
  return (
    internshipTitle.test(title) && (!eightMonthTerm.test(title) || fourToEightMonthTerm.test(title))
  );
}

export function titleAdjustedJobTerms(title: string, terms: readonly JobTerm[]): JobTerm[] {
  if (/\bsummer\b/i.test(title) && !/\b(?:spring|winter)\b/i.test(title)) {
    return [...new Set(terms.map((term) => (term === "winter-2027" ? "summer-2027" : term)))];
  }
  return [...terms];
}

export function classifyJobTerms(job: Job): JobTerm[] {
  return titleAdjustedJobTerms(job.title, classifyTerms(job));
}

function classifyTerms(job: Job): JobTerm[] {
  if (!isInternshipTitle(job.title)) return [];

  const title = termEvidence(job.title);
  if (title.terms.size > 0) return orderedTerms(title.terms);

  const text = termEvidence([job.summary, job.rawText].filter(Boolean).join("\n"));
  if (text.terms.size > 0) return orderedTerms(text.terms);

  const explicit = (job.terms ?? []).join("\n");
  const listed = termEvidence(explicit.length > 0 ? explicit : (job.workTerm ?? ""));
  if (listed.terms.size > 0 || explicit.length > 0) return orderedTerms(listed.terms);
  if (title.other || text.other || listed.other) return [];
  const isOffCycle = offCycle.test(`${job.title}\n${job.summary ?? ""}`);
  for (const keywords of [title.keywords, text.keywords]) {
    if (isOffCycle) keywords.delete("summer-2027");
    if (keywords.size > 0) return orderedTerms(keywords);
  }
  return ["winter-2027", "summer-2027"];
}
