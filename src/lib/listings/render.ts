import { type JobCategory, jobCategories, jobCategoryLabels } from "@/lib/ranking/categories";
import { type JobTerm, jobTermLabels, jobTerms } from "@/lib/ranking/terms";
import type { Listing, ListingSource } from "./collect";

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function row(job: Listing): string {
  const location = job.location === "Not specified" ? "" : job.location.split("; ").join(", ");
  const link = `[Apply](${job.url})`;
  const posted = job.postedAt ? job.postedAt.slice(0, 10) : "";
  return `| ${cell(job.company)} | ${cell(job.title)} | ${cell(location)} | ${cell(job.pay ?? "")} | ${posted} | ${link} |`;
}

function table(jobs: Listing[]): string {
  const sorted = [...jobs].sort(
    (a, b) =>
      (b.postedAt ?? "").localeCompare(a.postedAt ?? "") ||
      a.company.localeCompare(b.company) ||
      a.title.localeCompare(b.title),
  );
  return [
    "| Company | Role | Location | Pay | Posted | Link |",
    "| --- | --- | --- | --- | --- | --- |",
    ...sorted.map(row),
  ].join("\n");
}

export const recentDays = 14;

const csvHeaders = ["Term", "Category", "Company", "Role", "Location", "Pay", "Posted", "Link"];

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function renderCsv(listings: Listing[]): string {
  const rows: string[][] = [];
  const unique = new Map<string, Listing>();
  for (const listing of listings) unique.set(listing.url, listing);
  const sorted = [...unique.values()].sort(
    (a, b) =>
      (b.postedAt ?? "").localeCompare(a.postedAt ?? "") || a.company.localeCompare(b.company),
  );
  for (const listing of sorted) {
    for (const term of listing.terms) {
      for (const category of listing.categories) {
        rows.push([
          jobTermLabels[term],
          jobCategoryLabels[category],
          listing.company,
          listing.title,
          listing.location === "Not specified" ? "" : listing.location,
          listing.pay ?? "",
          listing.postedAt?.slice(0, 10) ?? "",
          listing.url,
        ]);
      }
    }
  }
  return `${[csvHeaders, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export interface ListingCounts {
  byTerm: Record<JobTerm, number>;
}

export interface SourceStatus {
  source: ListingSource;
  count: number;
  scrapedAt?: string;
}

export function renderListings(
  listings: Listing[],
  statuses: SourceStatus[],
  updated: Date,
): { markdown: string; counts: ListingCounts } {
  const cutoff = new Date(updated.getTime() - recentDays * 86_400_000).toISOString();
  const unique = new Map<string, Listing>();
  for (const listing of listings) {
    if (listing.postedAt && listing.postedAt >= cutoff) unique.set(listing.url, listing);
  }

  const byTerm = new Map<JobTerm, Map<JobCategory, Listing[]>>();
  for (const term of jobTerms) byTerm.set(term, new Map());
  for (const listing of unique.values()) {
    for (const term of listing.terms) {
      const bucket = byTerm.get(term);
      if (!bucket) continue;
      for (const category of listing.categories) {
        bucket.set(category, [...(bucket.get(category) ?? []), listing]);
      }
    }
  }

  const counts: ListingCounts = { byTerm: { "winter-2027": 0, "summer-2027": 0 } };
  const sections: string[] = [];
  for (const term of jobTerms) {
    const bucket = byTerm.get(term) ?? new Map<JobCategory, Listing[]>();
    const ids = new Set<string>();
    for (const list of bucket.values()) for (const item of list) ids.add(item.url);
    counts.byTerm[term] = ids.size;
    const parts = [`## ${jobTermLabels[term]}`];
    for (const category of jobCategories) {
      const list = bucket.get(category) ?? [];
      parts.push(`### ${jobCategoryLabels[category]} (${list.length})`);
      parts.push(list.length > 0 ? table(list) : "_No listings right now._");
    }
    sections.push(parts.join("\n\n"));
  }

  const header = [
    "# JobScope: 2027 Internship Listings",
    "Software engineering, data science, cyber security, hardware engineering, and fintech internships for **Winter 2027** and **Summer 2027**, gathered from public community lists and company job boards. The tables show listings posted in the last 14 days, newest first. Older listings and listings with no posted date are in [data/listings.csv](data/listings.csv). Each source is scraped manually, one at a time.",
    `Last updated: ${updated.toISOString().slice(0, 10)} | Winter 2027: ${counts.byTerm["winter-2027"]} | Summer 2027: ${counts.byTerm["summer-2027"]}`,
    "Jump to: [Winter 2027](#winter-2027) | [Summer 2027](#summer-2027) | [Sources](#sources)",
  ].join("\n\n");

  const sourceRows = statuses.map(
    ({ source, count, scrapedAt }) =>
      `| ${source.label} | ${scrapedAt ? scrapedAt.slice(0, 10) : "not scraped yet"} | ${count} |`,
  );
  const footer = [
    "## Sources",
    "Nothing scrapes automatically. To refresh a source, open the **Actions** tab, choose **Scrape source**, click **Run workflow**, and pick the source (or run `bun run listings <source-id>` locally).",
    ["| Source | Last scraped | Listings |", "| --- | --- | --- |", ...sourceRows].join("\n"),
    "- Download [data/listings.csv](data/listings.csv) for every scraped listing, including older ones and ones with no posted date.",
    "- **Posted** is the date the employer or job board published the listing, not the date it was scraped. It is blank when the source does not provide one.",
    "- **Pay** is shown only when the source or posting text states it.",
    "- A listing can appear under several categories or in both terms.",
    "- Categories and terms are inferred from titles, tags, and descriptions, so check the posting before applying.",
    "- Job boards (Ashby, Greenhouse, Lever, SmartRecruiters, Workable, Pinpoint, Gem, Workday) are discovered from the community lists, so scrape those first. The optional Chrome extension is described in [docs/EXTENSION.md](docs/EXTENSION.md).",
  ].join("\n\n");

  return { markdown: `${[header, ...sections, footer].join("\n\n")}\n`, counts };
}
