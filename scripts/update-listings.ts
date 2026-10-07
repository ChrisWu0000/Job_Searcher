import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Listing, listingSources, scrapeSource } from "../src/lib/listings/collect";
import { displayCompanyName, preferredCompanyName } from "../src/lib/listings/companyNames";
import {
  renderCsv,
  renderListings,
  renderListingsPage,
  type SourceStatus,
} from "../src/lib/listings/render";
import { isInternshipTitle } from "../src/lib/ranking/terms";

interface StoredSource {
  scrapedAt: string;
  listings: Listing[];
}

const dataDir = new URL("../data/", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const siteDir = new URL("../site/", import.meta.url);
const target = process.argv[2];

function fileFor(id: string): URL {
  return new URL(`${id}.json`, dataDir);
}

function load(id: string): StoredSource | undefined {
  const file = fileFor(id);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as StoredSource) : undefined;
}

if (target && target !== "render") {
  const ids = target === "all" ? listingSources.map((source) => source.id) : [target];
  mkdirSync(dataDir, { recursive: true });
  for (const id of ids) {
    const { listings, failures } = await scrapeSource(id, (url, init) => fetch(url, init));
    const missing = failures.filter((failure) => failure.endsWith("HTTP 404 Not Found"));
    for (const failure of failures) {
      if (!missing.includes(failure)) console.warn(`warning: ${failure}`);
    }
    if (missing.length > 0)
      console.log(`${id}: skipped ${missing.length} boards that no longer exist (404)`);
    const previous = load(id);
    if (listings.length === 0 && previous) {
      console.warn(`${id}: nothing found, keeping previous results`);
      continue;
    }
    const stored: StoredSource = { scrapedAt: new Date().toISOString(), listings };
    writeFileSync(fileFor(id), `${JSON.stringify(stored)}\n`);
    console.log(`${id}: ${listings.length} listings`);
  }
}

const statuses: SourceStatus[] = [];
const all: Listing[] = [];
const workdayCompanyNames = new Map<string, string>();
for (const source of listingSources.filter((candidate) => candidate.kind === "feed")) {
  const stored = load(source.id);
  for (const listing of stored?.listings ?? []) {
    const url = new URL(listing.url);
    if (!url.hostname.endsWith(".myworkdayjobs.com")) continue;
    const company = displayCompanyName(listing.company);
    const existing = workdayCompanyNames.get(url.hostname);
    workdayCompanyNames.set(
      url.hostname,
      existing ? preferredCompanyName(existing, company) : company,
    );
  }
}

for (const source of listingSources) {
  const stored = load(source.id);
  const listings = (stored?.listings ?? [])
    .filter((listing) => isInternshipTitle(listing.title))
    .map((listing) => {
      const host = new URL(listing.url).hostname;
      const company =
        source.id === "workday"
          ? (workdayCompanyNames.get(host) ?? displayCompanyName(listing.company))
          : displayCompanyName(listing.company);
      return { ...listing, company };
    });
  if (stored && JSON.stringify(listings) !== JSON.stringify(stored.listings)) {
    writeFileSync(fileFor(source.id), `${JSON.stringify({ ...stored, listings })}\n`);
  }
  all.push(...listings);
  statuses.push({
    source,
    count: listings.length,
    ...(stored ? { scrapedAt: stored.scrapedAt } : {}),
  });
}
const { markdown, counts } = renderListings(all, statuses, new Date());
writeFileSync(readmeUrl, markdown);
mkdirSync(dataDir, { recursive: true });
writeFileSync(new URL("listings.csv", dataDir), renderCsv(all));
mkdirSync(siteDir, { recursive: true });
writeFileSync(new URL("index.html", siteDir), renderListingsPage());
console.log(
  `README.md updated: ${counts.byTerm["winter-2027"]} winter, ${counts.byTerm["summer-2027"]} summer, ${counts.byTerm.later} later`,
);
