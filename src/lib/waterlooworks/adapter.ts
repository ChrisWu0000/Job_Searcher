import { highlighter } from "@/lib/automation/actions";
import type { ResponseFor } from "@/lib/messaging/protocol";
import {
  applyRoot,
  getApplyState,
  getPrescreenQuestions,
  selectDocument,
  selectPackage,
  startApplication,
  submit,
} from "./applier";
import {
  type DirectTokens,
  extractDirectTokens,
  fetchPostingBundle,
  fetchResultsPage,
  inlineScriptText,
  isOnJobSearchPage,
  parsePostingBundle,
} from "./direct";
import { applyQuickFilters, navigateToResults, nextResultsPage, openJob } from "./navigator";
import { getCurrentJobId, getPageKind, type PageKindResult } from "./pageKind";
import { truncate } from "./parse";
import { getResultsPageNumber, postingRoot, scrapeCurrentJob, scrapeResultsPage } from "./scraper";
import {
  isSelectorKey,
  query,
  quickFilterToggles,
  scriptAndStyleNodes,
  valueCarryingControls,
} from "./selectors";

export const maxErrorHtmlLength = 50_000;
export const maxFixtureHtmlLength = 1_000_000;

export interface WaterlooWorksAdapter {
  getPageKind(): Promise<ResponseFor<"ww:getPageKind">>;
  navigateToResults(): Promise<ResponseFor<"ww:navigateToResults">>;
  applyQuickFilters(): Promise<ResponseFor<"ww:applyQuickFilters">>;
  scrapeResultsPage(): Promise<ResponseFor<"ww:scrapeResultsPage">>;
  nextResultsPage(): Promise<ResponseFor<"ww:nextResultsPage">>;
  openJob(jobId: string): Promise<ResponseFor<"ww:openJob">>;
  getCurrentJobId(): Promise<ResponseFor<"ww:getCurrentJobId">>;
  scrapeCurrentJob(): Promise<ResponseFor<"ww:scrapeCurrentJob">>;
  startApplication(jobId: string): Promise<ResponseFor<"ww:startApplication">>;
  getApplyState(): Promise<ResponseFor<"ww:getApplyState">>;
  selectPackage(packageId: string): Promise<ResponseFor<"ww:selectPackage">>;
  selectDocument(kind: string, documentId: string): Promise<ResponseFor<"ww:selectDocument">>;
  getPrescreenQuestions(): Promise<ResponseFor<"ww:getPrescreenQuestions">>;
  submit(): Promise<ResponseFor<"ww:submit">>;
  highlight(
    selectorKey: string,
    label?: string,
    durationMs?: number,
  ): Promise<ResponseFor<"ww:highlight">>;
  fetchResults(page: number, itemsPerPage: number): Promise<ResponseFor<"ww:fetchResults">>;
  fetchPosting(jobId: string): Promise<ResponseFor<"ww:fetchPosting">>;
  captureHtml(): Promise<ResponseFor<"ww:captureHtml">>;
}

const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const phonePattern = /\+?\d[\d\s().-]{7,}\d/g;

function relevantErrorRoot(): Element | undefined {
  const kind = getPageKind().kind;
  if (kind === "apply") {
    const scope = applyRoot();
    return scope instanceof Element ? scope : document.body;
  }
  if (kind === "posting") {
    const scope = postingRoot();
    return scope instanceof Element ? scope : document.body;
  }
  if (kind === "results") return query("resultsTable") ?? document.body;
  return document.body ?? document.documentElement;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loggedInUserName(): string | undefined {
  const element = query("loggedInUserName");
  if (!element) return undefined;
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  if (text === undefined || text.length < 3 || text.length > 60) return undefined;
  if (!/[A-Za-z]{2,}/.test(text)) return undefined;
  return text;
}

function maskIdentifiers(html: string): string {
  const name = loggedInUserName();
  const masked = html.replace(emailPattern, "[email]").replace(phonePattern, "[phone]");
  if (name === undefined) return masked;
  return masked.replace(new RegExp(escapeForRegExp(name), "g"), "[user]");
}

export function captureSanitizedHtml(
  limit: number = maxErrorHtmlLength,
  source: Element | undefined = relevantErrorRoot(),
): string | undefined {
  if (typeof document === "undefined") return undefined;
  if (!source) return undefined;
  const clone = source.cloneNode(true);
  if (!(clone instanceof Element)) return undefined;
  for (const node of scriptAndStyleNodes(clone)) node.remove();
  for (const control of valueCarryingControls(clone)) {
    if (control.hasAttribute("value")) control.setAttribute("value", "");
    if (control.tagName.toLowerCase() === "textarea") control.textContent = "";
  }
  return truncate(maskIdentifiers(clone.outerHTML), limit);
}

export function describeCurrentPage(): PageKindResult {
  return getPageKind();
}

function directTokens(): DirectTokens | undefined {
  if (typeof document === "undefined" || typeof location === "undefined") return undefined;
  if (!isOnJobSearchPage(location.pathname)) return undefined;
  return extractDirectTokens(inlineScriptText(document));
}

const pageFetch = (url: string, init: RequestInit) => fetch(url, init);

export function createWaterlooWorksAdapter(): WaterlooWorksAdapter {
  return {
    async fetchResults(page, itemsPerPage) {
      const tokens = directTokens();
      if (!tokens) return { available: false, totalResults: 0, page, rows: [] };
      const myProgram = quickFilterToggles(document).some(
        (toggle) => /^my program$/i.test(toggle.label) && toggle.on,
      );
      const result = await fetchResultsPage(tokens, { page, itemsPerPage, myProgram }, pageFetch);
      return { available: true, ...result };
    },
    async fetchPosting(jobId) {
      const tokens = directTokens();
      if (!tokens) throw new Error("the WaterlooWorks tab is not on the job search page");
      const bundle = await fetchPostingBundle(tokens, jobId, pageFetch);
      return { job: parsePostingBundle(jobId, bundle) };
    },
    async getPageKind() {
      const result = getPageKind();
      if (result.kind === "other" && result.reason) {
        console.warn(`WW++ page kind is "other": ${result.reason}`);
      }
      return {
        kind: result.kind,
        ...(result.jobId === undefined ? {} : { jobId: result.jobId }),
        ...(result.reason === undefined ? {} : { reason: result.reason }),
        ...(typeof location === "undefined" ? {} : { url: location.href }),
      };
    },
    async navigateToResults() {
      return navigateToResults();
    },
    async applyQuickFilters() {
      return applyQuickFilters();
    },
    async scrapeResultsPage() {
      return { stubs: scrapeResultsPage(), pageNumber: getResultsPageNumber() };
    },
    async nextResultsPage() {
      return nextResultsPage();
    },
    async openJob(jobId) {
      return openJob(jobId);
    },
    async getCurrentJobId() {
      return { jobId: getCurrentJobId() };
    },
    async scrapeCurrentJob() {
      return { job: scrapeCurrentJob() };
    },
    async startApplication(jobId) {
      return startApplication(jobId);
    },
    async getApplyState() {
      return { applyState: getApplyState() };
    },
    async selectPackage(packageId) {
      return selectPackage(packageId);
    },
    async selectDocument(kind, documentId) {
      return selectDocument(kind, documentId);
    },
    async getPrescreenQuestions() {
      return { questions: getPrescreenQuestions() };
    },
    async submit() {
      return submit();
    },
    async highlight(selectorKey, label, durationMs) {
      if (!isSelectorKey(selectorKey)) return { highlighted: false };
      const element = query(selectorKey);
      if (!element) return { highlighted: false };
      await highlighter.pulse(element, label ?? selectorKey, durationMs ?? 1200);
      return { highlighted: true };
    },
    async captureHtml() {
      const page = getPageKind();
      return {
        html: captureSanitizedHtml(maxFixtureHtmlLength, document.body) ?? "",
        kind: page.kind,
        url: typeof location === "undefined" ? "" : location.href,
        ...(page.jobId === undefined ? {} : { jobId: page.jobId }),
      };
    },
  };
}
