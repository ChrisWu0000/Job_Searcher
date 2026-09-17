import type { z } from "zod";
import type {
  jobApplicationRequirementsSchema,
  jobSchema,
  jobStatusSchema,
  jobStubSchema,
  pageKindSchema,
  resultRowSchema,
  workArrangementSchema,
} from "./schemas";

export type PageKind = z.infer<typeof pageKindSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type WorkArrangement = z.infer<typeof workArrangementSchema>;
export type JobApplicationRequirements = z.infer<typeof jobApplicationRequirementsSchema>;
export type JobStub = z.infer<typeof jobStubSchema>;
export type ResultRow = z.infer<typeof resultRowSchema>;
export type Job = z.infer<typeof jobSchema>;
