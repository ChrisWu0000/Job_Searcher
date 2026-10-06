import { describe, expect, it } from "vitest";
import {
  discoverPublicBoards,
  fetchPublicBoardJobs,
  normalizeBoardJob,
  publicBoardFromJobUrl,
} from "@/lib/sources/boards";
import type { Job } from "@/types/job";

function makeJob(url: string): Job {
  return {
    id: url,
    company: "Acme",
    title: "Software Engineer",
    location: "Remote",
    source: "test",
    url,
    scrapedAt: "2026-10-06T00:00:00.000Z",
    rawText: "",
    application: {
      resume: false,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    status: "new",
  };
}

describe("public ATS board discovery", () => {
  it.each([
    [
      "https://jobs.ashbyhq.com/acme/123",
      "ashby",
      "https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true",
    ],
    [
      "https://job-boards.greenhouse.io/acme/jobs/123",
      "greenhouse",
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
    ],
    ["https://jobs.eu.lever.co/acme/123", "lever", "https://api.eu.lever.co/v0/postings/acme"],
    [
      "https://jobs.smartrecruiters.com/acme/123",
      "smartrecruiters",
      "https://api.smartrecruiters.com/v1/companies/acme/postings",
    ],
    [
      "https://apply.workable.com/acme/j/123",
      "workable",
      "https://apply.workable.com/api/v1/widget/accounts/acme?details=true",
    ],
    [
      "https://acme.pinpointhq.com/jobs/123",
      "pinpoint",
      "https://acme.pinpointhq.com/postings.json",
    ],
    [
      "https://jobs.gem.com/acme/job/123",
      "gem",
      "https://api.gem.com/job_board/v0/acme/job_posts/",
    ],
    [
      "https://acme.wd5.myworkdayjobs.com/en-US/Acme/job/Remote/123",
      "workday",
      "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Acme/jobs",
    ],
  ] as const)("discovers %s", (url, provider, endpoint) => {
    expect(publicBoardFromJobUrl(url)).toMatchObject({ provider, endpoint });
  });

  it("deduplicates board identifiers and ignores unsupported or insecure URLs", () => {
    const boards = discoverPublicBoards([
      makeJob("https://jobs.lever.co/acme/one"),
      makeJob("https://jobs.lever.co/acme/two"),
      makeJob("https://careers.example.com/jobs/three"),
      makeJob("http://jobs.lever.co/insecure/one"),
    ]);
    expect(boards.map((entry) => entry.id)).toEqual(["lever:acme"]);
  });

  it("normalizes provider jobs with descriptions and compensation", async () => {
    const board = publicBoardFromJobUrl("https://jobs.ashbyhq.com/acme/123");
    if (!board) throw new Error("expected Ashby board");
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: "one",
              title: "Cyber Security Engineer",
              location: "Remote",
              descriptionHtml: "<p>Protect customer systems.</p>",
              compensationTierSummary: "$100,000 a year",
              jobUrl: "https://jobs.ashbyhq.com/acme/one",
            },
          ],
        }),
        { status: 200 },
      );
    const jobs = await fetchPublicBoardJobs(board, fetchImpl);
    expect(jobs).toMatchObject([
      {
        title: "Cyber Security Engineer",
        location: "Remote",
        url: "https://jobs.ashbyhq.com/acme/one",
        summary: "Protect customer systems.",
        compensation: "$100,000 a year",
      },
    ]);
  });

  it("normalizes Workday external paths against the tenant origin", () => {
    const board = publicBoardFromJobUrl(
      "https://acme.wd5.myworkdayjobs.com/en-US/Acme/job/Toronto/Role_123",
    );
    if (!board) throw new Error("expected Workday board");
    expect(
      normalizeBoardJob(board, {
        title: "Hardware Engineer",
        externalPath: "/en-US/Acme/job/Toronto/Role_456",
        locationsText: "Toronto, ON",
      }),
    ).toMatchObject({
      title: "Hardware Engineer",
      location: "Toronto, ON",
      url: "https://acme.wd5.myworkdayjobs.com/en-US/Acme/job/Toronto/Role_456",
    });
  });
});
