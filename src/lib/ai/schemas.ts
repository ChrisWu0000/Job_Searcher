import { z } from "zod";
import type { ResumeBank, TailoringResult } from "@/lib/resume/contracts";
import { checkGrounding } from "@/lib/resume/grounding";
import type { Profile } from "@/types/preferences";
import type {
  BulletChoice,
  EntryChoice,
  ExperienceBullet,
  ExperienceEntry,
  SkillChoice,
} from "@/types/resume";

export const verdictSoftNoteSchema = z.object({
  constraintId: z.string(),
  satisfied: z.boolean(),
  note: z.string(),
});

export const scoringVerdictSchema = z.object({
  score: z.number(),
  likelihood: z.number(),
  verdict: z.enum(["apply", "maybe", "skip"]),
  hardViolations: z.array(z.string()),
  softNotes: z.array(verdictSoftNoteSchema),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  summary: z.string(),
});

export type ScoringVerdict = z.infer<typeof scoringVerdictSchema>;

export const scoringVerdictSchemaName = "job_scoring_verdict";

export const scoringVerdictJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "likelihood",
    "verdict",
    "hardViolations",
    "softNotes",
    "strengths",
    "gaps",
    "summary",
  ],
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    likelihood: { type: "number", minimum: 0, maximum: 100 },
    verdict: { type: "string", enum: ["apply", "maybe", "skip"] },
    hardViolations: { type: "array", items: { type: "string" } },
    softNotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["constraintId", "satisfied", "note"],
        properties: {
          constraintId: { type: "string" },
          satisfied: { type: "boolean" },
          note: { type: "string" },
        },
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

export type VerdictParseResult =
  | { ok: true; verdict: ScoringVerdict }
  | { ok: false; error: string };

const fencedBlockPattern = /```(?:json|jsonc)?\s*([\s\S]*?)```/i;

export function extractJsonObject(text: string): string | undefined {
  const fenced = fencedBlockPattern.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  return candidate.slice(start, end + 1);
}

export function parseVerdict(text: string): VerdictParseResult {
  const jsonText = extractJsonObject(text);
  if (jsonText === undefined) return { ok: false, error: "No JSON object found in the response." };
  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonText);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `Response was not valid JSON: ${message}` };
  }
  const parsed = scoringVerdictSchema.safeParse(decoded);
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error) };
  return { ok: true, verdict: parsed.data };
}

export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function firstSentences(text: string, count: number): string {
  const trimmed = text.trim();
  if (trimmed === "") return trimmed;
  const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!sentences) return trimmed;
  return sentences
    .slice(0, count)
    .map((sentence) => sentence.trim())
    .join(" ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))];
}

export function normalizeVerdict(verdict: ScoringVerdict, profile: Profile): ScoringVerdict {
  const knownIds = new Set(profile.constraints.map((constraint) => constraint.id));
  const hardViolations = uniqueStrings(verdict.hardViolations).filter((id) => knownIds.has(id));
  const softNotes = verdict.softNotes.filter((note) => knownIds.has(note.constraintId));
  const violated = hardViolations.length > 0;
  return {
    score: violated ? 0 : clampScore(verdict.score),
    likelihood: violated ? 0 : clampScore(verdict.likelihood),
    verdict: violated ? "skip" : verdict.verdict,
    hardViolations,
    softNotes,
    strengths: uniqueStrings(verdict.strengths),
    gaps: uniqueStrings(verdict.gaps),
    summary: firstSentences(verdict.summary, 2),
  };
}

export const tailoringBulletSchema = z.object({
  bulletId: z.string(),
  text: z.string().nullable(),
});

export const tailoringEntrySchema = z.object({
  experienceId: z.string(),
  bullets: z.array(tailoringBulletSchema),
});

export const tailoringSkillSchema = z.object({
  groupId: z.string(),
  items: z.array(z.string()),
});

export const tailoringOutputSchema = z.object({
  entries: z.array(tailoringEntrySchema),
  skills: z.array(tailoringSkillSchema),
  rationale: z.string(),
});

export type TailoringOutput = z.infer<typeof tailoringOutputSchema>;

export const tailoringSchemaName = "resume_tailoring";

export const tailoringJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["entries", "skills", "rationale"],
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["experienceId", "bullets"],
        properties: {
          experienceId: { type: "string" },
          bullets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["bulletId", "text"],
              properties: {
                bulletId: { type: "string" },
                text: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["groupId", "items"],
        properties: {
          groupId: { type: "string" },
          items: { type: "array", items: { type: "string" } },
        },
      },
    },
    rationale: { type: "string" },
  },
};

export type TailoringParseResult =
  | { ok: true; output: TailoringOutput }
  | { ok: false; error: string };

export function parseTailoring(text: string): TailoringParseResult {
  const jsonText = extractJsonObject(text);
  if (jsonText === undefined) return { ok: false, error: "No JSON object found in the response." };
  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonText);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `Response was not valid JSON: ${message}` };
  }
  const parsed = tailoringOutputSchema.safeParse(decoded);
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error) };
  return { ok: true, output: parsed.data };
}

export const rewriteLengthFactor = 2;
export const rewriteLengthSlack = 40;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

interface ChosenBullet {
  bullet: ExperienceBullet;
  text: string | null;
}

interface PlannedEntry {
  entry: ExperienceEntry;
  bullets: ChosenBullet[];
}

function chooseBullets(
  entry: ExperienceEntry,
  requested: TailoringOutput["entries"][number],
): ChosenBullet[] {
  const byId = new Map(entry.bullets.map((bullet) => [bullet.id, bullet]));
  const requestedById = new Map<string, string | null>();
  for (const choice of requested.bullets) {
    if (!byId.has(choice.bulletId) || requestedById.has(choice.bulletId)) continue;
    requestedById.set(choice.bulletId, choice.text);
  }

  const pinned = entry.bullets.filter((bullet) => bullet.pinned);
  const ordered: ChosenBullet[] = pinned.map((bullet) => ({
    bullet,
    text: requestedById.get(bullet.id) ?? null,
  }));
  const taken = new Set(pinned.map((bullet) => bullet.id));
  for (const [bulletId, text] of requestedById) {
    if (taken.has(bulletId)) continue;
    const bullet = byId.get(bulletId);
    if (!bullet) continue;
    taken.add(bulletId);
    ordered.push({ bullet, text });
  }
  return ordered;
}

function fallbackBullets(entry: ExperienceEntry, maxBullets: number): ChosenBullet[] {
  const pinned = entry.bullets.filter((bullet) => bullet.pinned);
  const source = pinned.length > 0 ? pinned : entry.bullets;
  return source.slice(0, maxBullets).map((bullet) => ({ bullet, text: null }));
}

function planEntries(output: TailoringOutput, bank: ResumeBank): PlannedEntry[] {
  const byId = new Map(bank.entries.map((entry) => [entry.id, entry]));
  const { maxBulletsPerEntry, maxEntriesPerSection, sectionOrder } = bank.settings;

  const chosen: PlannedEntry[] = [];
  const seen = new Set<string>();
  for (const requested of output.entries) {
    const entry = byId.get(requested.experienceId);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    chosen.push({ entry, bullets: chooseBullets(entry, requested).slice(0, maxBulletsPerEntry) });
  }

  for (const entry of bank.entries) {
    if (!entry.pinned || seen.has(entry.id)) continue;
    seen.add(entry.id);
    chosen.push({ entry, bullets: fallbackBullets(entry, maxBulletsPerEntry) });
  }

  const kinds = [...new Set([...sectionOrder, ...chosen.map((planned) => planned.entry.kind)])];
  const capped: PlannedEntry[] = [];
  for (const kind of kinds) {
    const ofKind = chosen.filter((planned) => planned.entry.kind === kind);
    const keep = new Set<PlannedEntry>();
    for (const planned of ofKind) {
      if (keep.size >= maxEntriesPerSection) break;
      if (planned.entry.pinned) keep.add(planned);
    }
    for (const planned of ofKind) {
      if (keep.size >= maxEntriesPerSection) break;
      keep.add(planned);
    }
    for (const planned of ofKind) {
      if (keep.has(planned)) capped.push(planned);
    }
  }
  return capped;
}

function resolveBullet(
  entry: ExperienceEntry,
  chosen: ChosenBullet,
  notes: string[],
): BulletChoice {
  const original = chosen.bullet.text;
  const proposed = chosen.text;
  const label = `[${entry.id}/${chosen.bullet.id}]`;
  const keepOriginal: BulletChoice = {
    bulletId: chosen.bullet.id,
    text: original,
    rewritten: false,
  };
  if (proposed === null || proposed.trim() === "") return keepOriginal;
  const candidate = collapseWhitespace(proposed);
  if (candidate === collapseWhitespace(original)) return keepOriginal;
  const cap = original.length * rewriteLengthFactor + rewriteLengthSlack;
  if (candidate.length > cap) {
    notes.push(
      `${label} rewrite reverted: rewrite is ${candidate.length} characters, over the ${cap} character cap`,
    );
    return keepOriginal;
  }
  const grounding = checkGrounding(candidate, entry);
  if (!grounding.ok) {
    notes.push(`${label} rewrite reverted: ${grounding.reason ?? "not grounded in the entry"}`);
    return keepOriginal;
  }
  return { bulletId: chosen.bullet.id, text: candidate, rewritten: true };
}

function allSkills(bank: ResumeBank): SkillChoice[] {
  return bank.settings.skillGroups
    .filter((group) => group.items.length > 0)
    .map((group) => ({ groupId: group.id, items: [...group.items] }));
}

function resolveSkills(output: TailoringOutput, bank: ResumeBank, notes: string[]): SkillChoice[] {
  if (output.skills.length === 0) return allSkills(bank);

  const groupIds = new Set(bank.settings.skillGroups.map((group) => group.id));
  const requested = new Map<string, string[]>();
  for (const choice of output.skills) {
    if (!groupIds.has(choice.groupId)) {
      notes.push(`[${choice.groupId}] unknown skill group ignored`);
      continue;
    }
    if (requested.has(choice.groupId)) continue;
    requested.set(choice.groupId, choice.items);
  }

  const resolved: SkillChoice[] = [];
  for (const group of bank.settings.skillGroups) {
    const items = requested.get(group.id);
    if (items === undefined) continue;
    const canonical = new Map(group.items.map((item) => [item.toLowerCase(), item]));
    const kept: string[] = [];
    for (const item of items) {
      const match = canonical.get(item.trim().toLowerCase());
      if (match === undefined) {
        notes.push(`[${group.id}] unknown skill dropped: ${item.trim()}`);
        continue;
      }
      if (kept.includes(match)) continue;
      kept.push(match);
    }
    if (kept.length === 0) continue;
    resolved.push({ groupId: group.id, items: kept });
  }
  return resolved;
}

export function normalizeTailoring(output: TailoringOutput, bank: ResumeBank): TailoringResult {
  const groundingNotes: string[] = [];
  const entries: EntryChoice[] = planEntries(output, bank).map((planned) => ({
    experienceId: planned.entry.id,
    bullets: planned.bullets.map((chosen) => resolveBullet(planned.entry, chosen, groundingNotes)),
  }));
  const skills = resolveSkills(output, bank, groundingNotes);
  return {
    selection: { entries, skills, rationale: firstSentences(output.rationale, 3) },
    groundingNotes,
  };
}
