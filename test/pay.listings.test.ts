import { describe, expect, it } from "vitest";
import type { Listing } from "@/lib/listings/collect";
import { enrichPay } from "@/lib/listings/collect";
import { payFromHtml, payFromText } from "@/lib/listings/pay";

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
});

describe("enrichPay", () => {
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

    const failures = await enrichPay([listing], fetchImpl, 1, new Date("2026-10-06T00:00:00.000Z"));

    expect(listing.pay).toBe("$80,000 - $95,000");
    expect(failures).toEqual([]);
  });
});
