import { createWwClient, type WwClient } from "@/engines/wwClient";
import {
  getApplication,
  nextQueueOrder,
  saveApplication,
  setJobStatus,
  upsertJobs,
} from "@/lib/db/repo";
import type { Application } from "@/types/application";
import type { Job } from "@/types/job";

export async function queueJob(jobId: string): Promise<void> {
  const existing = await getApplication(jobId);
  const order = existing?.order ?? (await nextQueueOrder());
  const application: Application = existing
    ? { ...existing, status: "queued", order }
    : { jobId, status: "queued", answers: {}, log: [], order };
  await saveApplication(application);
  await setJobStatus(jobId, "queued");
}

export async function queueJobs(jobIds: string[]): Promise<void> {
  for (const jobId of jobIds) await queueJob(jobId);
}

export async function openJobInWaterlooWorks(
  jobId: string,
  client: WwClient = createWwClient(),
): Promise<void> {
  await client.ensureTab();
  if (!(await client.openJob(jobId))) throw new Error(`WaterlooWorks did not open job ${jobId}`);
}

export const noPostingOpenMessage =
  "Open a job posting in the WaterlooWorks tab first, then import it";

export async function importCurrentPosting(client: WwClient = createWwClient()): Promise<Job> {
  await client.ensureTab();
  const { kind } = await client.getPageKind();
  if (kind !== "posting" && kind !== "apply") throw new Error(noPostingOpenMessage);
  const job = await client.scrapeCurrentJob();
  await upsertJobs([job]);
  return job;
}
