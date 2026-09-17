import type { ExperienceEntry, ExperienceKind } from "@/types/resume";

export function swapAt<TItem>(items: TItem[], index: number, target: number): TItem[] {
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const moved = next[index];
  const displaced = next[target];
  if (moved === undefined || displaced === undefined) return items;
  next[index] = displaced;
  next[target] = moved;
  return next;
}

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function joinList(items: string[]): string {
  return items.join(", ");
}

export function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function entryDates(entry: ExperienceEntry): string {
  const start = entry.startDate?.trim() ?? "";
  const end = entry.endDate?.trim() ?? "";
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

export function newExperienceEntry(kind: ExperienceKind, order: number): ExperienceEntry {
  return {
    id: `${kind}-${crypto.randomUUID()}`,
    kind,
    title: "",
    technologies: [],
    facts: [],
    bullets: [],
    pinned: false,
    order,
    updatedAt: new Date().toISOString(),
  };
}

export function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
