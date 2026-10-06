import { parseHourlyPay } from "@/lib/ranking/pay";

const rangePattern =
  /(?:US\$|C\$|CA\$|\$)\s?(\d[\d,]*(?:\.\d+)?)\s?([kK])?\s*(?:CAD|USD)?\s*(?:-|–|—|to)\s*(?:US\$|C\$|CA\$|\$)?\s?(\d[\d,]*(?:\.\d+)?)\s?([kK])?(?:\s*(?:CAD|USD))?(?:\s*(?:\/|per\s+|an?\s+)?\s*(hour|hr|year|yr|annum|annually|month|week))?/i;

const payContext = /(?:pay|salary|compensation|wage|rate|range|stipend)/i;

function amount(value: string, suffix: string | undefined): number {
  return Number(value.replace(/,/g, "")) * (suffix ? 1000 : 1);
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdPay(html: string): string | undefined {
  const blocks = html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    const body = block[1];
    if (!body) continue;
    try {
      const found = findSalary(JSON.parse(body));
      if (found) return found;
    } catch {}
  }
  return undefined;
}

function findSalary(node: unknown): string | undefined {
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findSalary(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== "object" || node === null) return undefined;
  const record = node as Record<string, unknown>;
  const base = record.baseSalary;
  if (typeof base === "object" && base !== null) {
    const salary = base as Record<string, unknown>;
    const value = salary.value;
    const currency = typeof salary.currency === "string" ? salary.currency : "";
    if (typeof value === "object" && value !== null) {
      const range = value as Record<string, unknown>;
      const unit = typeof range.unitText === "string" ? range.unitText.toLowerCase() : "";
      const low = Number(range.minValue ?? range.value);
      const high = Number(range.maxValue);
      if (Number.isFinite(low) && low > 0) {
        const span = Number.isFinite(high) && high > low ? `${low}-${high}` : `${low}`;
        return `${currency} ${span}${unit ? `/${unit}` : ""}`.trim();
      }
    }
  }
  for (const value of Object.values(record)) {
    const found = findSalary(value);
    if (found) return found;
  }
  return undefined;
}

function looksLikePay(low: number, high: number, unit: string | undefined): boolean {
  const basis = unit?.toLowerCase();
  if (basis === "hour" || basis === "hr") return low >= 10 && high <= 500;
  return low >= 1000 && high <= 1_000_000;
}

export function payFromText(text: string): string | undefined {
  const hourly = parseHourlyPay(text);
  if (hourly) return hourly.original.trim();
  for (const match of text.matchAll(new RegExp(rangePattern.source, "gi"))) {
    const [full, lowText, lowK, highText, highK, unit] = match;
    if (!full || !lowText || !highText) continue;
    const low = amount(lowText, lowK);
    const high = amount(highText, highK);
    const before = text.slice(Math.max(0, (match.index ?? 0) - 120), match.index ?? 0);
    if (high < low) continue;
    const hourlyRange = /hour|hr/i.test(unit ?? "") || /per hour|hourly/i.test(before);
    if (!looksLikePay(low, high, hourlyRange ? "hour" : unit)) continue;
    if (!unit && !payContext.test(before)) continue;
    return full.trim();
  }
  return undefined;
}

export function payFromHtml(html: string): string | undefined {
  return jsonLdPay(html) ?? payFromText(stripHtml(html));
}
