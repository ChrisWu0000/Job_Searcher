import { isTransportFailure, sendToBackground, sendToContent } from "@/lib/messaging/client";
import { sleep } from "@/lib/time";
import type { ApplyState, Job, JobStub, PageKind, Question, ResultRow } from "@/types";
import type { LogLevel } from "@/types/run";

export interface PageKindResult {
  kind: PageKind;
  jobId?: string;
  reason?: string;
  url?: string;
}

export interface ResultsPage {
  stubs: JobStub[];
  pageNumber?: number;
}

export interface SubmitResult {
  submitted: boolean;
  confirmationText?: string;
}

export interface FetchedResults {
  available: boolean;
  totalResults: number;
  page: number;
  rows: ResultRow[];
}

export interface CapturedPage {
  html: string;
  kind: PageKind;
  url: string;
  jobId?: string;
}

export interface WwClient {
  ensureTab(url?: string): Promise<number>;
  getPageKind(): Promise<PageKindResult>;
  navigateToResults(): Promise<boolean>;
  applyQuickFilters(): Promise<{ changed: boolean; active: string[] }>;
  scrapeResultsPage(): Promise<ResultsPage>;
  nextResultsPage(): Promise<boolean>;
  openJob(jobId: string): Promise<boolean>;
  getCurrentJobId(): Promise<string | undefined>;
  scrapeCurrentJob(): Promise<Job>;
  startApplication(jobId: string): Promise<boolean>;
  getApplyState(): Promise<ApplyState>;
  selectPackage(packageId: string): Promise<boolean>;
  selectDocument(kind: string, documentId: string): Promise<boolean>;
  getPrescreenQuestions(): Promise<Question[]>;
  submit(): Promise<SubmitResult>;
  highlight(selectorKey: string, label?: string, durationMs?: number): Promise<boolean>;
  captureHtml(): Promise<CapturedPage>;
  fetchResults(page: number, itemsPerPage: number): Promise<FetchedResults>;
  fetchPosting(jobId: string): Promise<Job>;
  getCheckpoint<TValue>(key: string): Promise<TValue | undefined>;
  setCheckpoint(key: string, value: unknown): Promise<void>;
  clearCheckpoint(key: string): Promise<void>;
}

export function createWwClient(): WwClient {
  const client: WwClient = {
    async ensureTab(url) {
      const response = await sendToBackground({
        type: "bg:focusWwTab",
        ...(url === undefined ? {} : { url }),
      });
      return response.tabId;
    },
    async getPageKind() {
      return sendToContent({ type: "ww:getPageKind" });
    },
    async navigateToResults() {
      let navigated = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          const page = await client.getPageKind();
          if (page.kind === "results") return navigated;
          if (page.kind === "login") throw new Error(loginRequiredMessage);
          const response = await sendToContent({ type: "ww:navigateToResults" });
          navigated ||= response.navigated;
          const after = await client.getPageKind();
          if (after.kind === "results") return navigated;
        } catch (cause) {
          if (!isTransportFailure(cause) || attempt === 7) throw cause;
        }
        await sleep(300);
      }
      throw new Error(
        "Could not reach the Full-Cycle results after opening Co-op Jobs, Full-Cycle Service, and All Jobs. Check the WaterlooWorks tab and try again.",
      );
    },
    async applyQuickFilters() {
      return sendToContent({ type: "ww:applyQuickFilters" });
    },
    async scrapeResultsPage() {
      return sendToContent({ type: "ww:scrapeResultsPage" });
    },
    async nextResultsPage() {
      const response = await sendToContent({ type: "ww:nextResultsPage" });
      return response.hadNextPage;
    },
    async openJob(jobId) {
      const current = await client.getPageKind();
      if ((current.kind === "posting" || current.kind === "apply") && current.jobId === jobId)
        return true;
      await client.navigateToResults();
      try {
        const response = await sendToContent({ type: "ww:openJob", jobId });
        return response.opened;
      } catch (cause) {
        if (!isTransportFailure(cause)) throw cause;
        const page = await client.getPageKind();
        if ((page.kind === "posting" || page.kind === "apply") && page.jobId === jobId) return true;
        throw cause;
      }
    },
    async getCurrentJobId() {
      const response = await sendToContent({ type: "ww:getCurrentJobId" });
      return response.jobId;
    },
    async scrapeCurrentJob() {
      const response = await sendToContent({ type: "ww:scrapeCurrentJob" });
      return response.job;
    },
    async startApplication(jobId) {
      const response = await sendToContent({
        type: "ww:startApplication",
        jobId,
      });
      return response.started;
    },
    async getApplyState() {
      const response = await sendToContent({ type: "ww:getApplyState" });
      return response.applyState;
    },
    async selectPackage(packageId) {
      const response = await sendToContent({
        type: "ww:selectPackage",
        packageId,
      });
      return response.selected;
    },
    async selectDocument(kind, documentId) {
      const response = await sendToContent({
        type: "ww:selectDocument",
        kind,
        documentId,
      });
      return response.selected;
    },
    async getPrescreenQuestions() {
      const response = await sendToContent({
        type: "ww:getPrescreenQuestions",
      });
      return response.questions;
    },
    async submit() {
      return sendToContent({ type: "ww:submit" });
    },
    async highlight(selectorKey, label, durationMs) {
      const response = await sendToContent({
        type: "ww:highlight",
        selectorKey,
        ...(label === undefined ? {} : { label }),
        ...(durationMs === undefined ? {} : { durationMs }),
      });
      return response.highlighted;
    },
    async captureHtml() {
      return sendToContent({ type: "ww:captureHtml" });
    },
    async fetchResults(page, itemsPerPage) {
      return sendToContent({ type: "ww:fetchResults", page, itemsPerPage });
    },
    async fetchPosting(jobId) {
      const response = await sendToContent({ type: "ww:fetchPosting", jobId });
      return response.job;
    },
    async getCheckpoint<TValue>(key: string) {
      const response = await sendToBackground({
        type: "bg:getCheckpoint",
        key,
      });
      return response.value as TValue | undefined;
    },
    async setCheckpoint(key, value) {
      await sendToBackground({ type: "bg:setCheckpoint", key, value });
    },
    async clearCheckpoint(key) {
      await sendToBackground({ type: "bg:clearCheckpoint", key });
    },
  };
  return client;
}

export type WwTraceLog = (level: LogLevel, message: string) => unknown;

const tracedMethods: (keyof WwClient)[] = [
  "ensureTab",
  "getPageKind",
  "navigateToResults",
  "applyQuickFilters",
  "scrapeResultsPage",
  "nextResultsPage",
  "openJob",
  "getCurrentJobId",
  "scrapeCurrentJob",
  "startApplication",
  "getApplyState",
  "selectPackage",
  "selectDocument",
  "getPrescreenQuestions",
  "submit",
  "highlight",
  "captureHtml",
  "fetchResults",
  "fetchPosting",
];

function describeArgs(args: unknown[]): string {
  const parts = args.filter((arg) => arg !== undefined).map((arg) => JSON.stringify(arg));
  return parts.length === 0 ? "" : `(${parts.join(", ")})`;
}

function describeResult(name: keyof WwClient, value: unknown): string {
  if (name === "getPageKind") {
    const result = value as PageKindResult;
    const job = result.jobId === undefined ? "" : ` for job ${result.jobId}`;
    const reason = result.reason === undefined ? "" : ` (${result.reason})`;
    const url = result.url === undefined ? "" : ` at ${result.url}`;
    return `${result.kind}${job}${reason}${url}`;
  }
  if (name === "scrapeResultsPage") return `${(value as ResultsPage).stubs.length} rows`;
  if (name === "applyQuickFilters") {
    const result = value as { changed: boolean; active: string[] };
    const active = result.active.length === 0 ? "none" : result.active.join(", ");
    return `${result.changed ? "toggled, " : ""}active: ${active}`;
  }
  if (name === "scrapeCurrentJob" || name === "fetchPosting") return `"${(value as Job).title}"`;
  if (name === "fetchResults") {
    const result = value as FetchedResults;
    if (!result.available) return "not available on this page";
    return `${result.rows.length} rows of ${result.totalResults}`;
  }
  if (name === "getPrescreenQuestions") return `${(value as Question[]).length} questions`;
  if (name === "captureHtml") return `${(value as CapturedPage).html.length} characters`;
  if (name === "ensureTab") return `tab ${String(value)}`;
  if (value === undefined) return "done";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 160);
  return String(value);
}

function describeFailure(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function traceWwClient(client: WwClient, log: WwTraceLog): WwClient {
  const traced: Record<string, unknown> = {};
  for (const name of tracedMethods) {
    const method = client[name] as (...args: unknown[]) => Promise<unknown>;
    traced[name] = async (...args: unknown[]) => {
      const label = `${name}${describeArgs(args)}`;
      const startedAt = Date.now();
      void log("debug", `→ ${label}`);
      try {
        const result = await method.apply(client, args);
        const elapsed = Date.now() - startedAt;
        void log("debug", `← ${label}: ${describeResult(name, result)} in ${elapsed} ms`);
        return result;
      } catch (cause) {
        const elapsed = Date.now() - startedAt;
        void log("warn", `✗ ${label} failed after ${elapsed} ms: ${describeFailure(cause)}`);
        throw cause;
      }
    };
  }
  traced.getCheckpoint = (key: string) => client.getCheckpoint(key);
  traced.setCheckpoint = (key: string, value: unknown) => client.setCheckpoint(key, value);
  traced.clearCheckpoint = (key: string) => client.clearCheckpoint(key);
  return traced as unknown as WwClient;
}

export const loginRequiredMessage =
  "Log in to WaterlooWorks in the opened tab, then resume the run";

export const resultsPageRequiredMessage =
  "Open a WaterlooWorks job search results page in the WaterlooWorks tab, then resume the run";

export const tabUnavailableMessage =
  "The WaterlooWorks tab stopped responding. Reopen WaterlooWorks and start again";
