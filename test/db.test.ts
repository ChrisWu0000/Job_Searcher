import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db, schemaVersion, tableNames, WwppDatabase } from "@/lib/db/db";
import { exportAll, importAll } from "@/lib/db/export";
import { primaryKeyField, relationsPointingTo } from "@/lib/db/relations";
import {
  appendEvent,
  createRun,
  finishRun,
  getApplication,
  getJob,
  getProfile,
  latestScoreForJob,
  listCapturedHtml,
  listQueuedApplications,
  moveQueuedApplication,
  nextQueueOrder,
  putSavedAnswer,
  saveApplication,
  saveCapturedHtml,
  saveProfile,
  setJobNotes,
  setJobStatus,
  upsertJobs,
  upsertScore,
} from "@/lib/db/repo";
import type { Job } from "@/types/job";
import { defaultProfile } from "@/types/preferences";
import type { JobScore } from "@/types/scoring";

function makeJob(id: string): Job {
  return {
    id,
    company: "Datadog",
    title: "Software Engineer Intern",
    location: "New York, NY",
    scrapedAt: "2026-09-06T14:02:00.000Z",
    application: {
      resume: true,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    rawText: "raw posting text",
    status: "new",
  };
}

function makeScore(
  jobId: string,
  profileVersion: string,
  score: number,
  scoredAt = "2026-09-06T14:02:00.000Z",
): JobScore {
  return {
    id: `${jobId}:${profileVersion}`,
    jobId,
    profileVersion,
    score,
    likelihood: 40,
    verdict: "apply",
    hardViolations: [],
    softNotes: [],
    strengths: [],
    gaps: [],
    summary: "Strong match.",
    model: "z-ai/glm-5.3-flash",
    usage: { promptTokens: 100, completionTokens: 20, costUsd: 0.0001 },
    prompt: "prompt text",
    rawResponse: "{}",
    scoredAt,
  };
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(tableNames.map((name) => db.table(name).clear()));
});

describe("database schema", () => {
  it("opens at the current version with every declared table", async () => {
    expect(db.isOpen()).toBe(true);
    expect(db.verno).toBe(schemaVersion);
    expect(db.tables.map((table) => table.name).sort()).toEqual([...tableNames].sort());
  });

  it("indexes the fields the dashboard sorts and filters by", () => {
    const jobIndexes = db.jobs.schema.indexes.map((index) => index.name).sort();
    expect(jobIndexes).toEqual(["company", "deadline", "detailScrapedAt", "score", "status"]);
    expect(db.jobs.schema.primKey.name).toBe("id");
    expect(db.runs.schema.primKey.auto).toBe(true);
  });

  it("names a primary key for every table in relations", () => {
    for (const name of tableNames) expect(primaryKeyField(name)).toBeTruthy();
    expect(relationsPointingTo("jobs").map((relation) => relation.fromTable)).toEqual([
      "jobScores",
      "applications",
      "capturedHtml",
      "tailoredResumes",
    ]);
  });
});

describe("job repository", () => {
  it("inserts new jobs and preserves triage state on re-import", async () => {
    await upsertJobs([makeJob("1")]);
    await setJobStatus("1", "interested");
    await setJobNotes("1", "referral from a friend");

    await upsertJobs([{ ...makeJob("1"), title: "Software Engineer Intern (Fall)" }]);

    const stored = await getJob("1");
    expect(stored?.title).toBe("Software Engineer Intern (Fall)");
    expect(stored?.status).toBe("interested");
    expect(stored?.notes).toBe("referral from a friend");
  });

  it("denormalizes the latest score onto the job row", async () => {
    await upsertJobs([makeJob("1")]);
    await upsertScore(makeScore("1", "v1", 61, "2026-09-01T00:00:00.000Z"));
    await upsertScore(makeScore("1", "v2", 92, "2026-09-05T00:00:00.000Z"));

    expect((await getJob("1"))?.score).toBe(92);
    expect((await latestScoreForJob("1"))?.score).toBe(92);
  });
});

describe("profile repository", () => {
  it("seeds the default profile with a computed version", async () => {
    const seeded = await getProfile();
    expect(seeded.id).toBe("me");
    expect(seeded.constraints).toHaveLength(defaultProfile.constraints.length);
    expect(seeded.version).not.toBe("");
  });

  it("bumps the version when a scoring input changes", async () => {
    const seeded = await getProfile();
    const saved = await saveProfile({ ...seeded, payFloors: { CAD: 70, USD: 50 } });
    expect(saved.version).not.toBe(seeded.version);
  });
});

describe("runs, events, and applications", () => {
  it("records a run lifecycle and its events", async () => {
    const runId = await createRun("sync");
    await appendEvent({
      runId,
      at: "2026-09-06T14:02:00.000Z",
      level: "info",
      engine: "sync",
      message: "started",
    });
    await finishRun(runId, "done", { imported: 3 });

    const run = await db.runs.get(runId);
    expect(run?.status).toBe("done");
    expect(run?.summary).toEqual({ imported: 3 });
    expect(await db.events.where("runId").equals(runId).count()).toBe(1);
  });

  it("stores applications and saved answers", async () => {
    await saveApplication({
      jobId: "1",
      status: "queued",
      answers: { q1: "Yes" },
      log: [{ at: "2026-09-06T14:02:00.000Z", step: "queued", ok: true }],
    });
    expect((await getApplication("1"))?.status).toBe("queued");

    const answer = await putSavedAnswer("  Are You   Eligible? ", "Yes");
    expect(answer.questionHash).toHaveLength(16);
    expect(answer.answer).toBe("Yes");
  });
});

describe("export and import", () => {
  it("round trips every table through json", async () => {
    await upsertJobs([makeJob("1"), makeJob("2")]);
    await upsertScore(makeScore("1", "v1", 88));
    await getProfile();

    const exported = await exportAll();
    const serialized = JSON.stringify(exported);
    await Promise.all(tableNames.map((name) => db.table(name).clear()));

    const counts = await importAll(JSON.parse(serialized));
    expect(counts.jobs).toBe(2);
    expect(counts.jobScores).toBe(1);
    expect(counts.preferences).toBe(1);
    expect(await db.jobs.count()).toBe(2);
  });

  it("rejects a payload that is not a database export", async () => {
    await expect(importAll({ tables: { jobs: [{ id: 7 }] } })).rejects.toThrow();
  });

  it("never carries the openrouter api key", async () => {
    const exported = await exportAll();
    expect(Object.keys(exported.tables).sort()).toEqual([...tableNames].sort());
    expect(JSON.stringify(exported)).not.toContain("apiKey");
  });

  it("round trips captured html and accepts a version 1 payload without it", async () => {
    await saveCapturedHtml({
      at: "2026-09-06T14:02:00.000Z",
      kind: "posting",
      source: "manual",
      html: "<main>posting</main>",
      url: "https://waterlooworks.uwaterloo.ca/posting",
    });

    const exported = await exportAll();
    expect(exported.tables.capturedHtml).toHaveLength(1);
    await Promise.all(tableNames.map((name) => db.table(name).clear()));

    const counts = await importAll(JSON.parse(JSON.stringify(exported)));
    expect(counts.capturedHtml).toBe(1);
    expect((await listCapturedHtml())[0]?.html).toBe("<main>posting</main>");

    const legacy = {
      formatVersion: 1,
      exportedAt: "2026-09-06T14:02:00.000Z",
      tables: {
        jobs: [makeJob("9")],
        jobScores: [],
        applications: [],
        savedAnswers: [],
        runs: [],
        events: [],
        preferences: [],
      },
    };
    const legacyCounts = await importAll(legacy);
    expect(legacyCounts.jobs).toBe(1);
    expect(legacyCounts.capturedHtml).toBe(0);
  });
});

describe("queue ordering", () => {
  it("orders queued applications and swaps neighbours", async () => {
    await saveApplication({ jobId: "a", status: "queued", answers: {}, log: [], order: 1 });
    await saveApplication({ jobId: "b", status: "queued", answers: {}, log: [], order: 2 });
    await saveApplication({ jobId: "c", status: "queued", answers: {}, log: [], order: 3 });

    expect((await listQueuedApplications()).map((entry) => entry.jobId)).toEqual(["a", "b", "c"]);
    expect(await nextQueueOrder()).toBe(4);

    await moveQueuedApplication("c", -1);
    expect((await listQueuedApplications()).map((entry) => entry.jobId)).toEqual(["a", "c", "b"]);

    await moveQueuedApplication("a", -1);
    expect((await listQueuedApplications()).map((entry) => entry.jobId)).toEqual(["a", "c", "b"]);
  });
});

describe("version 1 upgrade", () => {
  it("keeps version 1 rows and adds the version 2 tables and order index", async () => {
    const name = "wwpp-upgrade-test";
    await Dexie.delete(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      jobs: "id, company, status, score, deadline, detailScrapedAt",
      jobScores: "id, jobId, profileVersion, verdict, scoredAt",
      applications: "jobId, status, submittedAt",
      savedAnswers: "questionHash, lastUsedAt",
      runs: "++id, kind, startedAt",
      events: "++id, runId, at, level",
      preferences: "id",
    });
    await legacy.open();
    await legacy.table("jobs").put(makeJob("legacy-1"));
    await legacy.table("preferences").put({
      ...defaultProfile,
      resumeText: "Keep my resume",
      reach: "Keep my personal goals",
      model: "my-model",
      unknownPay: "llm",
      payFloors: { CAD: 20, USD: 25 },
      constraints: [{ id: "personal", kind: "soft", weight: 3, text: "Prefer remote" }],
      version: "old-version",
    });
    await legacy.table("applications").put({
      jobId: "legacy-1",
      status: "queued",
      answers: {},
      log: [],
    });
    legacy.close();

    const upgraded = new WwppDatabase(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(schemaVersion);
    expect(await upgraded.jobs.get("legacy-1")).toBeDefined();
    const profile = await upgraded.preferences.get("me");
    expect(profile).toMatchObject({
      resumeText: "Keep my resume",
      reach: "Keep my personal goals",
      model: "my-model",
      unknownPay: "reject",
      payFloors: { CAD: 60, USD: 50 },
    });
    expect(profile?.version).not.toBe("old-version");
    expect(profile?.constraints.map((constraint) => constraint.id)).toEqual(
      expect.arrayContaining(["personal", "software", "no-hw", "pay-disclosure", "ca-value"]),
    );
    const migrated = await upgraded.applications.get("legacy-1");
    expect(migrated?.order).toBe(1);
    expect(upgraded.tables.map((table) => table.name)).toContain("capturedHtml");
    await upgraded.capturedHtml.add({
      at: "2026-09-06T14:02:00.000Z",
      kind: "results",
      source: "error",
      html: "<table></table>",
    });
    expect(await upgraded.capturedHtml.count()).toBe(1);
    upgraded.close();
    await Dexie.delete(name);
  });
});
