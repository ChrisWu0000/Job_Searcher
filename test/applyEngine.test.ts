import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplyEngine } from "@/engines/ApplyEngine";
import { applyCheckpointKey } from "@/engines/contracts";
import { db, tableNames } from "@/lib/db/db";
import {
  getApplication,
  getJob,
  getSavedAnswer,
  listSavedAnswers,
  upsertJobs,
} from "@/lib/db/repo";
import { hashQuestion } from "@/lib/hash";
import { createFakeWw, makeApplyState, makeJob, makeQuestion } from "./helpers/fakeWw";

const eligibility = "Are you eligible to work in Canada?";
const terms = "How many study terms remain?";

function twoQuestions() {
  return [makeQuestion("q1", eligibility), makeQuestion("q2", terms)];
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(tableNames.map((name) => db.table(name).clear()));
});

describe("ApplyEngine", () => {
  it("walks a queue, pausing for questions and again before submit", async () => {
    const jobA = makeJob("A");
    const jobB = makeJob("B");
    await upsertJobs([jobA, jobB]);
    const fake = createFakeWw({
      jobs: [jobA, jobB],
      applyStates: {
        A: makeApplyState({ questions: twoQuestions() }),
        B: makeApplyState(),
      },
    });
    const engine = new ApplyEngine({ jobIds: ["A", "B"], client: fake });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("questions");
    });

    expect(engine.currentStep).toBe("paused-for-questions");
    expect(engine.progress?.questions).toHaveLength(2);
    expect((await getApplication("A"))?.status).toBe("paused");
    expect((await getJob("A"))?.status).toBe("queued");
    expect(fake.countOf("selectPackage")).toBe(1);
    expect(fake.countOf("selectDocument")).toBe(1);

    const checkpointDuringQuestions = fake.checkpoints.get(applyCheckpointKey);
    expect(checkpointDuringQuestions).toMatchObject({
      queueIds: ["A", "B"],
      currentIndex: 0,
      currentStep: "paused-for-questions",
    });

    await engine.submitAnswers({ q1: "Yes", q2: "3" });
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("submit");
    });

    expect(engine.currentStep).toBe("paused-before-submit");
    expect(await listSavedAnswers()).toHaveLength(2);
    expect((await getSavedAnswer(hashQuestion(eligibility)))?.answer).toBe("Yes");
    expect((await getSavedAnswer(hashQuestion(terms)))?.answer).toBe("3");
    expect((await getApplication("A"))?.answers).toEqual({ q1: "Yes", q2: "3" });

    const logA = (await getApplication("A"))?.log ?? [];
    expect(
      logA.some(
        (entry) => entry.step === "selecting-package" && entry.detail?.includes("Default package"),
      ),
    ).toBe(true);
    expect(
      logA.some(
        (entry) => entry.step === "selecting-documents" && entry.detail?.includes("Resume.pdf"),
      ),
    ).toBe(true);

    await engine.confirmSubmit();
    await vi.waitFor(() => {
      expect(engine.progress?.currentJobId).toBe("B");
    });
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("submit");
    });

    expect((await getApplication("A"))?.status).toBe("submitted");
    expect((await getApplication("A"))?.submittedAt).toBeDefined();
    expect((await getJob("A"))?.status).toBe("applied");
    expect(engine.progress?.step).toBe("paused-before-submit");
    expect(engine.progress?.questions).toHaveLength(0);

    await engine.confirmSubmit();
    await running;

    expect(engine.state).toBe("stopped");
    expect(fake.submittedJobIds).toEqual(["A", "B"]);
    expect((await getJob("B"))?.status).toBe("applied");
    expect(fake.checkpoints.has(applyCheckpointKey)).toBe(false);
    expect((await db.runs.toArray())[0]?.summary).toMatchObject({ done: 2, failed: 0, skipped: 0 });
  });

  it("isolates a failing application and keeps the queue moving", async () => {
    await upsertJobs([makeJob("A"), makeJob("B")]);
    const fake = createFakeWw({
      jobs: [makeJob("A"), makeJob("B")],
      applyStates: { B: makeApplyState() },
      failScrapeJobIds: ["A"],
    });
    const engine = new ApplyEngine({ jobIds: ["A", "B"], client: fake });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("submit");
    });

    expect(engine.progress?.currentJobId).toBe("B");
    expect((await getApplication("A"))?.status).toBe("failed");
    expect((await getJob("A"))?.status).toBe("error");
    expect(
      (await getApplication("A"))?.log.some((entry) => entry.step === "failed" && !entry.ok),
    ).toBe(true);

    await engine.confirmSubmit();
    await running;

    expect(engine.progress?.failed).toBe(1);
    expect(engine.progress?.done).toBe(1);
    expect(fake.submittedJobIds).toEqual(["B"]);
  });

  it("stops the queue on the first failure when stopOnFailure is set", async () => {
    await upsertJobs([makeJob("A"), makeJob("B")]);
    const fake = createFakeWw({
      jobs: [makeJob("A"), makeJob("B")],
      failScrapeJobIds: ["A"],
    });
    const engine = new ApplyEngine({ jobIds: ["A", "B"], client: fake, stopOnFailure: true });

    await engine.start();

    expect(engine.state).toBe("failed");
    expect(fake.countOf("openJob")).toBe(1);
    expect(await getApplication("B")).toBeUndefined();
  });

  it("skips the current application on request", async () => {
    await upsertJobs([makeJob("A")]);
    const fake = createFakeWw({ jobs: [makeJob("A")], applyStates: { A: makeApplyState() } });
    const engine = new ApplyEngine({ jobIds: ["A"], client: fake });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("submit");
    });

    await engine.skipCurrent();
    await running;

    expect((await getApplication("A"))?.status).toBe("cancelled");
    expect((await getJob("A"))?.status).toBe("interested");
    expect(engine.progress?.skipped).toBe(1);
    expect(fake.countOf("submit")).toBe(0);
  });

  it("restarts the current application from opening on retry", async () => {
    await upsertJobs([makeJob("A")]);
    const fake = createFakeWw({
      jobs: [makeJob("A")],
      applyStates: { A: makeApplyState({ questions: twoQuestions() }) },
    });
    const engine = new ApplyEngine({ jobIds: ["A"], client: fake });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("questions");
    });

    await engine.retryCurrent();
    await vi.waitFor(() => {
      expect(fake.countOf("openJob")).toBe(2);
    });
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("questions");
    });

    await engine.submitAnswers({ q1: "Yes", q2: "3" });
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("submit");
    });
    await engine.confirmSubmit();
    await running;

    expect(fake.submittedJobIds).toEqual(["A"]);
  });

  it("stops cleanly while paused and resumes from the checkpoint", async () => {
    await upsertJobs([makeJob("A")]);
    const fake = createFakeWw({
      jobs: [makeJob("A")],
      applyStates: { A: makeApplyState({ questions: twoQuestions() }) },
    });
    const engine = new ApplyEngine({ jobIds: ["A"], client: fake });

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("questions");
    });

    engine.stop();
    await running;

    expect(engine.state).toBe("stopped");
    expect((await getApplication("A"))?.status).toBe("paused");
    expect((await getJob("A"))?.status).toBe("queued");
    expect(fake.checkpoints.get(applyCheckpointKey)).toMatchObject({
      queueIds: ["A"],
      currentIndex: 0,
      currentStep: "paused-for-questions",
    });

    const resumed = await ApplyEngine.fromCheckpoint(fake);
    if (!resumed) throw new Error("expected a checkpoint to resume from");

    const resumedRun = resumed.start();
    await vi.waitFor(() => {
      expect(resumed.waitReason).toBe("questions");
    });
    expect(resumed.progress?.currentJobId).toBe("A");

    await resumed.submitAnswers({ q1: "Yes", q2: "3" });
    await vi.waitFor(() => {
      expect(resumed.waitReason).toBe("submit");
    });
    await resumed.confirmSubmit();
    await resumedRun;

    expect(resumed.state).toBe("stopped");
    expect((await getApplication("A"))?.status).toBe("submitted");
    expect((await getJob("A"))?.status).toBe("applied");
    expect(fake.checkpoints.has(applyCheckpointKey)).toBe(false);
  });

  it("records a submission that lands while the queue is being stopped", async () => {
    await upsertJobs([makeJob("A")]);
    const fake = createFakeWw({ jobs: [makeJob("A")], applyStates: { A: makeApplyState() } });
    const engine = new ApplyEngine({ jobIds: ["A"], client: fake });
    const originalSubmit = fake.submit.bind(fake);
    fake.submit = async () => {
      engine.stop();
      return originalSubmit();
    };

    const running = engine.start();
    await vi.waitFor(() => {
      expect(engine.waitReason).toBe("submit");
    });
    await engine.confirmSubmit();
    await running;

    expect(engine.state).toBe("stopped");
    expect(fake.submittedJobIds).toEqual(["A"]);
    expect((await getApplication("A"))?.status).toBe("submitted");
    expect((await getJob("A"))?.status).toBe("applied");
  });

  it("returns no engine when there is no checkpoint", async () => {
    const fake = createFakeWw();
    expect(await ApplyEngine.fromCheckpoint(fake)).toBeUndefined();
  });
});
