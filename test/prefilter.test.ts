import { describe, expect, it } from "vitest";
import {
  inferCurrencyFromCountry,
  parseHourlyPay,
  toHourly,
  unknownCurrency,
} from "@/lib/ranking/pay";
import { payConstraintIdForCurrency, payTextForJob, prefilterJob } from "@/lib/ranking/prefilter";
import { withCurrentVersion } from "@/lib/ranking/profile";
import type { Job } from "@/types/job";
import { defaultProfile, type Profile } from "@/types/preferences";

const profile: Profile = withCurrentVersion(defaultProfile);

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "1",
    company: "Acme",
    title: "Software Engineer Intern",
    location: "Toronto, ON",
    country: "Canada",
    application: {
      resume: true,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    rawText: "",
    scrapedAt: "2026-09-06T14:02:00.000Z",
    status: "new",
    ...overrides,
  };
}

describe("parseHourlyPay", () => {
  it("reads a plain hourly rate", () => {
    expect(parseHourlyPay("$30/hr")).toEqual({
      amount: 30,
      currency: unknownCurrency,
      basis: "hour",
      original: "$30/hr",
    });
  });

  it("takes the guaranteed bottom of a range", () => {
    const parsed = parseHourlyPay("Compensation: $30 - $45 per hour");
    expect(parsed?.amount).toBe(30);
    expect(parsed?.basis).toBe("hour");
  });

  it("reads a trailing currency code", () => {
    const parsed = parseHourlyPay("30.00 CAD/hour");
    expect(parsed).toMatchObject({ amount: 30, currency: "CAD", basis: "hour" });
  });

  it("reads a leading currency code with a symbol", () => {
    const parsed = parseHourlyPay("USD $8,000/month");
    expect(parsed?.currency).toBe("USD");
    expect(parsed?.basis).toBe("month");
    expect(parsed?.amount).toBeCloseTo(46.15, 2);
  });

  it("converts an annual salary at forty hours a week", () => {
    const parsed = parseHourlyPay("$85,000 per year");
    expect(parsed?.basis).toBe("year");
    expect(parsed?.amount).toBeCloseTo(40.86, 2);
  });

  it("converts a weekly rate", () => {
    expect(parseHourlyPay("C$2,000 per week")?.amount).toBe(50);
  });

  it("understands the canadian and american symbols and codes", () => {
    expect(parseHourlyPay("C$40/hour")?.currency).toBe("CAD");
    expect(parseHourlyPay("US$40/hour")?.currency).toBe("USD");
    expect(parseHourlyPay("40 CAD an hour")?.currency).toBe("CAD");
    expect(parseHourlyPay("USD 40 an hour")?.currency).toBe("USD");
  });

  it("reads a labelled rate with no currency", () => {
    expect(parseHourlyPay("hourly rate: 35")).toMatchObject({
      amount: 35,
      currency: unknownCurrency,
      basis: "hour",
    });
    expect(parseHourlyPay("Monthly salary of 7,000 USD")).toMatchObject({
      currency: "USD",
      basis: "month",
    });
  });

  it("ignores durations and other numbers that are not pay", () => {
    expect(parseHourlyPay("40 hours per week, 4 month term")).toBeUndefined();
    expect(parseHourlyPay("This is a 12 month position")).toBeUndefined();
    expect(parseHourlyPay("")).toBeUndefined();
    expect(parseHourlyPay("Compensation to be discussed")).toBeUndefined();
  });

  it("finds the pay inside a longer posting", () => {
    const parsed = parseHourlyPay(
      "Work term: 8 months, 40 hours per week.\nSalary: $52.50 CAD per hour plus benefits.",
    );
    expect(parsed).toMatchObject({ amount: 52.5, currency: "CAD", basis: "hour" });
  });
});

describe("toHourly and currency inference", () => {
  it("normalizes every basis", () => {
    expect(toHourly(30, "hour")).toBe(30);
    expect(toHourly(2080, "year")).toBe(1);
    expect(toHourly(400, "week")).toBe(10);
    expect(toHourly(1733.3333333333333, "month")).toBeCloseTo(10, 6);
  });

  it("maps countries to currencies", () => {
    expect(inferCurrencyFromCountry("Canada")).toBe("CAD");
    expect(inferCurrencyFromCountry("United States")).toBe("USD");
    expect(inferCurrencyFromCountry("USA")).toBe("USD");
    expect(inferCurrencyFromCountry("Germany")).toBeUndefined();
    expect(inferCurrencyFromCountry(undefined)).toBeUndefined();
    expect(inferCurrencyFromCountry("San Francisco, CA")).toBeUndefined();
  });
});

describe("payConstraintIdForCurrency", () => {
  it("maps currencies to the seeded constraint ids", () => {
    expect(payConstraintIdForCurrency("CAD", profile)).toBe("ca-pay");
    expect(payConstraintIdForCurrency("USD", profile)).toBe("us-pay");
  });

  it("still names a pay constraint when the profile dropped it", () => {
    const stripped: Profile = { ...profile, constraints: [] };
    expect(payConstraintIdForCurrency("CAD", stripped)).toBe("ca-pay");
    expect(payConstraintIdForCurrency("EUR", stripped)).toBe("eur-pay");
  });
});

describe("payTextForJob", () => {
  it("prefers the compensation field but keeps the raw text", () => {
    const text = payTextForJob(makeJob({ compensation: "$30/hr", rawText: "long posting" }));
    expect(text.startsWith("$30/hr")).toBe(true);
    expect(text).toContain("long posting");
  });
});

describe("prefilterJob", () => {
  it("excludes a canadian job below the CAD floor", () => {
    const result = prefilterJob(makeJob({ compensation: "$45.00 per hour" }), profile);
    expect(result.excluded).toBe(true);
    expect(result.hardViolations).toEqual(["ca-pay"]);
    expect(result.reason).toContain("below the CAD floor");
    expect(result.parsedHourlyPay).toMatchObject({ amount: 45, currency: "CAD", basis: "hour" });
  });

  it("keeps a canadian job at or above the floor", () => {
    const result = prefilterJob(makeJob({ compensation: "$60/hour" }), profile);
    expect(result.excluded).toBe(false);
    expect(result.hardViolations).toEqual([]);
    expect(result.parsedHourlyPay).toMatchObject({ amount: 60, currency: "CAD", basis: "hour" });
  });

  it("excludes a US job below the USD floor using the us-pay id", () => {
    const job = makeJob({
      country: "United States",
      location: "New York, NY",
      compensation: "USD $8,000/month",
    });
    const result = prefilterJob(job, profile);
    expect(result.excluded).toBe(true);
    expect(result.hardViolations).toEqual(["us-pay"]);
  });

  it("lets an explicit currency win over the country", () => {
    const job = makeJob({ country: "Canada", compensation: "US$55 per hour" });
    const result = prefilterJob(job, profile);
    expect(result.excluded).toBe(false);
    expect(result.parsedHourlyPay).toMatchObject({
      amount: 55,
      currency: "USD",
      basis: "hour",
      original: "US$55 per hour",
    });
  });

  it("rejects ambiguous currency even outside canada and the us", () => {
    const job = makeJob({
      country: "Germany",
      location: "Berlin",
      compensation: "$12 per hour",
    });
    expect(prefilterJob(job, profile).excluded).toBe(true);
  });

  it("sends unparseable pay to the model when unknownPay is llm", () => {
    const job = makeJob({ compensation: "Competitive", rawText: "No pay listed." });
    const result = prefilterJob(job, { ...profile, unknownPay: "llm" });
    expect(result.excluded).toBe(false);
    expect(result.parsedHourlyPay).toBeUndefined();
  });

  it("excludes unparseable pay when unknownPay is reject", () => {
    const rejecting: Profile = { ...profile, unknownPay: "reject" };
    const job = makeJob({ compensation: "Competitive", rawText: "No pay listed." });
    const result = prefilterJob(job, rejecting);
    expect(result.excluded).toBe(true);
    expect(result.hardViolations).toEqual(["ca-pay"]);
    expect(result.reason).toContain("Pay is vague");
  });

  it("rejects missing pay even when the location is unknown", () => {
    const rejecting: Profile = { ...profile, unknownPay: "reject" };
    const job = makeJob({ country: undefined, location: "Remote", compensation: undefined });
    expect(prefilterJob(job, rejecting).excluded).toBe(true);
  });

  it("rejects pay it cannot interpret instead of assuming it clears a floor", () => {
    const job = makeJob({ compensation: "€10 per hour", country: undefined, location: "Paris" });
    expect(prefilterJob(job, profile).excluded).toBe(true);
  });

  it.each([
    "Embedded Software Engineer",
    "Firmware Intern",
    "CAD Designer",
    "Mechanical Engineer",
    "Electrical Engineering Intern",
    "FPGA Developer",
  ])("accepts the requested hardware engineering category for %s", (title) => {
    expect(prefilterJob(makeJob({ title, compensation: "$100 CAD/hour" }), profile).excluded).toBe(
      false,
    );
  });

  it.each([
    "Marketing Intern",
    "Business Analyst",
    "IT Support",
    "QA Analyst",
    "Accounting Intern",
  ])("filters non-SWE role %s even with CS eligibility", (title) => {
    expect(
      prefilterJob(
        makeJob({
          title,
          targetedPrograms: ["Computer Science"],
          qualifications: "Python and SQL",
          compensation: "$100 CAD/hour",
        }),
        profile,
      ).excluded,
    ).toBe(true);
  });

  it.each([
    "Backend Developer",
    "Frontend Engineer",
    "Full Stack Developer",
    "ML Engineer",
    "Data Engineer",
    "Site Reliability Engineer",
    "Software Developer - CAD 70/hour",
  ])("keeps relevant %s roles", (title) => {
    expect(
      prefilterJob(
        makeJob({
          title,
          compensation: "$70 CAD/hour",
          summary: "Our customers manufacture hardware.",
          qualifications: "Computer or electrical engineering degree.",
        }),
        profile,
      ).excluded,
    ).toBe(false);
  });

  it("reads duties for generic titles and classifies hardware duties", () => {
    expect(
      prefilterJob(
        makeJob({
          title: "Technology Intern",
          responsibilities: "Build web applications and APIs.",
          compensation: "$60/hour",
        }),
        profile,
      ).excluded,
    ).toBe(false);
    expect(
      prefilterJob(
        makeJob({
          title: "Technology Intern",
          responsibilities: "Develop customer services.",
          compensation: "$60/hour",
        }),
        profile,
      ).excluded,
    ).toBe(true);
    expect(
      prefilterJob(
        makeJob({
          responsibilities: "Develop firmware for microcontrollers.",
          compensation: "$60/hour",
        }),
        profile,
      ).excluded,
    ).toBe(false);
  });

  it.each([
    "In accordance with university norms",
    "In accordance with university norms ($80 CAD/hour)",
    "Competitive pay based on experience",
    "TBD",
    "Up to $100 CAD/hour",
    "Maximum hourly rate: 100 CAD",
    "Housing: $12,000/month",
  ])("hides vague or non-salary pay: %s", (compensation) => {
    expect(
      prefilterJob(makeJob({ compensation, rawText: "University average: $80/hour" }), profile)
        .excluded,
    ).toBe(true);
  });

  it("processes long fields without truncating away the salary", () => {
    const compensation = `${"Benefits and company details. ".repeat(4000)} Base salary: CAD $60 - $80 per hour plus bonus.`;
    expect(prefilterJob(makeJob({ compensation }), profile)).toMatchObject({
      excluded: false,
      parsedHourlyPay: { amount: 60 },
    });
    expect(
      prefilterJob(
        makeJob({
          compensation: undefined,
          qualifications: `${"Qualifications. ".repeat(3000)} Pay: USD $50/hour`,
        }),
        profile,
      ).excluded,
    ).toBe(false);
  });

  it("does not waive pay floors for banks and rejects ranges below the minimum", () => {
    expect(
      prefilterJob(makeJob({ company: "RBC", compensation: "$30 - $80 CAD/hour" }), profile)
        .excluded,
    ).toBe(true);
    expect(
      prefilterJob(makeJob({ country: "United States", compensation: "$50 USD/hour" }), profile)
        .excluded,
    ).toBe(false);
  });

  it("uses the lowest tier and handles abbreviated annual and currency ranges", () => {
    expect(parseHourlyPay("CAD $60 - CAD $80 per hour")?.amount).toBe(60);
    expect(parseHourlyPay("USD 120-140k/year")?.amount).toBe(57.69);
    expect(parseHourlyPay("Hourly rate: 70 CAD; hourly rate: 40 CAD")?.amount).toBe(40);
    expect(parseHourlyPay("60/hr")?.amount).toBe(60);
    expect(parseHourlyPay("$124,799.99 CAD/year")?.amount).toBeLessThan(60);
  });
});
