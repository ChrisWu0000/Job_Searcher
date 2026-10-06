import { describe, expect, it } from "vitest";
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
});
