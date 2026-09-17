import Dexie, { type Table } from "dexie";
import { withCurrentVersion } from "@/lib/ranking/profile";
import type { Application, SavedAnswer } from "@/types/application";
import type { CapturedHtml } from "@/types/capture";
import type { Job } from "@/types/job";
import { defaultProfile, type Profile } from "@/types/preferences";
import type { ExperienceEntry, ResumeSettings, TailoredResume } from "@/types/resume";
import type { EngineEvent, Run } from "@/types/run";
import type { JobScore } from "@/types/scoring";

export const databaseName = "wwpp";

export const schemaVersion = 4;

export const tableNames = [
  "jobs",
  "jobScores",
  "applications",
  "savedAnswers",
  "runs",
  "events",
  "preferences",
  "capturedHtml",
  "experiences",
  "resumeSettings",
  "tailoredResumes",
] as const;

export type TableName = (typeof tableNames)[number];

export class WwppDatabase extends Dexie {
  declare jobs: Table<Job, string>;
  declare jobScores: Table<JobScore, string>;
  declare applications: Table<Application, string>;
  declare savedAnswers: Table<SavedAnswer, string>;
  declare runs: Table<Run, number>;
  declare events: Table<EngineEvent, number>;
  declare preferences: Table<Profile, string>;
  declare capturedHtml: Table<CapturedHtml, number>;
  declare experiences: Table<ExperienceEntry, string>;
  declare resumeSettings: Table<ResumeSettings, string>;
  declare tailoredResumes: Table<TailoredResume, string>;

  constructor(name: string = databaseName) {
    super(name);
    this.version(1).stores({
      jobs: "id, company, status, score, deadline, detailScrapedAt",
      jobScores: "id, jobId, profileVersion, verdict, scoredAt",
      applications: "jobId, status, submittedAt",
      savedAnswers: "questionHash, lastUsedAt",
      runs: "++id, kind, startedAt",
      events: "++id, runId, at, level",
      preferences: "id",
    });
    this.version(2)
      .stores({
        applications: "jobId, status, submittedAt, order",
        capturedHtml: "++id, at, kind, source, jobId",
      })
      .upgrade(async (transaction) => {
        let order = 0;
        await transaction
          .table<Application, string>("applications")
          .toCollection()
          .modify((application) => {
            order += 1;
            if (application.order === undefined) application.order = order;
          });
      });
    this.version(3).stores({
      experiences: "id, kind, order, updatedAt",
      resumeSettings: "id",
      tailoredResumes: "id, jobId, bankVersion, source, createdAt",
    });
    this.version(4)
      .stores({})
      .upgrade(async (transaction) => {
        await transaction
          .table<Profile, string>("preferences")
          .toCollection()
          .modify((profile) => {
            const updatedIds = new Set([
              "no-hw",
              "no-nonswe",
              "software",
              "ca-pay",
              "us-pay",
              "pay-disclosure",
              "ca-value",
            ]);
            const constraints = [
              ...profile.constraints.filter((constraint) => !updatedIds.has(constraint.id)),
              ...defaultProfile.constraints.filter((constraint) => updatedIds.has(constraint.id)),
            ];
            Object.assign(
              profile,
              withCurrentVersion({
                ...profile,
                constraints,
                payFloors: { ...profile.payFloors, CAD: 60, USD: 50 },
                unknownPay: "reject",
              }),
            );
          });
      });
  }
}

export const db = new WwppDatabase();

export function tableByName(name: TableName): Table<unknown, unknown> {
  return db.table(name);
}
