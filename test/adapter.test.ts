import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureSanitizedHtml,
  createWaterlooWorksAdapter,
  maxFixtureHtmlLength,
} from "@/lib/waterlooworks/adapter";
import { mountFixture } from "./fixtures/waterlooworks/load";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("createWaterlooWorksAdapter", () => {
  it.each([true, false])("preserves My Program=%s when fetching results", async (myProgram) => {
    mountFixture("results-real-page-1");
    if (!myProgram) {
      const icon = document.querySelector(".js--data-grid-toggle-quick-filter .button--toggle-on");
      expect(icon).not.toBeNull();
      icon?.classList.replace("button--toggle-on", "button--toggle-off");
      if (icon) icon.textContent = "toggle_off";
    }
    const script = document.createElement("script");
    script.textContent = `
      const viewer = { dataParams: { action: 'table-token', isDataViewer: true } };
      function getPostingOverview() { return { action: 'body-token' }; }
      function getPostingData() { return { action: 'summary-token' }; }
    `;
    document.body.append(script);
    vi.stubGlobal("location", { pathname: "/myAccount/co-op/full/jobs.htm" });
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const form = new URLSearchParams(String(init.body));
      return new Response(
        JSON.stringify({
          totalResults: myProgram ? 500 : 1770,
          page: Number(form.get("page")),
          data: [],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchImpl);
    const adapter = createWaterlooWorksAdapter();

    for (const page of [1, 2]) {
      await expect(adapter.fetchResults(page, 100)).resolves.toMatchObject({
        available: true,
        totalResults: myProgram ? 500 : 1770,
        page,
      });
      const form = new URLSearchParams(String(fetchImpl.mock.calls.at(-1)?.[1].body));
      expect(form.get("page")).toBe(String(page));
      expect(JSON.parse(form.get("filters") ?? "null")).toEqual(
        myProgram ? { studentPerspective: { type: "boolean", value: true } } : {},
      );
    }
  });

  it("answers the read-only messages from the results page", async () => {
    mountFixture("results-page-1");
    const adapter = createWaterlooWorksAdapter();

    await expect(adapter.getPageKind()).resolves.toMatchObject({ kind: "results" });
    const results = await adapter.scrapeResultsPage();
    expect(results.stubs).toHaveLength(4);
    expect(results.pageNumber).toBe(1);
  });

  it("scrapes the open posting and reports its id", async () => {
    mountFixture("posting-full");
    const adapter = createWaterlooWorksAdapter();

    await expect(adapter.getCurrentJobId()).resolves.toEqual({ jobId: "384922" });
    const { job } = await adapter.scrapeCurrentJob();
    expect(job.title).toBe("Software Engineer Intern");
  });

  it("reads the apply state and never fills an answer", async () => {
    mountFixture("apply-with-packages");
    const adapter = createWaterlooWorksAdapter();

    const { applyState } = await adapter.getApplyState();
    expect(applyState.questions).toHaveLength(2);
    const { questions } = await adapter.getPrescreenQuestions();
    expect(questions.map((question) => question.id)).toEqual(
      applyState.questions.map((question) => question.id),
    );
  });

  it("captures the current page as a sanitized fixture", async () => {
    mountFixture("posting-full");
    const adapter = createWaterlooWorksAdapter();

    const capture = await adapter.captureHtml();
    expect(capture.kind).toBe("posting");
    expect(capture.jobId).toBe("384922");
    expect(capture.url).toBe(location.href);
    expect(capture.html.length).toBeGreaterThan(0);
    expect(capture.html).not.toContain("<script");
    expect(capture.html.length).toBeLessThanOrEqual(maxFixtureHtmlLength + 1);
  });

  it("highlights a known selector key and ignores an unknown one", async () => {
    mountFixture("results-page-1");
    const adapter = createWaterlooWorksAdapter();

    await expect(adapter.highlight("nonsenseKey", "nope")).resolves.toEqual({
      highlighted: false,
    });
    await expect(adapter.highlight("resultsTable", "Results", 10)).resolves.toEqual({
      highlighted: true,
    });
  });
});

describe("captureSanitizedHtml", () => {
  it("strips scripts, input values, emails and phone numbers", () => {
    document.body.innerHTML = `
      <main>
        <script>window.token = "secret";</script>
        <p>Contact ben.zhou@uwaterloo.ca or +1 (519) 555-0134 for details.</p>
        <input type="text" name="student" value="Ben Zhou">
        <textarea name="notes">personal note</textarea>
      </main>`;

    const html = captureSanitizedHtml() ?? "";
    expect(html).not.toContain("secret");
    expect(html).not.toContain("ben.zhou@uwaterloo.ca");
    expect(html).not.toContain("555-0134");
    expect(html).not.toContain("Ben Zhou");
    expect(html).not.toContain("personal note");
    expect(html).toContain("[email]");
    expect(html.length).toBeLessThanOrEqual(50_001);
  });

  it("masks the signed-in student's name wherever it appears", () => {
    document.body.innerHTML = `
      <header><span id="userNameDisplay">Ben Zhou</span></header>
      <main><p>Application for Ben Zhou is in progress.</p></main>`;

    const html = captureSanitizedHtml() ?? "";
    expect(html).not.toContain("Ben Zhou");
    expect(html).toContain("[user]");
  });

  it("honours a larger cap for fixtures", () => {
    document.body.innerHTML = `<main><p>${"x".repeat(200)}</p></main>`;
    expect((captureSanitizedHtml(80) ?? "").length).toBeLessThanOrEqual(81);
    expect((captureSanitizedHtml(maxFixtureHtmlLength) ?? "").length).toBeGreaterThan(200);
  });
});
