import { type JobCategory, jobCategories, jobCategoryLabels } from "@/lib/ranking/categories";
import { isInternshipTitle, type JobTerm, jobTermLabels, jobTerms } from "@/lib/ranking/terms";
import type { Listing, ListingSource } from "./collect";
import { displayCompanyName, preferredCompanyName } from "./companyNames";
import { filterAllowedLocations } from "./location";

function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function htmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function companyLabel(job: Listing): string {
  const requirements = `${job.noSponsorship ? " 🛂" : ""}${job.requiresUSCitizenship ? " 🇺🇸" : ""}`;
  return `${displayCompanyName(job.company)}${requirements}`;
}

function row(job: Listing): string {
  const location = job.location === "Not specified" ? "" : job.location.split("; ").join(", ");
  const link = `<a href="${htmlAttribute(job.url)}" target="_blank" rel="noopener noreferrer">Apply</a>`;
  const posted = job.postedAt ? job.postedAt.slice(0, 10) : "";
  return `| ${cell(companyLabel(job))} | ${cell(job.title)} | ${cell(location)} | ${cell(job.pay ?? "")} | ${posted} | ${link} |`;
}

function table(jobs: Listing[]): string {
  const sorted = [...jobs].sort(
    (a, b) =>
      (b.postedAt ?? "").localeCompare(a.postedAt ?? "") ||
      displayCompanyName(a.company).localeCompare(displayCompanyName(b.company)) ||
      a.title.localeCompare(b.title),
  );
  return [
    "| Company | Role | Location | Pay | Posted | Link |",
    "| --- | --- | --- | --- | --- | --- |",
    ...sorted.map(row),
  ].join("\n");
}

export function renderListingsPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chris Wu's Job Board</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 2rem; line-height: 1.5; }
    main { max-width: 1500px; margin: 0 auto; }
    h1 { margin-bottom: .25rem; }
    .intro, .legend { color: CanvasText; opacity: .8; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 1rem; align-items: end; margin: 1.5rem 0; }
    label { display: grid; gap: .3rem; font-weight: 600; }
    input, select, .download { box-sizing: border-box; min-height: 2.5rem; padding: .45rem .65rem; font: inherit; }
    #search { min-width: min(26rem, 80vw); }
    .download { display: inline-flex; align-items: center; border: 1px solid currentColor; border-radius: .3rem; text-decoration: none; }
    .table-wrap { overflow: auto; max-height: 75vh; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); }
    table { border-collapse: collapse; width: 100%; min-width: 950px; }
    th, td { padding: .65rem .75rem; border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: Canvas; z-index: 1; }
    tbody tr:hover { background: color-mix(in srgb, Highlight 12%, Canvas); }
    a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid Highlight; outline-offset: 2px; }
    @media (max-width: 600px) { body { padding: 1rem; } .toolbar { align-items: stretch; flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <h1>Chris Wu's Job Board</h1>
    <p class="intro">Software engineering, data science, cyber security, hardware engineering, and fintech internships in Canada, the United States, EU member countries, and the United Kingdom, plus remote roles worldwide. Apply links open in a new tab.</p>
    <p class="legend">🛂 Does not offer sponsorship · 🇺🇸 Requires U.S. citizenship</p>
    <div class="toolbar">
      <label>Search
        <input id="search" type="search" placeholder="Company, role, location, or pay" autocomplete="off">
      </label>
      <label>Term
        <select id="term-filter"><option value="">All terms</option><option>Winter 2027</option><option>Summer 2027</option><option>Later terms</option></select>
      </label>
      <label>Category
        <select id="category-filter"><option value="">All categories</option><option>Software engineering</option><option>Data science</option><option>Cyber security</option><option>Hardware engineering</option><option>Fintech</option></select>
      </label>
      <a class="download" href="./listings.csv" download>Download CSV</a>
    </div>
    <p id="status" aria-live="polite">Loading listings…</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Term</th><th>Category</th><th>Company</th><th>Role</th><th>Location</th><th>Pay</th><th>Posted</th><th>Link</th></tr></thead>
        <tbody id="listings"></tbody>
      </table>
    </div>
  </main>
  <script src="./app.js" defer></script>
</body>
</html>
`;
}

function isRestricted(listing: Listing): boolean {
  return Boolean(listing.requiresUSCitizenship || listing.noSponsorship);
}

export const recentDays = 14;

const csvHeaders = ["Term", "Category", "Company", "Role", "Location", "Pay", "Posted", "Link"];

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function renderCsv(listings: Listing[]): string {
  const rows: string[][] = [];
  const unique = new Map<string, Listing>();
  for (const listing of listings) {
    const location = filterAllowedLocations(listing.location);
    if (!isInternshipTitle(listing.title) || isRestricted(listing) || !location) continue;
    const existing = unique.get(listing.url);
    unique.set(listing.url, {
      ...listing,
      location: [
        ...new Set([...(existing?.location.split("; ") ?? []), ...location.split("; ")]),
      ].join("; "),
      company: existing ? preferredCompanyName(existing.company, listing.company) : listing.company,
      ...(existing?.requiresUSCitizenship || listing.requiresUSCitizenship
        ? { requiresUSCitizenship: true }
        : {}),
      ...(existing?.noSponsorship || listing.noSponsorship ? { noSponsorship: true } : {}),
    });
  }
  const sorted = [...unique.values()].sort(
    (a, b) =>
      (b.postedAt ?? "").localeCompare(a.postedAt ?? "") ||
      displayCompanyName(a.company).localeCompare(displayCompanyName(b.company)),
  );
  for (const listing of sorted) {
    for (const term of listing.terms) {
      for (const category of listing.categories) {
        rows.push([
          jobTermLabels[term],
          jobCategoryLabels[category],
          companyLabel(listing),
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
    const location = filterAllowedLocations(listing.location);
    if (
      isInternshipTitle(listing.title) &&
      !isRestricted(listing) &&
      location &&
      listing.postedAt &&
      listing.postedAt >= cutoff
    ) {
      const existing = unique.get(listing.url);
      unique.set(listing.url, {
        ...listing,
        location: [
          ...new Set([...(existing?.location.split("; ") ?? []), ...location.split("; ")]),
        ].join("; "),
        company: existing
          ? preferredCompanyName(existing.company, listing.company)
          : listing.company,
        ...(existing?.requiresUSCitizenship || listing.requiresUSCitizenship
          ? { requiresUSCitizenship: true }
          : {}),
        ...(existing?.noSponsorship || listing.noSponsorship ? { noSponsorship: true } : {}),
      });
    }
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

  const counts: ListingCounts = { byTerm: { "winter-2027": 0, "summer-2027": 0, later: 0 } };
  const sections: string[] = [];
  for (const term of jobTerms) {
    const bucket = byTerm.get(term) ?? new Map<JobCategory, Listing[]>();
    const ids = new Set<string>();
    for (const list of bucket.values()) for (const item of list) ids.add(item.url);
    counts.byTerm[term] = ids.size;
    const parts = [`## ${jobTermLabels[term]}`];
    for (const category of jobCategories) {
      const list = bucket.get(category) ?? [];
      parts.push(`<a id="${term}-${category}"></a>`);
      parts.push(`### ${jobCategoryLabels[category]} (${list.length})`);
      parts.push(list.length > 0 ? table(list) : "_No listings right now._");
    }
    sections.push(parts.join("\n\n"));
  }

  const header = [
    "# Chris Wu's Job Board",
    "Software engineering, data science, cyber security, hardware engineering, and fintech internships for **Winter 2027** and **Summer 2027** (plus a **Later terms** section for Fall 2027 and beyond), gathered from public community lists and company job boards. Only roles identified as internships or co-ops in Canada, the United States, EU member countries, the United Kingdom, or remote worldwide are included; full-time roles are excluded. The tables show listings posted in the last 14 days, newest first. Older listings and listings with no posted date are in [data/listings.csv](data/listings.csv). For Apply links that open in a new tab, use the [interactive listings page](https://chriswu0000.github.io/Job_Searcher/). All sources are scraped when a commit is pushed to `main`; individual sources can also be scraped manually.",
    "### Requirement icons\n\n- 🛂 Does not offer sponsorship\n- 🇺🇸 Requires U.S. citizenship",
    `Last updated: ${updated.toISOString().slice(0, 10)} | Winter 2027: ${counts.byTerm["winter-2027"]} | Summer 2027: ${counts.byTerm["summer-2027"]} | Later terms: ${counts.byTerm.later}`,
    [
      "Jump to:",
      ...jobTerms.map(
        (term) =>
          `- [${jobTermLabels[term]}](#${jobTermLabels[term]
            .toLowerCase()
            .replaceAll(" ", "-")}): ${jobCategories
            .map(
              (category) =>
                `[${jobCategoryLabels[category]}](#${term}-${category})`,
            )
            .join(" | ")}`,
      ),
      "- [Sources](#sources)",
    ].join("\n"),
  ].join("\n\n");

  const sourceRows = statuses.map(
    ({ source, count, scrapedAt }) =>
      `| ${source.label} | ${scrapedAt ? scrapedAt.slice(0, 10) : "not scraped yet"} | ${count} |`,
  );
  const footer = [
    "## Sources",
    "To refresh all sources, push a commit to `main`. To refresh one source manually, open the **Actions** tab, choose **Scrape source**, click **Run workflow**, and pick the source (or run `bun run listings <source-id>` locally).",
    ["| Source | Last scraped | Listings |", "| --- | --- | --- |", ...sourceRows].join("\n"),
    "- Download [data/listings.csv](data/listings.csv) for every scraped listing, including older ones and ones with no posted date.",
    "- **Posted** is the date the employer or job board published the listing, not the date it was scraped. It is blank when the source does not provide one.",
    "- **Pay** is shown only when the source or posting text states it.",
    "- A listing can appear under several categories or in both terms.",
    "- Categories and terms are inferred from titles, tags, and descriptions, so check the posting before applying.",
    "- Citizenship and sponsorship indicators are inferred from source descriptions or explicit eligibility fields; listings without accessible descriptions may not show an indicator.",
    "- Job boards (Ashby, Greenhouse, Lever, SmartRecruiters, Workable, Pinpoint, Gem, Workday) are discovered from the community lists, so scrape those first. The optional Chrome extension is described in [docs/EXTENSION.md](docs/EXTENSION.md).",
  ].join("\n\n");

  return { markdown: `${[header, ...sections, footer].join("\n\n")}\n`, counts };
}
