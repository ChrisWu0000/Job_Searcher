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
