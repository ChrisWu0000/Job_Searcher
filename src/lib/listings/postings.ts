import type { FetchLike } from "@/lib/ai/openrouter";
import { payFromHtml } from "./pay";

export type PostingCheck =
  | { status: "open"; text: string; pay?: string }
  | { status: "closed"; reason: string }
  | { status: "unavailable"; reason: string };

export type PostingCache = Map<string, Promise<PostingCheck>>;

type DetailKind = "workday" | "greenhouse" | "lever" | "smartrecruiters" | "html";

interface DetailRequest {
  kind: DetailKind;
  url: string;
}

const maxTextLength = 40_000;
const closedText =
  /\b(?:no longer (?:accepting applications|available|active|open)|(?:job|position|posting|requisition|opening) (?:has been |is )?(?:closed|filled|expired|removed)|(?:job|position|posting|page) (?:could not be|was not|not) found)\b/i;

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const point =
        code[1]?.toLowerCase() === "x"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : " ";
    }
    return (
      {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
        nbsp: " ",
        ndash: "–",
        mdash: "—",
        rsquo: "’",
        lsquo: "‘",
        bull: "•",
        dollar: "$",
      }[code.toLowerCase()] ?? entity
    );
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/?(?:p|div|li|ul|ol|h[1-6]|tr|td|table|section|article|header|footer|dd|dt|blockquote)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ ?\n[\s]*/g, "\n")
    .trim();
}

function joined(parts: (string | undefined)[]): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .slice(0, maxTextLength);
}

export function postingDetailRequest(value: string): DetailRequest {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: "html", url: value };
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  const workday = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (workday?.[1]) {
    const jobIndex = parts.findIndex((part) => part.toLowerCase() === "job");
    const site = jobIndex > 0 ? parts[jobIndex - 1] : undefined;
    if (site && !/^[a-z]{2}(?:-[a-z]{2})?$/i.test(site) && parts.length > jobIndex + 1) {
      return {
        kind: "workday",
        url: `https://${host}/wday/cxs/${workday[1]}/${site}/${parts.slice(jobIndex).join("/")}`,
      };
    }
  }

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    const board = parts[1] === "jobs" ? parts[0] : url.searchParams.get("for");
    const id = parts[1] === "jobs" ? parts[2] : url.searchParams.get("token");
    if (board && id && /^\d+$/.test(id)) {
      return {
        kind: "greenhouse",
        url: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`,
      };
    }
  }

  if ((host === "jobs.lever.co" || host === "jobs.eu.lever.co") && parts[0] && parts[1]) {
    const api = host === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
    return { kind: "lever", url: `https://${api}/v0/postings/${parts[0]}/${parts[1]}` };
  }

  if (
    host === "api.smartrecruiters.com" &&
    /^\/v1\/companies\/[^/]+\/postings\/[^/]+$/.test(url.pathname)
  ) {
    return { kind: "smartrecruiters", url: url.toString() };
  }
  if (host === "jobs.smartrecruiters.com" && parts[0] && parts[1]) {
    const id = parts[1].match(/^\d+/)?.[0];
    if (id) {
      return {
        kind: "smartrecruiters",
        url: `https://api.smartrecruiters.com/v1/companies/${parts[0]}/postings/${id}`,
      };
    }
  }

  return { kind: "html", url: url.toString() };
}

function workdayText(payload: unknown): PostingCheck {
  const info = object(object(payload)?.jobPostingInfo);
  if (!info) return { status: "unavailable", reason: "unexpected Workday response" };
  if (info.posted === false) return { status: "closed", reason: "Workday posting unpublished" };
  const description = text(info.jobDescription);
  return {
    status: "open",
    text: joined([
      text(info.title),
      text(info.location),
      text(info.timeType),
      description ? htmlToText(description) : undefined,
    ]),
  };
}

function greenhouseText(payload: unknown): PostingCheck {
  const record = object(payload);
  if (!record) return { status: "unavailable", reason: "unexpected Greenhouse response" };
  const content = text(record.content);
  return {
    status: "open",
    text: joined([
      text(record.title),
      text(object(record.location)?.name),
      content ? htmlToText(decodeEntities(content)) : undefined,
    ]),
  };
}

function leverText(payload: unknown): PostingCheck {
  const record = object(payload);
  if (!record) return { status: "unavailable", reason: "unexpected Lever response" };
  const categories = object(record.categories);
  const lists = Array.isArray(record.lists)
    ? record.lists.map((entry) => {
        const list = object(entry);
        const content = text(list?.content);
        return joined([text(list?.text), content ? htmlToText(content) : undefined]);
      })
    : [];
  const description = text(record.description);
  const additional = text(record.additional);
  return {
    status: "open",
    text: joined([
      text(record.text),
      text(categories?.commitment),
      text(categories?.location),
      text(record.descriptionPlain) ?? (description ? htmlToText(description) : undefined),
      ...lists,
      text(record.additionalPlain) ?? (additional ? htmlToText(additional) : undefined),
    ]),
  };
}

function smartRecruitersText(payload: unknown): PostingCheck {
  const record = object(payload);
  if (!record) return { status: "unavailable", reason: "unexpected SmartRecruiters response" };
  if (record.active === false)
    return { status: "closed", reason: "SmartRecruiters posting inactive" };
  const sections = object(object(record.jobAd)?.sections) ?? {};
  return {
    status: "open",
    text: joined([
      text(record.name),
      text(object(record.typeOfEmployment)?.label),
      ...Object.values(sections).map((section) => {
        const body = text(object(section)?.text);
        return joined([text(object(section)?.title), body ? htmlToText(body) : undefined]);
      }),
    ]),
  };
}

function isJobPosting(record: Record<string, unknown>): boolean {
  const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  return types.some((type) => typeof type === "string" && /jobposting$/i.test(type));
}

function jobPostings(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jobPostings);
  const record = object(value);
  if (!record) return [];
  return [...(isJobPosting(record) ? [record] : []), ...Object.values(record).flatMap(jobPostings)];
}

function structuredPostings(html: string): Record<string, unknown>[] {
  const scripts =
    /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi;
  return [...html.matchAll(scripts)].flatMap((match) => {
    try {
      return jobPostings(JSON.parse(match[1] ?? ""));
    } catch {
      return [];
    }
  });
}

function scriptText(html: string): string {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => htmlToText(decodeEntities(match[1] ?? "")))
    .join("\n");
}

function pathDepth(value: string): number {
  try {
    return new URL(value).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function htmlPosting(
  html: string,
  requestedUrl: string,
  response: { url?: string; redirected?: boolean } = {},
  now: Date = new Date(),
): PostingCheck {
  const postings = structuredPostings(html);
  const finalUrl = response.url || requestedUrl;
  if (postings.length === 0) {
    const postingIds = requestedUrl.match(/\d{5,}|[\da-f]{8}-[\da-f-]{27}/gi) ?? [];
    if (/[?&]error=true\b/.test(finalUrl)) return { status: "closed", reason: "posting closed" };
    if (
      response.redirected &&
      pathDepth(finalUrl) < pathDepth(requestedUrl) &&
      !postingIds.some((id) => finalUrl.includes(id)) &&
      !/log-?in|sign-?in|sso|auth/i.test(finalUrl)
    ) {
      return { status: "closed", reason: "posting redirects to the job board" };
    }
    if (/^https:\/\/jobs\.ashbyhq\.com\//.test(requestedUrl) && /"posting"\s*:\s*null/.test(html)) {
      return { status: "closed", reason: "posting not found" };
    }
  }
  const validThrough = postings
    .map((posting) => Date.parse(String(posting.validThrough ?? "")))
    .filter(Number.isFinite);
  if (validThrough.length > 0 && validThrough.every((time) => time < now.getTime())) {
    return { status: "closed", reason: "posting expired" };
  }

  const pay = payFromHtml(html);
  if (postings.length > 0) {
    return {
      status: "open",
      text: joined(
        postings.flatMap((posting) => {
          const description = text(posting.description);
          return [
            text(posting.title),
            text(posting.employmentType),
            description ? htmlToText(decodeEntities(description)) : undefined,
          ];
        }),
      ),
      ...(pay ? { pay } : {}),
    };
  }

  const visible = htmlToText(html);
  if (closedText.test(visible.slice(0, 5_000))) {
    return { status: "closed", reason: "posting says it is closed" };
  }
  return {
    status: "open",
    text: joined([visible, visible.length < 500 ? scriptText(html) : undefined]),
    ...(pay ? { pay } : {}),
  };
}

function failureReason(cause: unknown): string {
  if (cause instanceof Error) return cause.name === "TimeoutError" ? "timeout" : cause.message;
  return String(cause);
}

async function request(
  fetchImpl: FetchLike,
  url: string,
  accept: string,
  retries = 1,
): Promise<Response> {
  const response = await fetchImpl(url, {
    headers: { Accept: accept },
    signal: AbortSignal.timeout(15_000),
  });
  if ((response.status === 429 || response.status === 503) && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    return request(fetchImpl, url, accept, retries - 1);
  }
  return response;
}

async function loadPosting(url: string, fetchImpl: FetchLike): Promise<PostingCheck> {
  const detail = postingDetailRequest(url);
  const json = detail.kind !== "html";
  try {
    const response = await request(
      fetchImpl,
      detail.url,
      json ? "application/json" : "text/html,application/xhtml+xml",
    );
    if (response.status === 404 || response.status === 410) {
      return { status: "closed", reason: `HTTP ${response.status}` };
    }
    if (!response.ok) return { status: "unavailable", reason: `HTTP ${response.status}` };
    if (!json) {
      return htmlPosting(await response.text(), detail.url, {
        url: response.url,
        redirected: response.redirected,
      });
    }
    const payload: unknown = await response.json();
    if (detail.kind === "workday") return workdayText(payload);
    if (detail.kind === "greenhouse") return greenhouseText(payload);
    if (detail.kind === "lever") return leverText(payload);
    return smartRecruitersText(payload);
  } catch (cause) {
    return { status: "unavailable", reason: failureReason(cause) };
  }
}

export function checkPosting(
  url: string,
  fetchImpl: FetchLike,
  cache?: PostingCache,
): Promise<PostingCheck> {
  const cached = cache?.get(url);
  if (cached) return cached;
  const pending = loadPosting(url, fetchImpl);
  cache?.set(url, pending);
  return pending;
}
