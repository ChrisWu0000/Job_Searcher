import { describe, expect, it } from "vitest";
import { scrapeSource } from "@/lib/listings/collect";
import { isInternshipTitle } from "@/lib/ranking/terms";
import { companyCareerSites, discoverCareerPage } from "@/lib/sources/companyCareers";

describe("company career pages", () => {
  it("loads the career links from the company list", () => {
    expect(companyCareerSites).toHaveLength(125);
    expect(new Set(companyCareerSites.map((site) => site.url)).size).toBe(125);
    expect(
      companyCareerSites.every((site) => site.company && site.url.startsWith("https://")),
    ).toBe(true);
  });

  it("extracts only intern or co-op roles and discovers linked ATS boards", () => {
    const discovery = discoverCareerPage(
      { company: "Acme", url: "https://careers.acme.example/jobs" },
      `<script type="application/ld+json">
        {"@context":"https://schema.org","@type":"JobPosting","title":"Software Engineer Intern",
        "url":"/jobs/intern-1","datePosted":"2026-10-01","hiringOrganization":{"name":"Acme"},
        "jobLocation":{"address":{"addressLocality":"Toronto","addressRegion":"ON"}},
        "description":"<p>Build reliable systems.</p>"}
      </script>
      <script type="application/ld+json">
        {"@type":"JobPosting","title":"Software Engineer","url":"/jobs/full-time"}
      </script>
      <a href="https://jobs.lever.co/acme/coop">Embedded Systems Co-op</a>
      <a href="https://jobs.lever.co/acme/fulltime">Software Engineer</a>`,
      "2026-10-13T00:00:00.000Z",
    );

    expect(discovery.jobs).toMatchObject([
      {
        company: "Acme",
        title: "Software Engineer Intern",
        url: "https://careers.acme.example/jobs/intern-1",
        location: "Toronto, ON",
        summary: "Build reliable systems.",
        postedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        company: "Acme",
        title: "Embedded Systems Co-op",
        url: "https://jobs.lever.co/acme/coop",
      },
    ]);
    expect(discovery.jobs.every((job) => isInternshipTitle(job.title))).toBe(true);
    expect(discovery.boards.map((board) => board.id)).toEqual(["lever:acme"]);
  });

  it("discovers a Workday board from a company career-site root", () => {
    const discovery = discoverCareerPage(
      {
        company: "Acme",
        url: "https://acme.wd5.myworkdayjobs.com/en-US/External",
      },
      "",
    );

    expect(discovery.boards).toMatchObject([
      {
        provider: "workday",
        label: "acme/External",
        endpoint: "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs",
      },
    ]);
  });

  it("scrapes every configured career page and linked public boards", async () => {
    const site = companyCareerSites[0];
    if (!site) throw new Error("expected a company career site");
    const siteUrls = new Set(companyCareerSites.map((careerSite) => careerSite.url));
    const visitedSites = new Set<string>();
    const fetchImpl = async (url: string): Promise<Response> => {
      if (siteUrls.has(url)) {
        visitedSites.add(url);
        return new Response(
          url === site.url
            ? `<script type="application/ld+json">
                {"@type":"JobPosting","title":"Software Engineering Intern Summer 2027",
                "url":"/jobs/intern","description":"Build software.","hiringOrganization":{"name":"Acme"}}
              </script>
              <a href="https://jobs.lever.co/acme">Careers</a>`
            : "",
        );
      }
      if (/api\.lever\.co/.test(url)) return new Response("[]");
      return new Response(
        JSON.stringify({
          jobs: [],
          jobPostings: [],
          postings: [],
          job_posts: [],
          content: [],
          totalFound: 0,
        }),
      );
    };

    const result = await scrapeSource("company-careers", fetchImpl, 16);

    expect(visitedSites.size).toBe(companyCareerSites.length);
    expect(result.listings).toMatchObject([
      {
        company: "Acme",
        title: "Software Engineering Intern Summer 2027",
        terms: ["summer-2027"],
      },
    ]);
  });
});
