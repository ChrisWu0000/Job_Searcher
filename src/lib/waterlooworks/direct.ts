import { waterlooWorksJobSearchPath } from "@/lib/messaging/tabs";
import { nowIso } from "@/lib/time";
import type { Job, ResultRow } from "@/types";
import { resultRowSchema } from "@/types/schemas";
import { flatText } from "./parse";
import { scrapeCurrentJob } from "./scraper";

export interface DirectTokens {
  table: string;
  body: string;
  summary: string;
  preScreening?: string;
}

export interface ResultsQuery {
  page: number;
  itemsPerPage: number;
  myProgram?: boolean;
}

export interface DirectResultsPage {
  totalResults: number;
  page: number;
  rows: ResultRow[];
}

export interface PostingBundle {
  html: string;
  summary: unknown;
  preScreeningHtml?: string;
}

export interface PostingOverview {
  org?: string;
  position?: string;
  div?: string;
  internalStatus?: string;
  status?: string;
  hasPreScreening?: boolean;
  tags?: string[];
  canApply?: boolean;
  hasApplication?: boolean;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const defaultItemsPerPage = 100;
export const maxItemsPerPage = 500;

const tokenPattern = "'([^']+)'";

function functionAction(name: string, scriptText: string): string | undefined {
  const pattern = new RegExp(
    `function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]{0,600}?action:\\s*${tokenPattern}`,
  );
  return pattern.exec(scriptText)?.[1];
}

export function extractDirectTokens(scriptText: string): DirectTokens | undefined {
  const table = /dataParams:\s*\{\s*action:\s*'([^']+)'\s*,\s*isDataViewer:\s*true/.exec(
    scriptText,
  )?.[1];
  const body = functionAction("getPostingOverview", scriptText);
  const summary = functionAction("getPostingData", scriptText);
  const preScreening = functionAction("getPostingPreScreening", scriptText);
  if (!table || !body || !summary) return undefined;
  return { table, body, summary, ...(preScreening ? { preScreening } : {}) };
}

export function inlineScriptText(doc: Document): string {
  return Array.from(doc.scripts)
    .map((script) => script.textContent ?? "")
    .join("\n");
}

export function isOnJobSearchPage(pathname: string): boolean {
  return pathname.endsWith(waterlooWorksJobSearchPath);
}

function formHeaders(): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    "X-Requested-With": "XMLHttpRequest",
  };
}

async function postForm(
  fetchImpl: FetchLike,
  fields: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const response = await fetchImpl(waterlooWorksJobSearchPath, {
    method: "POST",
    headers: formHeaders(),
    body: new URLSearchParams(fields).toString(),
    credentials: "same-origin",
  });
  return { status: response.status, text: await response.text() };
}

export class DirectFetchError extends Error {
  readonly step: string;

  constructor(step: string, message: string) {
    super(message);
    this.name = "DirectFetchError";
    this.step = step;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function normalizeIsoOffset(value: string): string | undefined {
  const withColon = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const time = Date.parse(withColon);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

interface RowCell {
  key: string;
  value: unknown;
}

function cellsOf(row: unknown): Map<string, unknown> {
  const cells = new Map<string, unknown>();
  if (typeof row !== "object" || row === null) return cells;
  const data = (row as { data?: unknown }).data;
  if (!Array.isArray(data)) return cells;
  for (const cell of data as RowCell[]) {
    if (typeof cell?.key === "string") cells.set(cell.key, cell.value);
  }
  return cells;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function parseResultRow(row: unknown, scrapedAt: string): ResultRow | undefined {
  const cells = cellsOf(row);
  const title = cells.get("JobTitle");
  const titleObject =
    typeof title === "object" && title !== null ? (title as Record<string, unknown>) : {};
  const id =
    asString(cells.get("postingId")) ??
    asString(cells.get("Id")) ??
    asString((row as { id?: unknown })?.id);
  if (!id || !/^\d+$/.test(id)) return undefined;
  const deadlineRaw = asString(cells.get("deadline")) ?? asString(cells.get("Deadline"));
  const candidate = {
    id,
    title: asString(titleObject.postingTitle) ?? asString(title) ?? "",
    company: asString(cells.get("Organization")) ?? "",
    location: asString(cells.get("City")) ?? "",
    deadline: deadlineRaw ? normalizeIsoOffset(deadlineRaw) : undefined,
    openings: asNumber(cells.get("Openings")),
    scrapedAt,
    division: asString(cells.get("Division")),
    level: asString(cells.get("Level")),
    applicationCount: asNumber(cells.get("ApplicationCount")),
    canApply: asBoolean(cells.get("canApply")),
    hasApplication: asBoolean(cells.get("hasApplication")),
    viewed: asBoolean(titleObject.viewed),
    isNew: asBoolean(titleObject.new),
  };
  const parsed = resultRowSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export function parseResultsPayload(payload: unknown, scrapedAt: string): DirectResultsPage {
  if (typeof payload !== "object" || payload === null) {
    throw new DirectFetchError("fetchResults", "WaterlooWorks did not return a results payload");
  }
  const body = payload as { totalResults?: unknown; page?: unknown; data?: unknown };
  const rows = Array.isArray(body.data)
    ? body.data
        .map((row) => parseResultRow(row, scrapedAt))
        .filter((row): row is ResultRow => row !== undefined)
    : [];
  return {
    totalResults: asNumber(body.totalResults) ?? rows.length,
    page: asNumber(body.page) ?? 1,
    rows,
  };
}

export async function fetchResultsPage(
  tokens: DirectTokens,
  query: ResultsQuery,
  fetchImpl: FetchLike,
): Promise<DirectResultsPage> {
  const filters =
    query.myProgram === false ? {} : { studentPerspective: { type: "boolean", value: true } };
  const { status, text } = await postForm(fetchImpl, {
    action: tokens.table,
    isDataViewer: "true",
    page: String(query.page),
    itemsPerPage: String(Math.min(maxItemsPerPage, Math.max(1, query.itemsPerPage))),
    sort: JSON.stringify([{ key: "Id", direction: "desc" }]),
    filters: JSON.stringify(filters),
  });
  if (status !== 200) {
    throw new DirectFetchError("fetchResults", `WaterlooWorks answered ${status} for the results`);
  }
  const payload = parseJson(text);
  if (payload === undefined) {
    throw new DirectFetchError(
      "fetchResults",
      "WaterlooWorks returned a page instead of results data; the session may have expired",
    );
  }
  return parseResultsPayload(payload, nowIso());
}

export async function fetchPostingBundle(
  tokens: DirectTokens,
  jobId: string,
  fetchImpl: FetchLike,
): Promise<PostingBundle> {
  const [body, summary] = await Promise.all([
    postForm(fetchImpl, { action: tokens.body, postingId: jobId }),
    postForm(fetchImpl, { action: tokens.summary, postingId: jobId }),
  ]);
  if (body.status !== 200 || summary.status !== 200) {
    throw new DirectFetchError(
      "fetchPosting",
      `WaterlooWorks answered ${body.status}/${summary.status} for posting ${jobId}`,
    );
  }
  const bodyText = body.text.trim();
  if (bodyText.length === 0 || /^(<!doctype|<html)/i.test(bodyText) || !bodyText.startsWith("<")) {
    throw new DirectFetchError(
      "fetchPosting",
      `WaterlooWorks did not return the posting body for ${jobId}; the session may have expired`,
    );
  }
  const summaryJson = parseJson(summary.text);
  if (summaryJson === undefined) {
    throw new DirectFetchError(
      "fetchPosting",
      `WaterlooWorks did not return the posting summary for ${jobId}`,
    );
  }
  const parsedSummary = asOverview(summaryJson);
  let preScreeningHtml: string | undefined;
  if (tokens.preScreening && parsedSummary.hasPreScreening) {
    const pre = await postForm(fetchImpl, { action: tokens.preScreening, postingId: jobId });
    if (pre.status === 200) preScreeningHtml = pre.text;
  }
  return {
    html: body.text,
    summary: summaryJson,
    ...(preScreeningHtml === undefined ? {} : { preScreeningHtml }),
  };
}

export function asOverview(value: unknown): PostingOverview {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const applicationData =
    typeof record.applicationData === "object" && record.applicationData !== null
      ? (record.applicationData as Record<string, unknown>)
      : {};
  return {
    org: asString(record.org),
    position: asString(record.position),
    div: asString(record.div),
    internalStatus: asString(record.internalStatus),
    status: asString(record.status),
    hasPreScreening: asBoolean(record.hasPreScreening),
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
    canApply: asBoolean(applicationData.canApply),
    hasApplication: asBoolean(applicationData.hasApplication),
  };
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function parsePostingBundle(jobId: string, bundle: PostingBundle): Job {
  const overview = asOverview(bundle.summary);
  const doc = parseHtml(bundle.html);
  const job = scrapeCurrentJob(doc, {
    id: jobId,
    ...(overview.position === undefined ? {} : { title: overview.position }),
    ...(overview.org === undefined ? {} : { company: overview.org }),
  });
  if (job.fields === undefined) {
    throw new DirectFetchError(
      "fetchPosting",
      `the posting body for ${jobId} carried no labelled fields, so nothing was saved`,
    );
  }
  const preScreenText = bundle.preScreeningHtml
    ? flatText(parseHtml(bundle.preScreeningHtml).body)
    : "";
  return {
    ...job,
    ...(overview.div === undefined ? {} : { division: overview.div }),
    ...(overview.internalStatus === undefined ? {} : { internalStatus: overview.internalStatus }),
    ...(overview.tags === undefined ? {} : { tags: overview.tags }),
    ...(overview.canApply === undefined ? {} : { canApply: overview.canApply }),
    ...(overview.hasApplication === undefined ? {} : { hasApplication: overview.hasApplication }),
    ...(preScreenText.length > 0 ? { prescreenText: preScreenText } : {}),
    application: {
      ...job.application,
      hasPrescreenQuestions:
        overview.hasPreScreening === true ||
        preScreenText.length > 0 ||
        job.application.hasPrescreenQuestions,
    },
  };
}
