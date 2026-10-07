import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/listings/collect";
import { displayCompanyName, preferredCompanyName } from "@/lib/listings/companyNames";
import { renderCsv, renderListings } from "@/lib/listings/render";

const listing: Listing = {
  id: "company-case",
  company: "acme robotics",
  title: "Software Engineer Intern",
  location: "Remote",
  url: "https://example.com/intern",
  categories: ["software-engineering"],
  terms: ["summer-2027"],
  postedAt: "2026-10-01T00:00:00.000Z",
};

describe("company name display", () => {
  it("capitalizes lowercase and all-uppercase company names", () => {
    expect(displayCompanyName("acme robotics")).toBe("Acme Robotics");
    expect(displayCompanyName("AMERICAN SYSTEMS")).toBe("American Systems");
    expect(displayCompanyName("3m")).toBe("3M");
    expect(displayCompanyName("nvidia")).toBe("NVIDIA");
  });

  it("keeps already formatted brand names", () => {
    expect(displayCompanyName("LinkedIn")).toBe("LinkedIn");
    expect(displayCompanyName("Anduril Industries")).toBe("Anduril Industries");
  });

  it("prefers a readable source company name over a board slug", () => {
    expect(preferredCompanyName("base-power", "Base Power Company")).toBe("Base Power Company");
  });

  it("uses display capitalization in both generated outputs", () => {
    const { markdown } = renderListings([listing], [], new Date("2026-10-06T00:00:00.000Z"));
    expect(markdown).toContain("| Acme Robotics |");
    expect(markdown).toContain(
      '<a href="https://example.com/intern" target="_blank" rel="noopener noreferrer">Apply</a>',
    );
    expect(renderCsv([listing])).toContain("Acme Robotics");
  });

  it("renders only the requested eligibility indicators beside the company", () => {
    const flaggedListing: Listing = {
      ...listing,
      requiresUSCitizenship: true,
      noSponsorship: true,
    };
    const { markdown } = renderListings([flaggedListing], [], new Date("2026-10-06T00:00:00.000Z"));
    const csv = renderCsv([flaggedListing]);

    expect(markdown).toContain("| Acme Robotics 🛂 🇺🇸 |");
    expect(markdown).toContain("- 🛂 Does not offer sponsorship");
    expect(markdown).toContain("- 🇺🇸 Requires U.S. citizenship");
    expect(csv).toContain("Acme Robotics 🛂 🇺🇸");
  });
});
