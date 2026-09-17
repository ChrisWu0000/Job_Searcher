import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importCurrentPosting, noPostingOpenMessage } from "@/components/jobs/actions";
import type { SyncProgress } from "@/engines/contracts";
import { hasUsableDetails, SyncEngine } from "@/engines/SyncEngine";
import {
  loginRequiredMessage,
  resultsPageRequiredMessage,
  tabUnavailableMessage,
} from "@/engines/wwClient";
import { db, tableNames } from "@/lib/db/db";
import { clearRuns, getJob, listJobs, upsertJobStubs, upsertJobs } from "@/lib/db/repo";
import { sleep } from "@/lib/time";
import { createFakeWw, makeJob, makeStub } from "./helpers/fakeWw";

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(tableNames.map((name) => db.table(name).clear()));
});

function collectProgress(engine: SyncEngine): SyncProgress[] {
  const seen: SyncProgress[] = [];
  engine.onProgress((progress) => seen.push(progress));
  return seen;
}

describe("SyncEngine", () => {
  it("paginates results, skips scraped postings, and isolates a failing posting", async () => {
    await upsertJobs([
      makeJob("2", { detailScrapedAt: "2026-09-01T00:00:00.000Z", rawText: "already scraped" }),
    ]);
    const fake = createFakeWw({
      resultPages: [[makeStub("1"), makeStub("2")], [makeStub("3")]],
      jobs: [makeJob("1"), makeJob("3")],
      failScrapeJobIds: ["3"],
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });
    const progress = collectProgress(engine);

    await engine.start();

    expect(engine.state).toBe("stopped");
    expect(await listJobs()).toHaveLength(3);
    expect((await getJob("1"))?.detailScrapedAt).toBeDefined();
    expect((await getJob("2"))?.rawText).toBe("already scraped");
    expect((await getJob("3"))?.detailScrapedAt).toBeUndefined();

    const last = progress.at(-1);
    expect(last?.phase).toBe("done");
    expect(last?.stubsFound).toBe(3);
    expect(last?.postingsTotal).toBe(2);
    expect(last?.postingsDone).toBe(1);
    expect(last?.postingsSkipped).toBe(1);
    expect(last?.postingsFailed).toBe(1);

    expect(fake.countOf("openJob")).toBe(2);
    expect(fake.countOf("navigateToResults")).toBe(1);
    expect(fake.countOf("applyQuickFilters")).toBe(0);

    const run = (await db.runs.toArray())[0];
    expect(run?.status).toBe("done");
    expect(run?.summary).toMatchObject({
      pagesScraped: 2,
      stubsFound: 3,
      postingsTotal: 2,
      postingsDone: 1,
      postingsSkipped: 1,
      postingsFailed: 1,
    });

    const warnings = await db.events.where("level").equals("warn").toArray();
    expect(warnings.some((event) => event.message.includes("posting 3 failed"))).toBe(true);
  });

  it("fetches rows and postings directly when the page allows it", async () => {
    await upsertJobs([
      makeJob("2", { detailScrapedAt: "2026-09-01T00:00:00.000Z", rawText: "already scraped" }),
    ]);
    const stubs = Array.from({ length: 1770 }, (_, index) => makeStub(String(index + 1)));
    const fake = createFakeWw({
      resultPages: [stubs],
      jobs: stubs.map((stub) => makeJob(stub.id)),
      failScrapeJobIds: ["7"],
      directMode: true,
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0, directDelayMs: 0 });

    await engine.start();

    expect(engine.state).toBe("stopped");
    expect(fake.countOf("fetchResults")).toBe(18);
    expect(fake.countOf("fetchPosting")).toBe(1769);
    expect(fake.countOf("openJob")).toBe(0);
    expect(fake.countOf("scrapeResultsPage")).toBe(0);
    expect(engine.progress).toMatchObject({
      phase: "done",
      page: 18,
      stubsFound: 1770,
      postingsTotal: 1769,
      postingsDone: 1768,
      postingsSkipped: 1,
      postingsFailed: 1,
    });
    expect((await getJob("2"))?.rawText).toBe("already scraped");
    expect((await getJob("1770"))?.detailScrapedAt).toBeDefined();
    expect(await listJobs()).toHaveLength(1770);
  });

  it("re-fetches jobs that were saved without usable details", async () => {
    await upsertJobs([
      makeJob("1", { detailScrapedAt: "2026-09-07T03:00:00.000Z", rawText: '{"org":"x"}' }),
      makeJob("2", { detailScrapedAt: "2026-09-07T03:00:00.000Z", rawText: "" }),
      makeJob("3", { detailScrapedAt: "2026-09-07T03:00:00.000Z", rawText: "real text" }),
      makeJob("4", {
        detailScrapedAt: "2026-09-07T03:00:00.000Z",
        rawText: "",
        fields: { "Job Summary": "present" },
      }),
    ]);
    expect(hasUsableDetails(makeJob("x"))).toBe(false);
    const fake = createFakeWw({
      resultPages: [[makeStub("1"), makeStub("2"), makeStub("3"), makeStub("4")]],
      jobs: ["1", "2", "3", "4"].map((id) => makeJob(id)),
      directMode: true,
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0, directDelayMs: 0 });

    await engine.start();

    expect(
      fake.calls.filter((call) => call.name === "fetchPosting").map((call) => call.args[0]),
    ).toEqual(expect.arrayContaining(["1", "2"]));
    expect(fake.countOf("fetchPosting")).toBe(2);
  });

  it("stops the direct fetch when the tab disappears", async () => {
    const fake = createFakeWw({
      resultPages: [[makeStub("1"), makeStub("2")]],
      jobs: [makeJob("1"), makeJob("2")],
      directMode: true,
      tabClosedOnCall: ["fetchPosting"],
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0, directDelayMs: 0 });

    await engine.start();

    expect(engine.state).toBe("failed");
    expect(engine.lastError?.message).toContain(tabUnavailableMessage);
  });

  it("opens the postings of each page before moving to the next page", async () => {
    const fake = createFakeWw({
      resultPages: [[makeStub("1"), makeStub("2")], [makeStub("3")]],
      jobs: [makeJob("1"), makeJob("2"), makeJob("3")],
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });

    await engine.start();

    expect(engine.state).toBe("stopped");
    const order = fake.calls
      .filter((call) => call.name === "openJob" || call.name === "nextResultsPage")
      .map((call) => (call.name === "openJob" ? `open:${String(call.args[0])}` : "next"));
    expect(order).toEqual(["open:1", "open:2", "next", "open:3", "next"]);
    expect(engine.progress?.postingsTotal).toBe(3);
    expect(engine.progress?.postingsDone).toBe(3);
  });

  it("clears the sync run history together with its events", async () => {
    const fake = createFakeWw({ resultPages: [[makeStub("1")]], jobs: [makeJob("1")] });
    await new SyncEngine({ client: fake, postingDelayMs: 0 }).start();
    expect(await db.runs.count()).toBe(1);
    expect(await db.events.count()).toBeGreaterThan(0);

    expect(await clearRuns("sync")).toBe(1);

    expect(await db.runs.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
  });

  it("honours maxPages", async () => {
    const fake = createFakeWw({
      resultPages: [[makeStub("1")], [makeStub("2")]],
      jobs: [makeJob("1")],
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0, maxPages: 1 });

    await engine.start();

    expect(fake.countOf("nextResultsPage")).toBe(0);
    expect(engine.progress?.stubsFound).toBe(1);
  });

  it("re-scrapes everything when forceRefresh is set", async () => {
    await upsertJobs([makeJob("1", { detailScrapedAt: "2026-09-01T00:00:00.000Z" })]);
    const fake = createFakeWw({ resultPages: [[makeStub("1")]], jobs: [makeJob("1")] });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0, forceRefresh: true });

    await engine.start();

    expect(engine.progress?.postingsTotal).toBe(1);
    expect(engine.progress?.postingsSkipped).toBe(0);
    expect(fake.countOf("openJob")).toBe(1);
  });

  it("stops between postings when the user asks", async () => {
    const fake = createFakeWw({
      resultPages: [[makeStub("1"), makeStub("2"), makeStub("3")]],
      jobs: [makeJob("1"), makeJob("2"), makeJob("3")],
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 5 });
    engine.onProgress((progress) => {
      if (progress.postingsDone === 1) engine.stop();
    });

    await engine.start();

    expect(engine.state).toBe("stopped");
    expect(engine.progress?.postingsDone).toBe(1);
    expect((await db.runs.toArray())[0]?.status).toBe("stopped");
  });

  it("holds at a pause and continues on resume", async () => {
    const fake = createFakeWw({
      resultPages: [[makeStub("1"), makeStub("2"), makeStub("3")]],
      jobs: [makeJob("1"), makeJob("2"), makeJob("3")],
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 2 });
    let paused = false;
    engine.onProgress((progress) => {
      if (progress.postingsDone === 1 && !paused) {
        paused = true;
        engine.pause();
      }
    });

    const running = engine.start();
    await sleep(30);
    expect(engine.state).toBe("paused");
    expect(engine.progress?.postingsDone).toBe(1);

    engine.resume();
    await running;

    expect(engine.progress?.postingsDone).toBe(3);
    expect(engine.state).toBe("stopped");
  });

  it("pauses for the user when WaterlooWorks shows the login page", async () => {
    const fake = createFakeWw({ pageKind: "login", resultPages: [[]] });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.state).toBe("paused");
    });

    fake.pageKind = "results";
    engine.resume();
    await running;

    expect(engine.state).toBe("stopped");
    const events = await db.events.toArray();
    expect(events.some((event) => event.message === loginRequiredMessage)).toBe(true);
  });

  it("fails when the login page is still showing after the user resumes", async () => {
    const fake = createFakeWw({ pageKind: "login", resultPages: [[]] });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.state).toBe("paused");
    });
    engine.resume();
    await running;

    expect(engine.state).toBe("failed");
    expect(engine.lastError?.message).toBe(loginRequiredMessage);
  });

  it("navigates to the results from any other page before scraping", async () => {
    const fake = createFakeWw({ pageKind: "other", resultPages: [[makeStub("1")]] });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });

    await engine.start();

    expect(engine.state).toBe("stopped");
    expect(fake.countOf("navigateToResults")).toBe(2);
    expect(await listJobs()).toHaveLength(1);
  });

  it("pauses for the user when it cannot reach the results table", async () => {
    const fake = createFakeWw({ pageKind: "other", resultPages: [[]], navigationFails: true });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.state).toBe("paused");
    });
    expect(fake.countOf("navigateToResults")).toBe(3);

    fake.pageKind = "results";
    engine.resume();
    await running;

    expect(engine.state).toBe("stopped");
    const events = await db.events.toArray();
    expect(events.some((event) => event.message === resultsPageRequiredMessage)).toBe(true);
  });

  it("navigates back from a posting the user opened while paused", async () => {
    const fake = createFakeWw({ pageKind: "other", resultPages: [[]], navigationFails: true });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.state).toBe("paused");
    });

    fake.pageKind = "posting";
    fake.navigationFails = false;
    engine.resume();
    await running;

    expect(engine.state).toBe("stopped");
    expect(fake.countOf("navigateToResults")).toBe(4);
  });

  it("fails when the results page is still missing after the user resumes", async () => {
    const fake = createFakeWw({ pageKind: "other", resultPages: [[]], navigationFails: true });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.state).toBe("paused");
    });
    engine.resume();
    await running;

    expect(engine.state).toBe("failed");
    expect(engine.lastError?.message).toBe(resultsPageRequiredMessage);
  });

  it("checks the page kind after three failures in a row and pauses on a login page", async () => {
    const fake = createFakeWw({
      resultPages: [[makeStub("1"), makeStub("2"), makeStub("3")]],
      failOpenJobIds: ["1", "2", "3"],
    });
    const engine = new SyncEngine({ client: fake, postingDelayMs: 0 });
    engine.onProgress((progress) => {
      if (progress.postingsFailed === 2) fake.pageKind = "login";
    });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.state).toBe("paused");
    });

    fake.pageKind = "results";
    engine.resume();
    await running;

    expect(engine.state).toBe("stopped");
    expect(engine.progress?.postingsFailed).toBe(3);
  });

  it("fails with a tab message when the WaterlooWorks tab disappears", async () => {
    const fake = createFakeWw({
      resultPages: [[makeStub("1")]],
      tabClosedOnCall: ["scrapeResultsPage"],
    });
    const engine = new SyncEngine({ client: fake });

    await engine.start();

    expect(engine.state).toBe("failed");
    expect(engine.lastError?.message).toContain(tabUnavailableMessage);
  });
});

describe("importCurrentPosting", () => {
  it("scrapes the open posting into the database", async () => {
    const fake = createFakeWw({ jobs: [makeJob("42")], pageKind: "results" });
    await fake.openJob("42");

    const imported = await importCurrentPosting(fake);

    expect(imported.id).toBe("42");
    expect((await getJob("42"))?.detailScrapedAt).toBeDefined();
  });

  it("refuses to import when no posting is open", async () => {
    const fake = createFakeWw({ pageKind: "results" });
    await expect(importCurrentPosting(fake)).rejects.toThrow(noPostingOpenMessage);
    expect(await listJobs()).toHaveLength(0);
  });
});

describe("upsertJobStubs", () => {
  it("refreshes row fields without blanking values a later row omits", async () => {
    await upsertJobs([
      makeJob("486053", {
        deadline: "2026-09-17T13:00:00.000Z",
        detailScrapedAt: "2026-09-07T03:00:00.000Z",
        summary: "kept",
        status: "interested",
      }),
    ]);

    await upsertJobStubs([
      { ...makeStub("486053", { title: "Renamed" }), deadline: undefined, openings: undefined },
    ]);

    const stored = await getJob("486053");
    expect(stored?.title).toBe("Renamed");
    expect(stored?.deadline).toBe("2026-09-17T13:00:00.000Z");
    expect(stored?.summary).toBe("kept");
    expect(stored?.status).toBe("interested");
    expect(stored?.detailScrapedAt).toBe("2026-09-07T03:00:00.000Z");
  });
});

describe("upsertJobs", () => {
  it("keeps stub fields that a scraped posting does not carry", async () => {
    await upsertJobs([makeJob("486053", { deadline: "2026-09-17T09:00:00.000Z" })]);
    await upsertJobs([
      { ...makeJob("486053"), deadline: undefined, detailScrapedAt: "2026-09-07T03:00:00.000Z" },
    ]);

    const stored = await getJob("486053");
    expect(stored?.deadline).toBe("2026-09-17T09:00:00.000Z");
    expect(stored?.detailScrapedAt).toBe("2026-09-07T03:00:00.000Z");
  });
});
