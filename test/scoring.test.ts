import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ScoringProgress } from "@/engines/contracts";
import {
  jobsNeedingScore,
  missingApiKeyMessage,
  planScoringRun,
  ScoringEngine,
} from "@/engines/ScoringEngine";
import { clearPricingCache, type FetchLike, setFetch } from "@/lib/ai/openrouter";
import { db, tableNames } from "@/lib/db/db";
import { getJob, getProfile, upsertJobs, upsertScore } from "@/lib/db/repo";
import { clearApiKey, setApiKey } from "@/lib/storage/apiKey";
import type { Job } from "@/types/job";
import type { JobScore } from "@/types/scoring";
import goodResponse from "./fixtures/ai/good-response.json";
import malformedResponse from "./fixtures/ai/malformed-response.json";
import modelsPayload from "./fixtures/ai/models.json";
import rateLimited from "./fixtures/ai/rate-limited.json";
import unauthorized from "./fixtures/ai/unauthorized.json";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function routedFetch(chatResponses: (() => Response)[]): { calls: string[]; impl: FetchLike } {
  const calls: string[] = [];
  let index = 0;
  const impl: FetchLike = async (url) => {
    calls.push(url);
    if (url.endsWith("/models")) return jsonResponse(modelsPayload);
    const next = chatResponses[Math.min(index, chatResponses.length - 1)];
    index += 1;
    if (!next) throw new Error("no stubbed chat response");
    return next();
  };
  return { calls, impl };
}

function makeJob(overrides: Partial<Job> & { id: string }): Job {
  return {
    company: "Acme",
    title: "Software Engineer Intern",
    location: "Toronto, ON",
    country: "Canada",
    application: {
      resume: true,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    rawText: "Posting text.",
    scrapedAt: "2026-09-06T14:02:00.000Z",
    status: "new",
    ...overrides,
  };
}

async function seedThreeJobs(): Promise<string> {
  await upsertJobs([
    makeJob({ id: "low", company: "Underpay Inc", compensation: "$30.00 per hour" }),
    makeJob({ id: "good", company: "Datadog", compensation: "$65 CAD per hour" }),
    makeJob({ id: "cached", company: "Stripe", compensation: "$70 CAD per hour" }),
  ]);
  const profile = await getProfile();
  const existing: JobScore = {
    id: `cached:${profile.version}`,
    jobId: "cached",
    profileVersion: profile.version,
    score: 77,
    likelihood: 50,
    verdict: "apply",
    hardViolations: [],
    softNotes: [],
    strengths: [],
    gaps: [],
    summary: "Already scored.",
    model: "z-ai/glm-5.3-flash",
    usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.00001 },
    prompt: "[]",
    rawResponse: "{}",
    scoredAt: "2026-09-05T00:00:00.000Z",
  };
  await upsertScore(existing);
  return profile.version;
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await Promise.all(tableNames.map((name) => db.table(name).clear()));
  await clearPricingCache();
  await setApiKey("sk-or-test-key");
});

afterEach(async () => {
  setFetch(undefined);
  await clearApiKey();
});

describe("ScoringEngine", () => {
  it("skips non-target and vague-pay postings without an API key or network request", async () => {
    await clearApiKey();
    await upsertJobs([
      makeJob({
        id: "hardware",
        title: "Marketing Intern",
        compensation: "$80 CAD/hour",
      }),
      makeJob({ id: "vague", compensation: "In accordance with university norms" }),
      makeJob({ id: "business", title: "Business Analyst", compensation: "$80 CAD/hour" }),
    ]);
    const { impl, calls } = routedFetch([]);
    setFetch(impl);
    const plan = await planScoringRun();
    expect(plan.estimate.jobCount).toBe(0);
    const engine = new ScoringEngine();
    await engine.start();
    expect(engine.lastError).toBeUndefined();
    expect(engine.counts.skippedByPrefilter).toBe(3);
    expect(engine.counts.costUsd).toBe(0);
    expect(calls).toEqual([]);
    expect(
      (await db.jobScores.toArray()).every(
        (score) => score.model === "prefilter" && score.summary.length > 0,
      ),
    ).toBe(true);
  });

  it("rechecks automatic filters before reusing a previous model score", async () => {
    await seedThreeJobs();
    await db.jobs.update("cached", { title: "Marketing Intern" });
    const { impl, calls } = routedFetch([]);
    setFetch(impl);
    const engine = new ScoringEngine({ jobIds: ["cached"] });
    await engine.start();
    expect(engine.counts.skippedByPrefilter).toBe(1);
    expect(calls).toEqual([]);
    expect((await getJob("cached"))?.score).toBe(0);
  });

  it("ranks a previously filtered job when its pay now qualifies", async () => {
    await upsertJobs([makeJob({ id: "changed", compensation: "$30 CAD/hour" })]);
    await new ScoringEngine().start();
    expect(await jobsNeedingScore()).toHaveLength(0);
    await db.jobs.update("changed", { compensation: "$60 CAD/hour" });
    expect((await jobsNeedingScore()).map((job) => job.id)).toEqual(["changed"]);
    const { impl, calls } = routedFetch([() => jsonResponse(goodResponse)]);
    setFetch(impl);
    await new ScoringEngine().start();
    expect(calls.filter((url) => url.endsWith("/chat/completions"))).toHaveLength(1);
    expect((await getJob("changed"))?.score).toBe(88);
  });

  it("scores, prefilters and reuses cached rows in one run", async () => {
    const version = await seedThreeJobs();
    const { impl } = routedFetch([() => jsonResponse(goodResponse)]);
    setFetch(impl);

    const engine = new ScoringEngine({ jobIds: ["low", "good", "cached"], concurrency: 2 });
    const progress: ScoringProgress[] = [];
    engine.onProgress((value) => progress.push(value));

    await engine.start();

    expect(engine.state).toBe("stopped");
    expect(engine.lastError).toBeUndefined();

    const counts = engine.counts;
    expect(counts.total).toBe(3);
    expect(counts.done).toBe(3);
    expect(counts.cached).toBe(1);
    expect(counts.skippedByPrefilter).toBe(1);
    expect(counts.failed).toBe(0);
    expect(counts.promptTokens).toBe(2450);
    expect(counts.completionTokens).toBe(260);
    expect(counts.costUsd).toBeCloseTo(0.00025375, 8);
    expect(counts.currentJobIds).toEqual([]);
    expect(progress.length).toBeGreaterThanOrEqual(3);

    const prefiltered = await db.jobScores.get(`low:${version}`);
    expect(prefiltered?.verdict).toBe("skip");
    expect(prefiltered?.score).toBe(0);
    expect(prefiltered?.likelihood).toBe(0);
    expect(prefiltered?.hardViolations).toEqual(["ca-pay"]);
    expect(prefiltered?.model).toBe("prefilter");
    expect(prefiltered?.prompt).toBe("");
    expect(prefiltered?.rawResponse).toBe("");
    expect(prefiltered?.usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: 0 });
    expect(prefiltered?.summary).toContain("below the CAD floor");

    const scored = await db.jobScores.get(`good:${version}`);
    expect(scored?.verdict).toBe("apply");
    expect(scored?.score).toBe(88);
    expect(scored?.likelihood).toBe(62);
    expect(scored?.model).toBe("z-ai/glm-5.3-flash");
    expect(scored?.usage.costUsd).toBeCloseTo(0.00025375, 8);
    expect(scored?.rawResponse).toContain('"verdict":"apply"');
    expect(JSON.parse(scored?.prompt ?? "[]")).toHaveLength(2);
    expect(scored?.softNotes.map((note) => note.constraintId)).toEqual([
      "pay",
      "interest",
      "company",
    ]);

    expect((await getJob("good"))?.score).toBe(88);
    expect((await getJob("low"))?.score).toBe(0);
    expect((await getJob("cached"))?.score).toBe(77);
    expect(await db.jobScores.count()).toBe(3);

    const run = (await db.runs.toArray())[0];
    expect(run?.kind).toBe("score");
    expect(run?.status).toBe("done");
    expect(run?.summary).toMatchObject({
      total: 3,
      done: 3,
      cached: 1,
      skippedByPrefilter: 1,
      failed: 0,
    });

    const events = await db.events.toArray();
    expect(events.some((event) => event.message.includes("scored good"))).toBe(true);
    expect(events.some((event) => event.message.includes("prefiltered low"))).toBe(true);
    expect(JSON.stringify(events)).not.toContain("sk-or-test-key");
  });

  it("defaults to the jobs with no score at all, keeping scores from older profiles", async () => {
    await seedThreeJobs();
    expect((await jobsNeedingScore()).map((job) => job.id).sort()).toEqual(["good", "low"]);
    await db.jobScores.update(`cached:${await getProfile().then((p) => p.version)}`, {
      profileVersion: "older-profile",
    });
    expect((await jobsNeedingScore()).map((job) => job.id).sort()).toEqual(["good", "low"]);

    const { impl } = routedFetch([() => jsonResponse(goodResponse)]);
    setFetch(impl);

    const engine = new ScoringEngine();
    await engine.start();

    expect(engine.counts.total).toBe(2);
    expect(engine.counts.cached).toBe(0);
    expect(engine.counts.skippedByPrefilter).toBe(1);
    expect(await jobsNeedingScore()).toHaveLength(0);
  });

  it("repairs one invalid response and stores the corrected verdict", async () => {
    const version = await seedThreeJobs();
    const { calls, impl } = routedFetch([
      () => jsonResponse(malformedResponse),
      () => jsonResponse(goodResponse),
    ]);
    setFetch(impl);

    const engine = new ScoringEngine({ jobIds: ["good"] });
    await engine.start();

    expect(calls.filter((url) => url.endsWith("/chat/completions"))).toHaveLength(2);
    const scored = await db.jobScores.get(`good:${version}`);
    expect(scored?.score).toBe(88);
    expect(scored?.usage.promptTokens).toBe(2050 + 2450);
    expect(JSON.parse(scored?.prompt ?? "[]")).toHaveLength(4);
    const events = await db.events.toArray();
    expect(events.some((event) => event.level === "warn")).toBe(true);
  });

  it("isolates a single job failure without failing the run", async () => {
    await seedThreeJobs();
    const { impl } = routedFetch([() => jsonResponse(unauthorized, 401)]);
    setFetch(impl);

    const engine = new ScoringEngine({ jobIds: ["good", "low"] });
    await engine.start();

    expect(engine.state).toBe("stopped");
    expect(engine.counts.failed).toBe(1);
    expect(engine.counts.skippedByPrefilter).toBe(1);
    const events = await db.events.toArray();
    expect(events.some((event) => event.level === "error")).toBe(true);
  });

  it("retries a rate limited job before giving up on it", async () => {
    const version = await seedThreeJobs();
    const { calls, impl } = routedFetch([
      () => jsonResponse(rateLimited, 429, { "Retry-After": "0" }),
      () => jsonResponse(goodResponse),
    ]);
    setFetch(impl);

    const engine = new ScoringEngine({ jobIds: ["good"] });
    await engine.start();

    expect(calls.filter((url) => url.endsWith("/chat/completions")).length).toBeGreaterThanOrEqual(
      2,
    );
    expect((await db.jobScores.get(`good:${version}`))?.score).toBe(88);
  });

  it("fails the run with a clear message when there is no api key", async () => {
    await seedThreeJobs();
    await clearApiKey();

    const engine = new ScoringEngine({ jobIds: ["good"] });
    await engine.start();

    expect(engine.state).toBe("failed");
    expect(engine.lastError?.message).toBe(missingApiKeyMessage);
    expect((await db.runs.toArray())[0]?.status).toBe("failed");
  });

  it("aborts the in-flight request when the run is stopped", async () => {
    await seedThreeJobs();
    let markStarted: () => void = () => undefined;
    const requestStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const impl: FetchLike = async (url, init) => {
      if (url.endsWith("/models")) return jsonResponse(modelsPayload);
      markStarted();
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("aborted by the caller"));
        });
      });
    };
    setFetch(impl);

    const engine = new ScoringEngine({ jobIds: ["good"] });
    const run = engine.start();
    await requestStarted;
    engine.stop();
    await run;

    expect(engine.state).toBe("stopped");
    expect(engine.counts.failed).toBe(0);
    expect((await db.runs.toArray())[0]?.status).toBe("stopped");
  });

  it("finishes immediately when nothing needs scoring", async () => {
    const { impl } = routedFetch([() => jsonResponse(goodResponse)]);
    setFetch(impl);
    const engine = new ScoringEngine();
    await engine.start();
    expect(engine.state).toBe("stopped");
    expect(engine.counts.total).toBe(0);
  });
});

describe("planScoringRun", () => {
  it("previews the jobs and the cost before anything is sent", async () => {
    await seedThreeJobs();
    const { impl } = routedFetch([() => jsonResponse(goodResponse)]);
    setFetch(impl);

    const plan = await planScoringRun();

    expect(plan.jobs.map((job) => job.id).sort()).toEqual(["good", "low"]);
    expect(plan.pricing?.promptUsdPerMillion).toBeCloseTo(0.075, 6);
    expect(plan.estimate.jobCount).toBe(1);
    expect(plan.estimate.pricingKnown).toBe(true);
    expect(plan.estimate.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("reports an unknown cost when pricing cannot be loaded", async () => {
    await seedThreeJobs();
    setFetch(async () => jsonResponse({ error: { message: "down" } }, 500));

    const plan = await planScoringRun({ jobIds: ["good"] });

    expect(plan.pricing).toBeUndefined();
    expect(plan.estimate.pricingKnown).toBe(false);
    expect(plan.estimate.estimatedCostUsd).toBe(0);
  });
});
