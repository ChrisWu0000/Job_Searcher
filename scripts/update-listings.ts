import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Listing, listingSources, scrapeSource } from "../src/lib/listings/collect";
import { renderCsv, renderListings, type SourceStatus } from "../src/lib/listings/render";

interface StoredSource {
  scrapedAt: string;
  listings: Listing[];
}

const dataDir = new URL("../data/", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
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
    for (const failure of failures) console.warn(`warning: ${failure}`);
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
for (const source of listingSources) {
  const stored = load(source.id);
  all.push(...(stored?.listings ?? []));
  statuses.push({
    source,
    count: stored?.listings.length ?? 0,
    ...(stored ? { scrapedAt: stored.scrapedAt } : {}),
  });
}
const { markdown, counts } = renderListings(all, statuses, new Date());
writeFileSync(readmeUrl, markdown);
mkdirSync(dataDir, { recursive: true });
writeFileSync(new URL("listings.csv", dataDir), renderCsv(all));
console.log(
  `README.md updated: ${counts.byTerm["winter-2027"]} winter, ${counts.byTerm["summer-2027"]} summer`,
);
