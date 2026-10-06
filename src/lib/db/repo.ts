import { hashQuestion } from "@/lib/hash";
import { withCurrentVersion } from "@/lib/ranking/profile";
import type { ResumeBank } from "@/lib/resume/contracts";
import { withResumeSettingsVersion } from "@/lib/resume/version";
import { hoursUntil, nowIso } from "@/lib/time";
import type {
  Application,
  ApplicationLogEntry,
  ApplicationStatus,
  SavedAnswer,
} from "@/types/application";
import type { CapturedHtml } from "@/types/capture";
import type { Job, JobStatus, JobStub } from "@/types/job";
import { defaultProfile, type Profile } from "@/types/preferences";
import {
  defaultResumeSettings,
  type ExperienceEntry,
  type ResumeSettings,
  type TailoredResume,
} from "@/types/resume";
import type { EngineEvent, Run, RunKind, RunStatus } from "@/types/run";
import type { JobScore } from "@/types/scoring";
import { db } from "./db";

export async function listJobs(): Promise<Job[]> {
  return db.jobs.toArray();
}

export async function getJob(jobId: string): Promise<Job | undefined> {
  return db.jobs.get(jobId);
}

export async function getJobs(jobIds: string[]): Promise<Job[]> {
  const found = await db.jobs.bulkGet(jobIds);
  return found.filter((job): job is Job => job !== undefined);
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function stubToJob(stub: JobStub): Job {
  return {
    ...stub,
    firstSeenAt: stub.scrapedAt,
    application: {
      resume: false,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    rawText: "",
    status: "new",
  };
}

export async function upsertJobStubs(stubs: (JobStub & Partial<Job>)[]): Promise<number> {
  if (stubs.length === 0) return 0;
  return db.transaction("rw", db.jobs, async () => {
    const existing = await db.jobs.bulkGet(stubs.map((stub) => stub.id));
    const merged = stubs.map((stub, index) => {
      const previous = existing[index];
      if (!previous) return stubToJob(stub);
      return { ...previous, ...withoutUndefined(stub) };
    });
    await db.jobs.bulkPut(merged);
    return merged.length;
  });
}

export async function upsertJobs(jobs: Job[]): Promise<number> {
  if (jobs.length === 0) return 0;
  return db.transaction("rw", db.jobs, async () => {
    const existing = await db.jobs.bulkGet(jobs.map((job) => job.id));
    const merged = jobs.map((job, index) => {
      const previous = existing[index];
      if (!previous) return job;
      const incoming = withoutUndefined(job);
      return {
        ...previous,
        ...incoming,
        status: previous.status === "new" ? job.status : previous.status,
        notes: job.notes ?? previous.notes,
        score: job.score ?? previous.score,
      };
    });
    await db.jobs.bulkPut(merged);
    return merged.length;
  });
}

export async function setJobStatus(jobId: string, status: JobStatus): Promise<void> {
  await db.jobs.update(jobId, { status });
}

export async function setJobStatuses(jobIds: string[], status: JobStatus): Promise<void> {
  await db.transaction("rw", db.jobs, async () => {
    for (const jobId of jobIds) await db.jobs.update(jobId, { status });
  });
}

export async function setJobNotes(jobId: string, notes: string): Promise<void> {
  await db.jobs.update(jobId, { notes });
}

function newestFirst(left: JobScore, right: JobScore): number {
  return left.scoredAt < right.scoredAt ? 1 : -1;
}

export async function latestScoreForJob(jobId: string): Promise<JobScore | undefined> {
  const scores = await db.jobScores.where("jobId").equals(jobId).toArray();
  return scores.sort(newestFirst)[0];
}

export async function listLatestScores(): Promise<JobScore[]> {
  const latest = new Map<string, JobScore>();
  for (const score of (await db.jobScores.toArray()).sort(newestFirst)) {
    if (!latest.has(score.jobId)) latest.set(score.jobId, score);
  }
  return [...latest.values()];
}

export async function latestSyncRunStartedAt(): Promise<string | undefined> {
  const runs = await db.runs.where("kind").equals("sync").toArray();
  return runs.map((run) => run.startedAt).sort()[runs.length - 1];
}

export async function scoreForJobVersion(
  jobId: string,
  profileVersion: string,
): Promise<JobScore | undefined> {
  return db.jobScores.get(`${jobId}:${profileVersion}`);
}

export async function upsertScore(score: JobScore): Promise<void> {
  await db.transaction("rw", db.jobScores, db.jobs, async () => {
    await db.jobScores.put(score);
    await db.jobs.update(score.jobId, { score: score.score });
  });
}

export async function listScoresForJob(jobId: string): Promise<JobScore[]> {
  return db.jobScores.where("jobId").equals(jobId).toArray();
}

export async function listScoresForVersion(profileVersion: string): Promise<JobScore[]> {
  return db.jobScores.where("profileVersion").equals(profileVersion).toArray();
}

export async function countScoresForVersion(profileVersion: string): Promise<number> {
  return db.jobScores.where("profileVersion").equals(profileVersion).count();
}

export async function jobsClosingWithin(hours: number, from: Date = new Date()): Promise<Job[]> {
  const jobs = await db.jobs.toArray();
  return jobs.filter((job) => {
    if (job.status === "skipped" || job.status === "applied") return false;
    const deadline = job.application.deadline ?? job.deadline;
    if (deadline === undefined) return false;
    const remaining = hoursUntil(deadline, from);
    return remaining !== undefined && remaining >= 0 && remaining <= hours;
  });
}

export async function getProfile(): Promise<Profile> {
  const stored = await db.preferences.get(defaultProfile.id);
  if (stored) return stored;
  const seeded = withCurrentVersion(defaultProfile);
  await db.preferences.put(seeded);
  return seeded;
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const versioned = withCurrentVersion(profile);
  await db.preferences.put(versioned);
  return versioned;
}

export async function createRun(kind: RunKind, summary?: Record<string, unknown>): Promise<number> {
  const run: Run = {
    kind,
    startedAt: nowIso(),
    status: "running",
    ...(summary ? { summary } : {}),
  };
  return db.runs.add(run);
}

export async function finishRun(
  runId: number,
  status: RunStatus,
  summary?: Record<string, unknown>,
): Promise<void> {
  const existing = await db.runs.get(runId);
  await db.runs.update(runId, {
    status,
    finishedAt: nowIso(),
    summary: { ...(existing?.summary ?? {}), ...(summary ?? {}) },
  });
}

export async function clearRuns(kind: RunKind): Promise<number> {
  return db.transaction("rw", db.runs, db.events, async () => {
    const runs = await db.runs.where("kind").equals(kind).toArray();
    const ids = runs.map((run) => run.id).filter((id): id is number => id !== undefined);
    if (ids.length === 0) return 0;
    await db.events.where("runId").anyOf(ids).delete();
    await db.runs.bulkDelete(ids);
    return ids.length;
  });
}

export async function getRun(runId: number): Promise<Run | undefined> {
  return db.runs.get(runId);
}

export async function listRuns(limit = 50): Promise<Run[]> {
  return db.runs.orderBy("startedAt").reverse().limit(limit).toArray();
}

export async function appendEvent(event: Omit<EngineEvent, "id">): Promise<number> {
  return db.events.add(event);
}

export async function listEventsForRun(runId: number): Promise<EngineEvent[]> {
  return db.events.where("runId").equals(runId).toArray();
}

export async function saveCapturedHtml(capture: Omit<CapturedHtml, "id">): Promise<number> {
  return db.capturedHtml.add(capture);
}

export async function listCapturedHtml(limit = 100): Promise<CapturedHtml[]> {
  return db.capturedHtml.orderBy("at").reverse().limit(limit).toArray();
}

export async function deleteCapturedHtml(id: number): Promise<void> {
  await db.capturedHtml.delete(id);
}

export async function getApplication(jobId: string): Promise<Application | undefined> {
  return db.applications.get(jobId);
}

export async function saveApplication(application: Application): Promise<void> {
  await db.applications.put(application);
}

export async function setApplicationStatus(
  jobId: string,
  status: ApplicationStatus,
): Promise<void> {
  await db.applications.update(jobId, { status });
}

export async function appendApplicationLog(
  jobId: string,
  entry: ApplicationLogEntry,
): Promise<void> {
  await db.transaction("rw", db.applications, async () => {
    const existing = await db.applications.get(jobId);
    if (!existing) return;
    await db.applications.put({ ...existing, log: [...existing.log, entry] });
  });
}

export async function getSavedAnswer(questionHash: string): Promise<SavedAnswer | undefined> {
  return db.savedAnswers.get(questionHash);
}

export async function findSavedAnswerForQuestion(
  questionText: string,
): Promise<SavedAnswer | undefined> {
  return getSavedAnswer(hashQuestion(questionText));
}

export async function putSavedAnswer(questionText: string, answer: string): Promise<SavedAnswer> {
  const record: SavedAnswer = {
    questionHash: hashQuestion(questionText),
    questionText,
    answer,
    lastUsedAt: nowIso(),
  };
  await db.savedAnswers.put(record);
  return record;
}

export async function listSavedAnswers(): Promise<SavedAnswer[]> {
  return db.savedAnswers.orderBy("lastUsedAt").reverse().toArray();
}

export async function touchSavedAnswer(questionHash: string): Promise<void> {
  await db.savedAnswers.update(questionHash, { lastUsedAt: nowIso() });
}

export async function listExperiences(): Promise<ExperienceEntry[]> {
  const entries = await db.experiences.toArray();
  return entries.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export async function getExperience(id: string): Promise<ExperienceEntry | undefined> {
  return db.experiences.get(id);
}

export async function nextExperienceOrder(): Promise<number> {
  const entries = await db.experiences.toArray();
  return entries.reduce((max, entry) => Math.max(max, entry.order), 0) + 1;
}

export async function saveExperience(entry: ExperienceEntry): Promise<ExperienceEntry> {
  const stamped = { ...entry, updatedAt: nowIso() };
  await db.experiences.put(stamped);
  return stamped;
}

export async function saveExperiences(entries: ExperienceEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const at = nowIso();
  await db.experiences.bulkPut(entries.map((entry) => ({ ...entry, updatedAt: at })));
}

export async function deleteExperience(id: string): Promise<void> {
  await db.experiences.delete(id);
}

export async function moveExperience(id: string, direction: -1 | 1): Promise<void> {
  await db.transaction("rw", db.experiences, async () => {
    const entries = await listExperiences();
    const index = entries.findIndex((entry) => entry.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) return;
    const moved = entries[index];
    const displaced = entries[target];
    if (!moved || !displaced) return;
    await db.experiences.put({ ...moved, order: displaced.order });
    await db.experiences.put({ ...displaced, order: moved.order });
  });
}

export async function getResumeSettings(): Promise<ResumeSettings> {
  const stored = await db.resumeSettings.get(defaultResumeSettings.id);
  if (stored) return stored;
  const seeded = withResumeSettingsVersion({ ...defaultResumeSettings, updatedAt: nowIso() });
  await db.resumeSettings.put(seeded);
  return seeded;
}

export async function saveResumeSettings(settings: ResumeSettings): Promise<ResumeSettings> {
  const versioned = withResumeSettingsVersion({ ...settings, updatedAt: nowIso() });
  await db.resumeSettings.put(versioned);
  return versioned;
}

export async function loadResumeBank(): Promise<ResumeBank> {
  const [entries, settings] = await Promise.all([listExperiences(), getResumeSettings()]);
  return { entries, settings };
}

function newestResumeFirst(left: TailoredResume, right: TailoredResume): number {
  return left.createdAt < right.createdAt ? 1 : -1;
}

export async function listTailoredResumes(): Promise<TailoredResume[]> {
  return (await db.tailoredResumes.toArray()).sort(newestResumeFirst);
}

export async function listTailoredResumesForJob(jobId: string): Promise<TailoredResume[]> {
  return (await db.tailoredResumes.where("jobId").equals(jobId).toArray()).sort(newestResumeFirst);
}

export async function latestTailoredResumeForJob(
  jobId: string,
): Promise<TailoredResume | undefined> {
  return (await listTailoredResumesForJob(jobId))[0];
}

export async function getTailoredResume(id: string): Promise<TailoredResume | undefined> {
  return db.tailoredResumes.get(id);
}

export async function saveTailoredResume(resume: TailoredResume): Promise<void> {
  await db.tailoredResumes.put(resume);
}

export async function setTailoredResumeLatex(id: string, editedLatex: string): Promise<void> {
  await db.tailoredResumes.update(id, { editedLatex, updatedAt: nowIso() });
}

export async function deleteTailoredResume(id: string): Promise<void> {
  await db.tailoredResumes.delete(id);
}
