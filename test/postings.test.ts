import { describe, expect, it } from "vitest";
import { scrapeSource, verifyJobPostings } from "@/lib/listings/collect";
import { checkPosting, htmlPosting, postingDetailRequest } from "@/lib/listings/postings";
import { normalizeBoardJob, publicBoardFromJobUrl } from "@/lib/sources/boards";
import type { Job } from "@/types/job";

const workdayUrl =
  "https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto-ON/Software-Co-op_R123";
const workdayApi =
  "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Careers/job/Toronto-ON/Software-Co-op_R123";

function workdayJob(title = "Software Engineering Co-op"): Job {
  const board = publicBoardFromJobUrl(workdayUrl);
  if (!board) throw new Error("expected Workday board");
  const job = normalizeBoardJob(board, {
    title,
    externalPath: "/job/Toronto-ON/Software-Co-op_R123",
    locationsText: "Toronto, ON",
  });
  if (!job) throw new Error("expected Workday job");
  return { ...job, url: workdayUrl, id: `url:${workdayUrl}` };
}

describe("postingDetailRequest", () => {
  it.each([
    [workdayUrl, "workday", workdayApi],
    [
      "https://job-boards.greenhouse.io/acme/jobs/4567",
      "greenhouse",
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/4567",
    ],
    [
      "https://boards.greenhouse.io/embed/job_app?for=acme&token=4567",
      "greenhouse",
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs/4567",
    ],
    [
      "https://jobs.lever.co/acme/7d1f/apply",
      "lever",
      "https://api.lever.co/v0/postings/acme/7d1f",
    ],
    [
      "https://jobs.smartrecruiters.com/Acme/744000012345-software-intern",
      "smartrecruiters",
      "https://api.smartrecruiters.com/v1/companies/Acme/postings/744000012345",
    ],
    ["https://careers.acme.example/jobs/1", "html", "https://careers.acme.example/jobs/1"],
  ] as const)("reads %s through the %s posting", (url, kind, detailUrl) => {
    expect(postingDetailRequest(url)).toEqual({ kind, url: detailUrl });
  });
});

describe("checkPosting", () => {
  it("reads the full Workday description from the job detail API", async () => {
    const requested: string[] = [];
    const check = await checkPosting(workdayUrl, async (url) => {
      requested.push(url);
      return new Response(
        JSON.stringify({
          jobPostingInfo: {
            title: "Software Engineering Co-op",
            jobDescription:
              "<p>About us</p><p><b>Term:</b> May - Aug 2027</p><ul><li>Pay: $30/hour</li></ul>",
            posted: true,
          },
        }),
      );
    });

    expect(requested).toEqual([workdayApi]);
    expect(check).toMatchObject({ status: "open" });
    expect(check.status === "open" && check.text).toContain("Term: May - Aug 2027");
  });

  it("treats missing postings as closed", async () => {
    const check = await checkPosting(workdayUrl, async () => new Response("", { status: 404 }));
    expect(check).toEqual({ status: "closed", reason: "HTTP 404" });
  });

  it("shares one request between duplicate URLs through the cache", async () => {
    let requests = 0;
    const cache = new Map();
    const fetchImpl = async () => {
      requests++;
      return new Response("<p>Summer 2027 internship</p>");
    };
    await Promise.all([
      checkPosting("https://example.com/a", fetchImpl, cache),
      checkPosting("https://example.com/a", fetchImpl, cache),
    ]);
    expect(requests).toBe(1);
  });
});

describe("htmlPosting", () => {
  it("prefers the structured job description over the rest of the page", () => {
    const check = htmlPosting(
      `<nav>Other roles: Fall 2027 Intern</nav>
      <script type="application/ld+json">{"@type":"JobPosting","title":"Intern",
      "description":"&lt;p&gt;Runs May &amp;ndash; August 2027&lt;/p&gt;"}</script>`,
      "https://example.com/jobs/1",
    );
    expect(check.status === "open" && check.text).toContain("Runs May – August 2027");
    expect(check.status === "open" && check.text).not.toContain("Fall 2027");
  });

  it("detects closed and expired postings", () => {
    expect(
      htmlPosting("<h1>This job is no longer available</h1>", "https://x.example/j/1"),
    ).toMatchObject({ status: "closed" });
    expect(
      htmlPosting(
        '<script type="application/ld+json">{"@type":"JobPosting","validThrough":"2026-01-01"}</script>',
        "https://x.example/j/1",
        {},
        new Date("2026-10-01T00:00:00.000Z"),
      ),
    ).toMatchObject({ status: "closed" });
    expect(
      htmlPosting(
        '<script>window.__appData = {"posting":null}</script>',
        "https://jobs.ashbyhq.com/acme/0000",
      ),
    ).toMatchObject({ status: "closed" });
    expect(
      htmlPosting("<p>Careers</p>", "https://careers.acme.example/jobs/123/intern", {
        redirected: true,
        url: "https://careers.acme.example/",
      }),
    ).toMatchObject({ status: "closed" });
  });

  it("keeps postings that redirect to a new address for the same job", () => {
    expect(
      htmlPosting(
        "<p>Software Engineer Intern</p>",
        "https://jobs.bytedance.com/en/position/7670354800621603125/detail",
        { redirected: true, url: "https://joinbytedance.com/search/7670354800621603125" },
      ),
    ).toMatchObject({ status: "open" });
  });
});

describe("verifyJobPostings", () => {
  it("re-classifies Workday co-ops from the dates in their full description", async () => {
    const job = workdayJob();
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          jobPostingInfo: {
            jobDescription: "<p>Work term: May - Aug 2027 (4 months)</p><p>$32/hour</p>",
          },
        }),
      );

    const result = await verifyJobPostings([job], fetchImpl, 1);

    expect(result.listings).toMatchObject([{ terms: ["summer-2027"], pay: "$32/hour" }]);
    expect(result.openedIds).toEqual(new Set([job.id]));
  });

  it("drops postings that no longer exist and keeps ones that cannot be opened", async () => {
    const gone = workdayJob();
    const blocked = {
      ...workdayJob("Firmware Engineering Intern"),
      id: "url:https://blocked.example/job",
      url: "https://blocked.example/job",
    };
    const fetchImpl = async (url: string) =>
      new Response("", { status: url.includes("blocked") ? 403 : 404 });

    const result = await verifyJobPostings([gone, blocked], fetchImpl, 1);

    expect(result.closed).toBe(1);
    expect(result.listings.map((listing) => listing.title)).toEqual([
      "Firmware Engineering Intern",
    ]);
    expect(result.failures).toEqual([
      "could not open posting (HTTP 403) for 1 listing (e.g. Acme: Firmware Engineering Intern)",
    ]);
  });

  it("opens feed postings instead of trusting the copied listing", async () => {
    const visited: string[] = [];
    const fetchImpl = async (url: string): Promise<Response> => {
      visited.push(url);
      if (url.includes("raw.githubusercontent.com/SimplifyJobs/")) {
        return new Response(
          JSON.stringify([
            {
              title: "Software Engineer Co-op",
              company_name: "Example",
              url: "https://careers.example.com/coop",
              location: "Toronto, ON",
              terms: ["Winter 2027"],
            },
            {
              title: "Software Engineer Intern",
              company_name: "Example",
              url: "https://careers.example.com/closed",
              location: "Toronto, ON",
              terms: ["Winter 2027"],
            },
          ]),
        );
      }
      if (url.endsWith("/closed")) return new Response("", { status: 404 });
      return new Response("<p>This co-op runs from May to August 2027.</p>");
    };

    const result = await scrapeSource("simplify", fetchImpl);

    expect(visited).toEqual(
      expect.arrayContaining([
        "https://careers.example.com/coop",
        "https://careers.example.com/closed",
      ]),
    );
    expect(result.closed).toBe(1);
    expect(result.listings).toMatchObject([
      { title: "Software Engineer Co-op", terms: ["summer-2027"] },
    ]);
  });
});
