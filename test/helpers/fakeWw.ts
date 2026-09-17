import type {
  CapturedPage,
  FetchedResults,
  PageKindResult,
  ResultsPage,
  SubmitResult,
  WwClient,
} from "@/engines/wwClient";
import { MessagingError } from "@/lib/messaging/client";
import { nowIso } from "@/lib/time";
import type { ApplyState, Job, JobStub, PageKind, Question } from "@/types";

export interface FakeCall {
  name: string;
  args: unknown[];
}

export interface FakeWwOptions {
  resultPages?: JobStub[][];
  jobs?: Job[];
  applyStates?: Record<string, ApplyState>;
  pageKind?: PageKind;
  tabId?: number;
  failOpenJobIds?: string[];
  failScrapeJobIds?: string[];
  failSubmitJobIds?: string[];
  tabClosedOnCall?: string[];
  navigationFails?: boolean;
  directMode?: boolean;
}

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

export function makeApplyState(overrides: Partial<ApplyState> = {}): ApplyState {
  return {
    packages: [
      { id: "pkg-1", name: "Default package", documents: [{ kind: "resume", name: "Resume.pdf" }] },
      { id: "pkg-2", name: "Backup package", documents: [] },
    ],
    documents: [
      {
        kind: "resume",
        required: true,
        options: [
          { id: "doc-1", name: "Resume.pdf" },
          { id: "doc-2", name: "Resume-old.pdf" },
        ],
      },
      { kind: "cover letter", required: false, options: [{ id: "doc-3", name: "Cover.pdf" }] },
    ],
    questions: [],
    canSubmit: false,
    submitted: false,
    ...overrides,
  };
}

export function makeQuestion(id: string, text: string): Question {
  return { id, text, kind: "text", required: true };
}

export class FakeWw implements WwClient {
  readonly calls: FakeCall[] = [];
  readonly checkpoints = new Map<string, unknown>();
  readonly submittedJobIds: string[] = [];
  pageKind: PageKind;
  currentJobId: string | undefined;
  pageIndex = 0;
  failOpenJobIds: Set<string>;
  failScrapeJobIds: Set<string>;
  failSubmitJobIds: Set<string>;
  tabClosedOnCall: Set<string>;
  navigationFails: boolean;
  directMode: boolean;

  private readonly resultPages: JobStub[][];
  private readonly jobs = new Map<string, Job>();
  private readonly applyStates = new Map<string, ApplyState>();
  private readonly tabId: number;

  constructor(options: FakeWwOptions = {}) {
    this.resultPages = options.resultPages ?? [];
    for (const job of options.jobs ?? []) this.jobs.set(job.id, job);
    for (const [jobId, state] of Object.entries(options.applyStates ?? {})) {
      this.applyStates.set(jobId, structuredClone(state));
    }
    this.pageKind = options.pageKind ?? "results";
    this.tabId = options.tabId ?? 7;
    this.failOpenJobIds = new Set(options.failOpenJobIds ?? []);
    this.failScrapeJobIds = new Set(options.failScrapeJobIds ?? []);
    this.failSubmitJobIds = new Set(options.failSubmitJobIds ?? []);
    this.tabClosedOnCall = new Set(options.tabClosedOnCall ?? []);
    this.navigationFails = options.navigationFails ?? false;
    this.directMode = options.directMode ?? false;
  }

  callNames(): string[] {
    return this.calls.map((call) => call.name);
  }

  countOf(name: string): number {
    return this.calls.filter((call) => call.name === name).length;
  }

  applyStateFor(jobId: string): ApplyState | undefined {
    const state = this.applyStates.get(jobId);
    return state ? structuredClone(state) : undefined;
  }

  private record(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args });
    if (this.tabClosedOnCall.has(name)) {
      throw new MessagingError({
        step: name,
        message: "Receiving end does not exist",
        code: "transport",
      });
    }
  }

  private currentApplyState(): ApplyState {
    const jobId = this.currentJobId;
    if (jobId === undefined) throw new Error("no posting is open");
    const existing = this.applyStates.get(jobId);
    if (existing) return existing;
    const created = makeApplyState({ packages: [], documents: [] });
    this.applyStates.set(jobId, created);
    return created;
  }

  private refreshCanSubmit(state: ApplyState): void {
    state.canSubmit =
      !state.submitted &&
      state.documents.every((slot) => !slot.required || slot.selectedId !== undefined);
  }

  async ensureTab(url?: string): Promise<number> {
    this.record("ensureTab", url);
    return this.tabId;
  }

  async getPageKind(): Promise<PageKindResult> {
    this.record("getPageKind");
    return { kind: this.pageKind, ...(this.currentJobId ? { jobId: this.currentJobId } : {}) };
  }

  async navigateToResults(): Promise<boolean> {
    this.record("navigateToResults");
    if (this.navigationFails) throw new Error("no way to the results table was found");
    this.pageKind = "results";
    this.currentJobId = undefined;
    return true;
  }

  async applyQuickFilters(): Promise<{ changed: boolean; active: string[] }> {
    this.record("applyQuickFilters");
    return { changed: false, active: ["My Program"] };
  }

  async scrapeResultsPage(): Promise<ResultsPage> {
    this.record("scrapeResultsPage");
    const stubs = this.resultPages[this.pageIndex] ?? [];
    return { stubs: structuredClone(stubs), pageNumber: this.pageIndex + 1 };
  }

  async nextResultsPage(): Promise<boolean> {
    this.record("nextResultsPage");
    if (this.pageIndex + 1 >= this.resultPages.length) return false;
    this.pageIndex += 1;
    return true;
  }

  async openJob(jobId: string): Promise<boolean> {
    this.record("openJob", jobId);
    if (this.failOpenJobIds.has(jobId)) throw new Error(`posting ${jobId} did not open`);
    this.currentJobId = jobId;
    this.pageKind = "posting";
    return true;
  }

  async getCurrentJobId(): Promise<string | undefined> {
    this.record("getCurrentJobId");
    return this.currentJobId;
  }

  async scrapeCurrentJob(): Promise<Job> {
    this.record("scrapeCurrentJob", this.currentJobId);
    const jobId = this.currentJobId;
    if (jobId === undefined) throw new Error("no posting is open");
    if (this.failScrapeJobIds.has(jobId)) throw new Error(`posting ${jobId} could not be parsed`);
    const job = this.jobs.get(jobId) ?? makeJob(jobId);
    return { ...structuredClone(job), detailScrapedAt: job.detailScrapedAt ?? nowIso() };
  }

  async startApplication(jobId: string): Promise<boolean> {
    this.record("startApplication", jobId);
    this.currentJobId = jobId;
    this.pageKind = "apply";
    this.refreshCanSubmit(this.currentApplyState());
    return true;
  }

  async getApplyState(): Promise<ApplyState> {
    this.record("getApplyState");
    const state = this.currentApplyState();
    this.refreshCanSubmit(state);
    return structuredClone(state);
  }

  async selectPackage(packageId: string): Promise<boolean> {
    this.record("selectPackage", packageId);
    const state = this.currentApplyState();
    state.selectedPackageId = packageId;
    return true;
  }

  async selectDocument(kind: string, documentId: string): Promise<boolean> {
    this.record("selectDocument", kind, documentId);
    const state = this.currentApplyState();
    const slot = state.documents.find((entry) => entry.kind === kind);
    if (!slot) throw new Error(`no document slot for ${kind}`);
    slot.selectedId = documentId;
    this.refreshCanSubmit(state);
    return true;
  }

  async getPrescreenQuestions(): Promise<Question[]> {
    this.record("getPrescreenQuestions");
    return structuredClone(this.currentApplyState().questions);
  }

  async submit(): Promise<SubmitResult> {
    const jobId = this.currentJobId;
    this.record("submit", jobId);
    if (jobId === undefined) throw new Error("no application is open");
    if (this.failSubmitJobIds.has(jobId)) return { submitted: false };
    const state = this.currentApplyState();
    state.submitted = true;
    state.canSubmit = false;
    this.submittedJobIds.push(jobId);
    return { submitted: true, confirmationText: `application submitted for ${jobId}` };
  }

  async highlight(selectorKey: string, label?: string, durationMs?: number): Promise<boolean> {
    this.record("highlight", selectorKey, label, durationMs);
    return true;
  }

  async fetchResults(page: number, itemsPerPage: number): Promise<FetchedResults> {
    this.record("fetchResults", page, itemsPerPage);
    if (!this.directMode) return { available: false, totalResults: 0, page, rows: [] };
    const all = this.resultPages.flat();
    const start = (page - 1) * itemsPerPage;
    const rows = all.slice(start, start + itemsPerPage).map((stub) => structuredClone(stub));
    return { available: true, totalResults: all.length, page, rows };
  }

  async fetchPosting(jobId: string): Promise<Job> {
    this.record("fetchPosting", jobId);
    if (this.failScrapeJobIds.has(jobId)) throw new Error(`posting ${jobId} could not be parsed`);
    const job = this.jobs.get(jobId) ?? makeJob(jobId);
    return { ...structuredClone(job), detailScrapedAt: job.detailScrapedAt ?? nowIso() };
  }

  async captureHtml(): Promise<CapturedPage> {
    this.record("captureHtml");
    return {
      html: `<main>captured ${this.pageKind}</main>`,
      kind: this.pageKind,
      url: `https://waterlooworks.uwaterloo.ca/${this.pageKind}`,
      ...(this.currentJobId ? { jobId: this.currentJobId } : {}),
    };
  }

  async getCheckpoint<TValue>(key: string): Promise<TValue | undefined> {
    this.record("getCheckpoint", key);
    const stored = this.checkpoints.get(key);
    return stored === undefined ? undefined : (structuredClone(stored) as TValue);
  }

  async setCheckpoint(key: string, value: unknown): Promise<void> {
    this.record("setCheckpoint", key);
    this.checkpoints.set(key, structuredClone(value));
  }

  async clearCheckpoint(key: string): Promise<void> {
    this.record("clearCheckpoint", key);
    this.checkpoints.delete(key);
  }
}

export function createFakeWw(options: FakeWwOptions = {}): FakeWw {
  return new FakeWw(options);
}
