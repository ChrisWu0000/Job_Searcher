import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/listings/collect";
import { renderCsv, renderListings } from "@/lib/listings/render";

const internship: Listing = {
  id: "intern",
  company: "Example",
  title: "Software Engineer Intern",
  location: "Remote",
  url: "https://example.com/intern",
  categories: ["software-engineering"],
  terms: ["summer-2027"],
  postedAt: "2026-10-01T00:00:00.000Z",
};

const fullTime: Listing = {
  ...internship,
  id: "full-time",
  title: "Software Engineer",
  url: "https://example.com/full-time",
};

describe("internship listing output", () => {
  it.each(["2027 Summer Software Engineer Intern", "Summer Software Engineer Intern"])(
    "moves cached winter assignments for %s to summer in README and CSV",
    (title) => {
      for (const terms of [["winter-2027"], ["winter-2027", "summer-2027"]] as const) {
        const listing: Listing = { ...internship, title, terms: [...terms] };
        const { markdown, counts } = renderListings(
          [listing],
          [],
          new Date("2026-10-06T00:00:00.000Z"),
        );
        const winterSection = markdown.split("## Winter 2027\n")[1]?.split("## Summer 2027\n")[0];
        const summerSection = markdown.split("## Summer 2027\n")[1];

        expect(winterSection).not.toContain(listing.url);
        expect(summerSection).toContain(listing.url);
        expect(counts.byTerm["winter-2027"]).toBe(0);
        expect(counts.byTerm["summer-2027"]).toBe(1);
        expect(renderCsv([listing]).trim().split("\n")).toHaveLength(2);
        expect(renderCsv([listing])).toContain("Summer 2027,");
        expect(renderCsv([listing])).not.toContain("Winter 2027,");
      }
    },
  );

  it("excludes cached full-time listings from the README and CSV", () => {
    const { markdown, counts } = renderListings(
      [internship, fullTime],
      [],
      new Date("2026-10-06T00:00:00.000Z"),
    );
    const csv = renderCsv([internship, fullTime]);

    expect(markdown).toContain("https://example.com/intern");
    expect(markdown).not.toContain("https://example.com/full-time");
    expect(counts.byTerm["summer-2027"]).toBe(1);
    expect(csv).toContain("https://example.com/intern");
    expect(csv).not.toContain("https://example.com/full-time");
  });

  it("includes only postings from the last seven days in the README", () => {
    const recent = { ...internship, postedAt: "2026-10-01T00:00:00.000Z" };
    const old = {
      ...internship,
      id: "old",
      url: "https://example.com/old",
      postedAt: "2026-09-28T00:00:00.000Z",
    };
    const { markdown } = renderListings([recent, old], [], new Date("2026-10-06T00:00:00.000Z"));

    expect(markdown).toContain("https://example.com/intern");
    expect(markdown).not.toContain("https://example.com/old");
    expect(markdown).toContain("last 7 days");
  });
});
