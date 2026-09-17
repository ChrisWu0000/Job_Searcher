import type { z } from "zod";
import type { capturedHtmlSchema, capturedHtmlSourceSchema } from "./schemas";

export type CapturedHtmlSource = z.infer<typeof capturedHtmlSourceSchema>;
export type CapturedHtml = z.infer<typeof capturedHtmlSchema>;
