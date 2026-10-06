export function nowIso(): string {
  return new Date().toISOString();
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; milliseconds: number }[] = [
  { unit: "year", milliseconds: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", milliseconds: 30 * 24 * 60 * 60 * 1000 },
  { unit: "day", milliseconds: 24 * 60 * 60 * 1000 },
  { unit: "hour", milliseconds: 60 * 60 * 1000 },
  { unit: "minute", milliseconds: 60 * 1000 },
  { unit: "second", milliseconds: 1000 },
];

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelative(isoTimestamp: string, from: Date = new Date()): string {
  const target = new Date(isoTimestamp).getTime();
  if (Number.isNaN(target)) return "unknown";
  const deltaMilliseconds = target - from.getTime();
  for (const { unit, milliseconds } of RELATIVE_UNITS) {
    if (Math.abs(deltaMilliseconds) >= milliseconds) {
      return relativeFormatter.format(Math.round(deltaMilliseconds / milliseconds), unit);
    }
  }
  return relativeFormatter.format(0, "second");
}

export function hoursUntil(isoTimestamp: string, from: Date = new Date()): number | undefined {
  const target = new Date(isoTimestamp).getTime();
  if (Number.isNaN(target)) return undefined;
  return (target - from.getTime()) / (60 * 60 * 1000);
}

export function postedAtIso(value: unknown, now: Date = new Date()): string | undefined {
  let date: Date | undefined;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    date = new Date(value < 1e11 ? value * 1000 : value);
  } else if (typeof value === "string" && value.trim() !== "") {
    const relative = value.match(/(\d+)\+?\s*days?\s+ago/i);
    if (relative?.[1]) {
      date = new Date(now.getTime() - Number(relative[1]) * 86_400_000);
    } else if (/today|just posted/i.test(value)) {
      date = now;
    } else if (/yesterday/i.test(value)) {
      date = new Date(now.getTime() - 86_400_000);
    } else if (/^\d{9,13}$/.test(value.trim())) {
      return postedAtIso(Number(value.trim()), now);
    } else {
      date = new Date(value);
    }
  }
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
}
