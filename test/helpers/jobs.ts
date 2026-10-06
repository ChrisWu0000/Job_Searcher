import type { Job, JobStub } from "@/types/job";

export function makeStub(id: string, overrides: Partial<JobStub> = {}): JobStub {
  return {
    id,
    company: `Company ${id}`,
    title: `Engineer ${id}`,
    location: "Toronto, ON",
    scrapedAt: "2026-09-06T14:00:00.000Z",
    ...overrides,
  };
}

export function makeJob(id: string, overrides: Partial<Job> = {}): Job {
  return {
    ...makeStub(id),
    application: {
      resume: true,
      gradeReport: false,
      coverLetter: false,
      otherDocuments: [],
      hasPrescreenQuestions: false,
    },
    rawText: `raw text for ${id}`,
    status: "new",
    ...overrides,
  };
}
