import { createWwClient, type WwClient } from "@/engines/wwClient";
import { deleteCapturedHtml, saveCapturedHtml } from "@/lib/db/repo";
import { nowIso } from "@/lib/time";
import type { CapturedHtml } from "@/types/capture";
import { downloadHtml, timestampedFileName } from "./download";

export function fixtureFileName(kind: string): string {
  return timestampedFileName(kind, "html");
}

export function downloadFixture(capture: CapturedHtml): void {
  downloadHtml(fixtureFileName(capture.kind), capture.html);
}

export async function captureCurrentPageFixture(client: WwClient = createWwClient()): Promise<{
  id: number;
  kind: string;
  bytes: number;
}> {
  await client.ensureTab();
  const page = await client.captureHtml();
  if (page.html.length === 0) throw new Error("The WaterlooWorks tab returned an empty page");
  const id = await saveCapturedHtml({
    at: nowIso(),
    kind: page.kind,
    source: "manual",
    url: page.url,
    html: page.html,
    ...(page.jobId === undefined ? {} : { jobId: page.jobId }),
  });
  downloadHtml(fixtureFileName(page.kind), page.html);
  return { id, kind: page.kind, bytes: page.html.length };
}

export async function discardFixture(capture: CapturedHtml): Promise<void> {
  if (capture.id === undefined) return;
  await deleteCapturedHtml(capture.id);
}
