import type { z } from "zod";
import type {
  applicationLogEntrySchema,
  applicationSchema,
  applicationStatusSchema,
  applyDocumentSlotSchema,
  applyPackageDocumentSchema,
  applyPackageSchema,
  applyStateSchema,
  documentOptionSchema,
  questionKindSchema,
  questionSchema,
  savedAnswerSchema,
} from "./schemas";

export type QuestionKind = z.infer<typeof questionKindSchema>;
export type Question = z.infer<typeof questionSchema>;
export type ApplyPackageDocument = z.infer<typeof applyPackageDocumentSchema>;
export type ApplyPackage = z.infer<typeof applyPackageSchema>;
export type DocumentOption = z.infer<typeof documentOptionSchema>;
export type ApplyDocumentSlot = z.infer<typeof applyDocumentSlotSchema>;
export type ApplyState = z.infer<typeof applyStateSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
export type ApplicationLogEntry = z.infer<typeof applicationLogEntrySchema>;
export type Application = z.infer<typeof applicationSchema>;
export type SavedAnswer = z.infer<typeof savedAnswerSchema>;
