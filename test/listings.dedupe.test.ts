import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/listings/collect";
import { filterInternListDuplicates } from "@/lib/listings/dedupe";

function listing(
  company: string,
  title: string,
  url: string,
  terms: Listing["terms"] = ["summer-2027"],
): Listing {
  return {
    id: url,
    company,
    title,
    location: "Remote",
    url,
    categories: ["software-engineering"],
    terms,
  };
}

describe("intern-list duplicate filtering", () => {
  it("removes a matching company and title when an employer listing exists", () => {
    const internList = listing(
      "Acme Corporation",
      "2027 Summer Software Engineering Intern",
      "https://jobright.ai/jobs/info/1",
    );
    const employer = listing(
      "Acme, Inc.",
      "Software Engineer Internship",
      "https://jobs.acme.com/role/1",
    );

    expect(filterInternListDuplicates([internList], [employer])).toEqual([]);
  });

  it("keeps listings when the company, role, or term differs", () => {
    const candidate = listing("Acme", "Software Engineer Intern", "https://jobright.ai/jobs/1");
    const otherListings = [
      listing("Other Co.", candidate.title, "https://jobs.other.com/1"),
      listing("Acme", "Data Scientist Intern", "https://jobs.acme.com/2"),
      listing("Acme", candidate.title, "https://jobs.acme.com/3", ["winter-2027"]),
    ];

    expect(filterInternListDuplicates([candidate], otherListings)).toEqual([candidate]);
  });

  it("does not treat another jobright page as an employer listing", () => {
    const candidate = listing("Acme", "Software Engineer Intern", "https://jobright.ai/jobs/1");
    const otherJobrightListing = listing("Acme", candidate.title, "https://jobright.ai/jobs/2");

    expect(filterInternListDuplicates([candidate], [otherJobrightListing])).toEqual([candidate]);
  });
});
