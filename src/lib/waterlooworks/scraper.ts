import { nowIso } from "@/lib/time";
import type { Job, JobStub } from "@/types";
import { jobSchema, jobStubSchema } from "@/types/schemas";
import { getCurrentJobId } from "./pageKind";
import {
  blockText,
  bodyOf,
  composeLocation,
  extractPostingId,
  flatText,
  hasPrescreenSignal,
  parseArrangement,
  parseDateToIso,
  parseDocumentRequirements,
  parseDurationMonths,
  parseInteger,
  parseOpenings,
  splitList,
} from "./parse";
import {
  type ColumnKey,
  cellsIn,
  clickableDescendants,
  columnPatterns,
  dataCellCount,
  findLabelElement,
  findLabelledElement,
  findLabelledText,
  firstAnchor,
  hasHeaderCellsOnly,
  headerLabelIn,
  type LabelKey,
  listItemsIn,
  postingFieldsIn,
  query,
  queryAll,
} from "./selectors";

export class ScrapeError extends Error {
  readonly step: string;

  constructor(step: string, message: string) {
    super(message);
    this.name = "ScrapeError";
    this.step = step;
  }
}

type ColumnIndexes = Partial<Record<ColumnKey, number>>;

function cellsOf(row: Element): HTMLElement[] {
  return cellsIn(row);
}

function headerIndexes(table: HTMLElement): ColumnIndexes {
  const headerRow = query("resultsHeaderRow", table);
  const indexes: ColumnIndexes = {};
  if (!headerRow) return indexes;
  const headers = cellsOf(headerRow).map((cell) => flatText(headerLabelIn(cell) ?? cell));
  for (const [key, pattern] of Object.entries(columnPatterns) as [ColumnKey, RegExp][]) {
    const index = headers.findIndex((header) => pattern.test(header));
    if (index >= 0) indexes[key] = index;
  }
  return indexes;
}

function cellText(cells: HTMLElement[], index: number | undefined): string {
  if (index === undefined) return "";
  const cell = cells[index];
  return cell ? flatText(cell) : "";
}

function rowJobId(
  row: HTMLElement,
  cells: HTMLElement[],
  indexes: ColumnIndexes,
): string | undefined {
  const attribute =
    row.getAttribute("data-posting-id") ??
    row.getAttribute("data-postingid") ??
    row.getAttribute("data-id") ??
    row.getAttribute("data-job-id");
  if (attribute && attribute.trim().length > 0) return attribute.trim();

  const fromColumn = cellText(cells, indexes.jobId);
  const columnDigits = /\d{3,}/.exec(fromColumn);
  if (columnDigits) return columnDigits[0];

  for (const anchor of clickableDescendants(row)) {
    const candidate = extractPostingId(
      `${anchor.getAttribute("href") ?? ""} ${anchor.getAttribute("onclick") ?? ""} ${anchor.getAttribute("data-posting-id") ?? ""}`,
    );
    if (candidate) return candidate;
  }

  const fromRowId = extractPostingId(row.id);
  return fromRowId;
}

function rowTitle(row: HTMLElement, cells: HTMLElement[], indexes: ColumnIndexes): string {
  const fromColumn = cellText(cells, indexes.title);
  if (fromColumn.length > 0) return fromColumn;
  const anchor = firstAnchor(row);
  return anchor ? flatText(anchor) : "";
}

export function isDataRow(row: HTMLElement): boolean {
  if (hasHeaderCellsOnly(row)) return false;
  return dataCellCount(row) > 0;
}

export function resultsRows(root: ParentNode = document): HTMLElement[] {
  const table = query("resultsTable", root);
  if (!table) return [];
  return queryAll("resultsRow", table).filter(isDataRow);
}

export function scrapeResultsPage(root: ParentNode = document): JobStub[] {
  const table = query("resultsTable", root);
  if (!table) return [];
  const indexes = headerIndexes(table);
  const scrapedAt = nowIso();
  const stubs: JobStub[] = [];
  const seen = new Set<string>();

  for (const row of queryAll("resultsRow", table).filter(isDataRow)) {
    const cells = cellsOf(row);
    const id = rowJobId(row, cells, indexes);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const deadlineText = cellText(cells, indexes.deadline);
    const stub = jobStubSchema.safeParse({
      id,
      company: cellText(cells, indexes.company),
      title: rowTitle(row, cells, indexes),
      location: cellText(cells, indexes.location),
      deadline: parseDateToIso(deadlineText),
      openings: parseOpenings(cellText(cells, indexes.openings)),
      scrapedAt,
    });
    if (stub.success) stubs.push(stub.data);
  }
  return stubs;
}

export function firstResultsRowId(root: ParentNode = document): string | undefined {
  const table = query("resultsTable", root);
  if (!table) return undefined;
  const indexes = headerIndexes(table);
  for (const row of queryAll("resultsRow", table).filter(isDataRow)) {
    const id = rowJobId(row, cellsOf(row), indexes);
    if (id) return id;
  }
  return undefined;
}

export function findResultsRow(
  jobId: string,
  root: ParentNode = document,
): HTMLElement | undefined {
  const table = query("resultsTable", root);
  if (!table) return undefined;
  const indexes = headerIndexes(table);
  return queryAll("resultsRow", table)
    .filter(isDataRow)
    .find((row) => rowJobId(row, cellsOf(row), indexes) === jobId);
}

export function getResultsPageNumber(root: ParentNode = document): number | undefined {
  const current = query("pagerCurrent", root);
  if (!current) return undefined;
  return parseInteger(flatText(current));
}

function labelledBlock(key: LabelKey, root: ParentNode): string | undefined {
  const element = findLabelledElement(key, root);
  if (!element) return undefined;
  const text = blockText(element);
  return text.length > 0 ? text : undefined;
}

function labelledListItems(key: LabelKey, root: ParentNode): string[] {
  const element = findLabelledElement(key, root);
  if (!element) return [];
  const items = listItemsIn(element)
    .map((item) => flatText(item).replace(/^[-–—*]\s*/, ""))
    .filter((item) => item.length > 0);
  if (items.length > 0) return items;
  const lines = blockText(element)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > 1) return lines;
  const single = lines[0];
  return single ? splitList(single) : [];
}

export function postingRoot(root: ParentNode = document): ParentNode {
  const container = query("postingContainer", root);
  if (container) return container;
  return bodyOf(root);
}

export interface KnownPostingFacts {
  id?: string;
  title?: string;
  company?: string;
}

function collectFields(container: ParentNode): Record<string, string> | undefined {
  const entries = postingFieldsIn(container)
    .map(({ label, value }) => [label, blockText(parseValue(value)).trim()] as const)
    .filter(([, value]) => value.length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function parseValue(text: string): Node {
  const holder = document.createElement("div");
  holder.textContent = text;
  return holder;
}

function joinDefined(parts: (string | undefined)[], separator: string): string | undefined {
  const present = parts.filter((part): part is string => part !== undefined && part.length > 0);
  return present.length > 0 ? present.join(separator) : undefined;
}

export function scrapeCurrentJob(root: ParentNode = document, known: KnownPostingFacts = {}): Job {
  const container = postingRoot(root);
  const id = known.id ?? getCurrentJobId(container) ?? getCurrentJobId(root);
  if (!id) {
    throw new ScrapeError("scrapeCurrentJob", "could not determine the posting id on this page");
  }

  const headingTitle = query("postingTitle", container);
  const title =
    findLabelledText("jobTitle", container) ??
    (headingTitle ? flatText(headingTitle) : undefined) ??
    known.title ??
    "";
  const company =
    findLabelledText("organization", container) ??
    known.company ??
    findLabelledText("division", container) ??
    "";

  const city = findLabelledText("jobCity", container);
  const region = findLabelledText("jobRegion", container);
  const country = findLabelledText("jobCountry", container);
  const labelledLocation = findLabelledText("location", container);
  const location = composeLocation([city, region, country]) || labelledLocation || "";

  const rawText = blockText(container);
  const arrangementText = findLabelledText("arrangement", container);
  const arrangement = parseArrangement(arrangementText) ?? parseArrangement(rawText);

  const documentEntries = labelledListItems("applicationDocuments", container).flatMap((entry) =>
    entry
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
  const documents = parseDocumentRequirements(documentEntries);
  const applicationDeadline = parseDateToIso(findLabelledText("applicationDeadline", container));

  const scrapedAt = nowIso();
  const job = {
    id,
    company,
    title,
    location,
    deadline: applicationDeadline,
    openings: parseOpenings(findLabelledText("openings", container)),
    scrapedAt,
    arrangement,
    city,
    region,
    country,
    durationMonths: parseDurationMonths(findLabelledText("workTermDuration", container)),
    compensation: findLabelledText("compensation", container),
    division: findLabelledText("division", container),
    level: findLabelledText("level", container),
    workTerm: findLabelledText("workTerm", container),
    jobType: findLabelledText("jobType", container),
    address: joinDefined(
      [findLabelledText("addressLine1", container), findLabelledText("addressLine2", container)],
      ", ",
    ),
    postalCode: findLabelledText("postalCode", container),
    specialRequirements: findLabelledText("specialRequirements", container),
    additionalArrangementInfo: findLabelledText("additionalArrangement", container),
    applicationMethod: findLabelledText("applicationMethod", container),
    fields: collectFields(container),
    summary: labelledBlock("jobSummary", container),
    responsibilities: labelledBlock("jobResponsibilities", container),
    qualifications: labelledBlock("requiredSkills", container),
    targetedPrograms: labelledListItems("targetedPrograms", container),
    application: {
      deadline: applicationDeadline,
      resume: documents.resume,
      gradeReport: documents.gradeReport,
      coverLetter: documents.coverLetter,
      otherDocuments: documents.otherDocuments,
      hasPrescreenQuestions: postingMentionsPrescreenQuestions(container, rawText),
    },
    rawText,
    detailScrapedAt: scrapedAt,
    status: "new",
  };

  const parsed = jobSchema.safeParse(job);
  if (!parsed.success) {
    throw new ScrapeError(
      "scrapeCurrentJob",
      `scraped posting ${id} failed validation: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ")}`,
    );
  }
  return parsed.data;
}

function postingMentionsPrescreenQuestions(root: ParentNode, rawText: string): boolean {
  if (query("prescreenQuestion", root)) return true;
  const additional = findLabelledText("additionalApplicationInformation", root);
  if (additional && hasPrescreenSignal(additional)) return true;
  return hasPrescreenSignal(rawText);
}

export function postingSectionPresent(key: LabelKey, root: ParentNode = document): boolean {
  return findLabelElement(key, root) !== undefined;
}

export function scrapeStubFromPosting(root: ParentNode = document): JobStub {
  const job = scrapeCurrentJob(root);
  return jobStubSchema.parse({
    id: job.id,
    company: job.company,
    title: job.title,
    location: job.location,
    deadline: job.deadline,
    openings: job.openings,
    scrapedAt: job.scrapedAt,
  });
}
