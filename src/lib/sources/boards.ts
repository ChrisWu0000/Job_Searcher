import type { FetchLike } from "@/lib/ai/openrouter";
import { nowIso } from "@/lib/time";
import type { Job } from "@/types/job";
import { canonicalJobUrl } from "./publicFeeds";

export type PublicBoardProvider =
  | "ashby"
  | "greenhouse"
  | "lever"
  | "smartrecruiters"
  | "workable"
  | "pinpoint"
  | "gem"
  | "workday";

export interface PublicBoard {
  id: string;
  provider: PublicBoardProvider;
  label: string;
  endpoint: string;
  host: string;
  site?: string;
}

export function discoverPublicBoards(jobs: Iterable<Job>): PublicBoard[] {
  const boards = new Map<string, PublicBoard>();
  for (const job of jobs) {
    if (!job.url) continue;
    const found = publicBoardFromJobUrl(job.url);
    if (found) boards.set(found.id, found);
  }
  return [...boards.values()];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return undefined;
}

function nestedText(value: unknown, ...keys: string[]): string | undefined {
  const record = object(value);
  if (!record) return text(value);
  for (const key of keys) {
    const found = text(record[key]);
    if (found) return found;
  }
  return undefined;
}

function pathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function board(
  provider: PublicBoardProvider,
  label: string,
  endpoint: string,
  host: string,
  site?: string,
): PublicBoard {
  return {
    id: `${provider}:${label.toLowerCase()}`,
    provider,
    label,
    endpoint,
    host,
    ...(site ? { site } : {}),
  };
}

export function publicBoardFromJobUrl(value: string): PublicBoard | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const parts = pathParts(url);
  const host = url.hostname.toLowerCase();

  if (host === "jobs.ashbyhq.com" && parts[0]) {
    const slug = parts[0];
    return board(
      "ashby",
      slug,
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
      host,
    );
  }
  if (
    (host === "boards.greenhouse.io" ||
      host === "job-boards.greenhouse.io" ||
      host === "job-boards.eu.greenhouse.io") &&
    parts[0]
  ) {
    const slug = parts[0];
    return board(
      "greenhouse",
      slug,
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
      host,
    );
  }
  if ((host === "jobs.lever.co" || host === "jobs.eu.lever.co") && parts[0]) {
    const slug = parts[0];
    const apiHost = host === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
    return board("lever", slug, `https://${apiHost}/v0/postings/${encodeURIComponent(slug)}`, host);
  }
  if (host === "jobs.smartrecruiters.com" && parts[0]) {
    const slug = parts[0];
    return board(
      "smartrecruiters",
      slug,
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings`,
      host,
    );
  }
  if (host === "apply.workable.com" && parts[0] !== "api" && parts[0]) {
    const slug = parts[0];
    return board(
      "workable",
      slug,
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`,
      host,
    );
  }
  if (host.endsWith(".pinpointhq.com")) {
    const slug = host.slice(0, -".pinpointhq.com".length);
    if (slug && slug !== "www") {
      return board("pinpoint", slug, `https://${host}/postings.json`, host);
    }
  }
  if (host === "jobs.gem.com" && parts[0]) {
    const slug = parts[0];
    return board(
      "gem",
      slug,
      `https://api.gem.com/job_board/v0/${encodeURIComponent(slug)}/job_posts/`,
      host,
    );
  }

  const workdayHost = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (workdayHost) {
    const jobIndex = parts.findIndex((part) => part.toLowerCase() === "job");
    const site = jobIndex > 0 ? parts[jobIndex - 1] : undefined;
    const tenant = workdayHost[1];
    if (!site || !tenant) return undefined;
    return board(
      "workday",
      `${tenant}/${site}`,
      `https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`,
      host,
      site,
    );
  }
  return undefined;
}

function rowsFrom(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = object(payload);
  if (!record) throw new Error("posting API returned an unexpected JSON shape");
  for (const key of keys) {
    const rows = record[key];
    if (Array.isArray(rows)) return rows;
  }
  throw new Error("posting API response did not include a jobs array");
}

function locationFor(provider: PublicBoardProvider, row: Record<string, unknown>): string {
  if (provider === "lever") {
    return nestedText(row.categories, "location") ?? text(row.location) ?? "Not specified";
  }
  if (provider === "smartrecruiters") {
    const location = object(row.location);
    if (location) {
      return (
        [location.city, location.region, location.country]
          .map(text)
          .filter((part): part is string => part !== undefined)
          .join(", ") || "Not specified"
      );
    }
  }
  if (provider === "workday") {
    const locations = Array.isArray(row.locations)
      ? row.locations.map((entry) => nestedText(entry, "name")).filter(Boolean)
      : [];
    return text(row.locationsText) ?? (locations.join("; ") || "Not specified");
  }
  return (
    nestedText(row.location, "name", "city") ??
    text(row.location) ??
    text(row.locationsText) ??
    "Not specified"
  );
}

function descriptionFor(row: Record<string, unknown>): string | undefined {
  const raw =
    text(row.descriptionPlain) ??
    text(row.description) ??
    text(row.descriptionHtml) ??
    text(row.jobDescription) ??
    text(row.content);
  return raw
    ?.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function urlFor(boardInfo: PublicBoard, row: Record<string, unknown>): string | undefined {
  let value =
    text(row.absolute_url) ??
    text(row.hostedUrl) ??
    text(row.jobUrl) ??
    text(row.url) ??
    text(row.ref) ??
    text(row.externalPath);
  if (boardInfo.provider === "smartrecruiters" && !value && text(row.id)) {
    value = `https://jobs.smartrecruiters.com/${boardInfo.label}/${text(row.id)}`;
  }
  if (!value) return undefined;
  const absolute = value.startsWith("/") ? `https://${boardInfo.host}${value}` : value;
  return canonicalJobUrl(absolute);
}

export function normalizeBoardJob(
  boardInfo: PublicBoard,
  value: unknown,
  now = nowIso(),
): Job | undefined {
  const row = object(value);
  if (!row) return undefined;
  const title = text(row.title) ?? text(row.name) ?? text(row.text);
  const url = urlFor(boardInfo, row);
  if (!title || !url) return undefined;

  const description = descriptionFor(row);
  const company =
    text(row.company_name) ??
    nestedText(row.company, "name") ??
    boardInfo.label.split("/")[0] ??
    boardInfo.label;
  const compensation =
    text(row.compensation) ??
    text(row.salary) ??
    text(row.compensationTierSummary) ??
    text(row.salaryText);

  return {
    id: `url:${url}`,
    company,
    title,
    location: locationFor(boardInfo.provider, row),
    source: boardInfo.provider,
    url,
    scrapedAt: now,
    firstSeenAt: now,
    ...(compensation ? { compensation } : {}),
    ...(description ? { summary: description } : {}),
    rawText: description ?? `${title} at ${company}`,
    application: {
      resume: false,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    status: "new",
    ...(description ? { detailScrapedAt: now } : {}),
  };
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function getJson(fetchImpl: FetchLike, url: string, init?: RequestInit): Promise<unknown> {
  const { headers, ...request } = init ?? {};
  const response = await fetchImpl(url, {
    ...request,
    headers: { Accept: "application/json", ...headers },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  return response.json();
}

export async function fetchPublicBoardJobs(
  boardInfo: PublicBoard,
  fetchImpl: FetchLike,
): Promise<Job[]> {
  const jobs: Job[] = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    let payload: unknown;
    let rawRows: unknown[];
    if (boardInfo.provider === "lever") {
      payload = await getJson(
        fetchImpl,
        `${boardInfo.endpoint}?mode=json&skip=${offset}&limit=${limit}`,
      );
      rawRows = rowsFrom(payload, []);
    } else if (boardInfo.provider === "smartrecruiters") {
      payload = await getJson(fetchImpl, `${boardInfo.endpoint}?limit=${limit}&offset=${offset}`);
      rawRows = rowsFrom(payload, ["content"]);
    } else if (boardInfo.provider === "workday") {
      payload = await getJson(fetchImpl, boardInfo.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "" }),
      });
      rawRows = rowsFrom(payload, ["jobPostings"]);
    } else {
      payload = await getJson(fetchImpl, boardInfo.endpoint);
      rawRows = rowsFrom(payload, ["jobs", "postings", "job_posts"]);
    }

    for (const row of rawRows) {
      const job = normalizeBoardJob(boardInfo, row);
      if (job) jobs.push(job);
    }

    if (boardInfo.provider === "lever" && rawRows.length === limit) {
      offset += limit;
      continue;
    }
    if (boardInfo.provider === "smartrecruiters") {
      const record = object(payload);
      const total = numeric(record?.totalFound);
      if (rawRows.length > 0 && total !== undefined && offset + rawRows.length < total) {
        offset += rawRows.length;
        continue;
      }
    }
    if (boardInfo.provider === "workday") {
      const record = object(payload);
      const total = numeric(record?.total);
      if (rawRows.length > 0 && total !== undefined && offset + rawRows.length < total) {
        offset += rawRows.length;
        continue;
      }
    }
    break;
  }
  return jobs;
}
