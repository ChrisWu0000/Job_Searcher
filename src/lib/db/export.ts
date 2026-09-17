import { z } from "zod";
import { nowIso } from "@/lib/time";
import {
  applicationSchema,
  capturedHtmlSchema,
  engineEventSchema,
  experienceEntrySchema,
  jobSchema,
  jobScoreSchema,
  profileSchema,
  resumeSettingsSchema,
  runSchema,
  savedAnswerSchema,
  tailoredResumeSchema,
} from "@/types/schemas";
import { db, schemaVersion, type TableName, tableNames } from "./db";

export const exportFormatVersion = schemaVersion;

const tableSchemas = {
  jobs: jobSchema,
  jobScores: jobScoreSchema,
  applications: applicationSchema,
  savedAnswers: savedAnswerSchema,
  runs: runSchema,
  events: engineEventSchema,
  preferences: profileSchema,
  capturedHtml: capturedHtmlSchema,
  experiences: experienceEntrySchema,
  resumeSettings: resumeSettingsSchema,
  tailoredResumes: tailoredResumeSchema,
} satisfies Record<TableName, z.ZodType>;

export const databaseExportSchema = z.object({
  formatVersion: z.number().int(),
  exportedAt: z.string(),
  tables: z.object({
    jobs: z.array(jobSchema),
    jobScores: z.array(jobScoreSchema),
    applications: z.array(applicationSchema),
    savedAnswers: z.array(savedAnswerSchema),
    runs: z.array(runSchema),
    events: z.array(engineEventSchema),
    preferences: z.array(profileSchema),
    capturedHtml: z.array(capturedHtmlSchema).default([]),
    experiences: z.array(experienceEntrySchema).default([]),
    resumeSettings: z.array(resumeSettingsSchema).default([]),
    tailoredResumes: z.array(tailoredResumeSchema).default([]),
  }),
});

export type DatabaseExport = z.infer<typeof databaseExportSchema>;

export type ImportCounts = Record<TableName, number>;

export async function exportAll(): Promise<DatabaseExport> {
  const [
    jobs,
    jobScores,
    applications,
    savedAnswers,
    runs,
    events,
    preferences,
    capturedHtml,
    experiences,
    resumeSettings,
    tailoredResumes,
  ] = await Promise.all([
    db.jobs.toArray(),
    db.jobScores.toArray(),
    db.applications.toArray(),
    db.savedAnswers.toArray(),
    db.runs.toArray(),
    db.events.toArray(),
    db.preferences.toArray(),
    db.capturedHtml.toArray(),
    db.experiences.toArray(),
    db.resumeSettings.toArray(),
    db.tailoredResumes.toArray(),
  ]);
  return {
    formatVersion: exportFormatVersion,
    exportedAt: nowIso(),
    tables: {
      jobs,
      jobScores,
      applications,
      savedAnswers,
      runs,
      events,
      preferences,
      capturedHtml,
      experiences,
      resumeSettings,
      tailoredResumes,
    },
  };
}

export async function exportAllAsJson(): Promise<string> {
  return JSON.stringify(await exportAll(), null, 2);
}

export function parseDatabaseExport(payload: unknown): DatabaseExport {
  return databaseExportSchema.parse(payload);
}

export async function importAll(payload: unknown): Promise<ImportCounts> {
  const parsed = parseDatabaseExport(payload);
  const counts = {
    jobs: 0,
    jobScores: 0,
    applications: 0,
    savedAnswers: 0,
    runs: 0,
    events: 0,
    preferences: 0,
    capturedHtml: 0,
    experiences: 0,
    resumeSettings: 0,
    tailoredResumes: 0,
  } satisfies ImportCounts;

  await db.transaction(
    "rw",
    [
      db.jobs,
      db.jobScores,
      db.applications,
      db.savedAnswers,
      db.runs,
      db.events,
      db.preferences,
      db.capturedHtml,
      db.experiences,
      db.resumeSettings,
      db.tailoredResumes,
    ],
    async () => {
      for (const name of tableNames) {
        const rows = parsed.tables[name];
        if (rows.length === 0) continue;
        await db.table(name).bulkPut(rows);
        counts[name] = rows.length;
      }
    },
  );

  return counts;
}

export function validateTableRow(table: TableName, row: unknown): z.ZodSafeParseResult<unknown> {
  return tableSchemas[table].safeParse(row);
}
