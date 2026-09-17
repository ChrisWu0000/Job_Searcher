import { formatRelative, hoursUntil } from "@/lib/time";

export type DeadlineTone = "expired" | "urgent" | "soon" | "normal" | "unknown";

export const deadlineToneClasses: Record<DeadlineTone, string> = {
  expired: "text-muted-foreground line-through",
  urgent: "text-destructive font-medium",
  soon: "text-amber-600 dark:text-amber-400 font-medium",
  normal: "text-foreground",
  unknown: "text-muted-foreground",
};

export function deadlineTone(deadline: string | undefined, from: Date = new Date()): DeadlineTone {
  if (!deadline) return "unknown";
  const hours = hoursUntil(deadline, from);
  if (hours === undefined) return "unknown";
  if (hours < 0) return "expired";
  if (hours < 24) return "urgent";
  if (hours < 72) return "soon";
  return "normal";
}

export function formatDeadline(deadline: string | undefined, from: Date = new Date()): string {
  if (!deadline) return "—";
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return deadline;
  return formatRelative(deadline, from);
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

const documentKindLabels: Record<string, string> = {
  resume: "Resume",
  coverLetter: "Cover letter",
  gradeReport: "Grade report",
  other: "Other document",
};

export function documentKindLabel(kind: string): string {
  return documentKindLabels[kind] ?? kind;
}

export function formatBytes(byteCount: number): string {
  if (byteCount < 1024) return `${byteCount} B`;
  if (byteCount < 1024 * 1024) return `${Math.round(byteCount / 1024)} KB`;
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(months: number | undefined): string {
  if (months === undefined) return "—";
  return months === 1 ? "1 month" : `${months} months`;
}

export function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

export function stringifyValue(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function prettyJsonText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}
