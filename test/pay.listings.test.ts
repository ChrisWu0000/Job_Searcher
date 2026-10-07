import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/listings/collect";
import { enrichListingDetails, scrapeSource } from "@/lib/listings/collect";
import { payFromHtml, payFromText, textFromHtml } from "@/lib/listings/pay";

describe("payFromText", () => {
  it("finds hourly pay", () => {
    expect(payFromText("The pay is $45/hour for this role.")).toBeTruthy();
  });

  it("finds salary ranges near pay wording", () => {
    expect(payFromText("Salary range: $120,000 - $150,000 plus equity")).toBe(
      "$120,000 - $150,000",
    );
    expect(payFromText("Compensation $95k to $120k")).toBe("$95k to $120k");
  });

  it("ignores unrelated dollar ranges and nothing", () => {
    expect(payFromText("We raised $5 - $10 million")).toBeUndefined();
    expect(payFromText("Great team and benefits")).toBeUndefined();
  });
});

describe("payFromHtml", () => {
  it("reads JSON-LD base salary", () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","baseSalary":{"currency":"USD","value":{"minValue":40,"maxValue":55,"unitText":"HOUR"}}}</script>`;
    expect(payFromHtml(html)).toBe("USD 40-55/hour");
  });

  it("strips markup before matching", () => {
    expect(payFromHtml("<p>Pay range: <b>$30</b> - <b>$40</b> per hour</p>")).toContain("$30");
  });

  it("finds salary text embedded in page scripts", () => {
    expect(payFromHtml("<script>Salary range: $80,000 - $95,000</script>")).toBe(
      "$80,000 - $95,000",
    );
  });

  it("extracts visible and embedded job-description text from HTML", () => {
    const text = textFromHtml(
      "<p>U.S. <strong>citizenship is required</strong>.</p><script>Does not offer sponsorship.</script>",
    );
    expect(text).toContain("U.S. citizenship is required");
    expect(text).toContain("Does not offer sponsorship");
  });
});

describe("enrichListingDetails", () => {
  it("reads the full page for older Workday postings", async () => {
    const listing: Listing = {
      id: "workday-intern",
      company: "Example",
      title: "Engineer Intern",
      location: "Remote",
      url: "https://example.wd5.myworkdayjobs.com/Site/job/Remote/Intern",
      categories: ["software-engineering"],
      terms: ["summer-2027"],
      postedAt: "2025-01-01T00:00:00.000Z",
    };
    const html = `${"x".repeat(1_500_100)}<script>Salary range: $80,000 - $95,000</script>`;
    const fetchImpl = async (_url: string, _init: RequestInit): Promise<Response> =>
      new Response(html);

    const failures = await enrichListingDetails(
      [listing],
      fetchImpl,
      new Set(),
      1,
      new Date("2026-10-06T00:00:00.000Z"),
    );

    expect(listing.pay).toBe("$80,000 - $95,000");
    expect(failures).toEqual([]);
  });

  it("fetches missing descriptions for eligibility even when pay is already known", async () => {
    const listing: Listing = {
      id: "feed-intern",
      company: "Example",
      title: "Engineer Intern",
      location: "Remote",
      url: "https://example.com/intern",
      categories: ["software-engineering"],
      terms: ["summer-2027"],
      pay: "$30/hour",
      postedAt: "2025-01-01T00:00:00.000Z",
    };
    let requests = 0;
    const fetchImpl = async (_url: string, _init: RequestInit): Promise<Response> => {
      requests++;
      return new Response(
        "<p>U.S. citizenship is required.</p><script>Does not offer sponsorship.</script>",
      );
    };

    const failures = await enrichListingDetails(
      [listing],
      fetchImpl,
      new Set([listing.url]),
      1,
      new Date("2026-10-06T00:00:00.000Z"),
    );

    expect(requests).toBe(1);
    expect(listing.requiresUSCitizenship).toBe(true);
    expect(listing.noSponsorship).toBe(true);
    expect(failures).toEqual([]);
  });

  it("scrapes missing feed descriptions and classifies their eligibility statements", async () => {
    const visited: string[] = [];
    const fetchImpl = async (url: string, _init: RequestInit): Promise<Response> => {
      visited.push(url);
      if (url.includes("raw.githubusercontent.com/SimplifyJobs/")) {
        return new Response(
          JSON.stringify([
            {
              title: "Software Engineer Intern Summer 2027",
              company_name: "Example",
              url: "https://careers.example.com/intern",
              location: "Remote",
              summary: "U.S. citizenship is required.",
            },
          ]),
        );
      }
      return new Response("<p>Must be a U.S. citizen.</p><p>We do not offer visa sponsorship.</p>");
    };

    const result = await scrapeSource("simplify", fetchImpl);

    expect(visited).toContain("https://careers.example.com/intern");
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]).toMatchObject({
      requiresUSCitizenship: true,
      noSponsorship: true,
    });
    expect(result.failures).toEqual([]);
  });

  it("reports blocked job-description fetches instead of silently missing indicators", async () => {
    const listing: Listing = {
      id: "blocked-intern",
      company: "Example",
      title: "Engineer Intern",
      location: "Remote",
      url: "https://example.com/intern",
      categories: ["software-engineering"],
      terms: ["summer-2027"],
    };
    const fetchImpl = async (_url: string, _init: RequestInit): Promise<Response> =>
      new Response("Forbidden", { status: 403 });

    const failures = await enrichListingDetails([listing], fetchImpl, new Set([listing.url]), 1);

    expect(failures).toEqual([
      "eligibility page HTTP 403 for 1 listing (e.g. Example: Engineer Intern)",
    ]);
  });
});
