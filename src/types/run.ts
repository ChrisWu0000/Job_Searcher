import type { z } from "zod";
import type {
  engineEventSchema,
  engineNameSchema,
  logLevelSchema,
  runKindSchema,
  runSchema,
  runStatusSchema,
} from "./schemas";

export type RunKind = z.infer<typeof runKindSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type Run = z.infer<typeof runSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
export type EngineName = z.infer<typeof engineNameSchema>;
export type EngineEvent = z.infer<typeof engineEventSchema>;
