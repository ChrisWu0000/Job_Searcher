import type { Listing } from "./collect";

function normalizedCompany(value: string): string {
  const words = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  while (
    words.length > 0 &&
    /^(?:inc|incorporated|llc|ltd|limited|corp|corporation|company|co|plc)$/.test(
      words[words.length - 1] ?? "",
    )
  ) {
    words.pop();
  }
  return words.join("");
}

function normalizedTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(
      /\b(?:20\d{2}|spring|summer|fall|winter|intern|internship|co[\s-]*op|cooperative)\b/g,
      " ",
    )
    .replace(/\bengineering\b/g, "engineer")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasOverlappingTerms(first: Listing, second: Listing): boolean {
  return (
    first.terms.length === 0 ||
    second.terms.length === 0 ||
    first.terms.some((term) => second.terms.includes(term))
  );
}

function hasEmployerListingMatch(candidate: Listing, otherListings: readonly Listing[]): boolean {
  const company = normalizedCompany(candidate.company);
  const title = normalizedTitle(candidate.title);
  if (!company || !title) return false;
  return otherListings.some((other) => {
    let hostname: string;
    try {
      hostname = new URL(other.url).hostname.toLowerCase();
    } catch {
      return false;
    }
    return (
      hostname !== "jobright.ai" &&
      !hostname.endsWith(".jobright.ai") &&
      normalizedCompany(other.company) === company &&
      normalizedTitle(other.title) === title &&
      hasOverlappingTerms(candidate, other)
    );
  });
}

export function filterInternListDuplicates(
  internListListings: readonly Listing[],
  employerListings: readonly Listing[],
): Listing[] {
  return internListListings.filter(
    (listing) => !hasEmployerListingMatch(listing, employerListings),
  );
}
