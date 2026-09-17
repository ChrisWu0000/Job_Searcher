import { z } from "zod";

const fileName = z.string().regex(/^[a-zA-Z0-9_-]+$/);

export const savedResumeManifestSchema = z
  .array(
    z.object({
      jobId: z.string().min(1),
      company: z.string().min(1),
      title: z.string().min(1),
      stem: fileName,
      tailoringNote: z.string(),
    }),
  )
  .refine((resumes) => new Set(resumes.map((resume) => resume.jobId)).size === resumes.length, {
    message: "Each job must have one final resume",
  });

export type SavedResume = z.infer<typeof savedResumeManifestSchema>[number];

export function savedResumeUrl(resume: SavedResume, format: "pdf" | "tex" | "png") {
  return `./resumes/${format === "png" ? "previews/" : ""}${resume.stem}.${format}`;
}
