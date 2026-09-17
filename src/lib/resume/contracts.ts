import type { Job } from "@/types/job";
import type {
  ExperienceEntry,
  ResumeSelection,
  ResumeSettings,
  TailoredResume,
} from "@/types/resume";

export interface ResumeBank {
  entries: ExperienceEntry[];
  settings: ResumeSettings;
}

export interface RenderResumeInput {
  bank: ResumeBank;
  selection: ResumeSelection;
}

export interface GroundingCheck {
  ok: boolean;
  reason?: string;
}

export interface TailoringResult {
  selection: ResumeSelection;
  groundingNotes: string[];
}

export interface TailoringInput {
  job: Job;
  bank: ResumeBank;
}

export type RenderResume = (input: RenderResumeInput) => string;
export type SelectForJob = (input: TailoringInput) => ResumeSelection;
export type LatexOf = (resume: TailoredResume) => string;
