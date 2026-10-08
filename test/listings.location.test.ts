import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/listings/collect";
import { renderCsv, renderListings } from "@/lib/listings/render";

const listing = (id: string, location: string): Listing => ({
  id,
  company: `Company ${id}`,
  title: "Software Engineer Intern",
  location,
  url: `https://example.com/${id}`,
  categories: ["software-engineering"],
  terms: ["summer-2027"],
  postedAt: "2026-10-07T00:00:00.000Z",
});

const render = (listings: Listing[]) => {
  const updated = new Date("2026-10-07T00:00:00.000Z");
  return {
    markdown: renderListings(listings, [], updated).markdown,
    csv: renderCsv(listings),
  };
};

describe("listing location filter", () => {
  it("keeps Canadian, U.S., EU-member, U.K., and all remote listings", () => {
    const listings = [
      listing("canada", "Toronto, ON"),
      listing("canada-code", "Toronto, CAN"),
      listing("us", "San Jose, CA"),
      listing("eu", "Berlin, Germany"),
      listing("eu-code", "Amsterdam, NL"),
      listing("uk", "London, UK"),
      listing("uk-code", "Cambridge, GB"),
      listing("remote", "Remote - worldwide"),
    ];
    const output = render(listings);

    for (const { url } of listings) {
      expect(output.markdown).toContain(url);
      expect(output.csv).toContain(url);
    }
  });

  it("excludes physical locations outside Canada, the U.S., the EU, and the U.K.", () => {
    const listings = [
      listing("japan", "Tokyo, Japan"),
      listing("switzerland", "Zurich, Switzerland"),
      listing("norway", "Oslo, Norway"),
    ];
    const output = render(listings);

    for (const { url } of listings) {
      expect(output.markdown).not.toContain(url);
      expect(output.csv).not.toContain(url);
    }
  });

  it("shows only in-scope places on multi-location listings", () => {
    const mixed = listing(
      "mixed",
      "Toronto, ON; London, UK; Berlin, Germany; Singapore; Sydney, Australia",
    );
    const output = render([mixed]);

    expect(output.markdown).toContain("Toronto, ON, London, UK, Berlin, Germany");
    expect(output.csv).toContain('"Toronto, ON; London, UK; Berlin, Germany"');
    expect(output.markdown).not.toContain("Singapore");
    expect(output.csv).not.toContain("Singapore");
    expect(output.markdown).not.toContain("Sydney");
    expect(output.csv).not.toContain("Sydney");
  });
});
