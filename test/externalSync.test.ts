import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ExternalSyncEngine } from "@/engines/ExternalSyncEngine";
import { db, tableNames } from "@/lib/db/db";
import type { PublicJobFeed } from "@/lib/sources/publicFeeds";

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(tableNames.map((name) => db.table(name).clear()));
});

const feed: PublicJobFeed = {
  id: "test",
  label: "Test feed",
  url: "https://example.com/feed.json",
  parse: (payload) => {
    if (!Array.isArray(payload)) throw new Error("expected array");
    return payload;
  },
};

describe("ExternalSyncEngine", () => {
  it("imports matching live jobs and reports skipped feed entries", async () => {
    const engine = new ExternalSyncEngine({
      feeds: [feed],
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            {
              company: "Acme",
              title: "Data Scientist",
              location: "Remote",
              url: "https://jobs.example.com/data",
              active: true,
            },
            {
              company: "Acme",
              title: "Marketing Intern",
              url: "https://jobs.example.com/marketing",
              active: true,
            },
          ]),
          { status: 200 },
        ),
    });

    await engine.start();

    expect(engine.progress).toMatchObject({
      sourcesTotal: 1,
      sourcesDone: 1,
      jobsImported: 1,
      jobsSkipped: 1,
      sourcesFailed: 0,
    });
    expect(await db.jobs.count()).toBe(1);
    expect(await db.jobs.get("url:https://jobs.example.com/data")).toMatchObject({
      company: "Acme",
      title: "Data Scientist",
      source: "test",
      url: "https://jobs.example.com/data",
    });
  });

  it("logs a source failure and continues with the remaining feeds", async () => {
    const failing: PublicJobFeed = {
      ...feed,
      id: "failure",
      label: "Failing feed",
      url: "https://example.com/failure",
    };
    const engine = new ExternalSyncEngine({
      feeds: [failing, feed],
      fetchImpl: async (url) => {
        if (url.includes("failure")) throw new Error("offline");
        return new Response("[]", { status: 200 });
      },
    });

    await engine.start();

    expect(engine.progress).toMatchObject({
      sourcesTotal: 2,
      sourcesDone: 2,
      sourcesFailed: 1,
    });
    expect((await db.events.toArray()).some((event) => event.message.includes("offline"))).toBe(
      true,
    );
  });
});
