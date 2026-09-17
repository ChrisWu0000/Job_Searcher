export function downloadText(fileName: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(fileName: string, json: string): void {
  downloadText(fileName, json, "application/json");
}

export function downloadHtml(fileName: string, html: string): void {
  downloadText(fileName, html, "text/html");
}

export function timestampedFileName(prefix: string, extension = "json"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.${extension}`;
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
