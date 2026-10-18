import { describe, expect, it } from "vitest";
import {
  fetchInternListJobs,
  internListFeed,
  internListTerms,
  parseInternListRows,
} from "@/lib/sources/internList";
import { feedEntries } from "@/lib/sources/publicFeeds";

const payload = {
  data: {
    table: {
      columns: [
        { id: "a", name: "Position Title" },
        { id: "b", name: "Apply" },
        { id: "c", name: "Company" },
        { id: "d", name: "Location" },
        { id: "e", name: "Salary" },
        { id: "f", name: "Date" },
        { id: "g", name: "Hire Time" },
        { id: "h", name: "Qualifications" },
      ],
      rows: [
        {
          cellValuesByColumnId: {
            a: "Software Engineer Intern",
            b: {
              label: "Apply",
              url: "https://jobright.ai/jobs/info/1?utm_source=1099&utm_campaign=x",
            },
            c: "Acme",
            d: "New York, NY, United States",
            e: "$26-$35 /hr",
            f: "2026-10-07",
            g: "2027-Summer",
            h: "Pursuing a degree in Computer Science",
          },
        },
        {
          cellValuesByColumnId: {
            a: "Software Engineer Intern",
            b: { label: "Apply", url: "https://jobright.ai/jobs/info/2" },
            c: "Beta",
            d: "Austin, TX, United States",
            e: "N/A",
            f: "2026-10-06",
            g: "2027-Spring",
          },
        },
        {
          cellValuesByColumnId: {
            a: "Software Engineer Intern",
            b: { label: "Apply", url: "https://jobs.lever.co/gamma/3" },
            c: "Gamma",
            d: "Seattle, WA, United States",
            e: "$30-$40 /hr",
            f: "2026-10-08",
            g: "2027-Summer",
          },
        },
      ],
    },
  },
};

describe("intern-list source", () => {
  it("converts hire times into term labels", () => {
    expect(internListTerms("2027-Summer")).toEqual(["Summer 2027"]);
    expect(internListTerms("2027-January / 2027-June")).toEqual(["January 2027", "June 2027"]);
    expect(internListTerms("2027")).toEqual([]);
  });

  it("maps shared view rows to feed entries with pay, date and terms", () => {
    const { jobs } = feedEntries(payload, internListFeed);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: "Gamma",
      url: "https://jobs.lever.co/gamma/3",
      compensation: "$30-$40 /hr",
      terms: ["Summer 2027"],
    });
    expect(jobs[0]?.postedAt).toContain("2026-10-08");
  });

  it("rejects an unexpected response shape", () => {
    expect(() => parseInternListRows({})).toThrow("unexpected intern-list response");
  });

  it("loads the embedded view and then its data request", async () => {
    const urls: string[] = [];
    const jobs = await fetchInternListJobs(async (url) => {
      urls.push(url);
      if (url.includes("/embed/")) {
        return new Response(
          'x "x-airtable-page-load-id":"pgl1" urlWithParams: "\\u002Fv0.3\\u002Fview\\u002Fviw1\\u002FreadSharedViewData?a=1",',
        );
      }
      return Response.json(payload);
    });
    expect(urls[1]).toBe("https://airtable.com/v0.3/view/viw1/readSharedViewData?a=1");
    expect(jobs).toHaveLength(1);
  });
});
