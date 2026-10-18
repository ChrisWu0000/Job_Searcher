import type { FetchLike } from "@/lib/ai/openrouter";
import type { Job } from "@/types/job";
import { feedEntries, type PublicJobFeed } from "./publicFeeds";

const applicationId = "app17F0kkWQZhC6HB";
const embedUrl = `https://airtable.com/embed/${applicationId}/shrOTtndhc6HSgnYb?viewControls=on`;
const browserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36";

export const internListFeed: PublicJobFeed = {
  id: "internlist",
  label: "intern-list.com",
  url: embedUrl,
  parse: (payload) => parseInternListRows(payload),
};

export function isJobrightUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "jobright.ai" || hostname.endsWith(".jobright.ai");
  } catch {
    return false;
  }
}

const columnKeys: Record<string, string> = {
  "Position Title": "title",
  Company: "company_name",
  Location: "location",
  Date: "date_posted",
  Salary: "compensation",
  Qualifications: "description",
};

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function internListTerms(hireTime: string): string[] {
  const terms: string[] = [];
  for (const part of hireTime.split("/")) {
    const match = part.trim().match(/^(\d{4})-([A-Za-z]+)$/);
    if (match?.[1] && match[2]) terms.push(`${match[2]} ${match[1]}`);
  }
  return terms;
}

export function parseInternListRows(payload: unknown): unknown[] {
  const table = object(object(object(payload)?.data)?.table);
  const columns = table?.columns;
  const rows = table?.rows;
  if (!Array.isArray(columns) || !Array.isArray(rows)) {
    throw new Error("unexpected intern-list response");
  }
  const byId = new Map<string, string>();
  let applyId: string | undefined;
  let hireId: string | undefined;
  for (const column of columns) {
    const record = object(column);
    const id = record?.id;
    const name = record?.name;
    if (typeof id !== "string" || typeof name !== "string") continue;
    const key = columnKeys[name];
    if (key) byId.set(id, key);
    if (name === "Apply") applyId = id;
    if (name === "Hire Time") hireId = id;
  }
  return rows.flatMap((row) => {
    const cells = object(object(row)?.cellValuesByColumnId);
    if (!cells) return [];
    const record: Record<string, unknown> = {};
    for (const [id, key] of byId) {
      const value = cells[id];
      if (typeof value === "string" && value.trim() !== "" && value.trim() !== "N/A") {
        record[key] = value.trim();
      }
    }
    const apply = applyId ? object(cells[applyId]) : undefined;
    if (typeof apply?.url === "string") {
      if (isJobrightUrl(apply.url)) return [];
      record.url = apply.url;
    }
    const hire = hireId ? cells[hireId] : undefined;
    if (typeof hire === "string") {
      const terms = internListTerms(hire);
      if (terms.length > 0) record.terms = terms;
    }
    return [record];
  });
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

export async function fetchInternListPayload(fetchImpl: FetchLike): Promise<unknown> {
  const page = await fetchImpl(embedUrl, { headers: { "User-Agent": browserAgent } });
  if (!page.ok) throw new Error(`embed page HTTP ${page.status}`);
  const html = await page.text();
  const path = html.match(/urlWithParams:\s*"([^"]+)"/)?.[1]?.replace(/\\u002F/gi, "/");
  if (!path) throw new Error("embedded data request not found");
  const pageLoadId = html.match(/"x-airtable-page-load-id":"([^"]+)"/)?.[1];
  const cookie = cookieHeader(page);
  const response = await fetchImpl(`https://airtable.com${path}`, {
    headers: {
      "User-Agent": browserAgent,
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "x-airtable-application-id": applicationId,
      "x-airtable-inter-service-client": "webClient",
      "x-time-zone": "UTC",
      "x-user-locale": "en",
      ...(pageLoadId ? { "x-airtable-page-load-id": pageLoadId } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (!response.ok) throw new Error(`data HTTP ${response.status}`);
  return response.json();
}

export async function fetchInternListJobs(fetchImpl: FetchLike): Promise<Job[]> {
  return feedEntries(await fetchInternListPayload(fetchImpl), internListFeed).jobs;
}
