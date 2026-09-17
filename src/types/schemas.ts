import { z } from "zod";

export const pageKindSchema = z.enum(["results", "posting", "apply", "login", "other"]);

export const jobStatusSchema = z.enum([
  "new",
  "skipped",
  "interested",
  "queued",
  "applied",
  "error",
]);

export const workArrangementSchema = z.enum(["remote", "hybrid", "in-person"]);

export const jobStubSchema = z.object({
  id: z.string().min(1),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  deadline: z.string().optional(),
  openings: z.number().int().nonnegative().optional(),
  scrapedAt: z.string(),
});

export const jobApplicationRequirementsSchema = z.object({
  deadline: z.string().optional(),
  resume: z.boolean(),
  gradeReport: z.boolean(),
  coverLetter: z.boolean(),
  otherDocuments: z.array(z.string()),
  hasPrescreenQuestions: z.boolean(),
});

export const resultRowSchema = jobStubSchema.extend({
  division: z.string().optional(),
  level: z.string().optional(),
  applicationCount: z.number().int().nonnegative().optional(),
  canApply: z.boolean().optional(),
  hasApplication: z.boolean().optional(),
  viewed: z.boolean().optional(),
  isNew: z.boolean().optional(),
});

export const jobSchema = jobStubSchema.extend({
  division: z.string().optional(),
  level: z.string().optional(),
  applicationCount: z.number().int().nonnegative().optional(),
  canApply: z.boolean().optional(),
  hasApplication: z.boolean().optional(),
  viewed: z.boolean().optional(),
  isNew: z.boolean().optional(),
  workTerm: z.string().optional(),
  jobType: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  specialRequirements: z.string().optional(),
  additionalArrangementInfo: z.string().optional(),
  applicationMethod: z.string().optional(),
  internalStatus: z.string().optional(),
  tags: z.array(z.string()).optional(),
  fields: z.record(z.string(), z.string()).optional(),
  prescreenText: z.string().optional(),
  firstSeenAt: z.string().optional(),
  arrangement: workArrangementSchema.optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  durationMonths: z.number().optional(),
  compensation: z.string().optional(),
  summary: z.string().optional(),
  responsibilities: z.string().optional(),
  qualifications: z.string().optional(),
  targetedPrograms: z.array(z.string()).optional(),
  application: jobApplicationRequirementsSchema,
  rawText: z.string(),
  detailScrapedAt: z.string().optional(),
  status: jobStatusSchema,
  score: z.number().optional(),
  notes: z.string().optional(),
});

export const questionKindSchema = z.enum(["text", "textarea", "select", "checkbox", "radio"]);

export const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: questionKindSchema,
  options: z.array(z.string()).optional(),
  required: z.boolean(),
});

export const applyPackageDocumentSchema = z.object({
  kind: z.string(),
  name: z.string(),
});

export const applyPackageSchema = z.object({
  id: z.string(),
  name: z.string(),
  documents: z.array(applyPackageDocumentSchema),
});

export const documentOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const applyDocumentSlotSchema = z.object({
  kind: z.string(),
  required: z.boolean(),
  options: z.array(documentOptionSchema),
  selectedId: z.string().optional(),
});

export const applyStateSchema = z.object({
  packages: z.array(applyPackageSchema),
  selectedPackageId: z.string().optional(),
  documents: z.array(applyDocumentSlotSchema),
  questions: z.array(questionSchema),
  canSubmit: z.boolean(),
  submitted: z.boolean(),
});

export const applicationStatusSchema = z.enum([
  "queued",
  "in-progress",
  "paused",
  "submitted",
  "failed",
  "cancelled",
]);

export const applicationLogEntrySchema = z.object({
  at: z.string(),
  step: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
});

export const applicationSchema = z.object({
  jobId: z.string(),
  status: applicationStatusSchema,
  packageId: z.string().optional(),
  answers: z.record(z.string(), z.string()),
  log: z.array(applicationLogEntrySchema),
  submittedAt: z.string().optional(),
  order: z.number().optional(),
});

export const savedAnswerSchema = z.object({
  questionHash: z.string(),
  questionText: z.string(),
  answer: z.string(),
  lastUsedAt: z.string(),
});

export const constraintKindSchema = z.enum(["hard", "soft"]);

export const constraintSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: constraintKindSchema,
  weight: z.number().int().min(1).max(5),
});

export const reasoningEffortSchema = z.enum(["low", "medium", "high"]);

export const unknownPayPolicySchema = z.enum(["llm", "reject"]);

export const profileSchema = z.object({
  id: z.literal("me"),
  resumeText: z.string(),
  reach: z.string(),
  constraints: z.array(constraintSchema),
  payFloors: z.record(z.string(), z.number()),
  unknownPay: unknownPayPolicySchema,
  model: z.string(),
  reasoningEffort: reasoningEffortSchema,
  version: z.string(),
});

export const scoreVerdictSchema = z.enum(["apply", "maybe", "skip"]);

export const softNoteSchema = z.object({
  constraintId: z.string(),
  satisfied: z.boolean(),
  note: z.string(),
});

export const scoreUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  costUsd: z.number(),
});

export const jobScoreSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  profileVersion: z.string(),
  score: z.number().min(0).max(100),
  likelihood: z.number().min(0).max(100),
  verdict: scoreVerdictSchema,
  hardViolations: z.array(z.string()),
  softNotes: z.array(softNoteSchema),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  summary: z.string(),
  model: z.string(),
  usage: scoreUsageSchema,
  prompt: z.string(),
  rawResponse: z.string(),
  scoredAt: z.string(),
});

export const runKindSchema = z.enum(["sync", "score", "apply", "resume"]);

export const runStatusSchema = z.enum(["running", "done", "stopped", "failed"]);

export const runSchema = z.object({
  id: z.number().int().optional(),
  kind: runKindSchema,
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: runStatusSchema,
  summary: z.record(z.string(), z.unknown()).optional(),
});

export const capturedHtmlSourceSchema = z.enum(["error", "manual"]);

export const capturedHtmlSchema = z.object({
  id: z.number().int().optional(),
  at: z.string(),
  kind: pageKindSchema,
  source: capturedHtmlSourceSchema,
  url: z.string().optional(),
  jobId: z.string().optional(),
  step: z.string().optional(),
  html: z.string(),
});

export const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const engineNameSchema = z.enum(["sync", "score", "apply", "resume", "system"]);

export const engineEventSchema = z.object({
  id: z.number().int().optional(),
  runId: z.number().int().optional(),
  at: z.string(),
  level: logLevelSchema,
  engine: engineNameSchema,
  message: z.string(),
  data: z.unknown().optional(),
});

export const experienceKindSchema = z.enum(["work", "project", "education", "leadership", "award"]);

export const experienceBulletSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  tags: z.array(z.string()),
  pinned: z.boolean(),
});

export const experienceEntrySchema = z.object({
  id: z.string().min(1),
  kind: experienceKindSchema,
  title: z.string(),
  organization: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  link: z.string().optional(),
  technologies: z.array(z.string()),
  facts: z.array(z.string()),
  bullets: z.array(experienceBulletSchema),
  pinned: z.boolean(),
  order: z.number(),
  updatedAt: z.string(),
});

export const skillGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  items: z.array(z.string()),
});

export const latexSnippetsSchema = z.object({
  document: z.string(),
  section: z.string(),
  entry: z.string(),
  project: z.string(),
  bullet: z.string(),
  skills: z.string(),
  skillGroup: z.string(),
});

export const resumeSettingsSchema = z.object({
  id: z.literal("me"),
  snippets: latexSnippetsSchema,
  sectionOrder: z.array(experienceKindSchema),
  sectionTitles: z.record(z.string(), z.string()),
  skillsTitle: z.string(),
  skillGroups: z.array(skillGroupSchema),
  maxBulletsPerEntry: z.number().int().min(1),
  maxEntriesPerSection: z.number().int().min(1),
  tailoringInstructions: z.string(),
  version: z.string(),
  updatedAt: z.string(),
});

export const bulletChoiceSchema = z.object({
  bulletId: z.string(),
  text: z.string(),
  rewritten: z.boolean(),
});

export const entryChoiceSchema = z.object({
  experienceId: z.string(),
  bullets: z.array(bulletChoiceSchema),
});

export const skillChoiceSchema = z.object({
  groupId: z.string(),
  items: z.array(z.string()),
});

export const resumeSelectionSchema = z.object({
  entries: z.array(entryChoiceSchema),
  skills: z.array(skillChoiceSchema),
  rationale: z.string(),
});

export const tailoringSourceSchema = z.enum(["local", "model"]);

export const tailoredResumeSchema = z.object({
  id: z.string().min(1),
  jobId: z.string(),
  company: z.string(),
  title: z.string(),
  bankVersion: z.string(),
  source: tailoringSourceSchema,
  model: z.string(),
  usage: scoreUsageSchema,
  selection: resumeSelectionSchema,
  latex: z.string(),
  editedLatex: z.string().optional(),
  groundingNotes: z.array(z.string()),
  prompt: z.string(),
  rawResponse: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
