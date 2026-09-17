import { describe, expect, it } from "vitest";
import {
  extractDirectTokens,
  fetchPostingBundle,
  fetchResultsPage,
  normalizeIsoOffset,
  parsePostingBundle,
  parseResultsPayload,
} from "@/lib/waterlooworks/direct";
import { fixtureHtml, parseFixture } from "./fixtures/waterlooworks/load";

const scriptSample = `
  const dataViewerProps = { ...{ idColKey: "", displayMode: "docViewer", data: "",
    dataParams: { action: '_-_-table-token', isDataViewer: true }, lang: "en" } };
  function getPostingPreScreening(postingId, callback) {
    orbisApp.showLoadingOverlay();
    $.post("/myAccount/co-op/full/jobs.htm", { action: '_-_-pre-token', postingId }, (data) => {});
  }
  function getPostingOverview(postingId, callback) {
    orbisApp.showLoadingOverlay();
    $.post("/myAccount/co-op/full/jobs.htm", { action: '_-_-overview-token', postingId }, (data) => {});
  }
  function getPostingData(postingId, callback) {
    orbisApp.showLoadingOverlay();
    $.post("/myAccount/co-op/full/jobs.htm", { action: '_-_-data-token', postingId }, (data) => {});
  }
`;

const tokens = {
  table: "_-_-table-token",
  body: "_-_-overview-token",
  summary: "_-_-data-token",
  preScreening: "_-_-pre-token",
};

const resultsPayload = {
  totalResults: 296,
  page: 1,
  data: [
    {
      id: "486053",
      data: [
        { key: "postingId", value: "486053" },
        { key: "Id", value: 486053 },
        {
          key: "JobTitle",
          value: {
            new: true,
            featured: false,
            applied: false,
            viewed: true,
            postingTitle: "Software Developer",
          },
        },
        { key: "Organization", value: "Bolt Technologies Inc" },
        { key: "Division", value: "Divisional Office" },
        { key: "Openings", value: 1 },
        { key: "City", value: "Toronto" },
        { key: "Level", value: "Intermediate, Senior" },
        { key: "ApplicationCount", value: 48 },
        { key: "Deadline", value: "Sep 17, 2026 9:00 AM" },
        { key: "deadline", value: "2026-09-17T09:00:00-0400" },
        { key: "canApply", value: true },
        { key: "hasApplication", value: false },
      ],
    },
    { id: "bad", data: [{ key: "Organization", value: "No id" }] },
  ],
};

const overviewPayload = {
  div: "Divisional Office",
  internalStatus: "Open for Applications",
  org: "Bolt Technologies Inc",
  hasPreScreening: true,
  id: 486053,
  position: "Software Developer",
  applicationData: { canApply: true, hasApplication: false, buttonLabel: "Apply" },
  status: "Approved",
  tags: ["NEW", "Deadline in 10 day(s)", "Viewed"],
};

function postingPanelsHtml(): string {
  const doc = parseFixture("posting-overlay");
  const panels = Array.from(doc.querySelectorAll(".panel")).map((panel) => panel.outerHTML);
  return panels.join("\n");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

describe("extractDirectTokens", () => {
  it("reads the table and posting action tokens from the inline scripts", () => {
    expect(extractDirectTokens(scriptSample)).toEqual(tokens);
  });

  it("returns nothing when a required token is missing", () => {
    expect(extractDirectTokens(scriptSample.replace("getPostingData", "somethingElse"))).toBe(
      undefined,
    );
    expect(extractDirectTokens("<p>not the job search page</p>")).toBe(undefined);
  });
});

describe("parseResultsPayload", () => {
  it("turns data viewer rows into result rows and drops rows without an id", () => {
    const page = parseResultsPayload(resultsPayload, "2026-09-07T03:00:00.000Z");
    expect(page.totalResults).toBe(296);
    expect(page.page).toBe(1);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      id: "486053",
      title: "Software Developer",
      company: "Bolt Technologies Inc",
      location: "Toronto",
      openings: 1,
      division: "Divisional Office",
      level: "Intermediate, Senior",
      applicationCount: 48,
      canApply: true,
      hasApplication: false,
      viewed: true,
      isNew: true,
      deadline: "2026-09-17T13:00:00.000Z",
    });
  });

  it("normalizes the offset WaterlooWorks uses on deadlines", () => {
    expect(normalizeIsoOffset("2026-09-17T09:00:00-0400")).toBe("2026-09-17T13:00:00.000Z");
    expect(normalizeIsoOffset("garbage")).toBe(undefined);
  });
});

describe("fetchResultsPage", () => {
  it("posts the data viewer form with the My Program filter and parses the answer", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(resultsPayload);
    };

    const page = await fetchResultsPage(tokens, { page: 2, itemsPerPage: 100 }, fetchImpl);

    expect(page.rows).toHaveLength(1);
    expect(calls[0]?.url).toBe("/myAccount/co-op/full/jobs.htm");
    const body = new URLSearchParams(String(calls[0]?.init.body));
    expect(body.get("action")).toBe("_-_-table-token");
    expect(body.get("isDataViewer")).toBe("true");
    expect(body.get("page")).toBe("2");
    expect(body.get("itemsPerPage")).toBe("100");
    expect(JSON.parse(body.get("filters") ?? "{}")).toEqual({
      studentPerspective: { type: "boolean", value: true },
    });
  });

  it("explains an expired session when the answer is a page instead of data", async () => {
    const fetchImpl = async () => htmlResponse("<!DOCTYPE html><html><body>login</body></html>");
    await expect(
      fetchResultsPage(tokens, { page: 1, itemsPerPage: 100 }, fetchImpl),
    ).rejects.toThrow(/session may have expired/);
  });
});

describe("fetchPostingBundle and parsePostingBundle", () => {
  it("fetches the posting body, overview and pre-screening, then parses everything", async () => {
    const seen: string[] = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      seen.push(body.get("action") ?? "");
      if (body.get("action") === tokens.body) return htmlResponse(postingPanelsHtml());
      if (body.get("action") === tokens.summary) return jsonResponse(overviewPayload);
      return htmlResponse("<div><label>Why do you want this job?</label></div>");
    };

    const bundle = await fetchPostingBundle(tokens, "486053", fetchImpl);
    expect(seen.sort()).toEqual([tokens.body, tokens.summary, tokens.preScreening].sort());

    const job = parsePostingBundle("486053", bundle);
    expect(job.id).toBe("486053");
    expect(job.title).toBe("Software Developer");
    expect(job.company).toBe("Bolt Technologies Inc");
    expect(job.city).toBe("Toronto");
    expect(job.country).toBe("Canada");
    expect(job.arrangement).toBe("hybrid");
    expect(job.durationMonths).toBe(8);
    expect(job.division).toBe("Divisional Office");
    expect(job.internalStatus).toBe("Open for Applications");
    expect(job.tags).toEqual(["NEW", "Deadline in 10 day(s)", "Viewed"]);
    expect(job.canApply).toBe(true);
    expect(job.hasApplication).toBe(false);
    expect(job.workTerm).toBe("2027 - Winter");
    expect(job.jobType).toBe("Co-op Main");
    expect(job.postalCode).toBe("M5V 3C3");
    expect(job.address).toBe("150 John Street, Unit 8");
    expect(job.applicationMethod).toBe("Through WaterlooWorks");
    expect(job.additionalArrangementInfo).toContain("minimum 2 days");
    expect(job.specialRequirements).toBe("None");
    expect(job.fields?.["Job Summary"]).toContain("ingestion pipeline");
    expect(Object.keys(job.fields ?? {})).toHaveLength(25);
    expect(job.application.hasPrescreenQuestions).toBe(true);
    expect(job.prescreenText).toContain("Why do you want this job?");
    expect(job.detailScrapedAt).toBeDefined();
  });

  it("skips the pre-screening request when the overview says there is none", async () => {
    const seen: string[] = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      seen.push(body.get("action") ?? "");
      if (body.get("action") === tokens.body) return htmlResponse(postingPanelsHtml());
      return jsonResponse({ ...overviewPayload, hasPreScreening: false });
    };

    const bundle = await fetchPostingBundle(tokens, "486053", fetchImpl);
    expect(seen).not.toContain(tokens.preScreening);
    expect(parsePostingBundle("486053", bundle).application.hasPrescreenQuestions).toBe(false);
  });

  it("rejects a full page in place of the posting body", async () => {
    const fetchImpl = async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      if (body.get("action") === tokens.body) return htmlResponse(fixtureHtml("login"));
      return jsonResponse(overviewPayload);
    };
    await expect(fetchPostingBundle(tokens, "486053", fetchImpl)).rejects.toThrow(
      /session may have expired/,
    );
  });

  it("rejects swapped responses instead of saving a blank posting", async () => {
    const swapped = async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      if (body.get("action") === tokens.body) return jsonResponse(overviewPayload);
      return htmlResponse(postingPanelsHtml());
    };
    await expect(fetchPostingBundle(tokens, "486053", swapped)).rejects.toThrow(
      /did not return the posting body/,
    );

    expect(() =>
      parsePostingBundle("486053", { html: "<div><p>nothing labelled</p></div>", summary: {} }),
    ).toThrow(/no labelled fields/);
  });
});
