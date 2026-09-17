import { z } from "zod";
import { downloadJson, timestampedFileName } from "@/components/shared/download";
import type { ExperienceEntry, SkillGroup } from "@/types/resume";
import { experienceEntrySchema, skillGroupSchema } from "@/types/schemas";

export interface BankFile {
  entries: ExperienceEntry[];
  skillGroups: SkillGroup[];
}

const entriesSchema = z.array(experienceEntrySchema);
const skillGroupsSchema = z.array(skillGroupSchema);

export function exportBank(bank: BankFile): void {
  downloadJson(timestampedFileName("resume-bank"), JSON.stringify(bank, null, 2));
}

export function parseBankFile(text: string): BankFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Expected an object with entries and skillGroups");
  }
  const record = raw as Record<string, unknown>;
  const entries = entriesSchema.safeParse(record.entries ?? []);
  if (!entries.success) {
    throw new Error(`entries did not match the schema: ${entries.error.issues[0]?.message ?? ""}`);
  }
  const skillGroups = skillGroupsSchema.safeParse(record.skillGroups ?? []);
  if (!skillGroups.success) {
    throw new Error(
      `skillGroups did not match the schema: ${skillGroups.error.issues[0]?.message ?? ""}`,
    );
  }
  return { entries: entries.data, skillGroups: skillGroups.data };
}
