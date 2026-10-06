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
});
