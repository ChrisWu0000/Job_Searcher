const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function stableHash(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  let secondary = 0x9dc5811c;
  for (let index = input.length - 1; index >= 0; index -= 1) {
    secondary ^= input.charCodeAt(index);
    secondary = Math.imul(secondary, FNV_PRIME) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}${secondary.toString(16).padStart(8, "0")}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`);
  return `{${entries.join(",")}}`;
}

export function stableObjectHash(value: unknown): string {
  return stableHash(stableStringify(value));
}

export function normalizeQuestionText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function hashQuestion(text: string): string {
  return stableHash(normalizeQuestionText(text));
}
