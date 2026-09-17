import type { z } from "zod";
import type {
  jobScoreSchema,
  scoreUsageSchema,
  scoreVerdictSchema,
  softNoteSchema,
} from "./schemas";

export type { Constraint, ConstraintKind, Profile, ReasoningEffort } from "./preferences";

export type ScoreVerdict = z.infer<typeof scoreVerdictSchema>;
export type SoftNote = z.infer<typeof softNoteSchema>;
export type ScoreUsage = z.infer<typeof scoreUsageSchema>;
export type JobScore = z.infer<typeof jobScoreSchema>;
