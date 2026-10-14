import type { FetchLike } from "@/lib/ai/openrouter";
import { isInternshipTitle } from "@/lib/ranking/terms";
import { nowIso, postedAtIso } from "@/lib/time";
import type { Job } from "@/types/job";
import careerSites from "../../../data/career-sites.json" with { type: "json" };
import { type PublicBoard, publicBoardFromJobUrl } from "./boards";
import { canonicalJobUrl } from "./publicFeeds";

export interface CompanyCareerSite {
  company: string;
  url: string;
}

export const companyCareerSites: CompanyCareerSite[] = careerSites;

export interface CareerPageDiscovery {
  jobs: Job[];
  boards: PublicBoard[];
  failures: string[];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function decodeHtml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const numeric =
        code[1]?.toLowerCase() === "x"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : entity;
    }
    return (
      {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
        nbsp: " ",
      }[code.toLowerCase()] ?? entity
    );
  });
}

function plainText(value: string): string {
  return decodeHtml(
    value
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function resolveJobUrl(value: unknown, baseUrl: string): string | undefined {
  const candidate = text(value);
  if (!candidate) return undefined;
  try {
    return canonicalJobUrl(new URL(candidate, baseUrl).toString());
  } catch {
    return undefined;
  }
}

function isJobPosting(value: Record<string, unknown>): boolean {
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  return types.some(
    (type) => typeof type === "string" && type.split(/[/#]/).at(-1)?.toLowerCase() === "jobposting",
  );
}

function jobPostingRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jobPostingRecords);
  const record = object(value);
  if (!record) return [];
  return [
    ...(isJobPosting(record) ? [record] : []),
    ...Object.values(record).flatMap(jobPostingRecords),
  ];
}

function locationText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map(locationText).filter(Boolean).join("; ") || undefined;
  }
  const record = object(value);
  if (!record) return text(value);
  const address = object(record.address) ?? record;
  const parts = [
    text(address.streetAddress),
    text(address.addressLocality),
    text(address.addressRegion),
    text(address.postalCode),
    text(address.addressCountry),
  ].filter((part): part is string => Boolean(part));
  return parts.join(", ") || undefined;
}

function structuredJob(
  record: Record<string, unknown>,
  site: CompanyCareerSite,
  pageUrl: string,
  now: string,
): Job | undefined {
  const title = text(record.title);
  if (!title || !isInternshipTitle(title)) return undefined;
  const mainEntity = object(record.mainEntityOfPage);
  const url =
    resolveJobUrl(record.url, pageUrl) ??
    resolveJobUrl(mainEntity?.["@id"] ?? mainEntity?.url, pageUrl) ??
    pageUrl;
  const hiringOrganization = object(record.hiringOrganization);
  const company = text(hiringOrganization?.name) ?? site.company;
  const description = text(record.description);
  const summary = description ? plainText(description) : undefined;
  const postedAt = postedAtIso(record.datePosted, new Date(now));
  return {
    id: `url:${url}`,
    company,
    title,
    location: locationText(record.jobLocation) ?? "Not specified",
    source: "company-careers",
    url,
    scrapedAt: now,
    firstSeenAt: now,
    ...(postedAt ? { postedAt } : {}),
    ...(summary ? { summary } : {}),
    rawText: summary ?? `${title} at ${company}`,
    application: {
      resume: false,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    status: "new",
  };
}

function jsonLdValues(html: string, failures: string[]): unknown[] {
  const payloads: unknown[] = [];
  const scripts =
    /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scripts)) {
    const content = match[1]?.trim();
    if (!content) continue;
    try {
      payloads.push(JSON.parse(content) as unknown);
    } catch (cause) {
      failures.push(`invalid JSON-LD: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return payloads;
}

function anchorValues(html: string): { href: string; title: string }[] {
  const values: { href: string; title: string }[] = [];
  const anchors = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const match of html.matchAll(anchors)) {
    const attributes = match[1] ?? "";
    const href = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    const title = plainText(match[2] ?? "");
    if (href && title) values.push({ href: decodeHtml(href), title });
  }
  return values;
}

export function discoverCareerPage(
  site: CompanyCareerSite,
  html: string,
  now = nowIso(),
): CareerPageDiscovery {
  const jobs = new Map<string, Job>();
  const boards = new Map<string, PublicBoard>();
  const failures: string[] = [];
  const pageUrl = canonicalJobUrl(site.url);
  if (!pageUrl) return { jobs: [], boards: [], failures };

  const directBoard = publicBoardFromJobUrl(pageUrl);
  if (directBoard) boards.set(directBoard.id, directBoard);

  for (const payload of jsonLdValues(html, failures)) {
    for (const record of jobPostingRecords(payload)) {
      const job = structuredJob(record, site, pageUrl, now);
      if (job) jobs.set(job.id, job);
    }
  }

  for (const anchor of anchorValues(html)) {
    const url = resolveJobUrl(anchor.href, pageUrl);
    if (!url) continue;
    const board = publicBoardFromJobUrl(url);
    if (board) boards.set(board.id, board);
    if (!isInternshipTitle(anchor.title)) continue;
    const job: Job = {
      id: `url:${url}`,
      company: site.company,
      title: anchor.title,
      location: "Not specified",
      source: "company-careers",
      url,
      scrapedAt: now,
      firstSeenAt: now,
      rawText: `${anchor.title} at ${site.company}`,
      application: {
        resume: false,
        gradeReport: false,
        coverLetter: false,
        otherDocuments: [],
        hasPrescreenQuestions: false,
      },
      status: "new",
    };
    if (!jobs.has(job.id)) jobs.set(job.id, job);
  }

  return { jobs: [...jobs.values()], boards: [...boards.values()], failures };
}

export async function fetchCareerPage(
  site: CompanyCareerSite,
  fetchImpl: FetchLike,
): Promise<CareerPageDiscovery> {
  const response = await fetchImpl(site.url, {
    headers: { Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  return discoverCareerPage(site, await response.text());
}
